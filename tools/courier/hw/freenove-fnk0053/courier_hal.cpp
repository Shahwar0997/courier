// courier_hal.cpp — the Courier board on the Freenove 4WD Car Kit for ESP32 (FNK0053): courier.h
// (motors, distanceCm, lineRead, cameraGrab) and the Courier pins of courier_kit.h.
//
// Pin map from Freenove's own sources (github.com/Freenove/Freenove_4WD_Car_Kit_for_ESP32,
// Sketches/*/Freenove_4WD_Car_For_ESP32.{h,cpp}, 2024-08), written from scratch here with no code
// copied (their repo is CC BY-NC-SA 3.0). Raw I2C register writes, so no third-party libraries.
// Compiles with arduino-cli (esp32:esp32@3.3.12, board esp32wrover); NOT yet run on a kit.
#define COURIER_HAL_IMPL
#include <Arduino.h>
#include <Wire.h>
#include "esp_camera.h"
#include "esp_ota_ops.h"
// Updates and downloads pull in Wi-Fi, HTTP and libsodium (~300 KB), so they're built only for
// firmware that uses courier::ota or courier::net (build-esp32.sh sets COURIER_WITH_NET).
#ifdef COURIER_WITH_NET
#include <HTTPClient.h>
#include <Update.h>
#include <WiFi.h>
#include <sodium.h>
#if __has_include("courier_key.h")
#include "courier_key.h"  // #define COURIER_OTA_KEY "<64 hex>": written by `cli.mjs keygen` as <name>.h
#endif
#include "mqtt_client.h"  // ESP-IDF's MQTT client (esp-mqtt), part of the ESP32 core
#include "freertos/queue.h"
#endif
#if __has_include("courier_config.h")
#include "courier_config.h"  // optional: #define COURIER_MQTT_URL "mqtt://192.168.1.20:1883", COURIER_ROBOT_ID "robot-001"
#endif
#include "courier_kit.h"
#include "courier.h"

// ---- board wiring (Freenove) ----
static const int I2C_SDA = 13, I2C_SCL = 14;
static const uint8_t PCA9685 = 0x5F;   // PWM chip: servos on ch 0–7, motor H-bridges on ch 8–15
static const uint8_t PCF8574 = 0x20;   // I/O expander: bits 0,1,2 = line sensors left, middle, right
static const int SONAR_TRIG = 12, SONAR_ECHO = 15;
static const int WS2812_PIN = 32;      // the LED strip's data line (shared with the battery ADC)
// Motor channels per Courier pin: the same input of both motors on that side
// (M1, M2 = left side, M3, M4 = right side, as Freenove's own turns use them).
static const uint8_t CHANNELS[4][2] = {{15, 9}, {14, 8}, {12, 10}, {13, 11}};

static void pcaWrite(uint8_t reg, uint8_t v) {
  Wire.beginTransmission(PCA9685); Wire.write(reg); Wire.write(v); Wire.endTransmission();
}
static void pcaDuty(uint8_t ch, uint16_t duty) {  // 0..4095
  Wire.beginTransmission(PCA9685);
  Wire.write(0x06 + 4 * ch);
  if (duty >= 4095) { Wire.write(0); Wire.write(0x10); Wire.write(0); Wire.write(0); }        // full on
  else if (duty == 0) { Wire.write(0); Wire.write(0); Wire.write(0); Wire.write(0x10); }      // full off
  else { Wire.write(0); Wire.write(0); Wire.write(duty & 0xff); Wire.write(duty >> 8); }
  Wire.endTransmission();
}

