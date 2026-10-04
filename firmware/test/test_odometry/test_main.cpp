// firmware/test/test_odometry/test_main.cpp — the tests for your odometry library (Stop 5).
//
// These run on this computer, not on the robot: no chip, no simulator, under a second.
//     pio test -e native -d firmware
// The test tool is Unity, a small C testing library. TEST_ASSERT_FLOAT_WITHIN(tolerance,
// expected, actual) passes when actual is within tolerance of expected, because decimals are
// rarely exactly equal.
//
// The tests below are switched off with // at the start of each line, because step() isn't
// written yet. In Stop 5 you remove the // from one test and its RUN_TEST line at a time, and
// run the tests after each. CI runs them on every push (job stop-05). Until you switch one on,
// stop-05 says Stop 5 hasn't started yet. Add your own tests the same way.

#include <math.h>
#include <unity.h>

#include <odometry.h>

const float PI_F = 3.14159265f;

void setUp() {}
void tearDown() {}

// // Equal ticks on both wheels: straight ahead. Facing north, that's all north.
// void test_straight() {
//   Pose p = step(Pose{0, 0, 0}, 100, 100, 0.3f, 10.0f);
//   TEST_ASSERT_TRUE_MESSAGE(p.north != 0.0f || p.east != 0.0f, "Pip didn't move: step() still returns the pose it was given. Write it in lib/odometry/odometry.cpp with the three lines there");
//   TEST_ASSERT_FLOAT_WITHIN_MESSAGE(0.1f, 0.0f, p.east, "Facing north, a straight move shouldn't go east. Are sin and cos the right way round? east uses sin(heading), north uses cos(heading)");
//   TEST_ASSERT_FLOAT_WITHIN_MESSAGE(0.1f, 30.0f, p.north, "100 ticks of 0.3 cm on both wheels is 30 cm. Did you add both wheels instead of averaging?");
//   TEST_ASSERT_FLOAT_WITHIN_MESSAGE(0.01f, 0.0f, p.heading, "Equal ticks shouldn't turn Pip");
// }

// // Opposite ticks: Pip turns on the spot. The wheels' moves cancel out, so east and north stay put.
// void test_turn_in_place() {
//   Pose p = step(Pose{12, 34, 0}, 20, -20, 0.3f, 10.0f);
//   TEST_ASSERT_FLOAT_WITHIN_MESSAGE(0.01f, 12.0f, p.east, "Turning on the spot shouldn't move Pip east or west");
//   TEST_ASSERT_FLOAT_WITHIN_MESSAGE(0.01f, 34.0f, p.north, "Turning on the spot shouldn't move Pip north or south");
//   TEST_ASSERT_TRUE_MESSAGE(p.heading > 0, "Left wheel forward, right wheel back: Pip turns right, so the heading should go up");
// }

// // A quarter turn right, then straight on: now the move goes east.
// void test_quarter_turn() {
//   float cmPerTick = PI_F / 20;  // chosen so that 50 ticks each way is exactly 90°
//   Pose p = step(Pose{0, 0, 0}, 50, -50, cmPerTick, 10.0f);
//   TEST_ASSERT_FLOAT_WITHIN_MESSAGE(0.01f, PI_F / 2, p.heading, "A quarter turn right should add pi/2 (90°). Is turn = (left - right) / wheelbase?");
//   p = step(p, 100, 100, 0.3f, 10.0f);
//   TEST_ASSERT_FLOAT_WITHIN_MESSAGE(0.1f, 30.0f, p.east, "Facing east, 30 cm straight should add 30 to east. Are sin and cos the right way round?");
//   TEST_ASSERT_FLOAT_WITHIN_MESSAGE(0.1f, 0.0f, p.north, "Facing east, a straight move shouldn't go north");
// }

// // A curve: the left wheel rolls 30 cm and the right 20 cm. Pip moves the average, 25 cm, and
// // turns by the difference over the wheelbase, 10 / 10 = 1 radian (about 57°).
// void test_curve() {
//   Pose p = step(Pose{0, 0, 0}, 120, 80, 0.25f, 10.0f);
//   TEST_ASSERT_FLOAT_WITHIN_MESSAGE(0.01f, 1.0f, p.heading, "The turn should be (30 - 20) / 10 = 1 radian");
//   float moved = sqrt(p.east * p.east + p.north * p.north);
//   TEST_ASSERT_FLOAT_WITHIN_MESSAGE(0.1f, 25.0f, moved, "Pip should move the average of the wheels, 25 cm");
// }

int main() {
  UNITY_BEGIN();
  // RUN_TEST(test_straight);
  // RUN_TEST(test_turn_in_place);
  // RUN_TEST(test_quarter_turn);
  // RUN_TEST(test_curve);
  return UNITY_END();
}
