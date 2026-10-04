// The robot's Wi-Fi (Stop 6): a simulated network in robot time. The firmware joins it (WiFi.begin),
// gets an IP address and listens on ports (WiFiServer); programs outside the robot connect to those
// ports and exchange bytes with it, as over TCP: a stream, in order, in whatever chunks were sent.
//
//   import { createNetwork } from "courier/net.js";
//   const net = createNetwork();                         // "courier-office", open, Pip at 192.168.4.23
//   const report = await simulate({ wasm, map, network: net, seconds: 20, setup: () => {
//     net.at(3000, () => {                               // at 3 s of robot time…
//       const c = net.connect(7000, { onData: (b) => replies.push(text(b)) });
//       if (c.ok) c.send('{"cmd":"ping"}\n');            // …or c.error: "refused" | "unreachable"
//     });
//   } });
//
// The same network answers in the CLI's real-time mode (`run --listen`), where real sockets on
// localhost forward to it. Each direction takes `latencyMs` (default 2 ms). Nothing here uses the
// wall clock: a run is the same every time.

/** WiFi.status() values, as in arduino-esp32. */
export const WL = Object.freeze({ IDLE_STATUS: 0, NO_SSID_AVAIL: 1, CONNECTED: 3, CONNECT_FAILED: 4, CONNECTION_LOST: 5, DISCONNECTED: 6 });

/** A connection's receive window: a peer that sends more than this waits until the robot reads. */
export const WINDOW_BYTES = 16384;

const enc = new TextEncoder();
const bytesOf = (b) => (typeof b === "string" ? enc.encode(b) : b instanceof Uint8Array ? b : new Uint8Array(b));

/**
 * @param {{ ssid?: string, password?: string | null, ip?: string, joinMs?: number, latencyMs?: number,
 *           peerClock?: () => number }} [opts]
 *   `ssid`/`password`: the network that exists (default "courier-office", open: any password works).
 *   `ip`: the address the robot gets. `joinMs`: how long joining takes (default 1500 ms).
 *   `peerClock`: when outside programs act, in robot µs (the CLI's real-time mode: the wall clock).
 *   Default: the robot's own clock.
 */
