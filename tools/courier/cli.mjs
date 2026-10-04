#!/usr/bin/env node
// courier — the Courier simulator without a screen, for CI and the terminal. The same engine as the
// sims (world.js, sim.js, build.js), so a run here is the run a learner watches in the browser.
// Not served from /_lib: it runs from a folder made by sim-kit's scripts/pack-courier.mjs, which puts
// it next to a courier release's engine and firmware/ (see tools/courier/README.md).
//
//   node cli.mjs drive EEEESSS… --map maps/office.txt [--name Pip]        the built-in driver (Stop 2)
//   node cli.mjs run firmware --map maps/office.txt [--seconds 30]       build + run firmware (Stop 3)
//   node cli.mjs run firmware --listen                                    in real time, its Wi-Fi ports on
//                                        localhost (Stop 6): until Ctrl+C, or --seconds N
//   node cli.mjs build firmware [--out fw.wasm]                          just build it (and save it)
//   node cli.mjs keygen --out keys/robot                                 a signing key pair (Stop 17)
//   node cli.mjs sign fw.wasm --key keys/robot.pem                       writes fw.wasm.sig
//   node cli.mjs run firmware --flash flash/ --key keys/robot.pub --serve bucket/
//                                        a robot with two firmware slots that may update itself
//   node cli.mjs fleet firmware --robots 100 --seconds 60 --mqtt mqtt://localhost:1883
//                                        many robots, headless, in real time, on MQTT (Stop 18)
//   node cli.mjs dataset --count 2000 --size 96x96 --seed 1 --out data/
//                                        labelled camera frames for training (Stop 20)
//
// Options: --map FILE (default: the office floor) · --seconds N (robot time, default 30) · --name NAME
// (the robot's name in messages) · --json FILE (the full report) · --events FILE (the event log,
// "@<ms> <kind> <detail>" per line, as courier-starter's checks read it) · --watchdog MS (wall time
// with no progress before giving up, default 5000) · -I DIR (extra include folder) · --real-world SEED
// (Stop 5's switch: slip, motor mismatch, battery sag and sensor noise, from SEED, default 1; the same
// seed gives the same run here and in the browser) · --noise sensor (Stop 4: only the sensors' noise;
// --seed N picks its seed, default 1) · --box ROW,COL[@FROM-TO] (Stop 4: a 20 cm box on that tile,
// from FROM to TO seconds of robot time if given; fractions put it between tiles; more than one
// --box for more boxes) · --square / --straight N / --route MOVES (Stop 5's test drives: the firmware
// is asked to drive that route through courier::route(); --square and --straight bring their own open
// floor and print what the drive measured) · --listen (real time; when the firmware is on the
// Wi-Fi and listens on a port — WiFiServer — the same port on localhost reaches it, so `nc localhost
// 7000` or a Python socket talks to the robot; serial lines print as they happen) · --flash DIR (the robot's two firmware slots, kept
// in DIR/flash.json between runs; the first run puts the firmware in slot A) · --key FILE (the
// public key, hex, that the robot checks updates against) · --serve DIR (what courier::net::get
// reaches: any URL's path is read from DIR, e.g. http://bucket/fw/latest.wasm → DIR/fw/latest.wasm).
// A route can also come on standard input: `python3 planner/plan.py maps/office.txt | node cli.mjs drive -`.
//
// Firmware: a PlatformIO project folder (src/ and lib/*; lib/arduino_sim is skipped, since the
// simulator brings its own Arduino.h) or .cpp files. Compiling needs clang for WebAssembly from npm:
// `npm install --save-exact @yowasp/clang@22.0.0-git20542-10` in the project (or set COURIER_CLANG to
// its gen/bundle.js).
//
// Exit codes: 0 it worked (no crash, no collision; with --listen, also when stopped with Ctrl+C or
// SIGTERM) · 1 it didn't (build error, crash, hit a wall, watchdog, a route with letters other than
// N/E/S/W) · 2 couldn't start (an unknown option, bad arguments, unreadable map, no compiler).
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign as signBytes } from "node:crypto";
import { createRequire } from "node:module";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { buildFirmware, CLANG_VERSION, FIRMWARE_FILES, OPTIONAL_FIRMWARE_FILES } from "./build.js";
import { simulate, simulateRoute, describe, endedReport } from "./sim.js";
import { createDevice } from "./device.js";
import { toHex, fromHex } from "./sign.js";
import { runFleet } from "./fleet.mjs";
import { makeDataset, toPGM, toCSV, LABELS } from "./dataset.js";
import { OFFICE, parseMap, parseBox, testDriveOf } from "./world.js";

