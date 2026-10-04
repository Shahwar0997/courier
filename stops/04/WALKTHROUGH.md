# Stop 4 · Sense and react: firmware that keeps looking — walkthrough

In this walkthrough you watch an expert give the robot a sense of what's ahead. By the end, the
firmware reads the **distance sensor** while it drives, never stops looking (no more `delay`),
stops for a box in the corridor and carries on when it's gone, and copes with a noisy sensor. Along
the way it grows from one file into five.

**Time:** about 3–4 hours. **You need:** Stops 1–3 merged. This stop starts from your Stop 3
firmware, the one that drives the office route with `delay`.

**How to read it:** the same as before. Each step says what to **Do**, what **You'll see** and
**Why**, in five parts, each ending in a ✅ checkpoint. New C++ is explained next to the Python you
know, the first time it appears. The finished files are at the end.

> **From this stop on, build and run with `npm run sim` only.** Step 2 adds the simulator's own
> library, `courier.h`, which Stop 3's other command, `pio run -e sim`, can't find. So after Step
> 2, `pio run -e sim -d firmware` stops with `fatal error: 'courier.h' file not found`. That's
> expected, and `npm run sim` builds the same code fine.
>
> **CI's `stop-03` job, from this stop on.** CI keeps checking Stop 3 on every push. From Stop 4
> on, `stop-03` builds your firmware with the simulator's compiler (the one `npm run sim` uses) and
> stays green, saying `✓ Stop 3: your firmware says hello, turns its LED on, and its ROUTE matches
> your planner.`
>
> **If your copy of the repo is older than these walkthroughs,** `stop-03` goes red (✗) once your PR
> includes Step 2, at its first step, with the same `courier.h` message. Your Stop 3 work is fine,
> and you can merge with `stop-03` red: this is the one exception to Stop 1's "merge when every
> check is green", and it's our bug, not yours. What counts for this stop is a green
> **`stop-04 · sense and react`**.

---

## Part A · See the problem, and look at the data

### Step 1 · A fresh branch, and a box in the corridor

**Do:** open your Codespace (Stop 1, Step 3f) and start from the latest `main`, on a new branch:

```
git switch main
git pull
git switch -c stop-04-sense-and-react
```

Then run your Stop 3 firmware with a box in the corridor, outside room 1's door:

```
npm run sim -- --box 4,8
```

**You'll see:** the moves as in Stop 3, then:

```
✗ Your robot hit a box after move 10 (at row 4, column 8)
  robot time 30.1 s · LED toggled 63 times · 15 bumps
  box at row 4, column 8
  longest loop() gap 1000 ms (from 19.61 s)
```

**Why:**
- `--` after `npm run sim` means "the rest is for the simulator, not for npm". `--box 4,8` puts a
  20 × 20 cm box on the tile at row 4, column 8 (counted from 0 at the top-left, like your planner
  counts). The route crosses that tile on move 10.
- Your route was right; then someone left a box in the corridor. The robot drove straight into it,
  because `forwardOneTile()` waits in `delay(TILE_MS)`: while the chip waits, it reads nothing.
  Code that waits and does nothing else is called **blocking**.
- `longest loop() gap 1000 ms` is how long `loop()` once took to come back: the blink's two
  `delay(500)`s. This stop's check wants it under 50 ms. Keep an eye on that line.

### Step 2 · Let the `courier` library drive the motors

**Do:** in `main.cpp`, add one line under `#include <Arduino.h>`:

```cpp
#include <courier.h>
```

Delete the whole `setWheel` function, and change `drive` to:

```cpp
// Both wheels: everything that moves the robot goes through here.
void drive(int left, int right) {
  courier::motors(left, right);
}
```

You can also delete the four `pinMode(LEFT_FWD …)` … `pinMode(RIGHT_REV …)` lines in `setup()`:
the library sets up the motor pins itself. Run it: `npm run sim`

**You'll see:** the same drive as in Stop 3: all 21 moves, `Arrived`, and
`✓ Your robot ended on G (2 cm from its centre)`.

**Why:**
- A **library** is code someone else wrote that your program includes. `courier.h` comes with
  the simulator. The same calls work on the real robot at the optional Stop 24, where the motors
  sit behind a different chip, so your code doesn't change.
- `courier::motors(left, right)` takes the same −255 to 255 speeds as your `drive`. The `::` says
  `motors` belongs to `courier`: a **namespace**, a name that groups a library's functions so they
  can't clash with yours (yours is `drive`; the library's is `courier::motors`). It's like
  `math.sqrt` in Python.
- Your Stop 3 `setWheel` taught you what's underneath: two inputs per motor and PWM. Now the
  library does that part.
- This is the step that makes `pio run -e sim` stop working (the note at the top). From now on,
  `npm run sim` is your build and run command.

### Step 3 · Look at the sensor

**Do:** print the distance sensor's reading in `loop()`. Add three lines at the end of `loop()`,
after the blink:

```cpp
  Serial.print("distance ");
  Serial.println(courier::distanceCm());
  delay(200);
```

