// firmware/src/main.cpp — your robot's firmware (Stop 3).
//
// Firmware is the one program that runs on the robot's chip. It starts when the power comes on
// and never ends: the chip calls setup() once, then calls loop() again and again, forever.
//
// Build it for the simulator:   pio run -e sim -d firmware
// Build and run it:             pio run -e sim -d firmware -t exec
//
// The walkthrough is in stops/03/WALKTHROUGH.md. Timing values you'll need in step 6
// (TILE_MS, TURN_MS at SPEED 180) are measured in the simulator and added here when it ships.

#include <Arduino.h>
#include <courier_pins.h>

void setup() {
  // Runs once, at power-on.

  // From Stop 5: let the simulator's test drives (npm run sim -- --square, --straight 10) choose
  // the route. courier::route() is the route the simulator asks for, or nullptr when it asks for
  // none; then your own route stays. Keep ROUTE (Stop 3's check reads it), add
  // `const char *route = ROUTE;` next to it and drive `route` instead. With #include <courier.h>
  // at the top (from Stop 4), remove the // from this line:
  // const char *asked = courier::route(); if (asked) route = asked;
}

void loop() {
  // Runs again and again, forever.
}