const KIT_DIR = dirname(fileURLToPath(import.meta.url));
const USAGE = `usage:
  node cli.mjs drive <ROUTE | -> [--map FILE] [--name NAME] [--real-world SEED] [--box ROW,COL[@FROM-TO]] [--json FILE] [--events FILE]
  node cli.mjs run <firmware folder | .cpp files | built .wasm> [--map FILE] [--seconds N] [--name NAME] [--json FILE] [--events FILE]
                  [--real-world [SEED] | --noise sensor [--seed N]] [--box ROW,COL[@FROM-TO]]…
                  [--square | --straight N | --route MOVES]   (test drives: the firmware drives courier::route(); Stop 5)
                  [--listen]   (real time, Wi-Fi ports on localhost, until Ctrl+C: Stop 6)
  node cli.mjs build <firmware folder | .cpp files> [--out FILE]
  node cli.mjs keygen --out <name>          (writes <name>.pem, private, and <name>.pub)
  node cli.mjs sign <image.wasm> --key <name>.pem
  (run also takes --flash DIR, --key <name>.pub, --serve DIR: over-the-air updates, Stop 17)
  node cli.mjs fleet <firmware | built .wasm> --robots N [--seconds S] [--mqtt mqtt://host:port] [--map FILE] [--real-world SEED]
                    [--flash DIR] [--key <name>.pub] [--serve DIR | http://…] [--prefix robot-] [--json FILE]
  node cli.mjs dataset --out DIR [--count N] [--size WxH] [--seed S] [--empty 0.2]`;

// Which options each command takes. Options in BOOLEAN take no value; --real-world takes a seed
// only if a number follows. Anything else is an error (exit 2), so a typo never looks like success.
const OPTIONS = {
  drive: ["map", "name", "real-world", "noise", "seed", "box", "json", "events", "watchdog", "seconds"],
  run: ["map", "seconds", "name", "real-world", "noise", "seed", "box", "route", "square", "straight", "json", "events", "watchdog", "I", "flash", "key", "serve", "listen"],
  build: ["out", "I"],
  keygen: ["out"],
  sign: ["key"],
  fleet: ["robots", "seconds", "mqtt", "map", "real-world", "flash", "key", "serve", "prefix", "json", "watchdog", "I"],
  dataset: ["out", "count", "size", "seed", "empty"],
};
const BOOLEAN = new Set(["listen", "square"]);

if (!isMainThread) {
  // The simulation, in a worker thread so the main thread can stop a firmware that never yields.
  const { kind, wasm, route, opts, flash, serve } = workerData;
  if (flash) {
    opts.device = createDevice.load(flash);
    opts.device.onChange = (d) => parentPort.postMessage({ type: "flash", flash: d.save() });
  }
  if (serve) opts.net = { get: (url) => serveFile(serve, url) };
  if (workerData.listen) await listenMode(opts);
  let last = 0, lastT = -1e9, seen = null;
  const onSnapshot = (s) => { seen = s; };
  const pace = (t) => {
    // every 100 ms of wall time or 250 ms of robot time; the pose is for a watchdog report
    const now = performance.now();
    if (now - last > 100 || t - lastT > 250000) { last = now; lastT = t; parentPort.postMessage({ type: "beat", t, s: seen }); }
  };
  const report = kind === "drive" ? simulateRoute({ ...opts, route, pace, onSnapshot }) : await simulate({ ...opts, wasm, pace, onSnapshot });
  opts.closePorts?.();
  parentPort.postMessage({ type: "done", report, flash: opts.device?.save() ?? null });
} else {
  process.exitCode = await main(process.argv.slice(2)).catch((e) => {
    console.error(`courier: ${e.message}`);
    return 2;
  });
}

// Stop 6, `run --listen`: the robot runs in real time (its firmware waits, suspended with WebAssembly
// JSPI, whenever it gets ahead of the wall clock), on a Wi-Fi whose open ports are forwarded to
// localhost. Serial lines and Wi-Fi events go to the main thread as they happen.
async function listenMode(opts) {
  const { createServer } = await import("node:net");
  const { createNetwork } = await import("./net.js");
  const wall0 = performance.now();
  const robotUs = () => (performance.now() - wall0) * 1000;
  const network = createNetwork({ peerClock: robotUs });
  const servers = new Map(); // port → [net.Server]
  network.onPorts((what, port) => {
    if (what === "unlisten") { for (const srv of servers.get(port) ?? []) srv.close(); servers.delete(port); return; }
    // 127.0.0.1 must open; ::1 too where the machine has IPv6 (Python's "localhost" may try it first).
    const list = [];
    servers.set(port, list);
    const open = (host) => new Promise((res) => {
      const srv = createServer((sock) => forward(network, port, sock));
      srv.once("error", (e) => res(e.code ?? "error"));
      srv.listen(port, host, () => { list.push(srv); res(null); });
    });
    Promise.all([open("127.0.0.1"), open("::1")]).then(([v4]) => {
      parentPort.postMessage(v4 ? { type: "port-error", port, code: v4 } : { type: "port", port });
    });
  });
  let stop = false, wake = null;
  parentPort.on("message", (m) => { if (m === "stop") { stop = true; wake?.(); } });
  // While the firmware waits, the thread is free: it tells the main thread it's alive.
  const alive = setInterval(() => parentPort.postMessage({ type: "beat", t: null, s: null }), 200);
  Object.assign(opts, {
    network,
    seconds: opts.seconds ?? 1e9,
    stopped: () => stop,
    onSerial: (l) => parentPort.postMessage({ type: "serial", l }),
    onEvent: (line) => { if (/^@\d+ (wifi|net) /.test(line)) parentPort.postMessage({ type: "event", line }); },
    suspend: (t) => {
      const ahead = t / 1000 - (performance.now() - wall0);
      if (stop || ahead <= 1) return null;
      return new Promise((r) => { const timer = setTimeout(() => { wake = null; r(); }, ahead); wake = () => { clearTimeout(timer); wake = null; r(); }; });
    },
    closePorts: () => { clearInterval(alive); for (const list of servers.values()) for (const srv of list) srv.close(); },
  });
}

