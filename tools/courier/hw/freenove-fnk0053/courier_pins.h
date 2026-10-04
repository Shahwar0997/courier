// courier_pins.h — which pin is wired to what: the simulator, and the Freenove FNK0053 kit.
// A drop-in for courier-starter's firmware/lib/courier/courier_pins.h (same names, same sim numbers).
#pragma once

#if defined(COURIER_SIM)
// The simulated robot.
const int LED_PIN = 2;     // the status LED
const int LEFT_FWD = 25;   // motor driver input: left wheel forward
const int LEFT_REV = 26;   // motor driver input: left wheel backward
const int RIGHT_FWD = 32;  // motor driver input: right wheel forward
const int RIGHT_REV = 33;  // motor driver input: right wheel backward
const int ENC_LEFT = 34;   // left wheel encoder: a pulse per tick, 120 per wheel turn (input)
const int ENC_RIGHT = 35;  // right wheel encoder
#else
// The Freenove 4WD Car Kit for ESP32 (FNK0053). Its motors are behind a PWM chip, so these are
// Courier pins that courier_kit.h routes to it (the optional Stop 24 opens this up).
#include "courier_kit.h"
const int LED_PIN = COURIER_PIN_LED;
const int LEFT_FWD = COURIER_PIN_LEFT_FWD;
const int LEFT_REV = COURIER_PIN_LEFT_REV;
const int RIGHT_FWD = COURIER_PIN_RIGHT_FWD;
const int RIGHT_REV = COURIER_PIN_RIGHT_REV;
// The FNK0053 has no wheel encoders (GPIO 34/35 are its camera's). Firmware that counts ticks
// builds, but attachInterrupt on these does nothing and courier::ticks() returns −1.
const int ENC_LEFT = COURIER_PIN_NONE;
const int ENC_RIGHT = COURIER_PIN_NONE;
#endif