Run it: `npm run sim`

**You'll see:** the route as before, then, only after `Arrived`:

```
   19.61 s  Arrived
   20.61 s  distance 5
   21.81 s  distance 5
   23.02 s  distance 5
   24.22 s  distance 4
   …
```

**Why:**
- The robot's **distance sensor** is **ultrasonic**: it sends a click of sound, too high for people
  to hear, and times the echo. Sound covers about 343 metres a second, so an echo after 1.2
  milliseconds means something is 20 cm away (20 cm there and 20 cm back).
- `courier::distanceCm()` returns that distance in whole centimetres, from 2 to 400. It returns
  **−1 when no echo comes back**: nothing within 4 m, or something soft or at an angle. A reading
  takes as long as the echo: about 1 ms for something close, and 25 ms when nothing answers.
- Look at *when* the readings start: **only after `Arrived`**. The whole route runs inside
  `setup()`, and `loop()` doesn't start until `setup()` is done (Stop 3, Step 9). So the robot
  only looks once it has stopped on G, facing the wall 5 cm ahead. For the whole drive, it was
  blind. That's the problem this stop fixes.
- Always look at the raw data before you trust it, and see what "normal" looks like.

### Step 4 · Blink without `delay`

**Do:** replace all of `loop()`, and add three lines above `setup()` (under `int heading = 1;`):

```cpp
unsigned long lastBlink = 0;  // when the LED last changed
unsigned long lastPrint = 0;  // when the distance was last printed
bool ledOn = false;
```

```cpp
void loop() {
  unsigned long now = millis();
  if (now - lastBlink >= 500) {
    lastBlink = now;
    ledOn = !ledOn;
    digitalWrite(LED_PIN, ledOn ? HIGH : LOW);
  }
  if (now - lastPrint >= 200) {
    lastPrint = now;
    Serial.print("distance ");
    Serial.println(courier::distanceCm());
  }
}
```

Run it: `npm run sim`

**You'll see:** after `Arrived`, a `distance` line every 0.2 s, and at the end:

```
✓ Your robot ended on G (2 cm from its centre)
  robot time 30.0 s · LED toggled 63 times · 0 bumps
  longest loop() gap 1.5 ms (from 19.61 s)
```

The `loop()` gap went from 1000 ms to under 2.

**Why:**
- **`millis()`** returns how many milliseconds have passed since power-on. Instead of sleeping
  for 500 ms, `loop()` now asks: *has 500 ms passed since the LED last changed?* If not, it moves
  on and returns, and `loop()` runs again straight away, many times a second. This is
  **non-blocking** code: check the clock, do what's due, and keep going.
- Each job keeps its own "last time" (`lastBlink`, `lastPrint`), so the two run side by side at
  their own pace. You'll use this pattern for everything from here on.
- `millis()` returns an **`unsigned long`**: a whole number that's never negative and goes up to
  about 4.29 billion, which is 49.7 days of milliseconds. Then it wraps back to 0. Writing
  `now - lastBlink` (not `now >= lastBlink + 500`) keeps working even across that wrap, because
  unsigned subtraction wraps the same way.
