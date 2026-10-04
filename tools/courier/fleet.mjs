// The courier fleet (Stop 18): many simulated robots, headless, each running the learner's firmware
// in real time and talking MQTT to a real broker, from one Node process. Used by `cli.mjs fleet`.
//
// How: every robot is the same engine as the sims (sim.js), and all of them share one worker thread.
// A robot's firmware is suspended (WebAssembly JSPI, Node 24) whenever its clock gets ahead of the
// wall clock, so 100 robots interleave like 100 chips. Each robot gets its own MQTT connection (client
// id = its name), its own flash (two firmware slots, Stop 17) and, with --real-world, its own seed.
// The main thread keeps a watchdog (a firmware that never gives the board a turn would freeze every
// robot) and a separate subscriber that counts what actually reaches the broker.
import { performance, monitorEventLoopDelay } from "node:perf_hooks";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { simulate } from "./sim.js";
import { createDevice } from "./device.js";
import { createBroker } from "./broker.js";
import { connectMqtt } from "./mqtt.mjs";

const HERE = fileURLToPath(import.meta.url);
const INBOX_LIMIT = 32; // messages a robot holds before the oldest is dropped (a chip's buffer is small)

/**
 * Runs a fleet and reports. Resolves with the summary.
 * @param {{ wasm: Uint8Array, robots: number, seconds: number, map: string, mqtt?: string | null,
 *           realWorld?: number | null, flashDir?: string | null, publicKey?: Uint8Array | null,
 *           serve?: string | null, prefix?: string, watchdogMs?: number,
 *           onTick?: (s: object) => void }} o
 */
export async function runFleet(o) {
  const hb = new Int32Array(new SharedArrayBuffer(8)); // [heartbeat counter, robot running now]
  const watchdogMs = o.watchdogMs ?? 5000;
  // The watcher connects first, so it counts every message the robots send.
  let watcher = null, received = 0, receivedBytes = 0;
  if (o.mqtt) {
    try {
      watcher = await connectMqtt(o.mqtt, { clientId: `${o.prefix ?? "robot-"}watcher-${process.pid}` });
      watcher.onMessage = (topic, payload) => { received++; receivedBytes += payload.length; };
      watcher.subscribe("#");
      await new Promise((r) => setTimeout(r, 100)); // the subscription is in place before anyone publishes
    } catch (e) {
      return { ok: false, reason: "no-broker", message: e.message };
    }
  }
  const worker = new Worker(HERE, { workerData: { ...o, onTick: undefined, hb } });
  return new Promise((done) => {
    let lastBeat = -1, lastChange = performance.now();
    const finish = (summary) => {
      clearInterval(timer);
      watcher?.end();
      summary.broker = watcher ? { received, receivedBytes } : null;
      done(summary);
    };
    const timer = setInterval(() => {
      const beat = Atomics.load(hb, 0);
      if (beat !== lastBeat) { lastBeat = beat; lastChange = performance.now(); return; }
      if (performance.now() - lastChange > watchdogMs) {
        const who = Atomics.load(hb, 1);
        worker.terminate();
        finish({ ok: false, reason: "watchdog", message: `Watchdog: ${name(o, who)}'s firmware ran for ${Math.round(watchdogMs / 1000)} s without giving the board a turn (a loop with no delay() or reading?), and every robot shares its thread. Stopped the fleet.` });
      }
    }, 250);
    timer.unref?.();
    worker.on("message", (m) => {
      if (m.type === "tick") o.onTick?.({ ...m.s, received, receivedBytes });
      if (m.type === "done") finish(m.summary);
    });
    worker.on("error", (e) => finish({ ok: false, reason: "crash", message: `the fleet stopped: ${e.message}` }));
  });
}

// Written to a temporary file and renamed, so a stop in the middle never leaves half a file.
function saveFlash(file, saved) {
  writeFileSync(`${file}.tmp`, JSON.stringify(saved));
  renameSync(`${file}.tmp`, file);
}

