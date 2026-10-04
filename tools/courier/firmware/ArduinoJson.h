// ArduinoJson.h for the Courier simulator: ArduinoJson 7.4.3 (Benoît Blanchon, MIT licence; the
// unmodified single-file release, ArduinoJson-v7.4.3.h, sha256 ab5fbb82…cc76a5b), set up for the
// simulator: no Arduino String class here, so ArduinoJson's String support is off; char* text, Print
// (Serial, WiFiClient) and Stream all work. The same version courier-starter pins for the real kit.
//
//   JsonDocument doc;
//   if (deserializeJson(doc, line)) { /* bad json */ }
//   const char *cmd = doc["cmd"] | "";
//   serializeJson(reply, client); client.print("\n");
#ifndef COURIER_SIM_ARDUINOJSON_H
#define COURIER_SIM_ARDUINOJSON_H
#ifndef ARDUINOJSON_ENABLE_ARDUINO_STRING
#define ARDUINOJSON_ENABLE_ARDUINO_STRING 0
#endif
#ifndef ARDUINOJSON_ENABLE_PROGMEM
#define ARDUINOJSON_ENABLE_PROGMEM 0
#endif
#define ARDUINOJSON_ENABLE_STD_STREAM 0
#define ARDUINOJSON_ENABLE_STD_STRING 0
#define ARDUINOJSON_ENABLE_STRING_VIEW 0
#include "ArduinoJson-v7.4.3.h"
#endif