// One real TCP connection on localhost ↔ one connection to the robot's port on the simulated Wi-Fi.
function forward(network, port, sock) {
  sock.setNoDelay(true);
  const c = network.connect(port, {
    onData: (b) => sock.write(b),
    onClose: () => sock.end(),
    onDrain: () => sock.resume(),
  });
  if (!c.ok) { sock.destroy(); return; }
  sock.on("data", (d) => { if (!c.send(new Uint8Array(d))) sock.pause(); });
  for (const ev of ["end", "error", "close"]) sock.on(ev, () => c.close());
}

async function main(argv) {
  const { cmd, args, flags, error } = parseArgs(argv);
  if (error) { console.error(`✗ ${error}\n${USAGE}`); return 2; }
  if (!cmd || cmd === "help" || flags.help) { console.log(USAGE); return cmd ? 0 : 2; }
  if (!["drive", "run", "build", "keygen", "sign", "fleet", "dataset"].includes(cmd)) { console.error(USAGE); return 2; }
  const unknown = Object.keys(flags).filter((f) => f !== "help" && !OPTIONS[cmd].includes(f));
  if (unknown.length) { console.error(`✗ ${cmd} doesn't take ${unknown.map((f) => (f === "I" ? "-I" : `--${f}`)).join(", ")}\n${USAGE}`); return 2; }
  if (cmd === "dataset") return dataset(flags);
  if (cmd === "keygen") return keygen(flags);
  if (cmd === "sign") return signImage(args, flags);
  const name = flags.name ?? "Your robot";
  let mapText = OFFICE;
  if (flags.map) {
    try { mapText = readFileSync(flags.map, "utf8"); } catch { console.error(`✗ can't open ${flags.map}`); return 2; }
  }
  try { parseMap(mapText); } catch (e) { console.error(`✗ ${flags.map ?? "the map"}: ${e.message}`); return 2; }
  const opts = { map: mapText, seconds: flags.seconds ? Number(flags.seconds) : undefined };
  // The Real world switch: --real-world [SEED] turns on all of it; --noise sensor only the sensor noise
  // (Stop 4). --seed N picks the seed for either.
  if (flags.seed != null && !/^\d+$/.test(flags.seed)) { console.error("✗ --seed takes a whole number (e.g. --seed 3)"); return 2; }
  if (flags.noise != null && flags.noise !== "sensor") { console.error(`✗ --noise takes "sensor" (the distance, line and encoder sensors' noise; --real-world turns on everything)`); return 2; }
  if (flags.seed != null && !("real-world" in flags) && flags.noise == null) { console.error("✗ --seed goes with --noise sensor or --real-world"); return 2; }
  if ("real-world" in flags) {
    const seed = flags["real-world"] === true ? Number(flags.seed ?? 1) : Number(flags["real-world"]);
    if (!Number.isInteger(seed) || seed < 0) { console.error(`✗ --real-world takes a seed, a whole number (e.g. --real-world 1)`); return 2; }
    if (flags["real-world"] !== true && flags.seed != null && Number(flags.seed) !== seed) { console.error("✗ two different seeds: give it once, as --real-world SEED or --seed SEED"); return 2; }
    opts.realWorld = { seed };
  } else if (flags.noise === "sensor") {
    opts.realWorld = { seed: Number(flags.seed ?? 1), sensorNoise: true, wheelSlip: false, batterySag: false };
  }
  // Stop 5's test drives: the firmware is asked (courier::route()) to drive a square or a straight line,
  // on the test's own floor; the summary prints what it measured. --route asks for any route.
  const drives = ["square", "straight", "route"].filter((f) => flags[f] != null);
  if (drives.length > 1) { console.error(`✗ one at a time: --${drives.join(", --")}`); return 2; }
  if ((flags.square || flags.straight != null) && flags.map) { console.error("✗ --square and --straight drive on their own open floor; leave out --map"); return 2; }
  if (flags.square) opts.testDrive = "square";
  if (flags.straight != null) {
    const n = Number(flags.straight);
    if (!/^\d+$/.test(flags.straight) || n < 1 || n > 50) { console.error("✗ --straight takes how many tiles, 1 to 50 (e.g. --straight 10)"); return 2; }
    opts.testDrive = { straight: n };
  }
  if (opts.testDrive) opts.map = testDriveOf(opts.testDrive).map; // also what a watchdog report shows
  if (flags.route != null) {
    const r = String(flags.route).trim().toUpperCase();
    if (!/^[NESW]{1,255}$/.test(r)) { console.error("✗ --route takes N, E, S and W moves (up to 255), e.g. --route EEEESSS"); return 2; }
    opts.route = r;
  }
  if (flags.box) {
    opts.boxes = [];
    for (const text of flags.box) {
      const b = parseBox(text);
      if (!b) { console.error(`✗ --box ${text}: write ROW,COL (e.g. 4,8), ROW,COL@FROM-TO in seconds (4,8@0-12) or ROW,COL@FROM (4,8@5)`); return 2; }
      opts.boxes.push(b);
    }
  }

  if (cmd === "drive") {
    let route = args[0];
    if (route === "-" || route == null) route = readFileSync(0, "utf8");
    route = route.trim();
    const report = await inWorker({ kind: "drive", route, opts }, flags);
    return finish(report, flags, name, `${name} drove ${report.moves ?? 0} of ${route.length} moves`);
  }

  if (!args.length) { console.error(USAGE); return 2; }
  // A built image (build --out): run it as it is, without loading the compiler.
  if ((cmd === "run" || cmd === "fleet") && args.length === 1 && args[0].endsWith(".wasm")) {
    let wasm;
    try { wasm = new Uint8Array(readFileSync(args[0])); } catch { console.error(`✗ can't open ${args[0]}`); return 2; }
    if (!WebAssembly.validate(wasm)) { console.error(`✗ ${args[0]} isn't a WebAssembly file`); return 2; }
    return afterBuild(cmd, wasm, mapText, opts, flags, name);
  }
  const job = collectFirmware(args, flags);
  if (!job) return 2;
  const commands = await loadClang();
  if (!commands) return 2;
  const kitFiles = Object.fromEntries([...FIRMWARE_FILES, ...Object.keys(OPTIONAL_FIRMWARE_FILES)].map((f) => [f, readFileSync(join(KIT_DIR, "firmware", f), "utf8")]));
  const b = await buildFirmware(commands, { ...job, kitFiles });
  if (!b.ok) {
    console.error(`✗ The firmware didn't build: ${b.error.message}`);
    if (b.error.file) console.error(`  at ${b.error.file}${b.error.line ? `, line ${b.error.line}` : ""}`);
    console.error("");
    console.error(b.error.text);
    return 1;
  }
  console.log(`✓ firmware built: ${b.wasm.length.toLocaleString("en")} bytes in ${(b.ms / 1000).toFixed(1)} s`);
  if (cmd === "build") {
    if (flags.out) { writeFileSync(flags.out, b.wasm); console.log(`  saved ${flags.out}`); }
    return 0;
  }
  return afterBuild(cmd, b.wasm, mapText, opts, flags, name);
}

