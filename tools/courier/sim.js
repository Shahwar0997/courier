// Runs a Courier robot: learner firmware (WebAssembly from build.js) or the built-in route driver,
// together with the world, in virtual time. Pure JavaScript, no DOM: the browser runs it in a
// worker (runner.js) and CI runs it in Node (the courier CLI, sim-kit tools/courier/, not served);
// the results are identical.
//
//   import { simulate, simulateRoute } from "courier/sim.js";
//   const report = await simulate({ wasm, map: OFFICE, seconds: 30 });
//   const drove = simulateRoute({ route: "EEEESSS…", map: OFFICE });
//
// Why the world steps *inside* the firmware's calls: firmware calls like delay() and
// distanceCm() are synchronous, and the sandbox has no SharedArrayBuffer, so nothing could answer
// them from another thread. delay(5) advances the world 5 ms; a sonar reading advances it by the
// echo's round trip; every call costs a few µs, so even a busy loop moves time forward.

import { createWorld, parseMap, tileCentre, tileAt, angleOf, wrap, headingOf, HEADINGS, MOVES, TILE, isWall, toCompass, parsePose, testDriveOf } from "./world.js";
import { createDevice, SLOT_BYTES, SLOT_NAMES } from "./device.js";
import { verify } from "./sign.js";
import { createNetwork } from "./net.js";

/** How the simulated board is wired: courier-starter's courier_pins.h (COURIER_SIM part). */
export const DEFAULT_WIRING = Object.freeze({ led: 2, leftFwd: 25, leftRev: 26, rightFwd: 32, rightRev: 33, encLeft: 34, encRight: 35 });

/** attachInterrupt modes, as the ESP32's Arduino core numbers them. */
const RISING = 1, FALLING = 2, CHANGE = 3;

/** The serial monitor's speed; firmware must Serial.begin() the same, or the text comes out garbled. */
export const MONITOR_BAUD = 115200;

class Halt extends Error {}
class Crash extends Error {}
/** The firmware restarted the chip (courier::restart(), or a rollback). */
class Reboot extends Error {}

/** What courier::ota and courier::net return when something goes wrong (also in courier.h). */
export const OTA_ERRORS = Object.freeze({
  [-1]: "no update in progress, or this run has no flash (pass a device)",
  [-2]: "the image is bigger than a slot (1.9 MB) or than ota::begin said",
  [-3]: "the image is shorter than ota::begin said",
  [-4]: "the signature doesn't match: not signed by this robot's key, or the image changed",
  [-5]: "this robot has no key to check signatures with, so it accepts no updates",
  [-6]: "the image isn't Courier firmware",
  [-7]: "there's no other slot to roll back to",
});
/** A slot's state as courier::ota::state() numbers it. */
const SLOT_STATES = ["empty", "valid", "new", "pending", "invalid"];

/**
 * Creates a board around a world: the WebAssembly imports firmware calls, plus a record of what
 * happened (serial lines, pin changes, LED toggles) in courier-starter's event-log format.
 * Exposed for sims that want to drive a world from their own JS "firmware".
 * @param {ReturnType<typeof createWorld>} world
 * @param {{ wiring?: Partial<typeof DEFAULT_WIRING>, baud?: number, advance?: (us: number) => void,
 *           onSerial?: (line: { t: number, text: string }) => void,
 *           onFrame?: (f: { w: number, h: number, px: Uint8Array }) => void }} [opts]
 */
