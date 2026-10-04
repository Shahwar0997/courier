# Stop 5 · Know where you are: measure, don't guess — walkthrough

In this walkthrough you watch an expert turn on the simulator's **real-world switch** and watch
the robot's timed moves drift. Then they make the robot *measure* instead of guess: it counts its
wheels' turns, adds them up into where it believes it is, ends every turn and tile by the count,
holds its speed with a controller, and is **calibrated** so the numbers match this floor.

**Time:** about 4–5 hours. **You need:** Stops 1–4 merged. This stop starts from your Stop 4
firmware (the state machine with `motors`, `sensors` and `main`).

**How to read it:** the same as before: **Do**, **You'll see**, **Why**, in five parts with ✅
checkpoints. Your numbers will be close to the expert's, not always identical: if a step says
"about 20 cm" and you get 19, that's fine.

> **Before you start: two things to know.**
> - **The test drives use a longer command for now.** `npm run sim -- --real-world --square` stops
>   with `✗ --square and --straight drive on their own open floor; leave out --map`. A fix is on
>   its way. This walkthrough uses the command that `npm run sim` runs underneath, without the
>   office map: `node tools/courier/cli.mjs run firmware --real-world --square`. Both run the same
>   simulator, and the longer one keeps working after the fix.
> - **What CI checks at this stop.** `stop-05` runs your odometry tests, then, with the real-world
>   switch on, on seeds 1–3: the square ends within 5 cm and your printed pose is within 5 cm of
>   the truth, `loop()` keeps looking, and 10 tiles come out 300 ± 6 cm and within 12° of straight.
>   Once Stop 5 starts, `stop-03` and `stop-04` also run with the switch on, as your robot is now
>   tuned, and not reaching G on the office route is a note or a warning, not a ✗ (Step 12 says
>   why). All of them go green with this walkthrough's firmware.
>
> **If your copy of the repo is older than these walkthroughs,** its checks are older too:
> `stop-03` and `stop-04` go red (`stop-04` from Step 7 on, at `✗ Still delivers: Pip hit a wall
> …`), and `stop-05` checks only your tests and the square. That's our bug, not yours: your work
> is fine, and you can merge with those red. Trust a green `stop-05` and the numbers in Steps 9–11.

---

## Part A · Turn on the real world

### Step 1 · A fresh branch, and the real-world switch

**Do:** start from the latest `main`, on a new branch, and run your Stop 4 firmware with the
switch on:

```
git switch main
git pull
git switch -c stop-05-know-where-you-are
npm run sim -- --real-world
```

**You'll see** (the end of it):

```
    6.90 s  E E E E S S S E BLOCKED 9
✓ Your robot stopped 352 cm from G
  robot time 30.0 s · LED toggled 94 times · 0 bumps
  real world on (seed 1) · battery 7.86 V → 7.86 V · encoder ticks 1265 / 1222
  longest loop() gap 25 ms (from 4.08 s)
```

The robot drifted against a wall on move 8 and stopped there for good (it took the wall for
something in the way). Now try two other seeds:

```
npm run sim -- --real-world 2
npm run sim -- --real-world 3
```

Both end `✗ Your robot hit a wall after move 3`.

