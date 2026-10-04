// firmware/lib/odometry/odometry.h — where Pip is, worked out from its wheel ticks (Stop 5).
//
// A pose is where the robot is and which way it faces:
//   east, north  centimetres east and north of where it started (the start tile's centre)
//   heading      a compass angle in radians: 0 is north, and it goes up clockwise
//                (east is pi/2). Print it in degrees (heading * 180 / pi).
//
// This folder is a library: your firmware and your tests (firmware/test/) can both use it.
// It has no hardware calls (no Arduino.h), so it runs on any computer:
//     pio test -e native -d firmware
// The walkthrough is in stops/05/WALKTHROUGH.md (step 4).
#pragma once

struct Pose {
  float east;
  float north;
  float heading;
};

// The pose after a small move: dLeft and dRight are each wheel's new ticks (negative when it
// turned backwards), cmPerTick is how far one tick rolls a wheel, and wheelbaseCm is the
// distance between the two wheels.
Pose step(Pose p, long dLeft, long dRight, float cmPerTick, float wheelbaseCm);