static bool cameraOk = false;
static void boardInit() {
  Wire.begin(I2C_SDA, I2C_SCL);
  pcaWrite(0x00, 0x10);                  // sleep to set the prescaler
  pcaWrite(0xFE, 121);                   // 25 MHz / (4096 × 50 Hz) − 1: 50 Hz (the servos share it)
  pcaWrite(0x00, 0x20);                  // wake, auto-increment
  delay(1);
  Wire.beginTransmission(PCF8574); Wire.write(0xFF); Wire.endTransmission();  // all pins as inputs
  pinMode(SONAR_TRIG, OUTPUT); pinMode(SONAR_ECHO, INPUT);
  camera_config_t c = {};
  c.pin_pwdn = -1; c.pin_reset = -1; c.pin_xclk = 21; c.pin_sccb_sda = 26; c.pin_sccb_scl = 27;
  c.pin_d7 = 35; c.pin_d6 = 34; c.pin_d5 = 39; c.pin_d4 = 36; c.pin_d3 = 19; c.pin_d2 = 18; c.pin_d1 = 5; c.pin_d0 = 4;
  c.pin_vsync = 25; c.pin_href = 23; c.pin_pclk = 22;
  c.xclk_freq_hz = 20000000; c.ledc_timer = LEDC_TIMER_0; c.ledc_channel = LEDC_CHANNEL_0;
  c.pixel_format = PIXFORMAT_GRAYSCALE; c.frame_size = FRAMESIZE_QQVGA; c.fb_count = 1;
  c.fb_location = CAMERA_FB_IN_PSRAM; c.grab_mode = CAMERA_GRAB_LATEST;
  cameraOk = esp_camera_init(&c) == ESP_OK;
}
// The board starts on first use (a global constructor would run before Arduino's own init, too
// early for Wire), so learner firmware needs no board-specific call.
static bool ready = false;
static inline void ensure() { if (!ready) { ready = true; boardInit(); } }

// ---- Courier pins (courier_kit.h) ----
static bool isCourierPin(uint8_t pin) { return pin >= COURIER_PIN_LEFT_FWD && pin <= COURIER_PIN_NONE; }
static uint8_t ledMode = INPUT;
static void courierPinDuty(uint8_t pin, int duty255) {
  if (pin == COURIER_PIN_NONE) return;
  ensure();
  duty255 = constrain(duty255, 0, 255);
  if (pin == COURIER_PIN_LED) {
    if (ledMode == OUTPUT) rgbLedWrite(WS2812_PIN, 0, duty255 ? 60 : 0, 0);
    return;
  }
  // Freenove's own driver never drives a motor below 1600/4095 (≈39%): the motors stall under it.
  // Courier keeps the learner's number; the simulator's dead band plays the same role.
  const uint16_t duty = (uint16_t)((duty255 * 4095L) / 255);
  for (uint8_t ch : CHANNELS[pin - COURIER_PIN_LEFT_FWD]) pcaDuty(ch, duty);
}
void courier_pinMode(uint8_t pin, uint8_t mode) {
  if (!isCourierPin(pin)) { pinMode(pin, mode); return; }
  if (pin == COURIER_PIN_LED) ledMode = mode;
}
void courier_digitalWrite(uint8_t pin, uint8_t value) {
  if (!isCourierPin(pin)) { digitalWrite(pin, value); return; }
  courierPinDuty(pin, value ? 255 : 0);
}
void courier_attachInterrupt(uint8_t pin, void (*isr)(void), int mode) {
  if (pin == COURIER_PIN_NONE) return;  // no encoders on this kit
  attachInterrupt(pin, isr, mode);
}
void courier_analogWrite(uint8_t pin, int value) {
  if (!isCourierPin(pin)) { analogWrite(pin, value); return; }
  courierPinDuty(pin, value);
}