**Why:**
- **`--real-world`** turns on what a real floor and a real robot do: the wheels **slip** a little,
  one motor is a little **weaker** than the other, the **battery sags** as it drains, and the
  sensors are noisy (Stop 4's noise). A number after it is the **seed**, which picks the random
  amounts (`--real-world` alone is seed 1), so a run is the same every time you repeat it.
- Your Stop 4 firmware drives by time: so many milliseconds is a tile, so many is a turn. On a
  perfect floor that works. Here, each turn comes out a few degrees off, each tile a little short,
  and the errors add up until the robot meets a wall. Nothing in the firmware notices, because
  nothing measures what the wheels really did. That's **open loop** (Stop 3, Step 6).
- `encoder ticks 1265 / 1222` in the summary: the simulator counted the left and right wheels'
  turns, and they differ. Your firmware will count them too, from Step 3.
- The switch stays on from here: calibrating against a perfect floor would teach you nothing.

### Step 2 · Switch on the test drives

The office route is long and has doors to squeeze through. To tune a robot, you want simple, short
drives you can measure: a **square** (forward one tile, turn right, four times: the robot should end
where it started) and a **straight** run of 10 tiles (it should end 300 cm ahead, facing the same
way). The simulator has both, on an open floor of their own. Your firmware drives them if it asks
the simulator which route to drive.

**Do:** in `main.cpp`:
1. Under `const char* ROUTE = …;`, add:

   ```cpp
   const char* route = ROUTE;  // what the robot drives: ROUTE, or a test drive the simulator asks for
   ```

2. Everywhere the code reads `ROUTE[move]` (in `startMove()` twice, and in `case State::TURNING:`),
   change it to `route[move]`.
3. At the end of `setup()`, in the comment that starts `// From Stop 5:`, remove the `// ` from the
   last line, so it runs:

   ```cpp
     const char *asked = courier::route(); if (asked) route = asked;
   ```

   and move that line up, **above** `startMove();`. (You can delete the rest of the comment: this
   step did what it says.)

Then run the square, first on a perfect floor and then with the switch on:

```
node tools/courier/cli.mjs run firmware --square
node tools/courier/cli.mjs run firmware --real-world --square
```

**You'll see:**

```
  square test (ESWN): ended 0.7 cm from where it started, facing 0.2° left of north
```

on the perfect floor, and with the switch on:

```
  square test (ESWN): ended 18.9 cm from where it started, facing 34° left of north
```

Then the straight run, with the switch on: `node tools/courier/cli.mjs run firmware --real-world
--straight 10`:

```
  straight test, 10 tiles (300 cm by the book): drove 273.2 cm (the simulator's truth) · encoder ticks 1676 / 1622, average 1649 · 0.1657 cm per tick
```

**Why:**
- `courier::route()` returns the route the simulator asks for (`"ESWN"` for the square, ten `E`s for
  the straight run), or `nullptr` (C++'s "nothing", like Python's `None`) when it asks for none.
  Then `route` stays `ROUTE`, so `npm run sim` still drives the office route.
- `ROUTE` stays, with `const char* ROUTE = "…";` exactly as before, because Stop 3's check reads it.
- **It has to be in `setup()`, before the first move.** Without this line, the test drive's open
  floor still runs, but your robot drives the office route on it, and the summary still prints a
  plausible-looking `square test (ESWN): ended … cm from where it started` that means nothing. If a square result
  looks wild, check this line first.
- The square on a perfect floor is nearly perfect: your Stop 4 timings were measured there. With
  the switch on, the turns come out short, and the square ends 19 cm off. The straight run comes
  out 27 cm short and curves: one motor is weaker.

✅ **Checkpoint A:** the square ends within 1 cm with the switch off and far off with it on.

---

## Part B · Count the wheels

### Step 3 · Encoders, counted with interrupts

Each wheel has an **encoder**: a disc with 120 slots that turns with the wheel, and a light that
shines through the slots onto a sensor. Each slot that passes makes the encoder's pin go HIGH for a
moment: one **tick**. 120 ticks are one turn of the wheel.

**Do:** make two new files in `firmware/src`. `encoders.h`:

```cpp
// firmware/src/encoders.h — counting wheel ticks (Stop 5).
#pragma once

void startEncoders();                      // call once, in setup()
void setDirections(int left, int right);   // which way each wheel was told to turn
long leftTicks();                          // ticks so far, + forward and - backward
long rightTicks();
```

and `encoders.cpp`:

```cpp
// firmware/src/encoders.cpp — counting wheel ticks with interrupts (Stop 5).
#include <Arduino.h>
#include <courier_pins.h>

#include "encoders.h"

volatile long leftCount = 0;   // changed inside an interrupt, so volatile
volatile long rightCount = 0;
volatile int leftDir = 1;      // +1 forward, -1 backward: the encoders can't tell
volatile int rightDir = 1;

void IRAM_ATTR onLeftTick() {
  leftCount += leftDir;
}

void IRAM_ATTR onRightTick() {
  rightCount += rightDir;
}

void startEncoders() {
  pinMode(ENC_LEFT, INPUT);
  pinMode(ENC_RIGHT, INPUT);
  attachInterrupt(digitalPinToInterrupt(ENC_LEFT), onLeftTick, RISING);
  attachInterrupt(digitalPinToInterrupt(ENC_RIGHT), onRightTick, RISING);
}

void setDirections(int left, int right) {
  // A wheel told 0 keeps its last direction: it coasts on the same way for a moment.
  if (left > 0) leftDir = 1;
  if (left < 0) leftDir = -1;
  if (right > 0) rightDir = 1;
  if (right < 0) rightDir = -1;
}

long leftTicks() {
  noInterrupts();
  long ticks = leftCount;
  interrupts();
  return ticks;
}

long rightTicks() {
  noInterrupts();
  long ticks = rightCount;
  interrupts();
  return ticks;
}
```

Change `motors.cpp` so every wheel command also tells the encoders which way the wheels turn:

```cpp
// firmware/src/motors.cpp — how the motors are driven (Stops 4 and 5).
#include <courier.h>

#include "encoders.h"
#include "motors.h"

// Both wheels: everything that moves the robot goes through here.
void drive(int left, int right) {
  setDirections(left, right);
  courier::motors(left, right);
}

void stopMotors() {
  drive(0, 0);
}
```

In `main.cpp`, add `#include "encoders.h"` above `#include "motors.h"`, and in `setup()`, call
`startEncoders();` just after `pinMode(LED_PIN, OUTPUT);`. Run `npm run sim`: the office route
drives as in Stop 4.

**Why:**
- A tick lasts a moment, and the robot's code is busy elsewhere most of the time (reading the
  sensor takes up to 25 ms). If `loop()` checked the pin now and then, it would miss ticks. An
  **interrupt** makes the chip drop what it's doing the instant the pin changes, run a tiny
  function (the **interrupt handler**), and carry on where it was. `attachInterrupt(…, onLeftTick,
  RISING)` says "call `onLeftTick` every time this pin goes from LOW to HIGH" (**RISING**): once
  per slot.
- `ENC_LEFT` and `ENC_RIGHT` are the encoders' pins, in `courier_pins.h`. `INPUT` means "this
  pin is read, not switched" (the opposite of Stop 3's `OUTPUT`).
- **`long`** is a whole number like `int`. On the robot's chip both hold up to about 2 billion,
  but writing `long` says "this counts up for a long time", and stays right on chips where `int`
  is smaller.
- **`volatile`** tells the compiler that a variable can change at any moment, behind the code's
  back (inside an interrupt), so it must really read it every time instead of reusing a copy.
- **`IRAM_ATTR`** puts the handler in the chip's fast internal memory, so it can run at any moment.
  (In the simulator it does nothing, but the real chip needs it.) Keep handlers tiny: add one, and
  return.
- `digitalPinToInterrupt(ENC_LEFT)` turns a pin number into the interrupt number that pin uses
  (on this chip they're the same; the call keeps the code right on chips where they aren't).
- `noInterrupts()` … `interrupts()` holds the interrupts back for the moment it takes to copy the
  count, so a tick can't change it halfway through the copy.
- **These encoders count slots, not direction.** So the firmware adds or subtracts by the direction
  it told each wheel to turn (`setDirections`). When a wheel is told to stop, it keeps the last
  direction: the wheel coasts on a little, still the same way, and those ticks count too.

### Step 4 · Look at the numbers

**Do:** in `startMove()`, just after `Serial.println("DONE");`, add:

```cpp
    Serial.print("ticks ");
    Serial.print(leftTicks());
    Serial.print(" ");
    Serial.println(rightTicks());
```

and run the straight test, on a perfect floor and then with the switch on, on seeds 1 and 2:

```
node tools/courier/cli.mjs run firmware --straight 10
node tools/courier/cli.mjs run firmware --real-world --straight 10
node tools/courier/cli.mjs run firmware --real-world 2 --straight 10
```

**You'll see:**

```
    8.86 s  ticks 1750 1750
    8.86 s  ticks 1662 1608
    8.86 s  ticks 1634 1695
```

On the perfect floor, both wheels turn the same. With the switch on, they differ by about 55
ticks, and the weaker wheel is left on one seed and right on the other.

**Why:** data first, again (Stop 4, Step 3). The robot drove 8.86 seconds either way, but its
wheels didn't turn the same, so it couldn't have driven straight. Now the firmware can *see* that,
and the rest of the stop uses it. Delete the four `ticks` lines again: Step 7 prints something
better.

✅ **Checkpoint B:** the firmware prints two different tick counts with the switch on.

---

## Part C · Odometry: from ticks to "where am I?"

