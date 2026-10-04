// courier.h — the Courier board: motors and sensors by what they do, not by pin.
//
// Stop 3 drives the wheels through pins (pinMode, analogWrite). From Stop 4 on, firmware uses these
// instead, and the same calls work in the simulator and on the Freenove 4WD Car Kit for ESP32
// (FNK0053), whose motors and line sensors sit behind I2C chips (sim-kit tools/courier/hw/).
//
//   #include <Arduino.h>
//   #include <courier.h>
//   courier::motors(180, 180);            // both wheels forward (−255..255 each)
//   int cm = courier::distanceCm();       // ultrasonic, straight ahead; −1 = no echo
//   if (courier::lineRead(1)) { … }       // the middle line sensor is over dark tape
//   long t = courier::ticks(0);           // the left wheel's encoder ticks so far (Stop 5)
//   const char *r = courier::route();     // a route the simulator asks for (test drives), or nullptr
//   courier::ota::begin(size); …           // over-the-air updates, two firmware slots (Stop 17)
#ifndef COURIER_H
#define COURIER_H

#include <Arduino.h>
#include <stdint.h>

#if defined(COURIER_SIM)
#define COURIER_BOARD(name) __attribute__((import_module("courier"), import_name(#name)))
#else
#define COURIER_BOARD(name)
#endif

extern "C" {
COURIER_BOARD(motors) void __courier_motors(int left, int right);
COURIER_BOARD(distance_cm) int __courier_distance_cm(void);
COURIER_BOARD(line_read) int __courier_line_read(int i);
COURIER_BOARD(camera_grab) int __courier_camera_grab(uint8_t *gray, int w, int h);
COURIER_BOARD(ticks) int32_t __courier_ticks(int side);
COURIER_BOARD(battery_volts) float __courier_battery_volts(void);
COURIER_BOARD(restart) void __courier_restart(void);
COURIER_BOARD(ota_begin) int __courier_ota_begin(uint32_t size);
COURIER_BOARD(ota_write) int __courier_ota_write(const uint8_t *data, int len);
COURIER_BOARD(ota_end) int __courier_ota_end(const uint8_t *signature);
COURIER_BOARD(ota_confirm) int __courier_ota_confirm(void);
COURIER_BOARD(ota_rollback) int __courier_ota_rollback(void);
COURIER_BOARD(ota_running) int __courier_ota_running(void);
COURIER_BOARD(ota_state) int __courier_ota_state(int slot);
COURIER_BOARD(ota_version) int __courier_ota_version(int slot, char *out, int max);
COURIER_BOARD(net_get) int __courier_net_get(const char *url, int len);
COURIER_BOARD(net_read) int __courier_net_read(uint8_t *buf, int max);
COURIER_BOARD(mqtt_publish) int __courier_mqtt_publish(const char *topic, int tlen, const uint8_t *payload, int plen);
COURIER_BOARD(mqtt_subscribe) int __courier_mqtt_subscribe(const char *filter, int len);
COURIER_BOARD(mqtt_poll) int __courier_mqtt_poll(char *topic, int tmax, uint8_t *payload, int pmax);
COURIER_BOARD(robot_id) int __courier_robot_id(char *out, int max);
COURIER_BOARD(route) int __courier_route(char *out, int max);
}

// The firmware's version, for the bootloader's log and the report: COURIER_VERSION("1.2.0") once,
// at the top level of one file. Read it in your own code as `courier_version`.
#define COURIER_VERSION(v) extern "C" __attribute__((used)) const char courier_version[] = v