export function createBoard(world, opts = {}) {
  const wiring = { ...DEFAULT_WIRING, ...opts.wiring };
  const baud = opts.baud ?? MONITOR_BAUD;
  const step = opts.advance ?? ((us) => world.advance(us));
  // Interrupts (attachInterrupt on the encoder pins): edges are queued as the world steps and each
  // handler runs after the step it happened in, one at a time, as on the chip. While a handler runs
  // or interrupts are off (noInterrupts), further edges on a pin wait, and several become one.
  const isrs = new Map(); // pin → { fn, mode }
  const queue = [];
  let table = null, inIsr = false, irqOn = true;
  const encPin = (side) => (side === 0 ? wiring.encLeft : wiring.encRight);
  world.onEdge = (side, rising) => {
    const pin = encPin(side), h = isrs.get(pin);
    if (!h || !(h.mode === CHANGE || (h.mode === RISING) === rising)) return;
    if ((inIsr || !irqOn) && queue.includes(pin)) return;
    queue.push(pin);
  };
  function dispatch() {
    if (inIsr || !irqOn) return;
    while (queue.length && irqOn) {
      const h = isrs.get(queue.shift());
      if (!h) continue;
      const fn = table?.get(h.fn);
      if (!fn) throw new Crash("the firmware crashed: attachInterrupt was given something that isn't a function");
      inIsr = true;
      try { fn(); } finally { inIsr = false; }
    }
  }
  // Over-the-air updates (Stop 17): an update being written, and an HTTP response being read.
  const device = opts.device ?? null;
  let update = null, response = null;
  const bytes = (ptr, len) => new Uint8Array(memory.buffer, ptr, len).slice();
  // May a board call wait (suspend the firmware) right now? Only with JSPI, and never inside an
  // interrupt handler (the handler was called from inside another board call).
  const asyncOk = () => !!opts.canWait && !inIsr;
  function got(url, r) {
    advance(30000); // a request on the robot's Wi-Fi: about 30 ms before the first byte
    if (!r) { event("net", `GET ${url} -> unreachable`); return -1; }
    event("net", `GET ${url} -> ${r.status}`);
    if (r.status !== 200) return -(r.status | 0 || 1);
    response = { body: typeof r.body === "string" ? new TextEncoder().encode(r.body) : r.body, at: 0 };
    return response.body.length;
  }
  // The Wi-Fi (Stop 6): created on the first WiFi call unless the run brought one (opts.network).
  let network = opts.network ?? null;
  const wifi = () => {
    if (!network) { network = createNetwork(); network.attach(() => world.now(), (k, d) => event(k, d)); }
    return network;
  };
  if (network) network.attach(() => world.now(), (k, d) => event(k, d));
  const advance = (us) => {
    if (!isrs.size) step(us);
    else for (let left = us; left > 0; left -= 1000) { step(Math.min(left, 1000)); dispatch(); }
    network?.robot.tick();
  };
  const modes = new Map(); // pin → mode
  const duty = new Map(); // pin → 0..255 as driven
  const record = { events: [], serial: [], led: { toggles: 0, on: false, changes: [] }, calls: 0, loops: 0 };
  let memory = null, serialOn = false, serialBaud = 0, line = "";
  const ms = () => Math.floor(world.now() / 1000);
  const event = (kind, detail = "") => {
    const line = `@${ms()} ${kind} ${detail}`.trimEnd();
    record.events.push(line);
    opts.onEvent?.(line);
  };

  function flushLine() {
    const text = line.replace(/\r$/, "");
    line = "";
    const entry = { t: world.now(), text };
    record.serial.push(entry);
    event("serial", text);
    opts.onSerial?.(entry);
  }
  function serialText(text) {
    if (!serialOn) return; // like a real chip: nothing is sent before Serial.begin
    if (serialBaud !== baud) text = garble(text, serialBaud);
    for (const ch of text) {
      if (ch === "\n") flushLine();
      else line += ch;
    }
    advance(Math.round((text.length * 10 * 1e6) / Math.max(300, serialBaud))); // 10 bits per character
  }
  function updateMotors() {
    const side = (fwd, rev) => (duty.get(fwd) ?? 0) - (duty.get(rev) ?? 0);
    world.setMotors(side(wiring.leftFwd, wiring.leftRev), side(wiring.rightFwd, wiring.rightRev));
  }
  const isMotorPin = (p) => p === wiring.leftFwd || p === wiring.leftRev || p === wiring.rightFwd || p === wiring.rightRev;
  function drive(pin, value) {
    // A pin only drives its wire as an OUTPUT (analogWrite sets that up itself, as on the ESP32).
    duty.set(pin, value);
    if (pin === wiring.led) {
      const on = value > 0 && modes.get(pin) === 1;
      if (on !== record.led.on) {
        record.led.on = on;
        record.led.toggles++;
        record.led.changes.push({ t: world.now(), on });
      }
      world.robot.led = on;
    }
    if (isMotorPin(pin)) updateMotors();
  }
  const cstr = (ptr, len) => {
    const b = new Uint8Array(memory.buffer, ptr, len);
    return new TextDecoder().decode(b);
  };
  const call = (us) => { record.calls++; advance(us); };

  const imports = {
    millis: () => { call(1); return ms() >>> 0; },
    micros: () => { call(1); return Math.floor(world.now()) >>> 0; },
    delay: (msArg) => { record.calls++; advance(Math.max(0, msArg >>> 0) * 1000); },
    delay_us: (us) => { record.calls++; advance(Math.max(1, us >>> 0)); },
    pin_mode: (pin, mode) => {
      modes.set(pin, mode === 1 ? 1 : 0);
      event("pinMode", `${pin} ${mode === 1 ? "OUTPUT" : "INPUT"}`);
      if (pin === wiring.led && duty.get(pin)) drive(pin, duty.get(pin));
      call(1);
    },
    digital_write: (pin, value) => {
      event("digitalWrite", `${pin} ${value ? "HIGH" : "LOW"}`);
      drive(pin, value ? 255 : 0);
      call(1);
    },
    digital_read: (pin) => {
      call(1);
      if (pin === wiring.encLeft || pin === wiring.encRight) return world.encoderLevel(pin === wiring.encLeft ? 0 : 1);
      return modes.get(pin) === 1 && duty.get(pin) ? 1 : 0;
    },
    analog_write: (pin, value) => {
      const v = Math.max(0, Math.min(255, value | 0));
      event("analogWrite", `${pin} ${v}`);
      if (!modes.has(pin)) modes.set(pin, 1);
      drive(pin, v);
      call(5);
    },
    analog_read: () => { call(10); return 0; },
    serial_begin: (b) => { serialOn = true; serialBaud = b >>> 0; call(10); },
    serial_write: (ptr, len) => { record.calls++; serialText(cstr(ptr, len)); },
    attach_interrupt: (pin, fn, mode) => {
      call(5);
      if (pin !== wiring.encLeft && pin !== wiring.encRight) return; // nothing else on the board makes edges
      isrs.set(pin, { fn, mode: mode === FALLING ? FALLING : mode === CHANGE ? CHANGE : RISING });
    },
    detach_interrupt: (pin) => { call(5); isrs.delete(pin); },
    interrupts: (on) => { record.calls++; irqOn = !!on; if (irqOn) dispatch(); },
    // courier.h: the board by function (Stop 4 on)
    motors: (l, r) => {
      world.setMotors(l, r);
      event("motors", `${world.robot.cmdL} ${world.robot.cmdR}`);
      call(5);
    },
    distance_cm: () => {
      record.calls++;
      const cm = world.sonarCm();
      advance(10 + (cm > 0 ? cm * 58 : 25000)); // trigger pulse + echo round trip (or the timeout)
      return cm;
    },
    line_read: (i) => { call(5); return world.onTape(i) ? 1 : 0; },
    ticks: (side) => { call(1); return side === 0 || side === 1 ? world.ticks[side] | 0 : -1; },
    battery_volts: () => { call(10); return Math.round(world.battery.volts * 100) / 100; },
    camera_grab: (ptr, w, h) => {
      record.calls++;
      if (w < 1 || h < 1 || w > 160 || h > 120) return 0;
      const px = world.camera(w, h);
      new Uint8Array(memory.buffer, ptr, w * h).set(px);
      opts.onFrame?.({ w, h, px });
      advance(30000); // a real camera frame takes about 30 ms
      return 1;
    },
    // courier.h, Stop 17: restart, the two firmware slots, and downloads
    restart: () => { record.calls++; throw new Reboot("restart"); },
    ota_begin: (size) => {
      call(5);
      if (!device) return -1;
      size >>>= 0;
      if (size > SLOT_BYTES) return -2;
      update = { buf: new Uint8Array(size), n: 0 };
      advance(Math.ceil(size / 4096) * 45000); // erasing flash: about 45 ms per 4 KB sector
      return 0;
    },
    ota_write: (ptr, len) => {
      record.calls++;
      if (!update) return -1;
      if (update.n + len > update.buf.length) { update = null; return -2; }
      update.buf.set(new Uint8Array(memory.buffer, ptr, len), update.n);
      update.n += len;
      advance(5 + len * 10); // writing flash: about 100 KB/s
      return 0;
    },
    ota_end: (sigPtr) => {
      call(3000); // checking a signature takes the chip a few ms
      if (!update) return -1;
      const u = update;
      update = null;
      if (u.n < u.buf.length) return -3;
      if (!device.publicKey) return -5;
      if (!verify(device.publicKey, u.buf, bytes(sigPtr, 64))) return -4;
      const info = firmwareInfo(u.buf);
      if (!info) return -6;
      device.install(u.buf, info.version);
      event("ota", `wrote slot ${SLOT_NAMES[device.boot]} (${u.buf.length} bytes)`);
      return 0;
    },
    ota_confirm: () => { call(5); return device?.confirm() ? 0 : -1; },
    ota_rollback: () => {
      record.calls++;
      if (!device?.rollback()) return -7;
      throw new Reboot("rollback");
    },
    ota_running: () => { call(1); return device?.running ?? 0; },
    ota_version: (slot, ptr, max) => {
      call(5);
      const v = device && (slot === 0 || slot === 1) ? device.slots[slot].version : null;
      if (v == null || max < 1) return -1;
      const b = new TextEncoder().encode(v).subarray(0, Math.max(0, max - 1));
      new Uint8Array(memory.buffer, ptr, b.length + 1).set([...b, 0]);
      return b.length;
    },
    ota_state: (slot) => { call(1); return device && (slot === 0 || slot === 1) ? SLOT_STATES.indexOf(device.slots[slot].state) : -1; },
    net_get: (ptr, len) => {
      call(5);
      response = null;
      const url = cstr(ptr, len);
      let r = null;
      try { r = opts.net?.get?.(url) ?? null; } catch { r = null; }
      // A real download (Node, the fleet runner) answers later: the firmware waits for it, suspended
      // (JSPI). Elsewhere (a sim's bucket, the CLI's --serve) it answers at once.
      if (r && typeof r.then === "function") {
        if (!asyncOk()) { advance(30000); event("net", `GET ${url} -> unreachable`); return -1; }
        return r.then((x) => got(url, x), () => got(url, null));
      }
      return got(url, r);
    },
    // courier.h, Stop 18: MQTT (the fleet's telemetry) and the robot's name
    mqtt_publish: (tp, tl, pp, pl) => {
      record.calls++;
      if (!opts.mqtt) return -1;
      const ok = opts.mqtt.publish(cstr(tp, tl), bytes(pp, pl));
      advance(300 + pl); // handing a message to the Wi-Fi: well under a millisecond
      return ok === false ? -2 : 0;
    },
    mqtt_subscribe: (tp, tl) => { call(100); if (!opts.mqtt) return -1; opts.mqtt.subscribe(cstr(tp, tl)); return 0; },
    mqtt_poll: (tp, tmax, pp, pmax) => {
      call(5);
      const m = opts.mqtt?.inbox?.shift();
      if (!m) return -1;
      if (tmax > 0) {
        const t = new TextEncoder().encode(m.topic).subarray(0, tmax - 1);
        new Uint8Array(memory.buffer, tp, t.length + 1).set([...t, 0]);
      }
      const body = typeof m.payload === "string" ? new TextEncoder().encode(m.payload) : m.payload;
      if (pmax < 1) return 0;
      const n = Math.min(body.length, pmax - 1); // a longer message is cut to fit, and ended with a 0 byte
      new Uint8Array(memory.buffer, pp, n + 1).set([...body.subarray(0, n), 0]);
      return n; // what's in the buffer, never more
    },
    // courier::route() (from 0.9): the route this run asks the firmware to drive (a test drive, or
    // --route), or −1 when it asks for none (the firmware drives its own).
    route: (ptr, max) => {
      call(1);
      if (opts.route == null || max < 1) return -1;
      const b = new TextEncoder().encode(String(opts.route)).subarray(0, max - 1);
      new Uint8Array(memory.buffer, ptr, b.length + 1).set([...b, 0]);
      return b.length;
    },
    robot_id: (ptr, max) => {
      call(1);
      const b = new TextEncoder().encode(opts.name ?? device?.name ?? "robot").subarray(0, Math.max(0, max - 1));
      new Uint8Array(memory.buffer, ptr, b.length + 1).set([...b, 0]);
      return b.length;
    },
    // WiFi.h, Stop 6: the robot's Wi-Fi and TCP (net.js)
    wifi_begin: (sp, sl, pp, pl) => { call(50); return wifi().robot.begin(cstr(sp, sl), pp ? cstr(pp, pl) : null); },
    wifi_status: () => { call(5); return wifi().robot.status(); },
    wifi_ip: () => { call(5); return wifi().robot.ip(); },
    wifi_disconnect: () => { call(50); wifi().robot.disconnect(); },
    tcp_listen: (port) => { call(50); return wifi().robot.listen(port); },
    tcp_accept: (port) => { call(10); return wifi().robot.accept(port); },
    tcp_connected: (id) => { call(5); return wifi().robot.connected(id); },
    tcp_available: (id) => { call(5); return wifi().robot.available(id); },
    tcp_read: (id, ptr, max) => {
      record.calls++;
      const b = wifi().robot.read(id, Math.max(0, max));
      if (b === null) { advance(5); return -1; }
      new Uint8Array(memory.buffer, ptr, b.length).set(b);
      advance(5 + b.length); // about 1 MB/s out of the Wi-Fi's buffers
      return b.length;
    },
    tcp_peek: (id) => { call(5); return wifi().robot.peek(id); },
    tcp_write: (id, ptr, len) => {
      record.calls++;
      const n = wifi().robot.write(id, bytes(ptr, len));
      advance(30 + (len >> 1)); // handing bytes to the Wi-Fi
      return n;
    },
    tcp_close: (id) => { call(20); wifi().robot.close(id); },
    net_read: (ptr, max) => {
      record.calls++;
      if (!response) return -1;
      const n = Math.min(max, response.body.length - response.at);
      new Uint8Array(memory.buffer, ptr, n).set(response.body.subarray(response.at, response.at + n));
      response.at += n;
      advance(10 + n); // about 1 MB/s
      return n;
    },
  };
  return {
    imports, record, wiring,
    /** Gives the board the firmware's memory (and its function table, for interrupt handlers). */
    attach(mem, fnTable = null) { memory = mem; table = fnTable; },
    /** The serial line being printed right now (not yet ended with a newline). */
    partial: () => line,
    /** Inside an interrupt handler (no waiting allowed). */
    get busy() { return inIsr; },
    /** A crash with a device: the log says so (the chip then restarts). */
    crashed(message) {
      if (line) flushLine();
      event("crash", message);
    },
    /** A chip reset: pins, serial, interrupts and downloads start over; the motors stop. The log goes on. */
    reset(reason, slot, version) {
      if (line) flushLine();
      network?.robot.reset();
      modes.clear(); duty.clear(); isrs.clear(); queue.length = 0;
      irqOn = true; inIsr = false; serialOn = false; serialBaud = 0; update = null; response = null;
      world.setMotors(0, 0);
      if (record.led.on) { record.led.on = false; record.led.toggles++; record.led.changes.push({ t: world.now(), on: false }); }
      world.robot.led = false;
      event("boot", `${slot == null ? "" : `slot ${SLOT_NAMES[slot]} `}${version ?? ""} (${reason})`.replace(/\s+/g, " "));
    },
    /** The Wi-Fi, if the firmware used it (or the run brought one). */
    get network() { return network; },
    /** Ends the log: prints any unfinished serial line and an `end` event. */
    finish() {
      if (line) flushLine();
      event("end");
    },
  };
}