**Odometry** means working out where you are from how far your wheels have turned. Where the robot
is and which way it faces, together, is its **pose**. The starter already has a small library for
it, `firmware/lib/odometry/`: open `odometry.h`. A pose is three numbers:
- `east` and `north`: centimetres east and north of where the robot started (S's centre);
- `heading`: which way it faces, as a compass angle in **radians**, clockwise from north.

**Radians** measure angles by the arc: a full turn is 2π radians (about 6.28), so 90° is π/2
(about 1.571) and 1 radian is about 57°. C++'s `sin` and `cos` take radians, which is why the
maths keeps them. **Heading 0 is north**, and the robot starts facing **east**, so its starting
heading is π/2.

One word, two meanings: in Stops 3–4, `heading` (now `dir`) was a direction, 0–3. Here
**heading** is an angle, and it can be anything, like 91.4°.

`step(pose, dLeft, dRight, cmPerTick, wheelbaseCm)` is the function you write: given a pose and each
wheel's new ticks, it returns the new pose. `odometry.cpp` holds a placeholder that returns the pose
unchanged. The **wheelbase** is the distance between the two wheels (Step 11 calibrates it).

### Step 5 · Switch on the first test, and watch it fail

**Do:** open `firmware/test/test_odometry/test_main.cpp`. Like Stop 2's tests, they're switched off
with `//`. Switch on `test_straight`: select its lines (from `// // Equal ticks` to its closing
`// }`) and press **Ctrl+/** (Windows or Linux) or **Cmd+/** (Mac), which removes one `//` from each
line. Then, at the bottom, remove the `// ` from `// RUN_TEST(test_straight);`. Run the tests:

```
pio test -e native -d firmware
```

**You'll see** the test fail:

```
test/test_odometry/test_main.cpp:27: test_straight: Pip didn't move: step() still returns the pose it was given. Write it in lib/odometry/odometry.cpp with the three lines there	[FAILED]
```

and a summary with `1 failed`. (In a copy older than these walkthroughs, the message is `Expected
30 Was 0. … Did you add both wheels instead of averaging?`: the same failure, worded for a
different mistake.) (`-d firmware` is needed, as for `pio run`: the project is in
the `firmware` folder. Run from the top folder, without it, `pio` says it can't find a project.)

**Why:**
- These are **host-side tests**: they run the library as an ordinary program on the computer
  running them (your Codespace, or GitHub's computer in CI), in under a second, with no robot and
  no simulator. That works because `odometry.cpp` has no hardware calls in it.
- `native` is a PlatformIO environment for "this computer", without the Arduino stand-in. The test
  tool is **Unity**, a small C testing library: `TEST_ASSERT_FLOAT_WITHIN(tolerance, expected,
  actual)` passes when the result is close enough, because decimals are rarely exactly equal.
- The placeholder `step()` doesn't move the robot at all, so the test fails. Watching a test fail
  first, for the right reason, proves it can catch the bug. Now make it pass.

### Step 6 · Write `step()`, then switch on the other tests

**Do:** replace all of `firmware/lib/odometry/odometry.cpp` with:

```cpp
// firmware/lib/odometry/odometry.cpp — your odometry (Stop 5). See odometry.h for what a pose is.
#include "odometry.h"

#include <math.h>

Pose step(Pose p, long dLeft, long dRight, float cmPerTick, float wheelbaseCm) {
  float left = dLeft * cmPerTick;     // how far each wheel rolled, in cm
  float right = dRight * cmPerTick;
  float move = (left + right) / 2;            // Pip moves the average of the two
  float turn = (left - right) / wheelbaseCm;  // radians; left wheel further: Pip turns right
  p.heading += turn / 2;                      // move along the heading halfway through the turn
  p.east += move * sin(p.heading);
  p.north += move * cos(p.heading);
  p.heading += turn / 2;
  return p;
}
```

Run `pio test -e native -d firmware`: `test_straight [PASSED]`. Then switch on `test_turn_in_place`,
`test_quarter_turn` and `test_curve` the same way (the test, and its `RUN_TEST` line), running the
tests after each. At the end:

```
test/test_odometry/test_main.cpp:61: test_straight	[PASSED]
test/test_odometry/test_main.cpp:62: test_turn_in_place	[PASSED]
test/test_odometry/test_main.cpp:63: test_quarter_turn	[PASSED]
test/test_odometry/test_main.cpp:64: test_curve	[PASSED]
…
================== 4 test cases: 4 succeeded in 00:00:00.870 ==================
```

Commit:

```
git add firmware
git commit -m "Count wheel ticks, and work out the pose from them"
```

**Why:**
- **The three lines from the sim.** Each wheel's distance is its ticks × `cmPerTick`. The robot
  moves the **average** of the two (`move`). It turns by their **difference over the wheelbase**
  (`turn`, in radians): if the left wheel rolls further, the robot turns right, and the heading
  goes up. Then `east` grows by `move × sin(heading)` and `north` by `move × cos(heading)`: facing
  north (0), all of `move` goes north; facing east (π/2), all of it goes east.
- The heading is moved by half the turn before the move and half after: during a small step the
  robot was facing, on average, halfway between. It's slightly more accurate than turning first.
- A **`struct`** groups named values into one type: `Pose` is three `float`s, used like
  `p.east`. **`float`** is a decimal number. The robot's chip does `float` maths fast in hardware.
- PlatformIO builds every folder in `firmware/lib/` as a **library**, which your firmware and your
  tests can both include (`#include <odometry.h>`).

✅ **Checkpoint C:** `pio test -e native -d firmware` says `4 test cases: 4 succeeded`.

---

## Part D · Drive by ticks, hold the speed, and calibrate

### Step 7 · Turn and drive by ticks

This step rewrites `main.cpp` again, so here is the whole file after it. **Do:** make `main.cpp`
say this:

```cpp
// firmware/src/main.cpp — your robot's firmware (Stops 3, 4 and 5).
//
// Build it and drive it in the simulator:   npm run sim
// The real-world switch on:                 npm run sim -- --real-world
// The test drives, --square and --straight 10: see stops/05/WALKTHROUGH.md, Step 2

#include <Arduino.h>
#include <courier.h>
#include <courier_pins.h>
#include <odometry.h>

#include "encoders.h"
#include "motors.h"
#include "sensors.h"

// The robot's numbers. The book's values for now: you calibrate them in Steps 9 and 11.
const long TICKS_PER_TURN = 50;     // where the motors stop for a 90° turn
const long TICKS_PER_TILE = 176;    // where the motors stop for one 30 cm tile: 30 / CM_PER_TICK
const float CM_PER_TICK = 0.1702f;  // how far one tick rolls a wheel: a 6.5 cm wheel, 120 ticks a turn
const float WHEELBASE_CM = 14.0f;   // the distance between the wheels

const int TURN_POWER = 170;
const int BASE = 170;                 // the power both wheels drive with
const unsigned long SETTLE_MS = 300;  // the pause after every stop, while the wheels coast
const unsigned long READ_MS = 60;     // read the sensor every 60 ms
const unsigned long POSE_MS = 500;    // print the pose every 500 ms
const int STOP_CM = 20;               // stop when something in the way is closer than this
const int GO_CM = 30;                 // go again only when it's further than this

// The route your planner prints for maps/office.txt:  python3 planner/plan.py maps/office.txt
const char* ROUTE = "EEEESSSEEEEEEEEEEESSS";
const char* route = ROUTE;  // what the robot drives: ROUTE, or a test drive the simulator asks for

enum class State { IDLE, TURNING, DRIVING, BLOCKED, SETTLING, DONE };
State state = State::IDLE;

int dir = 1;                  // which way the route faces: 0 = N, 1 = E, 2 = S, 3 = W
int move = -1;                // which move of the route the robot is on (none yet)
long startLeft = 0;           // both tick counts when this turn or tile began
long startRight = 0;
long goalTicks = 0;           // how many ticks this turn or tile takes
long ticksLeft = 0;           // how many ticks of the tile were left when the robot stopped
bool driveAfterSettling = false;  // after the pause: drive a tile (true) or start the next move
unsigned long settleStart = 0;
unsigned long lastRead = 0;
int distance = 400;           // the latest averaged reading, in cm
unsigned long lastBlink = 0;
bool ledOn = false;
Pose pose = {0, 0, HALF_PI};  // where the robot believes it is: on S, facing east (pi/2)
long seenLeft = 0;            // the ticks the pose has already counted
long seenRight = 0;
unsigned long lastPose = 0;

// N, E, S, W -> 0, 1, 2, 3
int headingOf(char m) {
  if (m == 'N') return 0;
  if (m == 'E') return 1;
  if (m == 'S') return 2;
  return 3;  // 'W'
}

void setLed(bool on) {
  ledOn = on;
  digitalWrite(LED_PIN, on ? HIGH : LOW);
}

// Remember both tick counts: this turn or tile counts from here.
void startCounting() {
  startLeft = leftTicks();
  startRight = rightTicks();
}

// How many ticks the wheels have turned since startCounting(): the average of the two.
long ticksDone() {
  return (labs(leftTicks() - startLeft) + labs(rightTicks() - startRight)) / 2;
}

// How many cm of this tile are still to drive.
int cmLeft() {
  long left = state == State::BLOCKED ? ticksLeft : goalTicks - ticksDone();
  if (left < 0) left = 0;
  return left * CM_PER_TICK;
}

// Something is in the way if it's closer than `limit` and nearer than where this tile ends.
bool inTheWay(int cm, int limit) {
  return cm < limit && cm < cmLeft();
}

// Add the ticks since last time to the pose.
void updatePose() {
  long l = leftTicks();
  long r = rightTicks();
  pose = step(pose, l - seenLeft, r - seenRight, CM_PER_TICK, WHEELBASE_CM);
  seenLeft = l;
  seenRight = r;
}

// Print the pose as cm east, cm north and compass degrees, for the simulator's summary.
void printPose() {
  float degrees = pose.heading * RAD_TO_DEG;
  while (degrees < 0) degrees += 360;
  while (degrees >= 360) degrees -= 360;
  Serial.print("pose e=");
  Serial.print(pose.east, 1);
  Serial.print(" n=");
  Serial.print(pose.north, 1);
  Serial.print(" h=");
  Serial.println(degrees, 1);
}

// Stop, and pause for SETTLE_MS before driving a tile or starting the next move.
void settle(bool thenDrive) {
  stopMotors();
  driveAfterSettling = thenDrive;
  settleStart = millis();
  state = State::SETTLING;
}

// Drive one tile.
void startTile() {
  startCounting();
  goalTicks = TICKS_PER_TILE;
  emptyWindow();    // those readings faced somewhere else
  distance = 400;   // the last reading faced somewhere else
  drive(BASE, BASE);
  state = State::DRIVING;
  setLed(true);
  Serial.print(route[move]);
  Serial.print(' ');
}

// Start the next move: turn to face it, or drive it straight away, or finish.
void startMove() {
  move++;
  if (route[move] == '\0') {
    state = State::DONE;
    setLed(false);
    updatePose();
    printPose();
    Serial.println("DONE");
    return;
  }
  int target = headingOf(route[move]);
  int quarterTurns = (target - dir + 4) % 4;
  dir = target;
  if (quarterTurns == 0) {
    startTile();
    return;
  }
  startCounting();
  goalTicks = quarterTurns == 2 ? 2 * TICKS_PER_TURN : TICKS_PER_TURN;
  if (quarterTurns == 3) drive(-TURN_POWER, TURN_POWER);  // one turn left
  else drive(TURN_POWER, -TURN_POWER);                    // right, or right twice
  state = State::TURNING;
  setLed(true);
}

void setup() {
  Serial.begin(115200);
  Serial.println("Courier ready");
  pinMode(LED_PIN, OUTPUT);
  startEncoders();

  // The simulator's test drives (--square, --straight 10) ask for their own route.
  const char *asked = courier::route(); if (asked) route = asked;

  startMove();
}

void loop() {
  unsigned long now = millis();
  if (now - lastRead >= READ_MS) {
    lastRead = now;
    distance = readDistance();
  }
  if (now - lastPose >= POSE_MS) {
    lastPose = now;
    updatePose();
    printPose();
  }

  switch (state) {
    case State::TURNING:
      if (ticksDone() >= goalTicks) settle(true);
      break;

    case State::DRIVING:
      if (ticksDone() >= goalTicks) {
        settle(false);
      } else if (inTheWay(distance, STOP_CM)) {
        stopMotors();
        ticksLeft = goalTicks - ticksDone();
        state = State::BLOCKED;
        Serial.print("BLOCKED ");
        Serial.println(distance);
      }
      break;

    case State::BLOCKED:
      if (now - lastBlink >= 250) {
        lastBlink = now;
        setLed(!ledOn);
      }
      if (!inTheWay(distance, GO_CM)) {
        startCounting();          // carry on with what was left of the tile
        goalTicks = ticksLeft;
        drive(BASE, BASE);
        state = State::DRIVING;
        setLed(true);
        Serial.print("GO ");
        Serial.println(distance);
      }
      break;

    case State::SETTLING:
      if (now - settleStart >= SETTLE_MS) {
        if (driveAfterSettling) startTile();
        else startMove();
      }
      break;

    case State::IDLE:
    case State::DONE:
      break;
  }
}
```

Run the square on the perfect floor, then with the switch on:

```
node tools/courier/cli.mjs run firmware --square
node tools/courier/cli.mjs run firmware --real-world --square
```

**You'll see:** on the perfect floor, `square test (ESWN): ended 0.2 cm from where it started`. With
the switch on, `ended 14.8 cm from where it started, facing 23° left of north`, and a `pose e=… n=…
h=…` line every half second, with a summary line comparing the last one with the truth:

```
  belief (last pose line, 29.53 s): e=1.9 n=1.9 h=10.7 · truth now: e=-8.5 n=-12.1 h=337 · 17.4 cm apart
```

Then the straight run, with the switch on: `node tools/courier/cli.mjs run firmware --real-world
--straight 10`:

```
  straight test, 10 tiles (300 cm by the book): drove 313.7 cm (the simulator's truth) · encoder ticks 1921 / 1866, average 1893.5 · 0.1657 cm per tick
  belief (last pose line, 29.50 s): e=298.7 n=-103.1 h=128.3 · truth now: e=293.6 n=-95.1 h=125.9 · 9.5 cm apart
```

The `truth now` heading is 125.9°: the robot ended facing 36° away from east (90°). It drove a
curve.

**Why:**
- **Closed loop for distance.** `TURNING` ends when the wheels have turned `TICKS_PER_TURN` ticks
  (`ticksDone()`, the average of both wheels since the turn began), and `DRIVING` ends at
  `TICKS_PER_TILE`. The move ends when the wheels have *really* turned enough, however long that
  takes. `TILE_MS` and `TURN_MS` are gone. `BLOCKED` now remembers `ticksLeft` instead of
  `msLeft`.
- **The numbers are "the book's"** for now: a 6.5 cm wheel with 120 ticks a turn rolls 0.1702 cm
  per tick, so a 30 cm tile is 176 ticks, and the wheels sit 14 cm apart. A 90° turn on the spot,
  with the wheels coasting on after the motors stop, comes to about 50 ticks. You'll calibrate all
  four against the real floor.
- **`SETTLING`, a pause after every stop.** The motors stop at the count, but the wheels roll on
  for a moment. The 300 ms pause lets them finish before the next move starts counting, so those
  coasting ticks don't land in the wrong move. It's a clock check, Stop 4's way, never
  `delay(300)`: a `delay` would make the robot blind for 300 ms (and CI's "keeps looking" check
  would catch it).
- **The pose.** Every 500 ms, `updatePose()` hands the ticks since last time to your `step()`, and
  `printPose()` prints the belief as `pose e=… n=… h=…`: cm east, cm north, and the heading in
  compass degrees (`RAD_TO_DEG` turns radians into degrees). The simulator reads those lines and
  puts your robot's belief next to the truth in its summary. On the perfect floor they agree
  within a centimetre or so.
- `labs(x)` is the size of a `long`, without its sign (Python's `abs`): a wheel turning backwards
  in a turn counts its ticks as negative. `HALF_PI` is π/2, Arduino's name for it, and
  `RAD_TO_DEG` is 180/π.
- `move` starts at −1, and `startMove()` adds 1 first, so every move, the first included, goes
  through the same code.
- The square is now better than Step 2's but still 15 cm off, and the straight run curves badly,
  because one motor is weaker: the same power doesn't give the same speed. Step 8 fixes that.
- **From here, Stop 4's office-route check changes** (the note at the top): with the fixes, it
  drives with the switch on and only warns if the robot doesn't reach G; without them, it drives
  on a perfect floor, where these ticks now hit a wall, and goes red.

### Step 8 · Hold the speed, and hold the wheels level

**Do:** in `main.cpp`, add these numbers under `const int BASE = 170;`:

```cpp
const long TARGET = 9;                // the speed to hold: ticks per 50 ms, about 31 cm/s
const long KP = 20;                   // power per tick of speed error
const long LEVEL = 0;                 // power per tick one wheel is ahead of the other (from 8b)
const unsigned long CONTROL_MS = 50;  // correct the power every 50 ms
```

these variables under `unsigned long lastPose = 0;`:

```cpp
unsigned long lastControl = 0;
long windowLeft = 0;          // both tick counts at the start of this 50 ms window
long windowRight = 0;
```

these two lines at the end of `startCounting()`:

```cpp
  windowLeft = startLeft;
  windowRight = startRight;
```

and, in `case State::DRIVING:`, a third branch after the `inTheWay` one (before `break;`):

```cpp
      } else if (now - lastControl >= CONTROL_MS) {
        lastControl = now;
        long l = leftTicks();
        long r = rightTicks();
        long measuredLeft = l - windowLeft;    // each wheel's ticks in the last 50 ms
        long measuredRight = r - windowRight;
        windowLeft = l;
        windowRight = r;
        long ahead = (l - startLeft) - (r - startRight);  // how far the left wheel is ahead this tile
        int powerLeft = constrain(BASE + KP * (TARGET - measuredLeft) - LEVEL * ahead, 0, 255);
        int powerRight = constrain(BASE + KP * (TARGET - measuredRight) + LEVEL * ahead, 0, 255);
        drive(powerLeft, powerRight);
      }
```

**8a.** With `LEVEL = 0`, run the straight test on seeds 1, 2 and 3
(`node tools/courier/cli.mjs run firmware --real-world 1 --straight 10`, then `2`, then `3`).
**You'll see** the `truth now` heading come out 102.8°, 69.1° and 76.1°: still 13–21° off east,
better than 36°.

**8b.** Set `LEVEL = 8` and run the three seeds again. **You'll see** 94.4°, 82.1° and 88.9°: within
8° of east.

**Why:**
- A **P-controller** (P for *proportional*) corrects in proportion to the error. Every 50 ms it
  counts each wheel's ticks in that window (`measuredLeft`), compares them with the speed it wants
  (`TARGET`, 9 ticks), and sets that wheel's power to `BASE + KP × (TARGET − measured)`. A wheel 2
  ticks slow gets 40 more power; a wheel 1 tick fast gets 20 less. `KP` (the **gain**) is how hard
  it pushes.
- `constrain(x, 0, 255)` keeps the power between 0 and 255: Python's `min(max(x, 0), 255)`.
- One controller per wheel isn't enough. A P-controller always leaves a little error, and the
  weaker motor needs more help, so its wheel stays a little behind, and the robot still curves.
  **The second correction compares the wheels with each other:** `ahead` is how many more ticks
  the left wheel has turned this tile than the right. `LEVEL × ahead` comes off the left wheel's
  power and goes onto the right's, so whichever wheel gets ahead gives a little back.
- The battery drains too slowly to see in one 30-second run. Across runs that start on different
  batteries, the controller is what keeps the speed the same.

### Step 9 · Calibrate the turn and the tile

**Calibration** means measuring what the robot really does, and setting its numbers to match. On a
real robot you'd use a tape measure (the optional Stop 24). The simulator can tell you the truth.

**The turn. Do:** run the square on seeds 1, 2 and 3:

```
node tools/courier/cli.mjs run firmware --real-world 1 --square
node tools/courier/cli.mjs run firmware --real-world 2 --square
node tools/courier/cli.mjs run firmware --real-world 3 --square
```

**You'll see** `ended 22.5 cm`, `18.9 cm` and `19.6 cm from where it started`, each facing 34–40°
left of north: the turns are short. Raise `TICKS_PER_TURN` a few ticks at a time and run the
three again, until all three end under 5 cm. The expert's runs:

| `TICKS_PER_TURN` | seed 1 | seed 2 | seed 3 |
| --- | --- | --- | --- |
| 50 | 22.5 cm | 18.9 cm | 19.6 cm |
| 58 | 3.3 cm | 3.2 cm | 4.3 cm |
| 59 | 1.2 cm | 2 cm | 0.9 cm |
| 60 | 1.9 cm | 2.8 cm | 0.7 cm |
| 62 | 3.6 cm | 4.9 cm | 4.8 cm |

The expert picks **59**: the smallest gaps, with room either side (58 to 62 all work).

**The tile. Do:** run the straight test on the three seeds. **You'll see** each `drove` about 313–314
cm, and `0.1655 cm per tick` on seed 1 (0.1659 and 0.1656 on seeds 2 and 3): the simulator's measure of how far a tick really rolls on
this floor (the wheels slip a little, so it's less than the book's 0.1702). Set:
1. `CM_PER_TICK = 0.1655f` (what the simulator measured on seed 1; any of the three works), and
2. `TICKS_PER_TILE = 181` (30 / 0.1655, rounded).

Run the straight test again. **You'll see** about **321 cm**, not 300: 320.8, 321.9 and 321.4 cm.
The motors stop at the count, but the wheels roll on about 2 cm after every stop, ten times. Take
that roll-on off the count: (321 − 300) / 10 tiles / 0.1655 cm per tick ≈ 13 ticks, so:

3. `TICKS_PER_TILE = 168`.

Run it once more. **You'll see** `drove 299.7 cm`, `300.4 cm` and `299.7 cm`.

**Why:** the number you set is where the **motors stop**, not where the wheels end: the turn and the
tile both stop the motors early on purpose, because the wheels roll on. Three seeds, not one, so
numbers tuned to one lucky run don't fool you: CI uses the same three. Commit:

```
git add firmware/src/main.cpp
git commit -m "Hold the wheels' speed, and calibrate the turn and the tile"
```

### Step 10 · Break it on purpose

**Do:** set `KP = 200` (ten times more) and run the straight test on the three seeds.

**You'll see** the `truth now` heading come out 77.9°, 76.7° and 82.2°: 8–13° off, worse than with
`KP = 20`, although the controller "tries harder".

Put `KP = 20` back.

**Why:** too much gain **overcorrects**. A wheel 1 tick slow gets 200 more power, overshoots, and on
the next check gets cut hard, so each wheel's speed swings above and below the target every 50 ms.
The swinging wheels don't stay level, so the line gets worse, which is what the heading shows. It's the most common controller bug, and now you'll recognise it.

### Step 11 · Show the belief, and calibrate the wheelbase

**Do:** run the square on the three seeds again, and read the `belief` line under each result.

**You'll see,** on seed 1:

```
  square test (ESWN): ended 3 cm from where it started, facing 5.5° left of north
  belief (last pose line, 29.51 s): e=8.7 n=6.2 h=23.3 · truth now: e=-2.4 n=-1.8 h=354.5 · 13.7 cm apart
```

The robot closed the square, but it *believes* it ended 9 cm east and 6 cm north, facing 23° right
of north: 10–14 cm away from the truth on all three seeds. Its belief turned too far at every
corner. Raise `WHEELBASE_CM` a little at a time until the belief ends on top of the truth. At
**15.5**:

```
  belief (last pose line, 29.51 s): e=-2.2 n=-1.6 h=354.9 · truth now: e=-2.4 n=-1.8 h=354.5 · 0.3 cm apart
```

and 2.9 cm and 1.1 cm on seeds 2 and 3.

**Why:** the **wheelbase** (the distance between the wheels) is the third number to calibrate. The
book says 14 cm, but on this floor the wheels slip sideways a little in every turn, so the robot
turns less than its ticks say. A larger wheelbase in `step()` makes the belief turn less for the
same ticks, and absorbs it. That's your firmware's belief drawn next to the truth: when they drift
apart, you can see it, and you know which number to fix.

(The straight run's belief stays further off, 1–8 cm: a small heading error grows over 3 metres.
That's fine for this stop.)

### Step 12 · Try the office route, and be honest about it

**Do:** run the office route with the switch on, on the three seeds:

```
npm run sim -- --real-world 1
npm run sim -- --real-world 2
npm run sim -- --real-world 3
```

**You'll see:** `✗ Your robot hit a wall after move 9`, `✗ … after move 18`, and on seed 3
`✓ Your robot ended on G (3.6 cm from its centre)`.

**Why:** this is the gap between the simulator's perfect floor and the real world at work, and an
honest result. Measuring its own wheels makes every move far better than Stop 4's, but each small
error stays in the sum: a degree or two of heading left from each turn adds up, and the office's
doors and one-tile corridors leave only 6 cm on each side. The robot still has no way to see where
the walls really are and correct itself. That comes in a later stop. CI doesn't check this run.

✅ **Checkpoint D:** the square ends within 5 cm and the belief within 3 cm of the truth on seeds 1–3,
and the straight run drives 300 ± 6 cm, ending within 12° of east.

---

## Part E · Ship it

### Step 13 · Check, push, pull request, merge

**Do:** run the stop's check:

```
python3 checks/check_stop_05.py
```

**You'll see** the tests (`4 test cases: 4 succeeded`), then (after about a minute):

```
Note: Steady speed isn't checked yet: its limit is being re-measured with Stop 4's sensor code in.
✓ Stop 5: your firmware builds and your odometry tests pass. With the real-world switch on, seeds 1–3: the square ends within 5 cm and the square's pose is honest, loop() keeps looking, and 10 tiles come out 300 ± 6 cm and straight.
```

(In an older copy, you'll see `Warning:` lines about the office route instead, such as `Pip
believed it was 218 cm east … but it was 45 cm away`. That's Step 12's honest result: the office
route isn't part of this stop. The last line is then `✓ Stop 5: your firmware builds, your
odometry tests pass, and the square ends within 5 cm on seeds 1–3.`)

Commit (if anything changed since Step 9), push, and open the pull request as in Stop 1 (Steps
13–16):

```
git add firmware
git commit -m "Calibrate the wheelbase"
git push -u origin stop-05-know-where-you-are
```

Explain-back, for example: *"The robot counts wheel ticks with interrupts, adds them up into a pose,
ends turns and tiles by ticks, and holds its speed with a P-controller; I calibrated ticks per turn,
ticks per tile and the wheelbase against the real-world switch."*

**You'll see** on the PR: `stop-05 · know where you are` green; `stop-01` and `stop-02` green;
`stop-06`, `stop-17` and `stop-18` saying their stops haven't started. `stop-03` is green, with a
note that the office drive hit a wall (Step 12). `stop-04` is green: with the switch on, it tests
the box on the straight test drive, and two `Warning: Still delivers …` lines say the office route
hit a wall on seeds 1 and 2 (Step 12 again). In an older copy, `stop-03` and `stop-04` are red: see
the note at the top.

Merge, delete the branch, and bring `main` into your Codespace (`git switch main`, `git pull`).

✅ **Checkpoint E:** your Stop 5 PR is merged with `stop-05` green.

---

## The whole files

`firmware/src/main.cpp` at the end of the stop:

```cpp
// firmware/src/main.cpp — your robot's firmware (Stops 3, 4 and 5).
//
// Build it and drive it in the simulator:   npm run sim
// The real-world switch on:                 npm run sim -- --real-world
// The test drives, --square and --straight 10: see stops/05/WALKTHROUGH.md, Step 2

#include <Arduino.h>
#include <courier.h>
#include <courier_pins.h>
#include <odometry.h>

#include "encoders.h"
#include "motors.h"
#include "sensors.h"

// The robot's numbers, calibrated with the real-world switch on (Steps 9 and 11).
const long TICKS_PER_TURN = 59;     // where the motors stop for a 90° turn
const long TICKS_PER_TILE = 168;    // where the motors stop for one 30 cm tile (they coast on ~2 cm)
const float CM_PER_TICK = 0.1655f;  // how far one tick rolls a wheel on this floor
const float WHEELBASE_CM = 15.5f;   // the distance between the wheels, as the floor turns them

const int TURN_POWER = 170;
const int BASE = 170;                 // the power both wheels drive with
const long TARGET = 9;                // the speed to hold: ticks per 50 ms, about 31 cm/s
const long KP = 20;                   // power per tick of speed error
const long LEVEL = 8;                 // power per tick one wheel is ahead of the other
const unsigned long CONTROL_MS = 50;  // correct the power every 50 ms
const unsigned long SETTLE_MS = 300;  // the pause after every stop, while the wheels coast
const unsigned long READ_MS = 60;     // read the sensor every 60 ms
const unsigned long POSE_MS = 500;    // print the pose every 500 ms
const int STOP_CM = 20;               // stop when something in the way is closer than this
const int GO_CM = 30;                 // go again only when it's further than this

// The route your planner prints for maps/office.txt:  python3 planner/plan.py maps/office.txt
const char* ROUTE = "EEEESSSEEEEEEEEEEESSS";
const char* route = ROUTE;  // what the robot drives: ROUTE, or a test drive the simulator asks for

enum class State { IDLE, TURNING, DRIVING, BLOCKED, SETTLING, DONE };
State state = State::IDLE;

int dir = 1;                  // which way the route faces: 0 = N, 1 = E, 2 = S, 3 = W
int move = -1;                // which move of the route the robot is on (none yet)
long startLeft = 0;           // both tick counts when this turn or tile began
long startRight = 0;
long goalTicks = 0;           // how many ticks this turn or tile takes
long ticksLeft = 0;           // how many ticks of the tile were left when the robot stopped
bool driveAfterSettling = false;  // after the pause: drive a tile (true) or start the next move
unsigned long settleStart = 0;
unsigned long lastRead = 0;
int distance = 400;           // the latest averaged reading, in cm
unsigned long lastBlink = 0;
bool ledOn = false;
Pose pose = {0, 0, HALF_PI};  // where the robot believes it is: on S, facing east (pi/2)
long seenLeft = 0;            // the ticks the pose has already counted
long seenRight = 0;
unsigned long lastPose = 0;
unsigned long lastControl = 0;
long windowLeft = 0;          // both tick counts at the start of this 50 ms window
long windowRight = 0;

// N, E, S, W -> 0, 1, 2, 3
int headingOf(char m) {
  if (m == 'N') return 0;
  if (m == 'E') return 1;
  if (m == 'S') return 2;
  return 3;  // 'W'
}

void setLed(bool on) {
  ledOn = on;
  digitalWrite(LED_PIN, on ? HIGH : LOW);
}

// Remember both tick counts: this turn or tile counts from here.
void startCounting() {
  startLeft = leftTicks();
  startRight = rightTicks();
  windowLeft = startLeft;
  windowRight = startRight;
}

// How many ticks the wheels have turned since startCounting(): the average of the two.
long ticksDone() {
  return (labs(leftTicks() - startLeft) + labs(rightTicks() - startRight)) / 2;
}

// How many cm of this tile are still to drive.
int cmLeft() {
  long left = state == State::BLOCKED ? ticksLeft : goalTicks - ticksDone();
  if (left < 0) left = 0;
  return left * CM_PER_TICK;
}

// Something is in the way if it's closer than `limit` and nearer than where this tile ends.
bool inTheWay(int cm, int limit) {
  return cm < limit && cm < cmLeft();
}

// Add the ticks since last time to the pose.
void updatePose() {
  long l = leftTicks();
  long r = rightTicks();
  pose = step(pose, l - seenLeft, r - seenRight, CM_PER_TICK, WHEELBASE_CM);
  seenLeft = l;
  seenRight = r;
}

// Print the pose as cm east, cm north and compass degrees, for the simulator's summary.
void printPose() {
  float degrees = pose.heading * RAD_TO_DEG;
  while (degrees < 0) degrees += 360;
  while (degrees >= 360) degrees -= 360;
  Serial.print("pose e=");
  Serial.print(pose.east, 1);
  Serial.print(" n=");
  Serial.print(pose.north, 1);
  Serial.print(" h=");
  Serial.println(degrees, 1);
}

// Stop, and pause for SETTLE_MS before driving a tile or starting the next move.
void settle(bool thenDrive) {
  stopMotors();
  driveAfterSettling = thenDrive;
  settleStart = millis();
  state = State::SETTLING;
}

// Drive one tile.
void startTile() {
  startCounting();
  goalTicks = TICKS_PER_TILE;
  emptyWindow();    // those readings faced somewhere else
  distance = 400;   // the last reading faced somewhere else
  drive(BASE, BASE);
  state = State::DRIVING;
  setLed(true);
  Serial.print(route[move]);
  Serial.print(' ');
}

// Start the next move: turn to face it, or drive it straight away, or finish.
void startMove() {
  move++;
  if (route[move] == '\0') {
    state = State::DONE;
    setLed(false);
    updatePose();
    printPose();
    Serial.println("DONE");
    return;
  }
  int target = headingOf(route[move]);
  int quarterTurns = (target - dir + 4) % 4;
  dir = target;
  if (quarterTurns == 0) {
    startTile();
    return;
  }
  startCounting();
  goalTicks = quarterTurns == 2 ? 2 * TICKS_PER_TURN : TICKS_PER_TURN;
  if (quarterTurns == 3) drive(-TURN_POWER, TURN_POWER);  // one turn left
  else drive(TURN_POWER, -TURN_POWER);                    // right, or right twice
  state = State::TURNING;
  setLed(true);
}

void setup() {
  Serial.begin(115200);
  Serial.println("Courier ready");
  pinMode(LED_PIN, OUTPUT);
  startEncoders();

  // The simulator's test drives (--square, --straight 10) ask for their own route.
  const char *asked = courier::route(); if (asked) route = asked;

  startMove();
}

void loop() {
  unsigned long now = millis();
  if (now - lastRead >= READ_MS) {
    lastRead = now;
    distance = readDistance();
  }
  if (now - lastPose >= POSE_MS) {
    lastPose = now;
    updatePose();
    printPose();
  }

  switch (state) {
    case State::TURNING:
      if (ticksDone() >= goalTicks) settle(true);
      break;

    case State::DRIVING:
      if (ticksDone() >= goalTicks) {
        settle(false);
      } else if (inTheWay(distance, STOP_CM)) {
        stopMotors();
        ticksLeft = goalTicks - ticksDone();
        state = State::BLOCKED;
        Serial.print("BLOCKED ");
        Serial.println(distance);
      } else if (now - lastControl >= CONTROL_MS) {
        lastControl = now;
        long l = leftTicks();
        long r = rightTicks();
        long measuredLeft = l - windowLeft;    // each wheel's ticks in the last 50 ms
        long measuredRight = r - windowRight;
        windowLeft = l;
        windowRight = r;
        long ahead = (l - startLeft) - (r - startRight);  // how far the left wheel is ahead this tile
        int powerLeft = constrain(BASE + KP * (TARGET - measuredLeft) - LEVEL * ahead, 0, 255);
        int powerRight = constrain(BASE + KP * (TARGET - measuredRight) + LEVEL * ahead, 0, 255);
        drive(powerLeft, powerRight);
      }
      break;

    case State::BLOCKED:
      if (now - lastBlink >= 250) {
        lastBlink = now;
        setLed(!ledOn);
      }
      if (!inTheWay(distance, GO_CM)) {
        startCounting();          // carry on with what was left of the tile
        goalTicks = ticksLeft;
        drive(BASE, BASE);
        state = State::DRIVING;
        setLed(true);
        Serial.print("GO ");
        Serial.println(distance);
      }
      break;

    case State::SETTLING:
      if (now - settleStart >= SETTLE_MS) {
        if (driveAfterSettling) startTile();
        else startMove();
      }
      break;

    case State::IDLE:
    case State::DONE:
      break;
  }
}
```

`encoders.h`, `encoders.cpp` and `motors.cpp` are as in Step 3, `odometry.cpp` as in Step 6, and
`sensors.h`, `sensors.cpp` and `motors.h` are unchanged from Stop 4.

## Now you: do it

In **your** repo, make the same change: a branch, the encoders, `step()` and its four tests, ticks in
the state machine, the controller, your own calibrated numbers, a PR with `stop-05` green, merge.
Your numbers are yours: measure them on seeds 1–3 as in Steps 9 and 11.

**Make it yours (optional):** add the *I* of a PI controller: keep a running sum of each wheel's
speed error and add a small multiple of it to the power. Show in the PR what it does to the
straight run.

## Words you met, and where

| Word | Explained in |
| --- | --- |
| real-world switch, `--real-world`, slip, weaker motor, battery sag, seed | Step 1 |
| test drive, square, straight run, `courier::route()`, `nullptr` | Step 2 |
| encoder, tick, interrupt, interrupt handler, `attachInterrupt`, `RISING`, `INPUT`, `long`, `volatile`, `IRAM_ATTR`, `noInterrupts()` | Step 3 |
| odometry, pose, radians, heading (0 = north) | Part C |
| host-side tests, `pio test -e native -d firmware`, Unity, `TEST_ASSERT_FLOAT_WITHIN` | Step 5 |
| `step()`, `sin`, `cos`, `struct`, `float`, library (`firmware/lib/`) | Step 6 |
| closed loop, `TICKS_PER_TURN`, `TICKS_PER_TILE`, `SETTLING`, `pose e=… n=… h=…`, belief, truth | Step 7 |
| P-controller, gain (`KP`), `constrain`, holding the wheels level (`LEVEL`) | Step 8 |
| calibration, `CM_PER_TICK`, roll-on | Step 9 |
| overcorrecting | Step 10 |
| wheelbase | Step 11 |
