// An MQTT broker in memory, for sims and tests (Stop 18): robots publish and subscribe through it
// the way they do through a real one (the fleet runner, sim-kit tools/courier/, connects them to
// Mosquitto instead). Topics and wildcards work as in MQTT: "+" is one level, "#" the rest.
//
//   import { createBroker } from "courier/broker.js";
//   const broker = createBroker();
//   broker.watch("fleet/#", (topic, payload) => …);          // the page listening in
//   await simulate({ wasm, map, mqtt: broker.client("robot-001"), name: "robot-001" });
//   broker.publish("fleet/robot-001/cmd", "stop");             // reaches the robot's inbox

/** Does an MQTT topic filter match a topic? */
export function topicMatches(filter, topic) {
  const f = filter.split("/"), t = topic.split("/");
  for (let i = 0; i < f.length; i++) {
    if (f[i] === "#") return true;
    if (i >= t.length) return false;
    if (f[i] !== "+" && f[i] !== t[i]) return false;
  }
  return f.length === t.length;
}

/**
 * @param {{ inboxLimit?: number }} [opts] `inboxLimit`: messages a robot can hold before the oldest
 *   is dropped (a real chip's buffer is small; default 32).
 */
export function createBroker(opts = {}) {
  const limit = opts.inboxLimit ?? 32;
  const subs = []; // { filter, deliver }
  const stats = { published: 0, delivered: 0, dropped: 0, bytes: 0 };
  // As in MQTT 3.1.1, a robot subscribed to a topic it publishes on gets its own messages too.
  // Payloads are always bytes (a string is sent as UTF-8), as on the wire.
  function publish(topic, payload) {
    const bytes = typeof payload === "string" ? new TextEncoder().encode(payload) : payload;
    stats.published++;
    stats.bytes += bytes.length;
    for (const s of subs) {
      if (!topicMatches(s.filter, topic)) continue;
      stats.delivered++;
      // a mistake in a page's watcher is the page's, not the robot's that published
      try { s.deliver(topic, bytes); } catch (e) { queueMicrotask(() => { throw e; }); }
    }
  }
  return {
    stats,
    /** Publishes from outside the fleet (the page, a test). */
    publish: (topic, payload) => publish(topic, payload),
    /** Listens from outside (payloads are Uint8Array); returns a function that stops listening. */
    watch(filter, fn) {
      const s = { filter, deliver: fn, owner: null };
      subs.push(s);
      return () => subs.splice(subs.indexOf(s), 1);
    },
    /** A robot's connection: pass it as `mqtt` to simulate(). */
    client(id) {
      const inbox = [];
      const client = {
        id, inbox,
        publish(topic, payload) { publish(topic, payload); return true; },
        subscribe(filter) {
          if (subs.some((s) => s.owner === client && s.filter === filter)) return; // as a broker does: the same filter once
          subs.push({ filter, owner: client, deliver: (topic, payload) => {
            if (inbox.length >= limit) { inbox.shift(); stats.dropped++; }
            inbox.push({ topic, payload });
          } });
        },
      };
      return client;
    },
  };
}
