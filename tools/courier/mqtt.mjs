// A small MQTT 3.1.1 client for the courier fleet (Stop 18): connect, publish and subscribe at QoS 0,
// keep-alive pings, nothing else. No dependencies, so a learner's repo vendors it with the CLI. Each
// simulated robot gets its own connection, with its own client id, as a real robot would.
//
//   import { connectMqtt } from "./mqtt.mjs";
//   const c = await connectMqtt("mqtt://localhost:1883", { clientId: "robot-001" });
//   c.subscribe("fleet/robot-001/cmd");
//   c.onMessage = (topic, payload) => …;          // payload: Uint8Array
//   c.publish("fleet/robot-001/telemetry", '{"x":1.2}');
//   c.end();
//
// QoS 0 only ("at most once"): telemetry at 10 Hz is the case where losing one reading is fine and
// waiting for acknowledgements isn't. The spec: https://docs.oasis-open.org/mqtt/mqtt/v3.1.1/mqtt-v3.1.1.html
import { connect as tcp } from "node:net";

const enc = new TextEncoder();
const CONNECT = 1, CONNACK = 2, PUBLISH = 3, SUBSCRIBE = 8, SUBACK = 9, PINGREQ = 12, PINGRESP = 13, DISCONNECT = 14;
const REFUSED = ["", "unacceptable protocol version", "client id rejected", "server unavailable", "bad user name or password", "not authorised"];

function remainingLength(n) {
  const out = [];
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) b |= 128;
    out.push(b);
  } while (n > 0);
  return out;
}
const str = (s) => { const b = typeof s === "string" ? enc.encode(s) : s; return [b.length >> 8, b.length & 255, ...b]; };
function packet(type, flags, body) {
  const head = [(type << 4) | flags, ...remainingLength(body.length)];
  const out = Buffer.allocUnsafe(head.length + body.length);
  out.set(head, 0);
  out.set(body, head.length);
  return out;
}

/**
 * Connects to a broker. Resolves when the broker accepts (CONNACK), rejects with a plain message if it
 * can't be reached or refuses.
 * @param {string} url mqtt://host:port (default port 1883)
 * @param {{ clientId: string, keepAlive?: number, username?: string, password?: string, timeoutMs?: number }} opts
 */
export function connectMqtt(url, opts) {
  const u = new URL(url);
  if (u.protocol !== "mqtt:") return Promise.reject(new Error(`only mqtt:// URLs are supported (got ${u.protocol})`));
  const keepAlive = opts.keepAlive ?? 60;
  return new Promise((resolve, reject) => {
    const sock = tcp({ host: u.hostname, port: Number(u.port || 1883) });
    sock.setNoDelay(true);
    let buf = Buffer.alloc(0), ready = false, nextId = 1, ping = null;
    const client = {
      /** Called for every message on a subscribed topic. */
      onMessage: null,
      /** Called once if the connection drops. */
      onClose: null,
      /** Messages and bytes sent and received, for throughput numbers. */
      stats: { sent: 0, sentBytes: 0, received: 0, receivedBytes: 0 },
      /** Publishes at QoS 0. Returns false if the socket's buffer is full (back-pressure: slow down). */
      publish(topic, payload) {
        if (sock.destroyed) return false;
        const p = typeof payload === "string" ? enc.encode(payload) : payload;
        const body = Buffer.concat([Buffer.from(str(topic)), Buffer.from(p.buffer, p.byteOffset, p.byteLength)]);
        client.stats.sent++;
        client.stats.sentBytes += body.length;
        return sock.write(packet(PUBLISH, 0, body));
      },
      subscribe(filter) {
        const id = nextId;
        nextId = (nextId % 65535) + 1; // packet ids are 1–65535
        sock.write(packet(SUBSCRIBE, 2, Buffer.from([id >> 8, id & 255, ...str(filter), 0])));
      },
      /** Bytes queued in the socket, not yet sent: a growing number means the broker can't keep up. */
      get pending() { return sock.writableLength; },
      end() {
        clearInterval(ping);
        if (!sock.destroyed) sock.end(packet(DISCONNECT, 0, Buffer.alloc(0)));
      },
    };
    const fail = (e) => {
      clearInterval(ping);
      if (!ready) reject(new Error(`can't connect to ${url}: ${e.message ?? e}`));
      else client.onClose?.(e);
    };
    const timer = setTimeout(() => { sock.destroy(); fail(new Error("timed out")); }, opts.timeoutMs ?? 5000);
    sock.on("error", fail);
    sock.on("close", () => fail(new Error("connection closed")));
    sock.on("connect", () => {
      let flags = 2; // clean session
      const payload = [...str(opts.clientId)];
      if (opts.username != null) { flags |= 128; payload.push(...str(opts.username)); }
      if (opts.password != null) { flags |= 64; payload.push(...str(opts.password)); }
      sock.write(packet(CONNECT, 0, Buffer.from([...str("MQTT"), 4, flags, keepAlive >> 8, keepAlive & 255, ...payload])));
    });
    sock.on("data", (chunk) => {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      for (;;) {
        if (buf.length < 2) return;
        let len = 0, mult = 1, i = 1, b;
        do {
          if (i >= buf.length) return;
          b = buf[i++];
          len += (b & 127) * mult;
          mult *= 128;
        } while (b & 128);
        if (buf.length < i + len) return;
        const type = buf[0] >> 4, flags = buf[0] & 15, body = buf.subarray(i, i + len);
        buf = buf.subarray(i + len);
        if (type === CONNACK) {
          clearTimeout(timer);
          if (body[1] !== 0) { sock.destroy(); return reject(new Error(`the broker refused the connection: ${REFUSED[body[1]] ?? body[1]}`)); }
          ready = true;
          ping = setInterval(() => sock.write(packet(PINGREQ, 0, Buffer.alloc(0))), keepAlive * 500);
          ping.unref();
          resolve(client);
        } else if (type === PUBLISH) {
          const tlen = (body[0] << 8) | body[1];
          const topic = body.subarray(2, 2 + tlen).toString("utf8");
          const qos = (flags >> 1) & 3;
          const payload = new Uint8Array(body.subarray(2 + tlen + (qos ? 2 : 0)));
          client.stats.received++;
          client.stats.receivedBytes += body.length;
          client.onMessage?.(topic, payload);
        } else if (type !== SUBACK && type !== PINGRESP) {
          // anything else isn't used at QoS 0
        }
      }
    });
  });
}