async function afterBuild(cmd, wasm, mapText, opts, flags, name) {
  const b = { wasm };
  if (cmd === "fleet") return fleet(b.wasm, mapText, flags);
  let flash = null, flashFile = null;
  if (flags.flash) {
    flashFile = join(flags.flash, "flash.json");
    if (existsSync(flashFile)) {
      try { flash = JSON.parse(readFileSync(flashFile, "utf8")); } catch { console.error(`✗ ${flashFile} can't be read; move it away to start the robot fresh`); return 2; }
      console.log(`  booting from ${flashFile} (the firmware you built goes in only on a robot's first run)`);
    } else {
      let publicKey = null;
      if (flags.key) {
        try { publicKey = fromHex(readFileSync(flags.key, "utf8").trim()); } catch { console.error(`✗ can't read the key ${flags.key}`); return 2; }
        if (publicKey.length !== 32) { console.error(`✗ ${flags.key} isn't a public key (64 hex characters, from keygen)`); return 2; }
      }
      flash = createDevice({ image: b.wasm, publicKey, name }).save();
    }
  }
  const serve = flags.serve ? resolve(flags.serve) : null;
  if (flags.listen) {
    if (typeof WebAssembly.Suspending !== "function") { console.error("✗ --listen needs Node 24 or newer (WebAssembly JSPI)"); return 2; }
    console.log(`Running ${name} in real time${opts.seconds ? ` for ${opts.seconds} s` : " until Ctrl+C"}; its Wi-Fi ports open on localhost once it listens.`);
  }
  const report = await inWorker({ kind: "run", wasm: b.wasm, opts, flash, serve, listen: !!flags.listen }, flags);
  if (flashFile && report.flash) {
    mkdirSync(flags.flash, { recursive: true });
    writeFileSync(`${flashFile}.tmp`, JSON.stringify(report.flash)); // then renamed: never half a file
    renameSync(`${flashFile}.tmp`, flashFile);
  }
  if (report.boots?.length > 1 || flags.flash)
    console.log("Boots:\n" + report.boots.map((b) => `  ${(b.t / 1e6).toFixed(2).padStart(6)} s  slot ${b.slot ?? "-"}  ${b.version ?? "(no version)"}  ${b.reason}`).join("\n"));
  delete report.flash;
  return finish(report, flags, name, null);
}