// Text sent at the wrong speed arrives as noise, the same noise every time.
function garble(text, b) {
  let out = "";
  for (let i = 0; i < text.length; i++) out += text[i] === "\n" ? "\n" : "▯▒░¿ÿ§"[(text.charCodeAt(i) + b + i) % 6];
  return out;
}

/**
 * Runs firmware in a world until `seconds` of robot time have passed (or it crashes).
 * @param {{ wasm?: BufferSource | WebAssembly.Module, device?: ReturnType<typeof createDevice>,
 *           map: string | object, seconds?: number,
 *           wiring?: Partial<typeof DEFAULT_WIRING>, robot?: object, heading?: number, seed?: number,
 *           realWorld?: boolean | object, tape?: Array<Array<[number, number]>>, traceMs?: number,
 *           boxes?: Array<{ row: number, col: number, from?: number, to?: number, size?: number, h?: number }>,
 *           net?: { get(url: string): { status: number, body: Uint8Array | string } | null },
 *           onSnapshot?: (s: Snapshot) => void, snapshotMs?: number,
 *           pace?: (virtualUs: number) => void, onSerial?: Function, onFrame?: Function,
 *           network?: ReturnType<typeof import("./net.js").createNetwork>, onEvent?: (line: string) => void,
 *           stopped?: () => boolean }} opts
 *   `boxes`: boxes on the floor by tile, for the whole run or from `from` to `to` seconds (world.js boxAt).
 *   `network`: the robot's Wi-Fi (net.js), for WiFi.h firmware and the programs that talk to it. Left
 *   out, firmware that calls WiFi.begin gets a fresh "courier-office" network of its own.
 *   `onEvent`: each event-log line as it happens. `stopped`: checked as time moves; true ends the run
 *   (reason "stopped").
 *   `wasm`: the firmware. Or `device` (device.js): a robot with two firmware slots that boots
 *   whichever its bootloader picks, and keeps them after the run (Stop 17's updates).
 *   `net`: what the robot's Wi-Fi reaches, for courier::net::get (e.g. a bucket of signed images).
 *   `pace`: called as time moves; the browser's real-time mode spins here until the wall clock
 *   catches up. Leave it out to run as fast as possible.
 * Firmware that calls courier::restart() (or crashes, with a device) boots again after 300 ms of
 * robot time, as a chip does; the report's `boots` lists every start.
 * @returns {Promise<Report>}
 */