// ---- courier.h ----
static void side(uint8_t fwd, uint8_t rev, int speed) {
  speed = constrain(speed, -255, 255);
  courierPinDuty(fwd, speed > 0 ? speed : 0);
  courierPinDuty(rev, speed < 0 ? -speed : 0);
}
extern "C" void __courier_motors(int left, int right) {
  side(COURIER_PIN_LEFT_FWD, COURIER_PIN_LEFT_REV, left);
  side(COURIER_PIN_RIGHT_FWD, COURIER_PIN_RIGHT_REV, right);
}
extern "C" int __courier_distance_cm(void) {
  ensure();
  digitalWrite(SONAR_TRIG, LOW); delayMicroseconds(2);
  digitalWrite(SONAR_TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(SONAR_TRIG, LOW);
  unsigned long us = pulseIn(SONAR_ECHO, HIGH, 25000);  // 25 ms ≈ 4 m and back
  if (us == 0) return -1;
  int cm = (int)(us / 58);
  return (cm >= 2 && cm <= 400) ? cm : -1;
}
extern "C" int __courier_line_read(int i) {
  ensure();
  if (i < 0 || i > 2) return 0;
  Wire.requestFrom(PCF8574, (uint8_t)1);
  int bits = Wire.available() ? Wire.read() : 0;
  return (bits >> i) & 1;  // 1 = dark line under that sensor
}
// ---- over-the-air updates (Stop 17) ----
// The ESP32's own two app slots (partitions min_spiffs) and its bootloader's rollback. The image is
// kept in PSRAM while it's written, so its Ed25519 signature can be checked (libsodium) before the
// slot is made bootable. The robots' public key is COURIER_OTA_KEY (64 hex characters) from
// courier_key.h next to main.cpp (`cli.mjs keygen` writes it); without it every update is refused.
// Arduino confirms a new app at startup by default; returning true here leaves it to the firmware
// (courier::ota::confirm()), as in the simulator.
extern "C" bool verifyRollbackLater() { return true; }
extern "C" void __courier_restart(void) { ESP.restart(); }
#ifdef COURIER_WITH_NET
static uint8_t *otaBuf = nullptr;
static uint32_t otaSize = 0, otaHave = 0;
static void otaDrop() { if (otaBuf) free(otaBuf); otaBuf = nullptr; otaSize = otaHave = 0; }
extern "C" int __courier_ota_begin(uint32_t size) {
  otaDrop();
  const esp_partition_t *next = esp_ota_get_next_update_partition(nullptr);
  if (!next || size > next->size) return -2;
  otaBuf = (uint8_t *)ps_malloc(size ? size : 1);
  if (!otaBuf) return -2;
  if (!Update.begin(size)) { otaDrop(); return -2; }
  otaSize = size;
  return 0;
}
extern "C" int __courier_ota_write(const uint8_t *data, int len) {
  if (!otaBuf) return -1;
  if (len < 0 || otaHave + (uint32_t)len > otaSize) { Update.abort(); otaDrop(); return -2; }
  memcpy(otaBuf + otaHave, data, len);
  if (Update.write((uint8_t *)data, len) != (size_t)len) { Update.abort(); otaDrop(); return -2; }
  otaHave += len;
  return 0;
}
static int hexVal(char c) { return c >= '0' && c <= '9' ? c - '0' : c >= 'a' && c <= 'f' ? c - 'a' + 10 : c >= 'A' && c <= 'F' ? c - 'A' + 10 : -1; }
extern "C" int __courier_ota_end(const uint8_t *signature) {
  if (!otaBuf) return -1;
  int r = 0;
#ifdef COURIER_OTA_KEY
  uint8_t key[32];
  const char *hex = COURIER_OTA_KEY;
  for (int i = 0; i < 32; i++) {
    int hi = hexVal(hex[2 * i]), lo = hi < 0 ? -1 : hexVal(hex[2 * i + 1]);
    if (lo < 0) { r = -5; break; }
    key[i] = (uint8_t)(hi * 16 + lo);
  }
  if (!r && otaHave < otaSize) r = -3;
  if (!r && (sodium_init() < 0 || crypto_sign_verify_detached(signature, otaBuf, otaSize, key) != 0)) r = -4;
#else
  (void)signature; (void)hexVal;
  r = -5;
#endif
  if (r) Update.abort();
  else if (!Update.end(true)) r = -6;  // not an ESP32 app image: Update checks the header and checksum
  otaDrop();
  return r;
}
extern "C" int __courier_ota_confirm(void) { return esp_ota_mark_app_valid_cancel_rollback() == ESP_OK ? 0 : -1; }
extern "C" int __courier_ota_rollback(void) { esp_ota_mark_app_invalid_rollback_and_reboot(); return -7; }  // returns only if there's nothing to go back to
static const esp_partition_t *otaSlot(int slot) {
  return esp_partition_find_first(ESP_PARTITION_TYPE_APP, (esp_partition_subtype_t)(ESP_PARTITION_SUBTYPE_APP_OTA_0 + slot), nullptr);
}
extern "C" int __courier_ota_running(void) { return esp_ota_get_running_partition()->subtype - ESP_PARTITION_SUBTYPE_APP_OTA_0; }
extern "C" int __courier_ota_state(int slot) {
  const esp_partition_t *p = (slot == 0 || slot == 1) ? otaSlot(slot) : nullptr;
  if (!p) return -1;
  esp_ota_img_states_t s;
  if (esp_ota_get_state_partition(p, &s) != ESP_OK) return 0;  // never written: EMPTY
  switch (s) {
    case ESP_OTA_IMG_VALID: case ESP_OTA_IMG_UNDEFINED: return 1;
    case ESP_OTA_IMG_NEW: return 2;
    case ESP_OTA_IMG_PENDING_VERIFY: return 3;
    default: return 4;  // INVALID, ABORTED
  }
}
// On the kit a slot's version is the app description's (arduino-cli sets it from the sketch);
// COURIER_VERSION is the simulator's. The running firmware knows its own: courier_version.
extern "C" int __courier_ota_version(int slot, char *out, int max) {
  const esp_partition_t *p = (slot == 0 || slot == 1) ? otaSlot(slot) : nullptr;
  esp_app_desc_t d;
  if (!p || max < 1 || esp_ota_get_partition_description(p, &d) != ESP_OK) return -1;
  int n = 0;
  while (d.version[n] && n < max - 1 && n < (int)sizeof d.version) { out[n] = d.version[n]; n++; }
  out[n] = 0;
  return n;
}
// Downloads: the firmware connects to Wi-Fi itself (Stop 6); this is one GET at a time.
// (Made on first use, so firmware that never downloads doesn't carry the HTTP client.)
static HTTPClient *http = nullptr;
static WiFiClient *body = nullptr;
static int bodyLeft = 0;
extern "C" int __courier_net_get(const char *url, int len) {
  (void)len;
  if (!http) http = new HTTPClient();
  http->end(); body = nullptr; bodyLeft = 0;
  if (WiFi.status() != WL_CONNECTED || !http->begin(url)) return -1;
  int code = http->GET();
  if (code <= 0) { http->end(); return -1; }
  if (code != 200) { http->end(); return -code; }
  bodyLeft = http->getSize();
  body = http->getStreamPtr();
  return bodyLeft < 0 ? 0 : bodyLeft;
}
extern "C" int __courier_net_read(uint8_t *buf, int max) {
  if (!body) return -1;
  if (bodyLeft <= 0) { http->end(); body = nullptr; return 0; }
  int n = body->readBytes(buf, max < bodyLeft ? max : bodyLeft);
  bodyLeft -= n;
  return n;
}
// ---- MQTT (Stop 18) ----
// esp-mqtt, connected on first use (the firmware joins Wi-Fi first) to COURIER_MQTT_URL with the
// robot's name as client id. Received messages wait in a queue of 8 for courier::mqtt::poll().
struct CourierMsg { char topic[48]; uint8_t payload[128]; int len; };
static esp_mqtt_client_handle_t mq = nullptr;
static QueueHandle_t inbox = nullptr;
extern "C" int __courier_robot_id(char *out, int max);
static void onMqtt(void *, esp_event_base_t, int32_t id, void *data) {
  if (id != MQTT_EVENT_DATA) return;
  auto *e = (esp_mqtt_event_handle_t)data;
  CourierMsg m = {};
  int tl = e->topic_len < 47 ? e->topic_len : 47;
  memcpy(m.topic, e->topic, tl);
  m.len = e->data_len;
  memcpy(m.payload, e->data, e->data_len < 128 ? e->data_len : 128);
  if (xQueueSend(inbox, &m, 0) != pdTRUE) { CourierMsg old; xQueueReceive(inbox, &old, 0); xQueueSend(inbox, &m, 0); }  // full: drop the oldest
}
static bool mqttReady() {
#ifdef COURIER_MQTT_URL
  if (mq) return true;
  if (WiFi.status() != WL_CONNECTED) return false;
  static char id[24];
  __courier_robot_id(id, sizeof id);
  esp_mqtt_client_config_t cfg = {};
  cfg.broker.address.uri = COURIER_MQTT_URL;
  cfg.credentials.client_id = id;
  inbox = xQueueCreate(8, sizeof(CourierMsg));
  mq = esp_mqtt_client_init(&cfg);
  esp_mqtt_client_register_event(mq, MQTT_EVENT_ANY, onMqtt, nullptr);
  esp_mqtt_client_start(mq);
  return true;
#else
  return false;  // no broker configured (courier_config.h)
#endif
}
extern "C" int __courier_mqtt_publish(const char *topic, int tlen, const uint8_t *payload, int plen) {
  (void)tlen;
  if (!mqttReady()) return -1;
  return esp_mqtt_client_publish(mq, topic, (const char *)payload, plen, 0, 0) < 0 ? -2 : 0;
}
extern "C" int __courier_mqtt_subscribe(const char *filter, int len) {
  (void)len;
  if (!mqttReady()) return -1;
  return esp_mqtt_client_subscribe(mq, filter, 0) < 0 ? -1 : 0;
}
extern "C" int __courier_mqtt_poll(char *topic, int tmax, uint8_t *payload, int pmax) {
  CourierMsg m;
  if (!inbox || xQueueReceive(inbox, &m, 0) != pdTRUE) return -1;
  if (tmax > 0) { int n = 0; while (m.topic[n] && n < tmax - 1) { topic[n] = m.topic[n]; n++; } topic[n] = 0; }
  if (pmax < 1) return 0;
  int n = m.len < 128 ? m.len : 128;
  if (n > pmax - 1) n = pmax - 1;  // a longer message is cut to fit
  memcpy(payload, m.payload, n);
  payload[n] = 0;
  return n;  // what's in the buffer, never more
}
#endif  // COURIER_WITH_NET

// The robot's name: COURIER_ROBOT_ID (courier_config.h), or "robot-" and the end of its Wi-Fi MAC.
extern "C" int __courier_robot_id(char *out, int max) {
#ifdef COURIER_ROBOT_ID
  const char *id = COURIER_ROBOT_ID;
  int n = 0;
  while (id[n] && n < max - 1) { out[n] = id[n]; n++; }
  if (max > 0) out[n] = 0;
  return n;
#else
  uint64_t mac = ESP.getEfuseMac();
  return snprintf(out, max, "robot-%06x", (unsigned)((mac >> 24) & 0xffffff));
#endif
}

// courier::route(): only the simulator asks for routes (its test drives); on the kit, firmware drives its own.
extern "C" int __courier_route(char *out, int max) { (void)out; (void)max; return -1; }
extern "C" int32_t __courier_ticks(int side) { (void)side; return -1; }  // no wheel encoders on the FNK0053
// The battery sense on GPIO 32 shares its pin with the WS2812, and its divider isn't measured yet
// (no kit has been bought), so this says "not measured" rather than guess.
extern "C" float __courier_battery_volts(void) { return -1.0f; }
extern "C" int __courier_camera_grab(uint8_t *gray, int w, int h) {
  ensure();
  if (!cameraOk || w < 1 || h < 1 || w > 160 || h > 120) return 0;
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) return 0;
  for (int y = 0; y < h; y++)  // nearest-neighbour scale from 160×120
    for (int x = 0; x < w; x++) gray[y * w + x] = fb->buf[(y * fb->height / h) * fb->width + x * fb->width / w];
  esp_camera_fb_return(fb);
  return 1;
}