function finish(report, flags, name, headline) {
  if (report.serial?.length && !flags.listen) {
    console.log("Serial monitor:");
    for (const l of report.serial.slice(0, 200)) console.log(`  ${(l.t / 1e6).toFixed(2).padStart(6)} s  ${l.text}`);
    if (report.serial.length > 200) console.log(`  … ${report.serial.length - 200} more lines`);
  }
  if (flags.json) writeFileSync(flags.json, JSON.stringify(report, null, 1));
  if (flags.events) writeFileSync(flags.events, (report.events ?? []).join("\n") + "\n");
  if (headline) console.log(headline);
  const line = describe(report, { name });
  console.log(`${report.ok ? "✓" : "✗"} ${line ?? report.message}`);
  if (report.reason !== "watchdog" && report.reason !== "crash") console.log(`  robot time ${(report.virtualMs / 1000).toFixed(1)} s · LED toggled ${report.led.toggles} times · ${report.bumps ?? 0} bumps`);
  if (report.realWorld) {
    const rw = report.realWorld, parts = [["sensorNoise", "sensor noise"], ["wheelSlip", "wheel slip"], ["batterySag", "battery sag"]].filter(([k]) => rw[k] !== false).map(([, n]) => n);
    if (parts.length === 3) console.log(`  real world on (seed ${rw.seed}) · battery ${report.battery.startVolts} V → ${report.battery.volts} V · encoder ticks ${report.ticks.join(" / ")}`);
    else console.log(`  real world: ${parts.join(", ") || "nothing"} on (seed ${rw.seed}) · encoder ticks ${report.ticks.join(" / ")}`);
  }
  for (const b of report.boxes ?? []) console.log(`  box at row ${b.row}, column ${b.col}${b.from || b.to != null ? `, from ${b.from} s${b.to != null ? ` to ${b.to} s` : ""}` : ""}`);
  if (report.testDrive) {
    const d = report.testDrive;
    if (d.kind === "square") console.log(`  square test (${d.route}): ended ${d.endGapCm} cm from where it started, facing ${Math.abs(d.headingOffDeg)}° ${d.headingOffDeg > 0 ? "right of" : d.headingOffDeg < 0 ? "left of" : "exactly"} north`);
    else console.log(`  straight test, ${d.tiles} tiles (${d.bookCm} cm by the book): drove ${d.trueCm} cm (the simulator's truth) · encoder ticks ${d.ticks.join(" / ")}, average ${d.avgTicks} · ${d.cmPerTick ?? "—"} cm per tick`);
  } else if (report.route && !headline) console.log(`  asked to drive ${report.route} (courier::route())`);
  if (report.belief) console.log(`  belief (last pose line, ${(report.belief.t / 1e6).toFixed(2)} s): e=${report.belief.e} n=${report.belief.n} h=${report.belief.h} · truth now: e=${report.truth.e} n=${report.truth.n} h=${report.truth.h} · ${report.beliefGapCm} cm apart`);
  if (report.loopGap) console.log(`  longest loop() gap ${report.loopGap.ms} ms (from ${(report.loopGap.fromMs / 1000).toFixed(2)} s${report.loopGap.running ? ", still running at the end" : ""})`);
  if (report.network) {
    const n = report.network;
    console.log(`  Wi-Fi: ${n.ip ? `on ${n.ssid} as ${n.ip}` : `not connected (${n.ssid})`} · listening on ${n.listening.join(", ") || "no port"} · ${n.connections} connections, ${n.refused} refused · ${n.bytesIn} bytes in, ${n.bytesOut} out`);
  }
  return report.ok ? 0 : 1;
}

function clock(t) { return `${(t / 1e6).toFixed(2).padStart(6)} s`; }