export async function simulate(opts) {
  const device = opts.device ?? null;
  // JSPI (Node 24, the fleet runner): `suspend(t)` may return a promise, and the firmware waits for
  // it inside whichever board call it made (delay, a download…). Many robots share one thread that way.
  const jspi = typeof opts.suspend === "function";
  if (jspi && typeof WebAssembly.Suspending !== "function") throw new Error("suspend needs WebAssembly JSPI (Node 24 or newer)");
  const run = prepare({ ...opts, canWait: jspi }, device);
  const waiting = jspi ? Object.fromEntries(Object.entries(run.board.imports).map(([name, f]) => [name, new WebAssembly.Suspending((...a) => {
    const r = f(...a);
    if (r && typeof r.then === "function") return r;
    const p = run.board.busy ? null : opts.suspend(run.world.now());
    return p ? p.then(() => r) : r;
  })])) : null;
  const modules = new Map();
  const compile = async (image) => {
    if (image instanceof WebAssembly.Module) return image;
    if (!modules.has(image)) modules.set(image, await WebAssembly.compile(image));
    return modules.get(image);
  };
  let reason = "power-on";
  for (let n = 0; ; n++) {
    let image = opts.wasm, slot = null;
    if (device) {
      const pick = device.select();
      if (!pick) return run.report("crash", "the robot can't start: no firmware slot holds a good image");
      slot = pick.slot;
      image = device.slots[slot].image;
      if (pick.rolledBack) reason = "rollback";
    }
    run.loopReset(); // a restart: setup() runs again before the next loop()
    let instance;
    try {
      instance = await WebAssembly.instantiate(await compile(image), { courier: jspi ? waiting : run.board.imports });
    } catch (e) {
      return run.report("crash", `the firmware couldn't start: ${e.message}`);
    }
    run.board.attach(instance.exports.memory, instance.exports.__indirect_function_table ?? null);
    const version = versionOf(instance);
    if (device) device.slots[slot].version = version;
    const boot = { t: run.world.t, slot: slot == null ? null : SLOT_NAMES[slot], version, reason };
    run.boots.push(boot);
    if (device) { device.boots.push(boot); device.onChange?.(device); }
    if (n > 0 || device) run.board.reset(reason, slot, version);
    const x = instance.exports;
    const out = jspi
      ? await run.goAsync(async () => {
        const [ctors, setup, loop] = [x.__wasm_call_ctors, x.setup, x.loop].map((f) => f && WebAssembly.promising(f));
        if (n > 0) run.advance(300_000);
        await ctors?.();
        await setup();
        run.loopReturned();
        for (;;) {
          run.board.record.loops++;
          run.advance(10);
          await loop();
          run.loopReturned();
        }
      }, { device })
      : run.go(() => {
        if (n > 0) run.advance(300_000); // the chip starting up again
        x.__wasm_call_ctors?.();
        x.setup();
        run.loopReturned(); // the clock for "the longest gap between loop() returns" starts here
        for (;;) {
          run.board.record.loops++;
          run.advance(10); // Arduino's own work between loop() calls
          x.loop();
          run.loopReturned();
        }
      }, { device });
    if (!out.reboot) {
      if (device) device.running = null;
      return out;
    }
    reason = out.reboot;
  }
}