namespace courier {
/** Wheel power, −255 (full reverse) to 255 (full forward), left and right. Small values may not
 *  turn the wheels at all: gear motors have a dead band. */
inline void motors(int left, int right) { __courier_motors(left, right); }
/** Both wheels off. */
inline void stop() { __courier_motors(0, 0); }
/** The ultrasonic sensor: distance to the nearest thing straight ahead, 2–400 cm; −1 if no echo.
 *  A reading takes as long as the echo (about 58 µs per cm, or 25 ms with no echo). */
inline int distanceCm() { return __courier_distance_cm(); }
/** Line sensor i (0 left, 1 middle, 2 right): 1 over dark tape, 0 over floor. */
inline int lineRead(int i) { return __courier_line_read(i); }
/** A grayscale camera frame of w×h pixels (up to 160×120) into `gray`; 1 if it worked. A frame
 *  takes about 30 ms. */
inline int cameraGrab(uint8_t *gray, int w, int h) { return __courier_camera_grab(gray, w, h); }
/** Encoder ticks counted on a wheel (0 left, 1 right) since power-on, whichever way it turned;
 *  120 per wheel turn. −1 if the robot has no encoders. Counting them yourself with
 *  attachInterrupt(ENC_LEFT, …) gives the same number. */
inline long ticks(int side) { return __courier_ticks(side); }
/** The battery's voltage at the motors now (about 8.4 full, 6.4 flat; it dips while the motors
 *  pull hard). Constant at 8.0 unless the simulator's real-world switch is on. −1 if not measured. */
inline float batteryVolts() { return __courier_battery_volts(); }
/** Restarts the chip: setup() runs again, from whichever firmware slot the bootloader picks. */
[[noreturn]] inline void restart() { __courier_restart(); __builtin_unreachable(); }

/** Over-the-air updates (Stop 17). The robot has two firmware slots, A (0) and B (1): one runs, the
 *  other takes the update. Write the new image into it, prove it's signed by your key, restart, and
 *  confirm once the new firmware is healthy. If it restarts before confirming (or crashes), the
 *  bootloader goes back to the old slot by itself.
 *    if (ota::begin(size) == 0) { while (…) ota::write(chunk, n); if (ota::finish(sig) == 0) restart(); }
 *  Every function returns 0 when it worked, or one of these: */
namespace ota {
enum Error {
  NOT_STARTED = -1,     // no update in progress (call begin first), or the robot has no flash
  TOO_BIG = -2,         // bigger than a slot (1.9 MB) or than begin() said
  TOO_SHORT = -3,       // fewer bytes written than begin() said
  BAD_SIGNATURE = -4,   // not signed by this robot's key, or the image changed on the way
  NO_KEY = -5,          // this robot has no key to check signatures with
  NOT_FIRMWARE = -6,    // the image isn't Courier firmware
  NO_OTHER_SLOT = -7,   // rollback(): the other slot has nothing good to go back to
};
/** What a slot holds (state()). */
enum State { EMPTY = 0, VALID = 1, NEW = 2, PENDING = 3, INVALID = 4 };
/** Starts an update of `size` bytes into the slot that isn't running (erasing it takes ~45 ms per 4 KB). */
inline int begin(uint32_t size) { return __courier_ota_begin(size); }
/** Adds the next `len` bytes of the image. */
inline int write(const uint8_t *data, int len) { return __courier_ota_write(data, len); }
/** Checks the 64-byte Ed25519 signature over the whole image; if it's good, that slot boots next. */
inline int finish(const uint8_t *signature) { return __courier_ota_end(signature); }
/** The new firmware is healthy: keep it (no rollback from now on). */
inline int confirm() { return __courier_ota_confirm(); }
/** The new firmware isn't healthy: mark it bad and restart into the other slot. */
inline int rollback() { return __courier_ota_rollback(); }
/** The slot running now: 0 (A) or 1 (B). */
inline int runningSlot() { return __courier_ota_running(); }
/** What a slot holds: EMPTY, VALID, NEW, PENDING (booted, not confirmed yet) or INVALID. */
inline int state(int slot) { return __courier_ota_state(slot); }
/** The version (COURIER_VERSION) of the firmware in a slot, into `out`; its length, or −1 if unknown.
 *  E.g. after a rollback: which version failed, so you don't install it again. */
inline int version(int slot, char *out, int max) { return __courier_ota_version(slot, out, max); }
}  // namespace ota

/** Downloads over the robot's Wi-Fi, a chunk at a time (a robot has little memory). */
namespace net {
/** Starts an HTTP GET. Returns the body's length, −1 if the server can't be reached, or −status
 *  (e.g. −404) if it answered with an error. */
inline int get(const char *url) { int n = 0; while (url[n]) n++; return __courier_net_get(url, n); }
/** Reads up to `max` bytes of the body into `buf`; 0 at the end. */
inline int read(uint8_t *buf, int max) { return __courier_net_read(buf, max); }
}  // namespace net

/** The route this run asks the firmware to drive, as N/E/S/W letters (the simulator's test drives,
 *  `--square` and `--straight N`, and `--route`), or nullptr when it asks for none: then drive your
 *  own. Read it once in setup(): `const char *r = courier::route(); if (r) route = r;` On the kit it's
 *  always nullptr. Up to 255 moves. */
inline const char *route() {
  static char buf[256];
  return __courier_route(buf, sizeof buf) >= 0 ? buf : nullptr;
}

/** This robot's name in the fleet (e.g. "robot-007"), into `out`; its length. */
inline int robotId(char *out, int max) { return __courier_robot_id(out, max); }

/** MQTT, the fleet's telemetry and commands (Stop 18). The robot is already connected to the
 *  fleet's broker, with its name as the client id; messages go at QoS 0 ("at most once"). */
namespace mqtt {
/** Sends `payload` on `topic`. 0 if it went; −1 no broker; −2 the connection is backed up (send less). */
inline int publish(const char *topic, const uint8_t *payload, int len) {
  int n = 0; while (topic[n]) n++;
  return __courier_mqtt_publish(topic, n, payload, len);
}
inline int publish(const char *topic, const char *text) {
  int n = 0; while (text[n]) n++;
  return publish(topic, (const uint8_t *)text, n);
}
/** Receive messages on topics matching `filter` ("fleet/robot-007/cmd", "fleet/+/cmd", "fleet/#"). */
inline int subscribe(const char *filter) { int n = 0; while (filter[n]) n++; return __courier_mqtt_subscribe(filter, n); }
/** The next message received, if any: its topic and payload (both ended with a 0 byte; a longer
 *  one is cut to fit), and how many payload bytes are in `payload`; −1 if nothing has arrived. */
inline int poll(char *topic, int topicMax, char *payload, int payloadMax) {
  return __courier_mqtt_poll(topic, topicMax, (uint8_t *)payload, payloadMax);
}
}  // namespace mqtt
}  // namespace courier

#endif