function inWorker(data, flags) {
  const watchdogMs = Number(flags.watchdog ?? 5000);
  return new Promise((done) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: data });
    let beat = Date.now(), seen = null, t = 0, flash = null; // flash: as of the robot's last change
    const timer = setInterval(() => {
      if (Date.now() - beat > watchdogMs) {
        clearInterval(timer);
        w.terminate();
        done({ ...endedReport({ map: data.opts.map, reason: "watchdog", last: seen, virtualMs: Math.round(t / 1000),
          message: "Watchdog reset: the firmware ran without giving the board a turn (a loop with no delay() or reading?)" }), flash });
      }
    }, 100);
    let stopping = null;
    const onSignal = () => {
      if (stopping) return;
      w.postMessage("stop"); // the run ends at the firmware's next board call, with a full report
      stopping = setTimeout(() => { clearInterval(timer); w.terminate(); done({ ...endedReport({ map: data.opts.map, reason: "stopped", last: seen, virtualMs: Math.round(t / 1000), message: "stopped" }), flash }); }, 2000);
    };
    if (data.listen) { process.on("SIGINT", onSignal); process.on("SIGTERM", onSignal); }
    w.on("message", (m) => {
      beat = Date.now();
      if (m.type === "serial") console.log(`  ${clock(m.l.t)}  ${m.l.text}`);
      else if (m.type === "event") { const [, ms, rest] = /^@(\d+) (.*)$/.exec(m.line); console.log(`  ${clock(Number(ms) * 1000)}  · ${rest}`); }
      else if (m.type === "port") console.log(`  → the robot's port ${m.port} is at localhost:${m.port}`);
      else if (m.type === "port-error") console.log(`  ✗ can't open localhost:${m.port} for the robot (${m.code === "EADDRINUSE" ? "something on this machine already uses it: another simulator still running?" : m.code})`);
      if (m.type === "beat") { if (m.t !== null) t = m.t; if (m.s) seen = m.s; }
      if (m.type === "flash") flash = m.flash;
      if (m.type === "done") {
        clearInterval(timer); clearTimeout(stopping); w.terminate();
        process.off("SIGINT", onSignal); process.off("SIGTERM", onSignal);
        done({ ...m.report, flash: m.flash ?? flash });
      }
    });
    w.on("error", (e) => { clearInterval(timer); done({ ...endedReport({ map: data.opts.map, reason: "crash", last: seen, virtualMs: Math.round(t / 1000), message: `the simulator stopped: ${e.message}` }), flash }); });
  });
}