// The version firmware declared with COURIER_VERSION("1.2.0"), read from its memory; null if none.
export function versionOf(instance) {
  const g = instance.exports.courier_version;
  if (!(g instanceof WebAssembly.Global)) return null;
  const mem = new Uint8Array(instance.exports.memory.buffer);
  let end = g.value;
  while (end < mem.length && mem[end] && end - g.value < 32) end++;
  return new TextDecoder().decode(mem.subarray(g.value, end)) || null;
}

/**
 * Is this Courier firmware, and which version? A WebAssembly module whose imports are all board
 * functions, with setup() and loop(); its COURIER_VERSION is read without running any of its code
 * (as the ESP32 reads an image's app description). Null if it isn't firmware.
 * @param {Uint8Array} bytes
 * @returns {{ version: string | null } | null}
 */
export function firmwareInfo(bytes) {
  try {
    const mod = new WebAssembly.Module(bytes);
    const exports = WebAssembly.Module.exports(mod).map((e) => e.name);
    const imports = WebAssembly.Module.imports(mod);
    if (!imports.every((i) => i.module === "courier" && i.kind === "function") || !exports.includes("setup") || !exports.includes("loop")) return null;
    const stubs = Object.fromEntries(imports.map((i) => [i.name, () => 0]));
    return { version: versionOf(new WebAssembly.Instance(mod, { courier: stubs })) };
  } catch {
    return null;
  }
}

/**
 * The built-in driver (Stop 2): drives a route of N/E/S/W moves, one tile each, turning on the
 * spot to face each move. It steers by where the robot really is (closed loop), so a route that
 * stays on floor tiles always arrives; a route through a wall hits it.
 * @param {{ route: string, map: string | object, speed?: number, seconds?: number,
 *           robot?: object, heading?: number, seed?: number, realWorld?: boolean | object, traceMs?: number,
 *           boxes?: Array<{ row: number, col: number, from?: number, to?: number }>,
 *           onSnapshot?: Function, snapshotMs?: number, pace?: Function }} opts
 * @returns {Report} with `moves` (how many moves were finished) and `hit.move` (1-based)
 */