const name = (o, i) => `${o.prefix ?? "robot-"}${String(i + 1).padStart(3, "0")}`;

// courier::net::get in the fleet: --serve DIR (files) or --serve http(s)://… (a real server, e.g. the
// learner's bucket): the robot waits for the answer, suspended, as a chip waits on its Wi-Fi.
function netFor(serve) {
  if (!serve) return undefined;
  if (/^https?:\/\//.test(serve)) {
    const base = serve.replace(/\/$/, "");
    return {
      get: async (url) => {
        try {
          const u = new URL(url);
          // under the fleet's watchdog (5 s), so a slow server is a failed download, not a frozen fleet
          const r = await fetch(base + u.pathname + u.search, { signal: AbortSignal.timeout(4_000) });
          return { status: r.status, body: new Uint8Array(await r.arrayBuffer()) };
        } catch { return null; }
      },
    };
  }
  const dir = resolve(serve);
  return {
    get: (url) => {
      let path;
      try { path = decodeURIComponent(new URL(url).pathname); } catch { return null; }
      const file = resolve(dir, "." + path);
      if (!file.startsWith(dir + sep) || !existsSync(file) || !statSync(file).isFile()) return { status: 404, body: "not found" };
      return { status: 200, body: new Uint8Array(readFileSync(file)) };
    },
  };
}