// Stop 20: labelled camera frames, as files a training script reads (PGM images and labels.csv).
function dataset(flags) {
  if (!flags.out) { console.error("✗ dataset needs --out DIR"); return 2; }
  const count = Number(flags.count ?? 1000), seed = Number(flags.seed ?? 1), empty = Number(flags.empty ?? 0.2);
  const [w, h] = String(flags.size ?? "96x96").split("x").map(Number);
  if (!Number.isInteger(count) || count < 1 || count > 200000) { console.error("✗ --count takes a whole number, 1–200000"); return 2; }
  if (!(w >= 8 && h >= 8 && w <= 160 && h <= 120 && Number.isInteger(w) && Number.isInteger(h))) { console.error("✗ --size takes WxH, from 8x8 up to 160x120 (the camera's largest)"); return 2; }
  if (!Number.isInteger(seed) || !(empty >= 0 && empty <= 1)) { console.error("✗ --seed takes a whole number and --empty a share, 0–1"); return 2; }
  if (existsSync(join(flags.out, "labels.csv"))) { console.error(`✗ ${flags.out} already has a dataset (labels.csv); choose another --out`); return 2; }
  mkdirSync(join(flags.out, "images"), { recursive: true });
  const t0 = performance.now(), counts = Object.fromEntries(LABELS.map((l) => [l, 0]));
  const all = [];
  for (let start = 0; start < count; start += 500) {
    const part = makeDataset({ count: Math.min(500, count - start), w, h, seed, empty, offset: start });
    part.forEach((s, i) => {
      writeFileSync(join(flags.out, "images", `${String(start + i + 1).padStart(5, "0")}.pgm`), toPGM(s.px, w, h));
      counts[s.label]++;
      all.push({ ...s, px: null, scene: null });
    });
  }
  writeFileSync(join(flags.out, "labels.csv"), toCSV(all));
  console.log(`✓ ${count} frames (${w}×${h}, seed ${seed}) in ${flags.out}: ${LABELS.map((l) => `${counts[l]} ${l}`).join(", ")} · ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  return 0;
}

// Stop 18: many robots, headless, in real time, each with its own MQTT connection, flash and seed.
async function fleet(wasm, mapText, flags) {
  const robots = Number(flags.robots ?? 10), seconds = Number(flags.seconds ?? 30);
  if (!Number.isInteger(robots) || robots < 1 || robots > 2000) { console.error("✗ --robots takes a whole number, 1–2000"); return 2; }
  if (!(seconds > 0)) { console.error("✗ --seconds takes a number of seconds"); return 2; }
  let publicKey = null;
  if (flags.key) {
    try { publicKey = fromHex(readFileSync(flags.key, "utf8").trim()); } catch { console.error(`✗ can't read the key ${flags.key}`); return 2; }
  }
  const seed = "real-world" in flags ? Number(flags["real-world"]) : null;
  if (seed !== null && !(Number.isInteger(seed) && seed >= 0)) { console.error("✗ --real-world takes a seed, a whole number"); return 2; }
  console.log(`Fleet: ${robots} robots for ${seconds} s, ${flags.mqtt ? `MQTT ${flags.mqtt}` : "an in-memory broker (no --mqtt)"}${seed !== null ? `, real world from seed ${seed}` : ""}`);
  const s = await runFleet({
    wasm, robots, seconds, map: mapText, mqtt: flags.mqtt ?? null, realWorld: seed, publicKey,
    flashDir: flags.flash ?? null, serve: flags.serve ?? null, watchdogMs: flags.watchdog ? Number(flags.watchdog) : 5000,
    prefix: flags.prefix ?? "robot-",
    onTick: (t) => console.log(`  ${t.wallS.toFixed(1).padStart(5)} s  ${String(t.msgsPerS).padStart(6)} msg/s sent${flags.mqtt ? ` · ${String(t.received).padStart(8)} reached the broker so far` : ""} · lag ≤ ${t.lagMsMax} ms · CPU ${t.cpuPct}% · ${t.rssMB} MB`),
  });
  if (flags.json) writeFileSync(flags.json, JSON.stringify(s, null, 1));
  if (s.reason === "watchdog" || s.reason === "no-broker" || s.reason === "crash") { console.log(`✗ ${s.message}`); return 1; }
  const bad = s.robotsReport.filter((r) => !r.ok);
  console.log(`${s.ok ? "✓" : "✗"} ${robots} robots ran ${seconds} s of robot time in ${s.wallS} s: ${s.published} messages (${s.msgsPerS}/s)` +
    (s.broker ? `, ${s.broker.received} reached the broker` : ""));
  console.log(`  steady state: ${s.steady.msgsPerS ?? "-"} msg/s · CPU ${s.steady.cpuPct ?? "-"}% of a core · up to ${s.steady.rssMB} MB · robots up to ${s.steady.lagMsMax} ms behind the wall clock`);
  for (const r of bad.slice(0, 10)) console.log(`  ✗ ${r.robot}: ${r.message ?? r.reason}`);
  return s.ok ? 0 : 1;
}

// courier::net::get in the CLI: a URL's path, read from the --serve folder (never outside it).
function serveFile(dir, url) {
  let path;
  try { path = decodeURIComponent(new URL(url).pathname); } catch { return null; }
  const file = resolve(dir, "." + path);
  if (!file.startsWith(dir + sep) || !existsSync(file) || !statSync(file).isFile()) return { status: 404, body: "not found" };
  return { status: 200, body: new Uint8Array(readFileSync(file)) };
}

// Stop 17: a key pair for signing firmware. The .pem is private (never commit it); the .pub (hex)
// goes on the robots.
function keygen(flags) {
  if (!flags.out) { console.error("✗ keygen needs --out <name> (it writes <name>.pem and <name>.pub)"); return 2; }
  for (const ext of ["pem", "pub", "h"])
    if (existsSync(`${flags.out}.${ext}`)) { console.error(`✗ ${flags.out}.${ext} exists; keygen never overwrites a key`); return 2; }
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  mkdirSync(dirname(resolve(flags.out)), { recursive: true });
  writeFileSync(`${flags.out}.pem`, privateKey.export({ format: "pem", type: "pkcs8" }), { mode: 0o600 });
  const hex = toHex(publicKey.export({ format: "der", type: "spki" }).subarray(-32));
  writeFileSync(`${flags.out}.pub`, hex + "\n");
  writeFileSync(`${flags.out}.h`, `// The public key Courier robots check updates against (Stop 17). Copy it next to main.cpp as\n// courier_key.h for the real kit; the simulator takes ${basename(flags.out)}.pub (--key).\n#define COURIER_OTA_KEY "${hex}"\n`);
  console.log(`✓ wrote ${flags.out}.pem (private: keep it out of git), ${flags.out}.pub and ${flags.out}.h (the public key, for robots)`);
  return 0;
}