export function simulateRoute(opts) {
  const route = String(opts.route ?? "").trim().toUpperCase();
  const bad = [...route].findIndex((m) => !MOVES[m]);
  const run = prepare({ ...opts, seconds: opts.seconds ?? 20 + route.length * 4 });
  if (bad >= 0) return { ...run.report("bad-route", `move ${bad + 1} is "${route[bad]}": a route is made of N, E, S and W`), moves: 0, route };
  const { world } = run;
  const speed = opts.speed ?? 180;
  let move = 0;
  const report = run.go(() => {
    let { row, col } = world.map.start;
    // Straight runs (e.g. "EEEE") are driven in one go; `move` counts tiles as the robot reaches them.
    for (let i = 0; i < route.length; ) {
      let n = 1;
      while (route[i + n] === route[i]) n++;
      const [dr, dc] = MOVES[route[i]];
      const th = angleOf("NESW".indexOf(route[i]));
      row += dr * n; col += dc * n;
      move = i;
      turnTo(th);
      if (world.hit) throw new Halt();
      forwardTo(tileCentre(row, col), th, (along) => { move = i + Math.min(n - 1, Math.floor((n * TILE - along) / TILE + 0.5)); });
      if (world.hit) throw new Halt();
      i += n;
      move = i;
    }
    world.setMotors(0, 0);
    run.advance(300_000); // settle
    throw new Halt();
  });
  report.moves = move;
  if (report.hit) report.hit.move = move + 1;
  report.route = route;
  return report;

  function turnTo(th) {
    for (let i = 0; i < 4000; i++) {
      const err = wrap(th - world.robot.th);
      if (Math.abs(err) < 0.01 && Math.abs(world.robot.vL - world.robot.vR) < 0.01) break;
      const p = Math.max(75, Math.min(speed, Math.abs(err) * 220));
      const s = Math.sign(err) * p;
      world.setMotors(s, -s);
      run.advance(1000);
      if (world.hit) return;
    }
    world.setMotors(0, 0);
  }
  function forwardTo(goal, th, progress) {
    for (let i = 0; i < 60000; i++) {
      const r = world.robot;
      const along = (goal.x - r.x) * Math.cos(th) + (goal.y - r.y) * Math.sin(th);
      progress(along);
      if (along < 0.004) break;
      const cross = -(goal.x - r.x) * Math.sin(th) + (goal.y - r.y) * Math.cos(th); // + is to the right
      const aim = wrap(th + Math.atan2(cross, Math.max(0.05, along)) - r.th);
      const base = Math.max(80, Math.min(speed, 80 + along * 700));
      world.setMotors(base + aim * 160, base - aim * 160);
      run.advance(1000);
      if (world.hit) return;
    }
    world.setMotors(0, 0);
  }
}

/**
 * @typedef {{ t: number, x: number, y: number, th: number, led: boolean, row: number, col: number }} Snapshot
 * @typedef {{
 *   ok: boolean, reason: "time" | "hit" | "crash" | "bad-route" | "done", message: string | null,
 *   virtualMs: number, pose: object, goal: { row: number, col: number, reached: boolean, distanceCm: number } | null,
 *   hit: { t: number, thing: string, row: number, col: number, x: number, y: number, serial: string, move: number } | null, bumps: number,
 *   serial: Array<{ t: number, text: string }>, led: { toggles: number, on: boolean, changes: Array<{ t: number, on: boolean }> },
 *   tiles: Array<{ t: number, row: number, col: number }>, trace: Snapshot[], events: string[],
 *   calls: number, loops: number, moves?: number, route?: string,
 *   ticks: [number, number], battery: { startVolts: number, volts: number } | null, realWorld: object | null,
 *   boxes: Array<{ row: number, col: number, from: number, to: number | null, size: number, h: number, x0: number, y0: number, x1: number, y1: number }>,
 *   loopGap: { ms: number, fromMs: number, toMs: number, running: boolean } | null
 * }} Report
 * `hit.thing` is "wall", "box" or an object's kind; `hit.move` is the move the robot was making (the
 * route driver counts them; for firmware it's the tiles entered before the hit, plus one).
 * `loopGap`: the longest time between two returns from loop() (the first one counts from the end of
 * setup()); `running` when that loop() hadn't returned yet when the run ended. Null for the route driver.
 */

