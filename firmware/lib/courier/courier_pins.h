// firmware/lib/courier/courier_pins.h — which pin of the chip is wired to what.
//
// A pin is one of the chip's metal legs. Your code switches it on (HIGH, 3.3 volts) or
// off (LOW, 0 volts). The simulator and the real kit are wired differently, so there is one
// list for each. Your main.cpp only uses the names, so it works on both.
#pragma once

#if defined(COURIER_SIM)
// The simulated robot.
const int LED_PIN = 2;     // the status LED
const int LEFT_FWD = 25;   // motor driver input: left wheel forward
const int LEFT_REV = 26;   // motor driver input: left wheel backward
const int RIGHT_FWD = 32;  // motor driver input: right wheel forward
const int RIGHT_REV = 33;  // motor driver input: right wheel backward
// Wheel encoders (Stop 5): each pin pulses once per tick, 120 ticks per wheel turn. Your code
// reads them as inputs. The same numbers as the simulator's own pin list (tools/courier/firmware/).
const int ENC_LEFT = 34;   // left wheel encoder
const int ENC_RIGHT = 35;  // right wheel encoder
#else
// The real kit, for the optional Stop 24 only (Stops 0–23 run in the simulator). Placeholder
// values until the kit is chosen; its motor driver must take two inputs per motor
// (for example a DRV8833) for Stop 3's code to work as written.
const int LED_PIN = 2;
const int LEFT_FWD = 25;
const int LEFT_REV = 26;
const int RIGHT_FWD = 32;
const int RIGHT_REV = 33;
// No ENC_LEFT/ENC_RIGHT here: the kit being considered (Freenove FNK0053) has no wheel encoders
// (its pins 34/35 go to the camera); see tools/courier/hw/freenove-fnk0053/courier_pins.h.
#endif