export function createNetwork(opts = {}) {
  const ssid = opts.ssid ?? "courier-office";
  const password = opts.password ?? null;
  const ip = opts.ip ?? "192.168.4.23";
  const joinUs = Math.round((opts.joinMs ?? 1500) * 1000);
  const latencyUs = Math.round((opts.latencyMs ?? 2) * 1000);
  let clock = () => 0, log = null;
  let status = WL.IDLE_STATUS, joinAt = null, joinResult = WL.CONNECTED;
  const listening = new Set(); // ports the firmware listens on
  const backlog = new Map(); // port → connections not yet accepted
  const conns = new Map(); // id → connection
  const timers = []; // { at, fn } from at()
  const listeners = new Set(); // forwarders: on("listen"/"unlisten", port)
  let nextId = 1;
  const stats = { connections: 0, refused: 0, bytesIn: 0, bytesOut: 0 };
  const event = (kind, detail) => log?.(kind, detail);
  const now = () => clock();
  const peerNow = () => (opts.peerClock ? Math.max(0, Math.round(opts.peerClock())) : clock());
  const reachable = () => status === WL.CONNECTED;
  const open = (port) => reachable() && listening.has(port);
  const emit = (what, port) => { for (const l of listeners) l(what, port); };

  function settle() {
    if (joinAt !== null && now() >= joinAt) {
      status = joinResult;
      joinAt = null;
      if (status === WL.CONNECTED) {
        event("wifi", `connected ${ssid} ${ip}`);
        for (const p of listening) emit("listen", p);
      } else event("wifi", `failed ${ssid} (${status === WL.NO_SSID_AVAIL ? "no such network" : "wrong password"})`);
    }
  }
  // Bytes that have arrived by now, in a connection's queue toward one side.
  const arrived = (q) => { let n = 0; for (const c of q) { if (c.at > now()) break; n += c.bytes.length - c.off; } return n; };

  function closeConn(c, by) {
    if (by === "robot" && !c.robotClosed) {
      c.robotClosed = true;
      c.toPeer.push({ at: now() + latencyUs, bytes: null, off: 0 }); // the peer sees the close after the data
      event("net", `close #${c.id} (robot)`);
    } else if (by === "peer" && c.peerClosedAt === null) {
      c.peerClosedAt = peerNow() + latencyUs;
      event("net", `close #${c.id} (peer)`);
    }
  }

  const robot = {
    /** WiFi.begin: starts joining; WiFi.status() is DISCONNECTED until it's done. */
    begin(name, pass) {
      if (status === WL.CONNECTED && name === ssid) return status;
      joinResult = name !== ssid ? WL.NO_SSID_AVAIL : password !== null && pass !== password ? WL.CONNECT_FAILED : WL.CONNECTED;
      status = WL.DISCONNECTED;
      joinAt = now() + (joinResult === WL.CONNECTED ? joinUs : joinUs * 2);
      event("wifi", `begin ${name}`);
      return status;
    },
    status() { settle(); return status; },
    disconnect() {
      settle();
      if (status === WL.CONNECTED) for (const p of listening) emit("unlisten", p);
      for (const c of conns.values()) if (!c.robotClosed) closeConn(c, "robot");
      status = WL.DISCONNECTED; joinAt = null;
      event("wifi", "disconnected");
    },
    /** The robot's address as a number (first octet in the low byte, as IPAddress keeps it); 0 if not joined. */
    ip() {
      settle();
      if (status !== WL.CONNECTED) return 0;
      return ip.split(".").reduce((v, o, i) => v | ((Number(o) & 255) << (8 * i)), 0) >>> 0;
    },
    listen(port) {
      if (!(port > 0 && port < 65536)) return -1;
      if (listening.has(port)) return 0;
      listening.add(port);
      backlog.set(port, []);
      event("net", `listen ${port}`);
      if (reachable()) emit("listen", port);
      return 0;
    },
    /** The next connection waiting on `port`, or −1. */
    accept(port) {
      const q = backlog.get(port);
      const c = q?.find((x) => x.at <= now());
      if (!c) return -1;
      q.splice(q.indexOf(c), 1);
      c.accepted = true;
      return c.id;
    },
    connected(id) {
      const c = conns.get(id);
      if (!c || c.robotClosed) return 0;
      // as on the chip: still "connected" while unread bytes remain, even after the peer closed
      return c.peerClosedAt === null || now() < c.peerClosedAt || arrived(c.toRobot) > 0 ? 1 : 0;
    },
    available(id) {
      const c = conns.get(id);
      return c && !c.robotClosed ? arrived(c.toRobot) : 0;
    },
    /** Reads up to `max` bytes that have arrived (a Uint8Array, maybe empty), or null for no connection. */
    read(id, max) {
      const c = conns.get(id);
      if (!c || c.robotClosed) return null;
      const out = [];
      while (out.length < max && c.toRobot.length && c.toRobot[0].at <= now()) {
        const chunk = c.toRobot[0];
        const take = Math.min(max - out.length, chunk.bytes.length - chunk.off);
        for (let i = 0; i < take; i++) out.push(chunk.bytes[chunk.off + i]);
        chunk.off += take;
        if (chunk.off >= chunk.bytes.length) c.toRobot.shift();
      }
      c.buffered -= out.length;
      if (out.length && c.waiting && c.buffered < WINDOW_BYTES / 4) { c.waiting = false; c.peer.onDrain?.(); }
      return Uint8Array.from(out);
    },
    peek(id) {
      const c = conns.get(id);
      const chunk = c && !c.robotClosed ? c.toRobot[0] : null;
      return chunk && chunk.at <= now() ? chunk.bytes[chunk.off] : -1;
    },
    /** Sends bytes to the peer; how many were taken (0 when the connection is gone). */
    write(id, bytes) {
      const c = conns.get(id);
      if (!c || c.robotClosed || (c.peerClosedAt !== null && now() >= c.peerClosedAt) || !reachable()) return 0;
      c.toPeer.push({ at: now() + latencyUs, bytes: Uint8Array.from(bytes), off: 0 });
      stats.bytesOut += bytes.length;
      return bytes.length;
    },
    close(id) { const c = conns.get(id); if (c) closeConn(c, "robot"); },
    /** The chip restarted: its connections are gone (peers see them close) and it has left the Wi-Fi. */
    reset() {
      if (status === WL.CONNECTED) for (const p of listening) emit("unlisten", p);
      for (const c of conns.values()) if (!c.robotClosed) closeConn(c, "robot");
      listening.clear(); backlog.clear();
      status = WL.IDLE_STATUS; joinAt = null;
    },
    /** Moves the network on to the robot's current time: delivers to peers, runs at() callbacks. */
    tick() {
      settle();
      const t = now();
      while (timers.length && timers[0].at <= t) timers.shift().fn();
      for (const c of conns.values()) {
        while (c.toPeer.length && c.toPeer[0].at <= t) {
          const chunk = c.toPeer.shift();
          if (chunk.bytes === null) { if (!c.peerGone) { c.peerGone = true; c.peer.onClose?.(); } }
          else if (!c.peerGone) c.peer.onData?.(chunk.bytes);
        }
        if (c.robotClosed && c.peerGone) conns.delete(c.id);
      }
    },
  };

  return {
    ssid, ip,
    /** Gives the network its clock (robot time in µs) and the run's event log (sim.js does this). */
    attach(fn, events = null) { clock = fn; log = events; },
    robot,
    /** Runs `fn` when robot time reaches `ms` (for scripted peers in sims and tests). */
    at(ms, fn) {
      timers.push({ at: Math.round(ms * 1000), fn });
      timers.sort((a, b) => a.at - b.at);
    },
    /**
     * Connects to the robot's `port` from outside, now. Returns { ok: false, error } when nothing
     * listens ("refused") or the robot isn't on the Wi-Fi ("unreachable"; a real client would wait
     * and time out). Otherwise a connection: send(bytes or text), close(), and your onData/onClose
     * called as the robot's bytes arrive (in robot time).
     * @param {number} port
     * @param {{ onData?: (b: Uint8Array) => void, onClose?: () => void, onDrain?: () => void }} [peer]
     */
    connect(port, peer = {}) {
      settle();
      if (!reachable()) { stats.refused++; event("net", `connect ${port} -> unreachable`); return { ok: false, error: "unreachable" }; }
      if (!open(port) || backlog.get(port).length >= 5) { stats.refused++; event("net", `connect ${port} -> refused`); return { ok: false, error: "refused" }; }
      const c = { id: nextId++, port, at: peerNow() + latencyUs, toRobot: [], toPeer: [], buffered: 0, waiting: false,
        robotClosed: false, peerClosedAt: null, peerGone: false, accepted: false, peer };
      conns.set(c.id, c);
      backlog.get(port).push(c);
      stats.connections++;
      event("net", `connect ${port} #${c.id}`);
      return {
        ok: true, id: c.id,
        /** Sends bytes (or text, as UTF-8). False if the robot's window is full: wait for onDrain. */
        send(b) {
          if (c.peerClosedAt !== null || c.robotClosed) return false;
          const bytes = bytesOf(b);
          c.toRobot.push({ at: peerNow() + latencyUs, bytes, off: 0 });
          c.buffered += bytes.length;
          stats.bytesIn += bytes.length;
          if (c.buffered >= WINDOW_BYTES) { c.waiting = true; return false; }
          return true;
        },
        close() { closeConn(c, "peer"); },
        /** Bytes sent but not yet read by the firmware. */
        get buffered() { return c.buffered; },
        get closed() { return c.peerGone; },
      };
    },
    /** Forwarders (the CLI) hear when a port opens to the outside (robot on Wi-Fi and listening) or closes. */
    onPorts(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** Ports open to the outside right now. */
    get ports() { return reachable() ? [...listening] : []; },
    get status() { return status; },
    /** For the report. */
    summary() {
      return { ssid, ip: status === WL.CONNECTED ? ip : null, status, listening: [...listening], ...stats };
    },
  };
}