// Shared set-up for firmware runs and route drives: the world, the board, time and the report.
function prepare(opts, device = null) {
  // A test drive (Stop 5) brings its own floor and the route the firmware is asked to drive.
  const drive = opts.testDrive ? testDriveOf(opts.testDrive) : null;
  if (drive) opts = { ...opts, map: drive.map, route: drive.route, heading: 1 };
  const map = typeof opts.map === "string" ? parseMap(opts.map) : opts.map;
  const limit = (opts.seconds ?? 30) * 1e6;
  const traceUs = (opts.traceMs ?? 50) * 1000, snapUs = (opts.snapshotMs ?? 1000 / 60) * 1000;
  const trace = [], wheels = [];
  let nextTrace = 0, nextSnap = 0;
  const snap = () => {
    const p = world.pose();
    return { t: world.t, x: p.x, y: p.y, th: p.th, led: p.led, row: p.row, col: p.col };
  };
  const world = createWorld({
    map, robot: opts.robot, heading: opts.heading, seed: opts.seed, tape: opts.tape, realWorld: opts.realWorld, boxes: opts.boxes,
    onStep: (w) => {
      if (w.t >= nextTrace) {
        nextTrace += traceUs;
        trace.push(snap());
        wheels.push({ t: w.t, cmps: [round1(w.robot.vL * 100), round1(w.robot.vR * 100)], ticks: [w.ticks[0], w.ticks[1]] });
      }
      if (opts.onSnapshot && w.t >= nextSnap) { nextSnap += snapUs; opts.onSnapshot(snap()); }
    },
  });
  // A sim or a dataset sets the scene: objects on the floor, the light, where the robot stands.
  opts.setup?.(world);
  let hitSerial = null;
  const advance = (us) => {
    world.advance(us);
    if (world.hit && hitSerial === null) hitSerial = board.partial(); // what the monitor showed when it hit
    if (world.t >= limit) throw new Halt();
    if (opts.stopped?.()) throw new Halt("stopped");
    opts.pace?.(world.now());
  };
  const board = createBoard(world, { wiring: opts.wiring, baud: opts.baud, advance, onSerial: opts.onSerial, onFrame: opts.onFrame, device, net: opts.net,
    mqtt: opts.mqtt, name: opts.name, canWait: opts.canWait, network: opts.network, onEvent: opts.onEvent, route: opts.route });
  const boots = [];
  // The longest gap between loop() returns (Stop 4's "keeps looking" check), in µs of robot time.
  let lastReturn = null, gap = null;
  const loopReturned = () => {
    const t = world.now();
    if (lastReturn !== null && (!gap || t - lastReturn > gap.us)) gap = { us: t - lastReturn, from: lastReturn, to: t, running: false };
    lastReturn = t;
  };

  function report(reason, message = null) {
    board.finish();
    const pose = world.pose();
    const g = map.goal;
    const hit = world.hit ? { ...world.hit, serial: hitSerial ?? "" } : null;
    // Stop 5: the firmware's belief (its `pose e=… n=… h=…` lines) and the truth, in the same frame
    const truth = compass(toCompass(map, world.robot));
    const beliefs = [];
    for (const l of board.record.serial) { const b = parsePose(l.text); if (b) beliefs.push({ t: l.t, ...b }); }
    const belief = beliefs.length ? beliefs[beliefs.length - 1] : null;
    // a loop() still running when the run ended counts too (a delay() that outlasts the run)
    if (lastReturn !== null && (!gap || world.now() - lastReturn > gap.us)) gap = { us: world.now() - lastReturn, from: lastReturn, to: world.now(), running: true };
    return {
      ok: !hit && reason !== "crash" && reason !== "bad-route",
      reason: hit ? "hit" : reason,
      message: message ?? (hit ? hitMessage(hit) : null),
      virtualMs: Math.round(world.t / 1000),
      pose: { ...pose, heading: HEADINGS[pose.heading] },
      goal: g ? { ...g, reached: pose.row === g.row && pose.col === g.col, distanceCm: round1(pose.goalCm) } : null,
      hit, bumps: world.bumps,
      serial: board.record.serial, led: board.record.led, tiles: world.tiles,
      trace: (trace.push(snap()), trace), events: board.record.events,
      calls: board.record.calls, loops: board.record.loops,
      ticks: [...world.ticks],
      battery: { startVolts: round2(world.battery.startVolts), volts: round2(world.battery.volts) },
      realWorld: world.realWorld,
      boots,
      network: board.network ? board.network.summary() : null,
      boxes: world.placed.map((b) => ({ row: b.row, col: b.col, from: b.from, to: Number.isFinite(b.to) ? b.to : null, size: b.size, h: b.h, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 })),
      loopGap: gap ? { ms: Math.round(gap.us / 100) / 10, fromMs: Math.round(gap.from / 1000), toMs: Math.round(gap.to / 1000), running: gap.running } : null,
      truth, beliefs, belief,
      beliefGapCm: belief ? round1(Math.sqrt((belief.e - truth.e) ** 2 + (belief.n - truth.n) ** 2)) : null,
      travelledCm: round1(world.travelled * 100),
      wheels: (wheels.push({ t: world.t, cmps: [round1(world.robot.vL * 100), round1(world.robot.vR * 100)], ticks: [...world.ticks] }), wheels),
      ...(opts.route != null ? { route: opts.route } : {}),
      testDrive: drive ? driveResult(drive, world, map) : null,
    };
  }
  function ended(e, dev) {
    if (e instanceof Halt) return e.message === "stopped" ? report("stopped", "stopped") : report(world.t >= limit ? "time" : "done");
    // a restart or crash ends the loop() that was running: the gap up to that moment counts
    if (e instanceof Reboot) { loopReturned(); return { reboot: e.message }; }
    const message = e instanceof Crash ? e.message : crashMessage(e);
    if (dev) {
      board.crashed(message);
      loopReturned();
      return { reboot: "crash" };
    }
    return report("crash", message);
  }
  return {
    world, board, advance, report, boots, loopReturned,
    /** A (re)boot: the gap clock waits for the next setup() to end. */
    loopReset() { lastReturn = null; },
    /**
     * Runs a body until it halts, crashes or the chip restarts. Restarts return { reboot: reason };
     * with a `device`, a crash restarts the chip too (as a panic does), after printing why.
     */
    go(body, { device: dev = null } = {}) {
      try {
        body();
      } catch (e) {
        return ended(e, dev);
      }
      return report("done");
    },
    /** go() for a body that waits (JSPI). */
    async goAsync(body, { device: dev = null } = {}) {
      try {
        await body();
      } catch (e) {
        return ended(e, dev);
      }
      return report("done");
    },
  };
}

