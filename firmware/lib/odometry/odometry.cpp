// firmware/lib/odometry/odometry.cpp — your odometry (Stop 5). See odometry.h for what a pose is.
//
// Not written yet: step() returns the pose unchanged, so Pip never seems to move. In Stop 5 you
// write it with the three lines from the sim:
//   move = (left + right) / 2           (each wheel's centimetres: ticks * cmPerTick)
//   turn = (left - right) / wheelbase   (in radians: left wheel further, Pip turns right)
//   east += move * sin(heading), north += move * cos(heading)
// sin() and cos() come from <math.h>.

#include "odometry.h"

Pose step(Pose p, long dLeft, long dRight, float cmPerTick, float wheelbaseCm) {
  (void)dLeft;  // "(void)x;" says "not used yet", so the compiler doesn't warn about it
  (void)dRight;
  (void)cmPerTick;
  (void)wheelbaseCm;
  return p;
}