if (!isMainThread && workerData?.hb) {
  const o = workerData, hb = o.hb, n = o.robots;
  const wall0 = performance.now();
  const robotT = new Float64Array(n), lastYield = new Float64Array(n);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const turn = () => new Promise((r) => setImmediate(r));
  const loopDelay = monitorEventLoopDelay({ resolution: 10 });
  loopDelay.enable();
  const clients = [];
  const net = netFor(o.serve);
  let memBroker = null;
  try {
    for (let i = 0; i < n; i++) {
      const id = name(o, i);
      if (o.mqtt) {
        const c = await connectMqtt(o.mqtt, { clientId: id });
        const inbox = [];
        c.onMessage = (topic, payload) => { if (inbox.length >= INBOX_LIMIT) inbox.shift(); inbox.push({ topic, payload }); };
        clients.push({ id, c, mqtt: { publish: (t, p) => c.publish(t, p), subscribe: (f) => c.subscribe(f), inbox } });
      } else {
        memBroker ??= createBroker({ inboxLimit: INBOX_LIMIT });
        clients.push({ id, c: null, mqtt: memBroker.client(id) });
      }
    }
  } catch (e) {
    for (const x of clients) x.c?.end();
    parentPort.postMessage({ type: "done", summary: { ok: false, reason: "no-broker", message: e.message } });
    process.exit(0);
  }
  const devices = clients.map(({ id }) => {
    const file = o.flashDir ? join(o.flashDir, id, "flash.json") : null;
    let device = null;
    if (file && existsSync(file)) {
      try { device = createDevice.load(JSON.parse(readFileSync(file, "utf8"))); } catch { device = null; } // unreadable: start fresh
    }
    device ??= createDevice({ image: o.wasm, publicKey: o.publicKey ?? null, name: id });
    if (file) {
      // flash writes are durable: saved at every change, so a watchdog stop keeps them (as Stop 17's CLI does)
      mkdirSync(join(o.flashDir, id), { recursive: true });
      device.onChange = (d) => saveFlash(file, d.save());
    }
    return { file, device };
  });
  // Pacing: a robot ahead of the wall clock sleeps until it isn't; one that's behind still lets the
  // others run every 50 ms of its own time, so a slow machine slows every robot evenly.
  const pace = (i) => (t) => {
    Atomics.add(hb, 0, 1);
    Atomics.store(hb, 1, i);
    robotT[i] = t;
    const ahead = t / 1000 - (performance.now() - wall0);
    if (ahead > 1) { lastYield[i] = t; return sleep(ahead); }
    if (t - lastYield[i] >= 50_000) { lastYield[i] = t; return turn(); }
    return undefined;
  };
  let lastSent = 0, lastBytes = 0, lastCpu = process.cpuUsage(), lastWall = performance.now();
  const sentNow = () => clients.reduce((a, x) => a + (x.c ? x.c.stats.sent : 0), 0) + (memBroker?.stats.published ?? 0);
  const bytesNow = () => clients.reduce((a, x) => a + (x.c ? x.c.stats.sentBytes : 0), 0) + (memBroker?.stats.bytes ?? 0);
  const samples = [];
  const tick = setInterval(() => {
    const now = performance.now(), wallS = (now - wall0) / 1000;
    const cpu = process.cpuUsage(lastCpu); lastCpu = process.cpuUsage();
    const sent = sentNow(), bytes = bytesNow();
    let maxLag = 0, sumLag = 0;
    for (let i = 0; i < n; i++) { const lag = Math.max(0, wallS * 1000 - robotT[i] / 1000); maxLag = Math.max(maxLag, lag); sumLag += lag; }
    const s = {
      wallS: Math.round(wallS * 10) / 10, robots: n,
      msgsPerS: Math.round(((sent - lastSent) * 1000) / (now - lastWall)),
      kbPerS: Math.round(((bytes - lastBytes) * 1000) / (now - lastWall) / 1024),
      lagMsMax: Math.round(maxLag), lagMsMean: Math.round(sumLag / n),
      cpuPct: Math.round(((cpu.user + cpu.system) / 1000 / (now - lastWall)) * 100),
      rssMB: Math.round(process.memoryUsage().rss / 1048576),
      loopDelayP99Ms: Math.round(loopDelay.percentile(99) / 1e6),
      backlogKB: Math.round(clients.reduce((a, x) => a + (x.c ? x.c.pending : 0), 0) / 1024),
    };
    loopDelay.reset();
    lastSent = sent; lastBytes = bytes; lastWall = now;
    samples.push(s);
    parentPort.postMessage({ type: "tick", s });
  }, 1000);
  const reports = await Promise.all(clients.map(({ id, mqtt }, i) => simulate({
    device: devices[i].device, map: o.map, seconds: o.seconds, name: id, mqtt, net,
    realWorld: o.realWorld == null ? undefined : { seed: o.realWorld + i },
    suspend: pace(i), traceMs: 1000,
  })));
  clearInterval(tick);
  const wallS = (performance.now() - wall0) / 1000;
  for (const d of devices) if (d.file) saveFlash(d.file, d.device.save());
  // let the last messages leave before closing
  await new Promise((r) => setTimeout(r, 300));
  for (const x of clients) x.c?.end();
  const sent = sentNow();
  const steady = samples.length > 4 ? samples.slice(2, -1) : samples; // skip the start and end when there's enough
  const avg = (k) => (steady.length ? Math.round(steady.reduce((a, s) => a + s[k], 0) / steady.length) : null);
  parentPort.postMessage({ type: "done", summary: {
    ok: reports.every((r) => r.ok), robots: n, seconds: o.seconds, wallS: Math.round(wallS * 10) / 10,
    published: sent, msgsPerS: Math.round(sent / wallS),
    steady: { msgsPerS: avg("msgsPerS"), cpuPct: avg("cpuPct"), rssMB: Math.max(0, ...samples.map((s) => s.rssMB)), lagMsMax: Math.max(0, ...samples.map((s) => s.lagMsMax)), loopDelayP99Ms: Math.max(0, ...samples.map((s) => s.loopDelayP99Ms)) },
    samples,
    robotsReport: reports.map((r, i) => ({ robot: clients[i].id, ok: r.ok, reason: r.reason, message: r.message, virtualMs: r.virtualMs,
      boots: r.boots.map((b) => `${b.slot ?? "-"} ${b.version ?? ""} ${b.reason}`.replace(/\s+/g, " ")), serial: r.serial.slice(-5).map((l) => l.text) })),
  } });
}
