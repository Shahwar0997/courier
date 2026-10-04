// courier_pins.h — which pin of the chip is wired to what, on the simulated Courier robot.
//
// The same numbers as courier-starter's firmware/lib/courier/courier_pins.h (its COURIER_SIM part),
// so learner firmware that includes its own pin file builds here unchanged. Used only when the
// firmware doesn't bring a courier_pins.h of its own.
#pragma once

const int LED_PIN = 2;     // the status LED
const int LEFT_FWD = 25;   // motor driver input: left wheel forward
const int LEFT_REV = 26;   // motor driver input: left wheel backward
const int RIGHT_FWD = 32;  // motor driver input: right wheel forward
const int RIGHT_REV = 33;  // motor driver input: right wheel backward
const int ENC_LEFT = 34;   // left wheel encoder: a pulse per tick, 120 per wheel turn (input)
const int ENC_RIGHT = 35;  // right wheel encoder