- `ledOn = !ledOn` flips a `bool` (C++'s `True`/`False` type, written `true`/`false`). `ledOn ?
  HIGH : LOW` is C++'s `HIGH if ledOn else LOW`.
- The route still uses `delay` inside `forwardOneTile()` and the turns, so the drive is still
  blind. Part C fixes that.

✅ **Checkpoint A:** `npm run sim` ends on G, prints `distance` lines after `Arrived`, and says
`longest loop() gap` under 2 ms.

---

## Part B · Split the firmware into files

### Step 5 · `motors` and `sensors` files

**Do:** in the Explorer, right-click `firmware/src` → **New File…**, and make four files. First
`motors.h`:

```cpp
// firmware/src/motors.h — what the motor code offers (Stop 4).
#pragma once

void drive(int left, int right);
void stopMotors();
```

Then `motors.cpp`. **Move** `drive` and `stopMotors` here from `main.cpp` (cut them there, paste
them here):

```cpp
// firmware/src/motors.cpp — how the motors are driven (Stop 4).
#include <courier.h>

#include "motors.h"

// Both wheels: everything that moves the robot goes through here.
void drive(int left, int right) {
  courier::motors(left, right);
}

void stopMotors() {
  drive(0, 0);
}
```

Then `sensors.h`:

```cpp
// firmware/src/sensors.h — what the sensor code offers (Stop 4).
#pragma once

int readDistance();
```

and `sensors.cpp`:

```cpp
// firmware/src/sensors.cpp — reading the distance sensor (Stop 4).
#include <courier.h>

#include "sensors.h"

int readDistance() {
  return courier::distanceCm();
}
```

In `main.cpp`, under `#include <courier_pins.h>`, add:

```cpp
#include "motors.h"
#include "sensors.h"
```

and in `loop()`, print `readDistance()` instead of `courier::distanceCm()`. Run `npm run sim`:
the same as Step 4. Then run this stop's check:

```
python3 checks/check_stop_04.py
```

**You'll see:** the firmware builds, and the check now runs, because the files exist. It fails,
which is expected halfway through a stop:

```
Warning: Resumes the tile (`npm run sim -- --box 4,8.31@8.67-11.67`): Pip touched the box at 9.3 s. After the box, does Pip drive only the rest of the tile (msLeft)? (Not failing yet.)
✗ Stops for the box (`npm run sim -- --box 4,8@0-12`): Pip touched the box at 9.0 s
✗ Steady under noise (`npm run sim -- --box 4,8@0-12 --noise sensor --seed 1`): Pip touched the box at 9.0 s
✗ Steady under noise (`npm run sim -- --box 4,8@0-12 --noise sensor --seed 2`): Pip touched the box at 9.0 s
✗ Steady under noise (`npm run sim -- --box 4,8@0-12 --noise sensor --seed 3`): Pip touched the box at 9.0 s
```

(Every line is about the box, which Part D handles. `msLeft` is a name from Step 8. The checks
call your robot "Pip", the expert's robot. A **Warning** doesn't fail the check; a ✗ does.) Commit this working step:

```
git add firmware/src
git commit -m "Split the firmware into motors, sensors and main"
```

`git add firmware/src` adds every changed or new file in that folder.

**Why:**
- A **header file** (`.h`) says *what* exists: just the first line of each function, ending in
  `;`. That's a **declaration**. The **source file** (`.cpp`) says *how*: the full function, the
  **definition**. Any file that includes the header can call the functions, and the build joins
  the files together.
- This answers Stop 3's "define before use": the header *declares* `drive` at the top of
  `main.cpp`, so `main.cpp` can call it although its definition is in another file.
- `#pragma once` at the top of a header means "include this file only once", even if two files
  include it.
- `#include "motors.h"` with **quotes** means "my file, next to this one". `#include <courier.h>`
  with **angle brackets** means "a library".
- Why split at all? `main.cpp` is about to grow a lot. Small files with one job each are easier to
  read, and when something breaks, the file name already tells you where to look.

**Stuck?** *`use of undeclared identifier 'drive'`* (or `readDistance`): the file calling it is
missing its `#include "motors.h"` (or `"sensors.h"`). *`duplicate symbol: stopMotors()`*: it's
still defined in `main.cpp` too. Delete the copy in `main.cpp`.

✅ **Checkpoint B:** `firmware/src/` has `main.cpp`, `motors.h`, `motors.cpp`, `sensors.h` and
`sensors.cpp`, and `npm run sim` ends on G.

---

## Part C · A state machine: drive without `delay`

### Step 6 · Name the states

To drive without `delay`, `loop()` has to remember *what the robot is doing* between passes:
turning, driving, waiting for a box. A **state machine** is a program that is always in exactly
one **state**, with a rule for each way to move to another (a **transition**):

```
IDLE → TURNING → DRIVING → TURNING (next move) → … → DONE (no moves left)
                 DRIVING → BLOCKED (something in the way) → DRIVING (the way is clear)
```

**Do:** in `main.cpp`, under `ROUTE`, add:

```cpp
enum class State { IDLE, TURNING, DRIVING, BLOCKED, DONE };
State state = State::IDLE;
```

**Why:** an **`enum class`** is a type with a fixed list of named values. `State::DRIVING` is one
of them. The compiler rejects a typo like `State::DRIVNG`, where a string `"DRIVNG"` would slip
through and never match.

### Step 7 · The machine

This step rewrites `main.cpp`'s functions, so here is the whole file after it. **Do:** make
`main.cpp` say this. Keep your comments at the top and the `// From Stop 5:` comment at the end of
`setup()` (shown here as `…`):

```cpp
#include <Arduino.h>
#include <courier.h>
#include <courier_pins.h>

#include "motors.h"
#include "sensors.h"

const int SPEED = 180;
const unsigned long TILE_MS = 885;
const unsigned long TURN_MS = 324;

// The route your planner prints for maps/office.txt:  python3 planner/plan.py maps/office.txt
const char* ROUTE = "EEEESSSEEEEEEEEEEESSS";

enum class State { IDLE, TURNING, DRIVING, BLOCKED, DONE };
State state = State::IDLE;

int dir = 1;                  // which way the route faces: 0 = N, 1 = E, 2 = S, 3 = W
int move = 0;                 // which move of the route the robot is on
unsigned long stepStart = 0;  // when this turn or tile began
unsigned long turnMs = 0;     // how long this turn takes

// N, E, S, W -> 0, 1, 2, 3
int headingOf(char m) {
  if (m == 'N') return 0;
  if (m == 'E') return 1;
  if (m == 'S') return 2;
  return 3;  // 'W'
}

// Start the next move: turn to face it (or finish).
void startMove() {
  if (ROUTE[move] == '\0') {
    stopMotors();
    state = State::DONE;
    Serial.println("DONE");
    return;
  }
  int target = headingOf(ROUTE[move]);
  int quarterTurns = (target - dir + 4) % 4;
  dir = target;
  if (quarterTurns == 0) turnMs = 0;
  else if (quarterTurns == 2) turnMs = 2 * TURN_MS;
  else turnMs = TURN_MS;
  if (quarterTurns == 3) drive(-SPEED, SPEED);       // one turn left
  else if (quarterTurns != 0) drive(SPEED, -SPEED);  // right, or right twice
  stepStart = millis();
  state = State::TURNING;
}

void setup() {
  Serial.begin(115200);
  Serial.println("Courier ready");
  pinMode(LED_PIN, OUTPUT);
  startMove();
  // …
}

void loop() {
  unsigned long now = millis();

  switch (state) {
    case State::TURNING:
      if (now - stepStart >= turnMs) {
        drive(SPEED, SPEED);
        stepStart = now;
        state = State::DRIVING;
        Serial.print(ROUTE[move]);
        Serial.print(' ');
      }
      break;

    case State::DRIVING:
      if (now - stepStart >= TILE_MS) {
        stopMotors();
        move++;
        startMove();
      }
      break;

    case State::IDLE:
    case State::BLOCKED:
    case State::DONE:
      break;
  }
}
```

`forwardOneTile`, `turnRight`, `turnLeft`, `turnBy`, `followRoute`, `heading` and Step 4's blink
and print are gone. Run it: `npm run sim`

**You'll see:**

```
Serial monitor:
    0.00 s  Courier ready
   19.56 s  E E E E S S S E E E E E E E E E E E S S S DONE
✓ Your robot ended on G (2 cm from its centre)
  robot time 30.0 s · LED toggled 0 times · 0 bumps
  longest loop() gap 0.5 ms (from 19.56 s)
```

The same route, but now `loop()` never takes more than half a millisecond.

**Why:**
- `startMove()` begins a move: it works out the turn (Stop 3's `(target − dir + 4) % 4`), starts
  the wheels turning, notes the time, and sets the state to `TURNING`. A move with no turn gets
  `turnMs = 0`, so it goes straight to driving on the next pass.
- **`switch (state)`** picks the block for the current state, like a chain of `if … elif`. Each
  **`case State::…:`** is one state's block, and **`break`** ends it. The three states that do
  nothing yet share one `break`.
- Each pass of `loop()` is a quick look and a small decision. In `TURNING`: has the turn's time
  passed? Then start driving. In `DRIVING`: has a tile's time passed? Then start the next move. No
  pass ever waits.
- `move++` adds 1 to `move`. `dir` is Stop 3's `heading` (0–3) with a new name: Stop 5 needs the
  word "heading" for something else.
- The simulator prints each serial line with the time it *ended*, which is why the letters, one
  per move, appear together on one line at 19.56 s: they're printed with `Serial.print` (no new
  line) until `DONE` ends the line.
- `TILE_MS` and `TURN_MS` are now `unsigned long`, the same type as `millis()`, so the clock sums
  compare like with like.

**Commit this working step:**

```
git add firmware/src/main.cpp
git commit -m "Drive the route with a state machine instead of delay"
```

✅ **Checkpoint C:** `npm run sim` ends on G with `longest loop() gap` under 1 ms.

---

## Part D · Stop for the box

### Step 8 · Stop for the box, and carry on

**Do:** in `main.cpp`, add these numbers under `TURN_MS`:

```cpp
const unsigned long READ_MS = 60;  // read the sensor every 60 ms
const int STOP_CM = 20;            // stop when something in the way is closer than this
const int GO_CM = 30;              // go again only when it's further than this
```

these variables under `turnMs`:

```cpp
unsigned long msLeft = 0;     // how much of the tile was left when the robot stopped
unsigned long lastRead = 0;
int distance = 400;           // the latest reading, in cm
```

and these two functions under `headingOf`:

```cpp
// How many cm of this tile are still to drive.
int cmLeft() {
  if (state == State::BLOCKED) return 30 * msLeft / TILE_MS;
  unsigned long driven = millis() - stepStart;
  if (driven > TILE_MS) driven = TILE_MS;
  return 30 * (TILE_MS - driven) / TILE_MS;
}

// Something is in the way if it's closer than `limit` and nearer than where this tile ends
// (for the go line, GO_CM, both lines move 10 cm further out).
bool inTheWay(int cm, int limit) {
  return cm < limit && cm < cmLeft() + (limit - STOP_CM);
}
```

Then change `loop()`. At the top, under `unsigned long now = millis();`, read the sensor on its
own clock:

```cpp
  if (now - lastRead >= READ_MS) {
    lastRead = now;
    distance = readDistance();
  }
```

In `case State::TURNING:`, add one line as the turn hands over to driving, before
`drive(SPEED, SPEED);`:

```cpp
        distance = 400;   // the last reading faced somewhere else
```

Replace `case State::DRIVING:` with this, and add a `case State::BLOCKED:` (take `BLOCKED` out of
the list of states that do nothing):

```cpp
    case State::DRIVING:
      if (now - stepStart >= TILE_MS) {
        stopMotors();
        move++;
        startMove();
      } else if (inTheWay(distance, STOP_CM)) {
        stopMotors();
        msLeft = TILE_MS - (now - stepStart);
        state = State::BLOCKED;
        Serial.print("BLOCKED ");
        Serial.println(distance);
      }
      break;

    case State::BLOCKED:
      if (!inTheWay(distance, GO_CM)) {
        stepStart = now - (TILE_MS - msLeft);  // as if the tile had never paused
        drive(SPEED, SPEED);
        state = State::DRIVING;
        Serial.print("GO ");
        Serial.println(distance);
      }
      break;
```

Run it with a box that's taken away after 12 seconds:

```
npm run sim -- --box 4,8@0-12
```

**You'll see:**

```
Serial monitor:
    0.00 s  Courier ready
    8.64 s  E E E E S S S E E E BLOCKED 12
   12.01 s  GO 109
   22.92 s  E E E E E E E E S S S DONE
✓ Your robot ended on G (1.9 cm from its centre)
  robot time 30.0 s · LED toggled 0 times · 0 bumps
  box at row 4, column 8, from 0 s to 12 s
  longest loop() gap 8 ms (from 16.14 s)
```

The robot stops as move 10 starts, with the sensor reading 12 cm, waits until the box is gone at
12 s, drives on and ends on G. `@0-12` means "from 0 to 12 seconds of robot time".

**Why:**
- **Something is in the way** if it's close (under 20 cm) **and** nearer than where this tile ends.
  The robot stops at each tile's centre, so at the end of moves 4, 7 and 21 its nose is about 5 cm
  from a wall that ends the tile. That wall isn't in the way: the tile ends first. `cmLeft()` works
  out how much of the tile is left from how much of `TILE_MS` is left (30 cm per tile).
- **Dividing whole numbers in C++ gives a whole number:** `/` drops the part after the point (like
  Python's `//` for positive numbers). So `30 * msLeft / TILE_MS` is whole centimetres: multiply
  first, then divide, or `msLeft / TILE_MS` would already be 0.
- **`bool`** is C++'s true/false type, and **`&&`** is Python's `and`, **`!`** is `not`.
- **The machine remembers where it was.** When the robot stops for the box, `msLeft` saves how much
  of the tile was left. When it goes again, `stepStart = now - (TILE_MS - msLeft)` sets the clock
  as if the tile had never paused, so the robot drives only the rest of the tile, not a whole tile
  again.
- **Two lines, not one.** It stops below 20 cm (`STOP_CM`) but goes again only when nothing is in
  the way at 30 cm (`GO_CM`). For the go line, `inTheWay` moves both limits 10 cm further out
  (`limit - STOP_CM`): under 30 cm, and nearer than the tile's end plus 10. That's **hysteresis**:
  two thresholds, so a reading that wobbles around one line can't flip the state back and forth.
  (A **threshold** is the line where the behaviour changes.)
- The sensor is read every 60 ms on its own clock, the Step 4 pattern. At the robot's speed that's
  every 2 cm of driving: plenty. `loop()` still never waits: the longest gap, 8 ms, is one sensor
  reading's echo time.
- **`distance = 400` after a turn:** the last reading was taken facing the wall the robot just
  turned away from. Without this line, the robot reads that old wall reading as "in the way" just
  after turning into an open corridor, and stops for nothing (`BLOCKED 19` right after a turn).
  400 means "nothing seen yet".

**Try it:** in `inTheWay`, change the line to just `return cm < limit;`, and run `npm run sim` (no
box). The robot stops in front of the wall at the end of move 4 and waits forever:

```
    3.24 s  E E E E BLOCKED 19
✓ Your robot stopped 385 cm from G
```

(The ✓ only means it didn't bump into anything. "385 cm from G" is the failure.)

Put it back.

**Commit this working step:**

```
git add firmware/src/main.cpp
git commit -m "Stop for a box in the way, and carry on when it's gone"
```

### Step 9 · Average the noise

Real sensors aren't perfect. Their readings wobble, and now and then no echo comes back. The
simulator can do that too: `--noise sensor` turns on sensor **noise**, the random wobble in a
measurement.

**Do:** run the box again, with noise:

```
npm run sim -- --box 4,8@0-12 --noise sensor
```

**You'll see:** the robot stops for the box, but also stops and starts again and again where
nothing is in the way:

```
    8.64 s  E E E E S S S E E E BLOCKED 11
   12.01 s  GO 109
   12.99 s  E BLOCKED -1
   13.03 s  GO 108
   16.53 s  E E E E BLOCKED -1
   16.57 s  GO 126
   …
```

Each `BLOCKED -1` is a reading with no echo. −1 is less than 20, so the code took it as "very
close".

**Do:** make the sensor average its last 5 readings, and leave the −1s out. Replace `sensors.h`
with:

```cpp
// firmware/src/sensors.h — what the sensor code offers (Stop 4).
#pragma once

int readDistance();   // the average of the last few readings, in cm
void emptyWindow();   // forget the readings so far (after a turn)
```

and `sensors.cpp` with:

```cpp
// firmware/src/sensors.cpp — reading the distance sensor (Stop 4).
#include <courier.h>

#include "sensors.h"

const int WINDOW = 5;  // how many readings to average

int readings[WINDOW];
int count = 0;     // how many readings the window holds (0 to WINDOW)
int oldest = 0;    // where the next reading goes: over the oldest one
long sum = 0;      // the sum of the readings in the window
int average = 400;

int readDistance() {
  int cm = courier::distanceCm();
  if (cm < 0) {
    return average;  // no echo: leave it out, and keep the last average
  }
  if (count == WINDOW) {
    sum -= readings[oldest];  // the window is full: the oldest reading leaves
  } else {
    count++;
  }
  readings[oldest] = cm;
  sum += cm;
  oldest = (oldest + 1) % WINDOW;
  average = sum / count;
  return average;
}

void emptyWindow() {
  count = 0;
  sum = 0;
  oldest = 0;
  average = 400;
}
```

In `main.cpp`, in `case State::TURNING:`, add one line just above `distance = 400;`:

```cpp
        emptyWindow();    // those readings faced somewhere else
```

Run it again, with noise, on three different noise **seeds** (a seed picks which random wobble
you get, so the same seed always gives the same run):

```
npm run sim -- --box 4,8@0-12 --noise sensor
npm run sim -- --box 4,8@0-12 --noise sensor --seed 2
npm run sim -- --box 4,8@0-12 --noise sensor --seed 3
```

**You'll see,** on each seed, one stop for the box and nothing else, for example on seed 1:

```
    8.64 s  E E E E S S S E E E BLOCKED 11
   12.07 s  GO 49
   22.98 s  E E E E E E E E S S S DONE
✓ Your robot ended on G (1.9 cm from its centre)
  robot time 30.0 s · LED toggled 0 times · 0 bumps
  real world: sensor noise on (seed 1) · encoder ticks 3837 / 3798
  box at row 4, column 8, from 0 s to 12 s
  longest loop() gap 25 ms (from 10.02 s)
```

(`GO 49`: once the box is gone, the average climbs, and the robot goes again as soon as it's past
the go line. `encoder ticks` counts the wheels' turns; Stop 5 uses it.)

**Why:**
- A **moving average** averages the last few readings instead of trusting one: the wobble mostly
  cancels out. It's the **sliding window** you may know from algorithm exercises (the best
  average of *k* numbers in a row), now on live data: keep a running `sum`; each new reading adds
  itself and, once the window is full, subtracts the oldest one. No loop over the window.
- `long sum` is a **`long`**: a whole number like `int`. On this chip both hold up to about
  2 billion; `long` just says "a running total". (The sum of five readings of at most 400 is tiny
  either way.)
- `int readings[WINDOW];` is a C++ **array**: a fixed number of values of one type, chosen when you
  write the code. Unlike a Python list, it can't grow. `oldest` goes round and round it with
  `% WINDOW`.
- **A −1 stays out.** In front of a box, "no echo" means a missed echo, not "very close" and not
  "far away". Counted as −1, it drags the average toward "very close" and stops the robot for
  nothing. Counted as 400 ("far"), a single dropout can lift a window of 5 over the go line, and
  the robot drives into the box. Left out, it changes nothing.
- **Empty the window when a turn ends.** The readings in it were taken facing somewhere else: just
  before the turns after moves 4 and 7, that's the wall about 5 cm ahead. Don't empty it when `BLOCKED`
  goes back to `DRIVING`: the robot still faces the same way.
- `longest loop() gap 25 ms`: with noise, some readings get no echo, and a reading with no echo
  takes the sensor's full 25 ms. Still well under 50.

### Step 10 · The LED tells you the state

**Do:** in `main.cpp`, add under `distance`:

```cpp
unsigned long lastBlink = 0;
bool ledOn = false;
```

this function under `headingOf`:

```cpp
void setLed(bool on) {
  ledOn = on;
  digitalWrite(LED_PIN, on ? HIGH : LOW);
}
```

and these lines:
- in `startMove()`: `setLed(false);` just before `Serial.println("DONE");`, and `setLed(true);` as
  its last line (after `state = State::TURNING;`);
- in `case State::BLOCKED:`, at the top, a slow blink, every 500 ms:

  ```cpp
      if (now - lastBlink >= 500) {
        lastBlink = now;
        setLed(!ledOn);
      }
  ```

- in `case State::BLOCKED:`, `setLed(true);` just after `state = State::DRIVING;`.

Run `npm run sim -- --box 4,8@0-12`.

**You'll see:** the same drive, and `LED toggled 10 times`: on while it moves, a slow blink while
it waits for the box, off at the end.

**Why:** steady while turning and driving, blinking while blocked, off when done: you can see what
the firmware thinks from across the room. Every stop after this keeps that LED code. CI's check
also looks for the blink while the robot waits.

### Step 11 · Break it on purpose

**Do:** in `case State::BLOCKED:`, change `stepStart = now - (TILE_MS - msLeft);` to

```cpp
        stepStart = now;
```

so the robot forgets how much of the tile was left. Then run it with a box that's set down
*inside* the tile the robot is driving, 20 cm ahead of it as move 10 starts, and lifted 3 seconds
later:

```
npm run sim -- --box 4,8.31@8.67-11.67
```

**You'll see:**

```
    8.94 s  E E E E S S S E E E BLOCKED 15
   11.71 s  GO 28
   20.04 s  E E E E E E E E S BLOCKED 5
✓ Your robot stopped 88 cm from G
```

(Again, the ✓ only means no bump: 88 cm from G is the failure.) Put `stepStart = now - (TILE_MS - msLeft);` back and run the same command: `✓ Your robot ended on
G (1.9 cm from its centre)`.

**Why:**
- With the bug, the robot drives a *whole* tile after the box instead of the rest of it, so move 10
  goes about 11 cm too far, and every later move carries that error. Its last move east overshoots the corner, it turns south into
  the corridor wall, and it stops in front of it for good (`BLOCKED 5`).
- "Forgot where I was" is the most common state-machine bug. Now you know what it looks like.
- Fractions put a box between tiles (`8.31` is a third of the way into column 8). A box that sits
  on a tile from the start only ever stops the robot at the start of a tile, where nothing is left
  to forget, which is why this experiment needs its own box.

**Do:** now run the stop's check:

```
python3 checks/check_stop_04.py
```

**You'll see** (after about half a minute):

```
✓ Stop 4: your firmware builds, split into motors, sensors and main. It still delivers to G, stops for the box and blinks, stays steady with sensor noise on, and keeps looking.
```

Commit:

```
git add firmware/src
git commit -m "Average the sensor, and show the state on the LED"
```

✅ **Checkpoint D:** `python3 checks/check_stop_04.py` prints ✓.

---

## Part E · Ship it

### Step 12 · Push, pull request, merge

**Do:**

```
git push -u origin stop-04-sense-and-react
```

Then on GitHub, as in Stop 1 (Steps 13–16): open the pull request, fill in the template (**Stop:**
4, and your explain-back, for example: *"The robot checks the clock instead of sleeping, so it
keeps reading the sensor every 60 ms; a state machine stops it for the box and remembers the rest
of the tile, and averaging plus two thresholds keep it from stuttering."*), and wait for the
checks.

**You'll see:**
- `stop-04 · sense and react` goes green after a minute or two: the same check you ran.
- `stop-01` and `stop-02` stay green. `stop-05`, `stop-06`, `stop-17` and `stop-18` say their stops
  haven't started.
- `stop-03 · firmware` stays green, built with the simulator's compiler. (In a copy older than
  these walkthroughs, it's red at its first step with `fatal error: 'courier.h' file not found`:
  your work is fine, and you can merge. See the note at the top.)

Click **Merge pull request** → **Confirm merge** → **Delete branch**, then in the Codespace:

```
git switch main
git pull
```

**Why:** three commits tell the story: the split, the state machine with the box, and the
averaging. CI runs your firmware in the simulator on a fresh computer, with the box, with noise on
three seeds, and with no box at all, so a later change can't quietly break any of them.

✅ **Checkpoint E:** your Stop 4 PR is merged with `stop-04` green.

---

## The whole files

`firmware/src/main.cpp` at the end of the stop (with the comments the expert added):

```cpp
// firmware/src/main.cpp — your robot's firmware (Stops 3 and 4).
//
// Build it and drive it in the simulator:   npm run sim
// With a box in the corridor:               npm run sim -- --box 4,8@0-12

#include <Arduino.h>
#include <courier.h>
#include <courier_pins.h>

#include "motors.h"
#include "sensors.h"

const int SPEED = 180;
const unsigned long TILE_MS = 885;
const unsigned long TURN_MS = 324;
const unsigned long READ_MS = 60;  // read the sensor every 60 ms
const int STOP_CM = 20;            // stop when something in the way is closer than this
const int GO_CM = 30;              // go again only when it's further than this

// The route your planner prints for maps/office.txt:  python3 planner/plan.py maps/office.txt
const char* ROUTE = "EEEESSSEEEEEEEEEEESSS";

enum class State { IDLE, TURNING, DRIVING, BLOCKED, DONE };
State state = State::IDLE;

int dir = 1;                  // which way the route faces: 0 = N, 1 = E, 2 = S, 3 = W
int move = 0;                 // which move of the route the robot is on
unsigned long stepStart = 0;  // when this turn or tile began
unsigned long turnMs = 0;     // how long this turn takes
unsigned long msLeft = 0;     // how much of the tile was left when the robot stopped
unsigned long lastRead = 0;
int distance = 400;           // the latest reading, in cm
unsigned long lastBlink = 0;
bool ledOn = false;

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

// How many cm of this tile are still to drive.
int cmLeft() {
  if (state == State::BLOCKED) return 30 * msLeft / TILE_MS;
  unsigned long driven = millis() - stepStart;
  if (driven > TILE_MS) driven = TILE_MS;
  return 30 * (TILE_MS - driven) / TILE_MS;
}

// Something is in the way if it's closer than `limit` and nearer than where this tile ends
// (for the go line, GO_CM, both lines move 10 cm further out).
bool inTheWay(int cm, int limit) {
  return cm < limit && cm < cmLeft() + (limit - STOP_CM);
}

// Start the next move: turn to face it (or finish).
void startMove() {
  if (ROUTE[move] == '\0') {
    stopMotors();
    state = State::DONE;
    setLed(false);
    Serial.println("DONE");
    return;
  }
  int target = headingOf(ROUTE[move]);
  int quarterTurns = (target - dir + 4) % 4;
  dir = target;
  if (quarterTurns == 0) turnMs = 0;
  else if (quarterTurns == 2) turnMs = 2 * TURN_MS;
  else turnMs = TURN_MS;
  if (quarterTurns == 3) drive(-SPEED, SPEED);       // one turn left
  else if (quarterTurns != 0) drive(SPEED, -SPEED);  // right, or right twice
  stepStart = millis();
  state = State::TURNING;
  setLed(true);
}

void setup() {
  Serial.begin(115200);
  Serial.println("Courier ready");
  pinMode(LED_PIN, OUTPUT);
  startMove();

  // From Stop 5: let the simulator's test drives (npm run sim -- --square, --straight 10) choose
  // the route. courier::route() is the route the simulator asks for, or nullptr when it asks for
  // none; then your own route stays. Keep ROUTE (Stop 3's check reads it), add
  // `const char *route = ROUTE;` next to it and drive `route` instead. With #include <courier.h>
  // at the top (from Stop 4), remove the // from this line:
  // const char *asked = courier::route(); if (asked) route = asked;
}

void loop() {
  unsigned long now = millis();
  if (now - lastRead >= READ_MS) {
    lastRead = now;
    distance = readDistance();
  }

  switch (state) {
    case State::TURNING:
      if (now - stepStart >= turnMs) {
        emptyWindow();    // those readings faced somewhere else
        distance = 400;   // the last reading faced somewhere else
        drive(SPEED, SPEED);
        stepStart = now;
        state = State::DRIVING;
        Serial.print(ROUTE[move]);
        Serial.print(' ');
      }
      break;

    case State::DRIVING:
      if (now - stepStart >= TILE_MS) {
        stopMotors();
        move++;
        startMove();
      } else if (inTheWay(distance, STOP_CM)) {
        stopMotors();
        msLeft = TILE_MS - (now - stepStart);
        state = State::BLOCKED;
        Serial.print("BLOCKED ");
        Serial.println(distance);
      }
      break;

    case State::BLOCKED:
      if (now - lastBlink >= 500) {
        lastBlink = now;
        setLed(!ledOn);
      }
      if (!inTheWay(distance, GO_CM)) {
        stepStart = now - (TILE_MS - msLeft);  // as if the tile had never paused
        drive(SPEED, SPEED);
        state = State::DRIVING;
        setLed(true);
        Serial.print("GO ");
        Serial.println(distance);
      }
      break;

    case State::IDLE:
    case State::DONE:
      break;
  }
}
```

`motors.h` and `motors.cpp` are as in Step 5, and `sensors.h` and `sensors.cpp` as in Step 9.

## Now you: do it

In **your** repo, make the same change: a branch, the five files, three commits, a PR, `stop-04`
green, merge. You may name your states, variables and helpers your own way: the check tests what
the robot does, plus the file split (`motors.h`, `motors.cpp`, `sensors.h`, `sensors.cpp`,
included from `main.cpp`).

**Make it yours (optional):** slow down smoothly as the box gets closer, instead of stopping dead
(speed in proportion to the distance, with a minimum).

## Words you met, and where

| Word | Explained in |
| --- | --- |
| `--box`, blocking, `longest loop() gap` | Step 1 |
| library, `courier.h`, `courier::motors`, namespace, `::` | Step 2 |
| distance sensor (ultrasonic), echo, `courier::distanceCm()`, −1 for no echo | Step 3 |
| `millis()`, non-blocking, `unsigned long`, wrap-around (49.7 days), `bool`, `!`, `? :` | Step 4 |
| header file (`.h`), source file (`.cpp`), declaration, definition, `#pragma once`, `#include "…"` vs `<…>` | Step 5 |
| state machine, state, transition, `enum class` | Step 6 |
| `switch`, `case`, `break`, `move++` | Step 7 |
| in the way, `cmLeft`, whole-number division, `&&`, threshold, hysteresis, `msLeft` | Step 8 |
| noise, `--noise sensor`, seed, moving average, sliding window, running sum, C++ array, `long` | Step 9 |
| `setLed`, slow blink | Step 10 |
| "forgot where I was", a box between tiles (`8.31`) | Step 11 |
