// A Courier robot's flash memory, for over-the-air updates (Stop 17): two firmware slots (A/B), the
// "boot this slot" record, and the bootloader that picks a slot at power-on and rolls a bad update
// back by itself. It works like the ESP32's (ESP-IDF's app rollback), in plain JavaScript, and it
// lives outside a run, so it survives restarts, crashes and power cycles:
//
//   import { createDevice } from "courier/device.js";
//   const device = createDevice({ image: wasm, publicKey });     // factory firmware in slot A
//   await simulate({ device, map: OFFICE, seconds: 60 });        // firmware may update itself
//   device.slots[device.boot].version;                           // "1.3.0"
//
// A slot's state: "empty", "valid" (it ran and said it's healthy), "new" (just written, never
// booted), "pending" (booted once, not confirmed yet) or "invalid" (rolled back). A "new" slot boots
// as "pending"; if the robot restarts (or crashes) while it's still pending, the bootloader marks it
// invalid and boots the other slot: the update rolled back. Firmware confirms with
// courier::ota::confirm() once its health check passes.

/** The size of one firmware slot: the kit's app partitions with 4 MB of flash (min_spiffs, 1.9 MB). */
export const SLOT_BYTES = 0x1e0000;
/** Slot names, as people say them. */
export const SLOT_NAMES = ["A", "B"];

/**
 * @param {{ image?: Uint8Array | null, publicKey?: Uint8Array | null, name?: string }} [opts]
 *   `image`: the factory firmware (from build.js / compiler.js), in slot A, valid.
 *   `publicKey`: the 32-byte Ed25519 key whose signatures this robot accepts; without one, every
 *   update is refused (as a robot with secure boot and no key would).
 */
export function createDevice(opts = {}) {
  const device = {
    name: opts.name ?? "robot",
    publicKey: opts.publicKey ?? null,
    /** The two slots: the firmware image and the version it reported (COURIER_VERSION), if any. */
    slots: [
      { image: opts.image ?? null, version: null, state: opts.image ? "valid" : "empty" },
      { image: null, version: null, state: "empty" },
    ],
    /** The slot the bootloader starts next (the otadata record). */
    boot: 0,
    /** The slot running now, or null when off. */
    running: null,
    /** Every boot: { t, slot, version, reason } (reason: "power-on", "restart", "crash", "rollback"). */
    boots: [],
    /** Called after the flash changes (a boot, an update written, a confirm or a rollback): flash
     *  writes are durable on a chip, so a runner keeps a copy even if the run then hangs. */
    onChange: null,
    /**
     * The bootloader: picks the slot to start, marking a pending slot that never confirmed as
     * invalid and rolling back to the other. Returns { slot, rolledBack } or null if nothing can boot.
     */
    select() {
      let s = device.boot, rolledBack = false;
      const slot = device.slots[s];
      if (slot.state === "pending") {
        slot.state = "invalid";
        s = 1 - s;
        rolledBack = true;
      } else if (slot.state === "invalid" || slot.state === "empty") {
        s = 1 - s;
      }
      const chosen = device.slots[s];
      if (!chosen.image || chosen.state === "invalid" || chosen.state === "empty") return null;
      if (chosen.state === "new") chosen.state = "pending";
      device.boot = s;
      device.running = s;
      device.onChange?.(device);
      return { slot: s, rolledBack };
    },
    /** Writes an update into the slot that isn't running and boots it next (as "new"). */
    install(image, version = null) {
      const s = 1 - (device.running ?? device.boot);
      device.slots[s] = { image, version, state: "new" };
      device.boot = s;
      device.onChange?.(device);
      return s;
    },
    /** Firmware said it's healthy: the running slot is kept from now on. */
    confirm() {
      if (device.running == null) return false;
      const slot = device.slots[device.running];
      if (slot.state === "pending" || slot.state === "new") { slot.state = "valid"; device.onChange?.(device); }
      return slot.state === "valid";
    },
    /** Firmware said it isn't healthy: the running slot is marked invalid and the other boots next. */
    rollback() {
      if (device.running == null) return false;
      const other = device.slots[1 - device.running];
      if (!other.image || other.state === "invalid" || other.state === "empty") return false;
      device.slots[device.running].state = "invalid";
      device.boot = 1 - device.running;
      device.onChange?.(device);
      return true;
    },
    /** A plain object to save (images as base64), for createDevice.load(). */
    save() {
      return {
        name: device.name, boot: device.boot, boots: device.boots,
        publicKey: device.publicKey ? b64(device.publicKey) : null,
        slots: device.slots.map((s) => ({ ...s, image: s.image ? b64(s.image) : null })),
      };
    },
  };
  return device;
}

/** A device from device.save(): the same flash, as if the robot had been switched off and on. */
createDevice.load = (saved) => {
  const d = createDevice({ name: saved.name, publicKey: saved.publicKey ? unb64(saved.publicKey) : null });
  d.slots = saved.slots.map((s) => ({ ...s, image: s.image ? unb64(s.image) : null }));
  d.boot = saved.boot;
  d.boots = saved.boots ?? [];
  return d;
};

function b64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(text) {
  const s = atob(text), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