const thing = (hit) => {
  const k = hit.thing ?? hit.object ?? (hit.row < 0 ? "box" : "wall");
  return `${k === "obstacle" ? "an" : "a"} ${k}`;
};
const where = (hit) => (hit.row < 0 ? "" : ` at row ${hit.row}, column ${hit.col}`);
function hitMessage(hit) {
  return `hit ${thing(hit)}${where(hit)}`;
}
function crashMessage(e) {
  const m = String(e?.message ?? e);
  if (/unreachable/.test(m)) return "the firmware crashed (it reached code that should never run)";
  if (/out of bounds/.test(m)) return "the firmware crashed: it read or wrote outside its memory (an array index too big?)";
  if (/call stack|stack overflow|too much recursion/i.test(m)) return "the firmware crashed: too many nested calls (endless recursion?)";
  if (/divide by zero|integer overflow/.test(m)) return "the firmware crashed: it divided by zero";
  return `the firmware crashed: ${m}`;
}
const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const compass = (c) => ({ e: round1(c.e), n: round1(c.n), h: round1(c.h) % 360 });
// How far a compass heading is from a target, in (−180, 180]: + is to the right (clockwise).
export function offFrom(h, target) {
  const d = (((h - target) % 360) + 360) % 360;
  return round1(d > 180 ? d - 360 : d);
}
// What a test drive measured: the square's end gap and heading; the straight run's true distance and ticks.
function driveResult(drive, world, map) {
  const c = toCompass(map, world.robot), ticks = [...world.ticks], avg = (ticks[0] + ticks[1]) / 2;
  const gap = round1(Math.sqrt(c.e * c.e + c.n * c.n));
  if (drive.kind === "square") {
    return { kind: "square", route: drive.route, endGapCm: gap, headingOffDeg: offFrom(c.h, 0), ticks }; // its last move faces north
  }
  const trueCm = round1(world.travelled * 100); // the path Pip's centre really drove
  return { kind: "straight", route: drive.route, tiles: drive.tiles, trueCm, endGapCm: gap, bookCm: drive.tiles * 30, ticks, avgTicks: avg,
    cmPerTick: avg ? Math.round((world.travelled * 100 / avg) * 10000) / 10000 : null, headingOffDeg: offFrom(c.h, 90) }; // it drives east
}
const round2 = (v) => Math.round(v * 100) / 100;

/**
 * A report for a run that ended outside the engine (the page's watchdog, stop(), a worker that
 * died): the same shape as every other report, with the robot where it was last seen (`last`: the
 * runner and the CLI keep the latest pose, at most 250 ms of robot time old), or on S without one.
 * @param {{ map: string | object, reason: Report["reason"], message: string, virtualMs?: number,
 *           last?: { x: number, y: number, th: number, led?: boolean } | null, serial?: Array<{ t: number, text: string }>, heading?: number }} o
 * @returns {Report}
 */
export function endedReport(o) {
  const map = typeof o.map === "string" ? parseMap(o.map) : o.map;
  const s = tileCentre(map.start.row, map.start.col);
  const at = o.last ?? { x: s.x, y: s.y, th: angleOf(o.heading ?? 1), led: false };
  const { row, col } = tileAt(at.x, at.y);
  const g = map.goal ? tileCentre(map.goal.row, map.goal.col) : null;
  const dx = g ? g.x - at.x : 0, dy = g ? g.y - at.y : 0;
  const goalCm = g ? Math.sqrt(dx * dx + dy * dy) * 100 : null; // not Math.hypot: its rounding differs between browsers
  return {
    ok: false, reason: o.reason, message: o.message, virtualMs: o.virtualMs ?? 0,
    pose: { x: at.x, y: at.y, th: at.th, row, col, heading: HEADINGS[headingOf(at.th)], led: !!at.led, goalCm },
    goal: map.goal ? { ...map.goal, reached: row === map.goal.row && col === map.goal.col, distanceCm: round1(goalCm) } : null,
    hit: null, bumps: 0, serial: o.serial ?? [], led: { toggles: 0, on: !!at.led, changes: [] },
    tiles: [], trace: [], events: [], calls: 0, loops: 0,
    ticks: [0, 0], battery: null, realWorld: null, boots: [], network: null, boxes: [], loopGap: null,
    travelledCm: null, truth: toCompass(map, at), beliefs: [], belief: null, beliefGapCm: null, wheels: [], testDrive: null,
  };
}

/**
 * One line for people, in the curriculum's words: "Pip hit a wall after move 12 (at row 4,
 * column 0)", "Pip ended on G", "Pip stopped 42 cm from G".
 * @param {Report} report
 * @param {{ name?: string }} [opts] the robot's name (robot.json); default "Your robot"
 */
export function describe(report, { name = "Your robot" } = {}) {
  if (!report.pose || ["crash", "bad-route", "watchdog", "stopped"].includes(report.reason)) return report.message;
  if (report.hit) {
    const after = report.hit.move != null ? ` after move ${report.hit.move}` : ` after ${(report.hit.t / 1e6).toFixed(1)} s`;
    const at = report.hit.row < 0 ? "" : ` (at row ${report.hit.row}, column ${report.hit.col})`;
    return `${name} hit ${thing(report.hit)}${after}${at}`;
  }
  if (!report.goal) return `${name} ended at row ${report.pose.row}, column ${report.pose.col}`;
  if (report.goal.reached) return `${name} ended on G (${report.goal.distanceCm} cm from its centre)`;
  return `${name} stopped ${Math.round(report.goal.distanceCm)} cm from G`;
}

export { TILE, isWall, headingOf };