function signImage(args, flags) {
  if (!args[0] || !flags.key) { console.error("✗ usage: node cli.mjs sign <image.wasm> --key <name>.pem"); return 2; }
  let key, image;
  try { key = createPrivateKey(readFileSync(flags.key)); } catch { console.error(`✗ can't read a private key from ${flags.key}`); return 2; }
  try { image = readFileSync(args[0]); } catch { console.error(`✗ can't open ${args[0]}`); return 2; }
  const sig = signBytes(null, image, key);
  writeFileSync(`${args[0]}.sig`, sig);
  console.log(`✓ signed ${args[0]} (${image.length} bytes): ${args[0]}.sig, public key ${toHex(createPublicKey(key).export({ format: "der", type: "spki" }).subarray(-32))}`);
  return 0;
}

// The firmware's files: a PlatformIO project (src/, include/, lib/*) or a list of files.
function collectFirmware(args, flags) {
  const files = {}, includeDirs = [];
  const add = (root, abs) => { files[relative(root, abs).split(sep).join("/")] = readFileSync(abs, "utf8"); };
  if (args.length === 1 && existsSync(args[0]) && statSync(args[0]).isDirectory()) {
    const root = resolve(args[0]);
    const walk = (dir) => {
      if (!existsSync(dir)) return;
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith(".")) continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(c|cc|cpp|cxx|ino|h|hpp)$/.test(e.name)) add(root, p);
      }
    };
    walk(join(root, "src"));
    walk(join(root, "include"));
    if (existsSync(join(root, "include"))) includeDirs.push("include");
    const lib = join(root, "lib");
    if (existsSync(lib)) {
      for (const e of readdirSync(lib, { withFileTypes: true })) {
        if (!e.isDirectory() || e.name === "arduino_sim" || e.name.startsWith(".")) continue;
        walk(join(lib, e.name));
        includeDirs.push(`lib/${e.name}`);
        if (existsSync(join(lib, e.name, "src"))) includeDirs.push(`lib/${e.name}/src`);
      }
    }
    includeDirs.push("src");
    if (!Object.keys(files).some((p) => /\.(c|cc|cpp|cxx|ino)$/.test(p))) {
      console.error(`✗ no .cpp files in ${join(args[0], "src")}`);
      return null;
    }
  } else {
    for (const a of args) {
      if (!existsSync(a)) { console.error(`✗ can't open ${a}`); return null; }
      files[basename(a)] = readFileSync(a, "utf8");
    }
    includeDirs.push(".");
  }
  for (const d of [flags.I ?? []].flat()) {
    const root = resolve(d);
    for (const e of readdirSync(root)) if (/\.(h|hpp)$/.test(e)) files[`__extra/${basename(root)}/${e}`] = readFileSync(join(root, e), "utf8");
    includeDirs.unshift(`__extra/${basename(root)}`);
  }
  return { files, includeDirs };
}

async function loadClang() {
  let url = process.env.COURIER_CLANG ? pathToFileURL(resolve(process.env.COURIER_CLANG)).href : null;
  if (!url) {
    for (const from of [join(process.cwd(), "noop.js"), join(KIT_DIR, "noop.js")]) {
      try { url = pathToFileURL(createRequire(from).resolve("@yowasp/clang")).href; break; } catch { /* try the next */ }
    }
  }
  if (!url) {
    console.error(`✗ Compiling firmware needs clang for WebAssembly. Install it next to your project:
    npm install --save-exact @yowasp/clang@${CLANG_VERSION}`);
    return null;
  }
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", url), "utf8"));
    if (pkg.version !== CLANG_VERSION) console.error(`note: @yowasp/clang ${pkg.version} found; this kit is tested with ${CLANG_VERSION}`);
  } catch { /* COURIER_CLANG pointing somewhere unusual */ }
  return (await import(url)).commands;
}

function parseArgs(argv) {
  const flags = {}, args = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-I") (flags.I ??= []).push(argv[++i]);
    else if (a === "--box") {
      if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) return { error: "--box needs a value: ROW,COL or ROW,COL@FROM-TO (seconds)", flags, args };
      (flags.box ??= []).push(argv[++i]); // may be given more than once
    }
    else if (a.startsWith("-I") && a.length > 2) (flags.I ??= []).push(a.slice(2));
    else if (a === "--help" || a === "-h") flags.help = true;
    else if (a.startsWith("--")) {
      const name = a.slice(2);
      if (!Object.values(OPTIONS).some((o) => o.includes(name))) return { error: `there's no option --${name}`, flags, args };
      if (BOOLEAN.has(name)) flags[name] = true;
      else if (name === "real-world") flags[name] = /^\d+$/.test(argv[i + 1] ?? "") ? argv[++i] : true;
      else if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) return { error: `--${name} needs a value`, flags, args };
      else flags[name] = argv[++i];
    } else args.push(a);
  }
  return { cmd: args.shift(), args, flags };
}
