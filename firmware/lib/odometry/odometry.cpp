// firmware/lib/odometry/odometry.cpp — your odometry (Stop 5). See odometry.h for what a pose is.
//
// Not written yet: step() returns the pose unchanged, so Pip never seems to move. In Stop 5 you
// write it with the three lines from the sim:
//   move = (left + right) / 2           (each wheel's centimetres: ticks * cmPerTick)
//   turn = (left - right) / wheelbase   (in radians: left wheel further, Pip turns right)
//   east += move * sin(heading), north += move * cos(heading)
// sin() and cos() come from <math.h>.

#include "odometry.h"
#include <math.h>

Pose step(Pose p, long dLeft, long dRight, float cmPerTick, float wheelbaseCm) {
    float left=dLeft*cmPerTick;
    float right=dRight* cmPerTick;
    float move=(left+right)/2;
    float turn=(left-right)/wheelbaseCm;
    p.heading+=turn/2;
    p.east+=move*sin(p.heading);
    p.north+=move*cos(p.heading);
    p.heading+=turn/2;
    
    


    
  return p;
}
