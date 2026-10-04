# Stop 3 · Make it move: your first firmware — walkthrough

In this walkthrough you watch an expert write the robot's own program, its **firmware**, in C++.
It says hello, blinks the status light, drives both wheels, and follows the route your planner
printed in Stop 2. Until now a driver we wrote moved the robot. From this stop on, your code does.

**Time:** about 3 hours. **You need:** Stops 1 and 2 merged. This stop reads your planner's route.

**How to read it:** the same as before. Each step says what to **Do**, what **You'll see** and
**Why**, in four parts, each ending in a ✅ checkpoint. You don't need to know C++. Everything you
need is explained the first time it appears, next to the Python you already know. The whole file
is at the end.

> **Two ways to run your firmware in this stop.** Both run in **robot time**: `delay(500)`
> doesn't really wait half a second, it moves the robot's clock on by 500 milliseconds, so 10
> seconds of the robot's life take a blink to run.
> - `pio run -e sim -d firmware -t exec` runs it on a **stand-in for the chip**
>   (`firmware/lib/arduino_sim/`) for 10 seconds of robot time. It prints what the robot's serial
>   monitor would show, and records every light and motor command. `checks/check_stop_03.py`
>   reads that record.
> - `npm run sim` (you met it in Stop 1, Step 18) runs it in the **simulator**: a robot on the
>   office floor, with walls, for 30 seconds of robot time. It prints the serial monitor with the
>   time of each line, then says where the robot ended up and whether it hit anything.
>
> The simulator answers in text.

---

## Part A · Meet the firmware

### Step 1 · A fresh branch, and a tour of `firmware/`

**Do:** open your Codespace: go to [github.com/codespaces](https://github.com/codespaces) and
click your codespace's name (Stop 1, Step 3f). Wait until VS Code shows a terminal with a line
ending in `$`. No terminal? Menu (☰) → **Terminal → New Terminal**. Then, in the terminal:

```
git switch main
git pull
git switch -c stop-03-make-it-move
```

Then open these three files in the Explorer:

- `firmware/platformio.ini`: how to build the firmware;
- `firmware/src/main.cpp`: the firmware itself, with an empty `setup()` and `loop()`;
- `firmware/lib/courier/courier_pins.h`: which pin of the chip is wired to what.

Build and run the empty firmware:

```
pio run -e sim -d firmware -t exec
```

**You'll see:** PlatformIO's build lines (`Compiling …`, `Linking …`), then:

```
Executing .pio/build/sim/program
[sim] ran 10000 ms of robot time
========================= [SUCCESS] Took … seconds =========================
```

The first build takes longer: PlatformIO is setting up its tools.

**Why:**
- The robot's small computer is a **microcontroller**: one chip with no screen and no operating
  system, built to control hardware. Courier's is an **ESP32** (two cores up to 240 MHz, about half
  a megabyte of memory, Wi-Fi built in). **Firmware** is the one program it runs, from the moment
  the power comes on until it goes off.
- The chip can't read C++. A **compiler** translates your code into the chip's own instructions
  *before* it runs. That's **compiling**. (Python is translated while it runs, which is why you
  never had this step before.) **Flashing** then writes those instructions into the chip's memory.
  On the stand-in, "flashing" just means running it.
- **PlatformIO** is the tool that compiles firmware for you. `pio run` builds it. `-e sim` picks the
  **environment** (build target) called `sim` in `platformio.ini`, `-d firmware` says the project
  is in the `firmware` folder, and `-t exec` means "and then run it".
- `platformio.ini` has three environments: `sim` (the stand-in on this computer), `kit` (a real
  robot, only if you take the optional last stop, Stop 24) and `native` (tests, from Stop 5). **Your `main.cpp` is the same
  for both.** Only the pin numbers differ, and they live in `courier_pins.h`. That's how the same
  firmware could drive a real robot. You'll use `sim` for the whole course.
- It ran for 10,000 ms of robot time and printed nothing, because `setup()` and `loop()` are
  empty. That's your "something that runs" (Stop 2, Step 1).

**Stuck?** *Your codespace isn't listed, or GitHub says you've used your free hours:* see Stop
1, Steps 3f and 3g. If the codespace was deleted, create a new one from your repo (**<> Code →
Codespaces → Create codespace on main**, Stop 1, Step 3c). Your merged work is safe on GitHub.

### Step 2 · `setup()` and `loop()`, and a first hello

**Do:** in `main.cpp`, make `setup()` start like this (keep the two `#include` lines and the
comments at the top):

```cpp
void setup() {
  Serial.begin(115200);
  Serial.println("Courier ready");
```

**Leave the rest of `setup()` as it is.** Below these lines, the starter's `setup()` has a
comment that starts `// From Stop 5:` and ends with a line beginning `// const char *asked`. It's
for Stop 5. Lines that start with `//` are comments, so they don't run. Every time this walkthrough
shows `setup()`, that comment is still there at the end, even where it isn't printed. You can
delete the `// Runs once, at power-on.` line: your code says it now.

Run `pio run -e sim -d firmware -t exec` again.

**You'll see:**

```
Executing .pio/build/sim/program
Courier ready
[sim] ran 10000 ms of robot time
```

**Why:**
- Arduino firmware has two functions, and the chip calls them for you. **`setup()` runs once**, at
  power-on. Then **`loop()` runs again and again, forever**. There's no "end of the program": the
  robot keeps going until you pull the power.
- `#include <Arduino.h>` at the top pulls in another file's code, like Python's `import`. It gives
  you `Serial`, `delay`, the pin functions and the rest. The file `courier_pins.h` gives you the pin
  names (`LED_PIN`, `LEFT_FWD`, …).
- The **serial monitor** is how the firmware talks back to you: text sent over the robot's cable,
  or here printed in your terminal. Printing is your window into a chip that has no screen.
  `Serial.println(…)` prints a line. `Serial.print(…)` prints without starting a new line.
- `Serial.begin(115200)` starts the serial link at 115,200 bits per second: the **baud rate**. Both
  ends must agree on it, or you see garbage. That's why `platformio.ini`'s `kit` environment says
  `monitor_speed = 115200`. On a real chip nothing is sent before `Serial.begin`, and the stand-in
  copies that.
- C++ basics you just used: every statement ends with **`;`**, and **`{ }`** mark a block where
  Python uses indentation. `void setup()` means "a function called `setup` that returns nothing"
  (`void` = nothing). Text in double quotes is a string, as in Python.

### Step 3 · Blink: the "hello world" of hardware

**Do:** add one line to `setup()`, just after `Serial.println("Courier ready");` (above the Stop 5
comment), and fill in `loop()`:

```cpp
void setup() {
  Serial.begin(115200);
  Serial.println("Courier ready");
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  delay(500);
  digitalWrite(LED_PIN, LOW);
  delay(500);
}
```

Build and run it, then run the stop's check:

```
pio run -e sim -d firmware -t exec
python3 checks/check_stop_03.py
```

**You'll see:** the run looks the same as before (the LED isn't printed). The check prints:

```
[sim] ran 10000 ms of robot time
✗ No ROUTE in main.cpp yet. Add `const char* ROUTE = "…";` with the moves your planner prints (walkthrough step 8)
```

That's the only ✗, so the other two checks passed: **it said hello, and the LED blinked**. The
route comes in Step 8. Now try the simulator too: `npm run sim`. Its summary says
`✓ Your robot stopped 485 cm from G` (the ✓ means it didn't hit anything; it hasn't moved yet) and
`LED toggled 60 times`: on and off once a second for 30 seconds.

**Why:**
- A **pin** is a metal leg on the chip that your program can switch on or off, or read. They're
  called **GPIO** pins (general-purpose input/output). The status LED is wired to one of them.
- `pinMode(LED_PIN, OUTPUT)` says "we'll *switch* this pin, not read it". You do this once, so it
  goes in `setup()`.
- `digitalWrite(LED_PIN, HIGH)` switches the pin on. On the ESP32, **HIGH** means 3.3 **volts**
  (voltage is electrical push) and **LOW** means 0 volts. The **LED** (light-emitting diode) lights
  when its pin is HIGH.
- `delay(500)` waits 500 milliseconds (half a second) and does **nothing else**: the whole chip
  waits. Remember that. It will matter in Step 9, and it's the problem Stop 4 solves.
- So `loop()` is one blink per second, forever. A blinking light is the first thing every hardware
  engineer makes on a new board: it proves your code is on the chip and `loop()` is running.
- The check ran your firmware for 10 seconds of robot time and read its record of pin changes.
  It's what CI's `stop-03` job runs.

**Stuck?** If the check says `✗ Nothing on the serial monitor. Is Serial.begin(115200) in
setup()?`, the `Serial.begin` line is missing or comes after the `println`.

**Commit this working step:**

```
git add firmware/src/main.cpp
git commit -m "Say hello and blink"
```

✅ **Checkpoint A:** the check's only ✗ is the missing `ROUTE`.

---

## Part B · Drive the wheels

### C++ next to Stop 2's Python: what you need for the next steps

The code from here on uses a few more pieces of C++. Here they are next to the Python you wrote in Stop 2:

| Python | C++ | What's different |
| --- | --- | --- |
| `import math` | `#include <Arduino.h>` | `#include` pulls in another file's code |
| `speed = 180` | `int speed = 180;` | every variable has a **type**. `int` is a whole number. Statements end with `;` |
| `SPEED = 180` (by convention) | `const int SPEED = 180;` | **`const`**: the compiler makes sure it never changes |
| `def drive(left, right):` | `void drive(int left, int right) {` | a function says what it returns (`void` = nothing) and the type of each input. Blocks use `{ }` |
| `if speed >= 0:` … `else:` | `if (speed >= 0) { … } else { … }` | the condition goes in `( )` |
| `for i in range(4):` | `for (int i = 0; i < 4; i++) {` | three parts: start; keep going while; step (`i++` adds 1) |
| `"E"` and `route[0]` | `'E'` and `route[0]` | a single character (`char`) uses **single** quotes. Double quotes are text |
| `# comment` | `// comment` | |
| define functions in any order | **define a function above the code that calls it** | the compiler reads top to bottom, so it has to have seen a function before it's used |

The last row trips up everyone coming from Python. That's why the new functions below go
**above** `setup()`.

### Step 4 · One wheel

**Do:** add this function **above** `void setup()`:

```cpp
// One wheel. speed runs from -255 (full backward) to 255 (full forward).
void setWheel(int fwdPin, int revPin, int speed) {
  if (speed >= 0) {
    analogWrite(fwdPin, speed);
    analogWrite(revPin, 0);
  } else {
    analogWrite(fwdPin, 0);
    analogWrite(revPin, -speed);
  }
}
```

Build it with `pio run -e sim -d firmware`.

**You'll see:** `[SUCCESS]`. In the simulator, `setWheel(LEFT_FWD, LEFT_REV, 180)` would spin the
left wheel forward.

**Why:**
- **Current** is how much electricity flows, measured in **amps**. A pin can only give a
  **small** current: a few hundredths of an amp at most. A motor needs ten
  to a hundred times more. Wiring a motor straight to a pin wouldn't turn it, and could damage the chip. So a
  **motor driver** chip (also called an **H-bridge**) sits between them. It switches the battery's
  power to the motor, following the pins' orders, in either direction.
- Courier's driver has **two inputs per motor**: one for forward and one for backward. Whichever
  one gets power decides the direction. So `setWheel` powers one input and sets the other to 0.
  Never power both.
- **`analogWrite(pin, value)`** sets a speed from 0 to 255, using **PWM** (pulse-width modulation).
  The pin can only be on or off, so to go slower than full speed it switches on and off about a
  thousand times a second. The motor can't follow that fast, so it feels the *average* power. The
  **duty cycle** is the fraction of time the pin is on: 255 is always on, 128 is on about half the
  time. Half the duty cycle gives *roughly* half the speed, not exactly: a motor needs some power
  just to start turning.
- `-speed` turns a negative speed (backward) into the positive amount the reverse input needs.

### Step 5 · Both wheels

**Do:** add these below `setWheel` (still above `setup()`):

```cpp
// Both wheels: everything that moves the robot goes through here.
void drive(int left, int right) {
  setWheel(LEFT_FWD, LEFT_REV, left);
  setWheel(RIGHT_FWD, RIGHT_REV, right);
}

void stopMotors() {
  drive(0, 0);
}
```

In `setup()`, after `pinMode(LED_PIN, OUTPUT);`, set the four motor pins as outputs too:

```cpp
  pinMode(LEFT_FWD, OUTPUT);
  pinMode(LEFT_REV, OUTPUT);
  pinMode(RIGHT_FWD, OUTPUT);
  pinMode(RIGHT_REV, OUTPUT);
```

Build it: `[SUCCESS]`.

**Why:**
- Courier steers with **differential drive**: two wheels, each with its own motor. Same speed:
  straight. Different speeds: a curve, bending toward the slower side. Opposite speeds: it spins
  on the spot. `drive(180, 180)` goes straight. `drive(180, -180)` spins clockwise, turning right.
- From here on, **everything that moves the robot calls `drive`**. One function for all motion
  means one place to fix things, and if you build a real robot at the optional Stop 24, one place
  to adapt to it.

**Stuck?** Two compiler errors you'll meet sooner or later, as GCC (the compiler in your
Codespace) shows them. Your line numbers will differ:

```
src/main.cpp:24:3: error: 'setWheel' was not declared in this scope
```

means you called a function above the place where it's defined. Move the definition up.

```
src/main.cpp:33:14: error: expected ';' before '}' token
```

means a `;` is missing. The message points at the file and line (`33`) and the column (`14`). Look
at the end of that line, or the line before it: C++ often notices a missing `;` only when it
reaches the next thing.

`npm run sim` uses a different compiler (Clang), so it words the same mistakes differently:
`✗ The firmware didn't build: use of undeclared identifier 'setWheel'` and
`✗ The firmware didn't build: expected ';' after expression`, each followed by `at src/main.cpp,
line …`. Same mistakes, same fixes.

**Commit this working step:**

```
git add firmware/src/main.cpp
git commit -m "Drive both wheels"
```

### Step 6 · One tile, one turn

**Do:** under the two `#include` lines, add the numbers:

```cpp
// How fast to drive, and for how long: measured in the simulator, one 30 cm tile and one 90° turn
// at SPEED 180.
const int SPEED = 180;
const int TILE_MS = 885;
const int TURN_MS = 324;
```

The comment at the top of `main.cpp` says these timing values are "added here when it ships". The
simulator has shipped, and these are its numbers, so you can delete that sentence. **Use exactly
885 and 324.** Rounder numbers like 1000 and 400 drive each tile about 4 cm too far and turn
about 111° instead of 90°, and the robot hits a wall after move 5.

and under `stopMotors`, three moves:

```cpp
// Open loop: drive for a set time and trust that it was one tile. The LED is lit while driving.
void forwardOneTile() {
  digitalWrite(LED_PIN, HIGH);
  drive(SPEED, SPEED);
  delay(TILE_MS);
  stopMotors();
  digitalWrite(LED_PIN, LOW);
}

void turnRight() {
  drive(SPEED, -SPEED);
  delay(TURN_MS);
  stopMotors();
}

void turnLeft() {
  drive(-SPEED, SPEED);
  delay(TURN_MS);
  stopMotors();
}
```

Build it: `[SUCCESS]`.

**Why:**
- A tile of the office floor is 30 cm. At speed 180, the simulated robot covers one tile in
  885 milliseconds and turns 90° in 324. **Naming the numbers** says what they mean, and `const`
  stops you changing them by accident. If they ever need to change, you change one line each.
- Each move is: start the wheels, wait, stop. This is **open-loop** control: nothing measures what
  actually happened. If the floor is slippery or the battery is low, "885 ms" isn't quite one
  tile, and small errors add up over a long route. Stop 5 fixes that by measuring the wheels.
- The LED is on while the robot drives a tile, a status light you can see from across the room.
  Step 9 shows that it also matters for the check.

### Step 7 · A square

**Do:** in `setup()`, just after the last `pinMode(RIGHT_REV, OUTPUT);` line (above the Stop 5
comment), add:

```cpp
  for (int i = 0; i < 4; i++) {
    Serial.print("side ");
    Serial.println(i + 1);
    forwardOneTile();
    turnRight();
  }
```

Run it: `pio run -e sim -d firmware -t exec`

**You'll see:**

```
Courier ready
side 1
side 2
side 3
side 4
[sim] ran 10000 ms of robot time
```

Then run it in the simulator: `npm run sim`. The serial monitor shows the four sides about 1.2
seconds apart (`0.00 s  side 1`, `1.21 s  side 2`, `2.42 s  side 3`, `3.63 s  side 4`), and the
summary says `✓ Your robot stopped 485 cm from G`: the same as before it moved, because the square
brought it back to S, where it started. (The ✓ means no bumps; reaching G comes in Step 8.)

**Why:**
- This is C++'s `for` from the table: start at `i = 0`, keep going while `i < 4`, add 1 each time.
  Four sides, each "forward one tile, turn right".
- It's also a real test of `TURN_MS`. If the turn is too short, the "square" opens into a spiral.
  If it's too long, the sides overlap. If you played this stop's sim on Curious Sims, its try-it
  had you tune exactly this.
- It's temporary: Step 8 replaces the square with the real route.

✅ **Checkpoint B:** the square prints `side 1` to `side 4`, and the build succeeds.

---

## Part C · Follow the route

### Step 8 · Turn to face each move, then drive it

**Do:**

1. Get your planner's route. In the terminal:

   ```
   python3 planner/plan.py maps/office.txt
   ```

   It prints `EEEESSSEEEEEEEEEEESSS`. One wrong letter sends the robot somewhere else, so copy
   it rather than typing it: drag the mouse across the letters in the terminal, right-click →
   **Copy**, then click where the route goes in `main.cpp` and paste (**Ctrl+V** on Windows or
   Linux, **Cmd+V** on a Mac). If the browser asks whether the page may see your clipboard, click
   **Allow**.

2. Under the `const int` numbers, add the route and the robot's heading:

   ```cpp
   // The route your planner prints for maps/office.txt:  python3 planner/plan.py maps/office.txt
   const char* ROUTE = "EEEESSSEEEEEEEEEEESSS";

   int heading = 1;  // which way the robot faces: 0 = N, 1 = E, 2 = S, 3 = W. It starts facing east.
   ```

3. Under `turnLeft`, add three functions:

   ```cpp
   // N, E, S, W -> 0, 1, 2, 3
   int headingOf(char move) {
     if (move == 'N') return 0;
     if (move == 'E') return 1;
     if (move == 'S') return 2;
     return 3;  // 'W'
   }

   // Turn right by this many quarter-turns: 0 none, 1 right, 2 about-face, 3 = one turn left.
   void turnBy(int quarterTurns) {
     if (quarterTurns == 0) return;
     if (quarterTurns == 3) {
       turnLeft();
       return;
     }
     if (quarterTurns == 2) {
       turnRight();
       turnRight();
       return;
     }
     turnRight();
   }

   void followRoute(const char* route) {
     for (int i = 0; route[i] != '\0'; i++) {
       int target = headingOf(route[i]);
       int turns = (target - heading + 4) % 4;
       Serial.print("move ");
       Serial.print(i + 1);
       Serial.print(": ");
       Serial.print(route[i]);
       Serial.print(", quarter-turns ");
       Serial.println(turns);
       turnBy(turns);
       heading = target;
       forwardOneTile();
     }
     Serial.println("Arrived");
   }
   ```

4. In `setup()`, replace the square's `for` loop with one line:

   ```cpp
     followRoute(ROUTE);
   ```

Run it: `pio run -e sim -d firmware -t exec`

**You'll see:**

```
Courier ready
move 1: E, quarter-turns 0
move 2: E, quarter-turns 0
move 3: E, quarter-turns 0
move 4: E, quarter-turns 0
move 5: S, quarter-turns 1
move 6: S, quarter-turns 0
move 7: S, quarter-turns 0
move 8: E, quarter-turns 3
move 9: E, quarter-turns 0
move 10: E, quarter-turns 0
move 11: E, quarter-turns 0
[sim] ran 10000 ms of robot time
```

(The `[sim] ran …` line may appear a few lines higher: it's printed separately, and the terminal
can mix the two.) It stops at move 11 because the stand-in runs for 10 seconds of robot time, and
the whole route takes about 20. Now drive the whole route in the simulator:

```
npm run sim
```

**You'll see:** the build line, then the serial monitor with the robot time of each line:

```
✓ firmware built: 3,143 bytes in 1.2 s
Serial monitor:
    0.00 s  Courier ready
    0.00 s  move 1: E, quarter-turns 0
    0.89 s  move 2: E, quarter-turns 0
    …
   18.73 s  move 21: S, quarter-turns 0
   19.61 s  Arrived
✓ Your robot ended on G (2 cm from its centre)
  robot time 30.1 s · LED toggled 63 times · 0 bumps
  longest loop() gap 1000 ms (from 19.61 s)
```

(Your byte count may differ a little if your comments or names differ. That's fine.) All 21
moves, and it stops on G. You'll meet the last line, `longest loop() gap`, in Stop 4.

**Why:**
- **Text in C++.** `const char*` is C++'s fixed piece of text: a row of `char`s in memory. It
  always ends with a hidden extra character, `'\0'` (the "null" character), which marks the end.
  That's how `for (int i = 0; route[i] != '\0'; i++)` knows when to stop. C++ text doesn't carry
  its length the way a Python string does.
- **The heading.** The robot must *face* a direction before driving forward. Number the directions
  clockwise: N = 0, E = 1, S = 2, W = 3. `heading` holds which way the firmware believes the robot
  faces. It's a **global** variable: declared outside any function, so every function below it can
  read and change it.
- **How far to turn.** To face `target` from `heading`, turn right `(target − heading + 4) % 4`
  quarter-turns: `0` means already facing it, `1` a right turn, `2` an about-face, and `3` is the
  same as one turn *left*, which is quicker. It's the trick from the classic exercise of a
  robot walking a grid on commands. At move 5: facing E (1), target S (2): `(2 − 1 + 4) % 4 = 1`,
  one right turn. At move 8: facing S (2), target E (1): `(1 − 2 + 4) % 4 = 3`, one left turn.
- **Why `+ 4`?** Without it, move 8 is `(1 − 2) % 4`, which is `-1 % 4`. In Python that's `3`. **In
  C++ it's `-1`**: C++'s `%` keeps the sign of the number on the left. Adding 4 first keeps the
  number from going negative. Step 10 shows what happens without it.
- `return;` in a `void` function just means "stop here".
- The serial lines are how you'll debug your robot from now on: print what the firmware decided
  at each step, then compare it with what the robot did. It works the same in the simulator and on
  a real robot.

**Commit this working step:**

```
git add firmware/src/main.cpp
git commit -m "Follow the planner's route"
```

### Step 9 · Run the check, and see why the light matters

**Do:**

```
python3 checks/check_stop_03.py
```

**You'll see:**

```
[sim] ran 10000 ms of robot time
✓ Stop 3: your firmware says hello, blinks, and its ROUTE matches your planner.
```

**Now an experiment.** In `forwardOneTile`, put `//` in front of the two `digitalWrite` lines
(this turns them into comments), then build and check again:

```
pio run -e sim -d firmware
python3 checks/check_stop_03.py
```

```
✗ The LED didn't blink. Check `pinMode(LED_PIN, OUTPUT)` and the `loop()`
```

But the blink is still in `loop()`! Remove the two `//` again before you go on.

**Why:**
- The check watches the first 10 seconds of robot time. The route takes about 20 seconds, and it
  all runs inside `setup()`, one `delay` after another. **`loop()` doesn't start until `setup()`
  has finished**, so for the first 20 seconds the blink in `loop()` never runs. The only light is
  the one in `forwardOneTile`.
- This is what `delay()` costs: while the chip waits, it can do **nothing else**. It can't blink,
  can't read a sensor, can't hear a "stop!" message. That's fine for a first robot, and a real
  problem for the next one. **Stop 4** teaches the robot to do several things at once without
  `delay`.
- The check's last line compares your `ROUTE` with what your own planner prints. That links Stop
  2 to Stop 3: change the map or the planner, and the firmware has to follow.

### Step 10 · Break it on purpose

**Do:** in `followRoute`, delete the `+ 4`, so the line reads
`int turns = (target - heading) % 4;`. Run it: `pio run -e sim -d firmware -t exec`

**You'll see:** everything the same until:

```
move 8: E, quarter-turns -1
```

Now run `python3 checks/check_stop_03.py`: it still says ✓. Then run `npm run sim`. The serial
monitor still prints all 21 moves and `Arrived`, but the summary says:

```
✗ Your robot hit a wall after move 12 (at row 4, column 0)
  robot time 30.1 s · LED toggled 63 times · 13 bumps
```

Put the `+ 4` back, and run `npm run sim` again: `✓ Your robot ended on G`.

**Why:**
- There's the C++ trap: `(1 − 2) % 4` is `-1` in C++. `turnBy(-1)` matches none of the `if`s, so it
  falls through to "one turn right". Facing south, a right turn faces **west**, but `heading` now
  says east. What the firmware *believes* and what the robot *does* have split apart.
- In the simulator, the robot then drives west along the corridor. The next moves are all "E",
  and the firmware thinks it's facing east, so it never turns again. It hits the left wall (row 4,
  column 0) on move 12. The firmware never knew: it printed `Arrived`, because nothing measures
  where the robot really is.
- `check_stop_03.py` can't see this: the stand-in has no floor or walls, so it still says ✓. The
  simulator can, and CI runs it too (Step 11), so this bug would turn your PR red. Printing the
  decisions matters as much: the `-1` is right there in the output.
- A belief that has drifted from the truth, with nothing measuring the difference: that's the
  problem with open loop. Stop 5 fixes it by measuring what the wheels actually did.

✅ **Checkpoint C:** `python3 checks/check_stop_03.py` prints ✓, and the `+ 4` is back.

---

## Part D · Ship it

### Step 11 · Push, pull request, merge

**Do:**

```
git push -u origin stop-03-make-it-move
```

**Do,** on GitHub. Stop 1 showed each of these screens in full (Steps 13–16):

1. Open your repo, `github.com/<your-username>/courier`. On the yellow banner, click **Compare &
   pull request**. *No banner?* Open the link `git push` printed, or click **Pull requests** →
   **New pull request** → set **compare:** to `stop-03-make-it-move` → **Create pull request**
   (Stop 1, Step 13).
2. Fill in the template: **Stop:** 3, and your explain-back, for example: *"Drives the office route by turning `(target − heading + 4) % 4` quarter-turns before each tile, timed with `delay`, open loop."*
   Click **Create pull request**.
3. Scroll to the box of checks at the bottom of the **Conversation** tab. Wait until every check
   shows a green ✓ (about a minute). *A red ✗?* Click **Details** next to it and read the ✗ line
   (Stop 1, Step 15). Fix it in the Codespace on the same branch, then `git add`, `git commit` and
   `git push`. The PR updates and the checks run again.
4. Click **Merge pull request** → **Confirm merge**. Then click **Delete branch**.
5. Back in the Codespace terminal, bring the merged `main` into your Codespace:

   ```
   git switch main
   git pull
   ```

6. Stop your Codespace if you're done for the day: [github.com/codespaces](https://github.com/codespaces)
   → **⋯** → **Stop codespace** (Stop 1, Step 3e).

**You'll see:** `stop-03 · firmware` goes green. Click **Details**. Among its steps (the others set
up the computer) are three of yours: **firmware builds** (with `pio run -e sim`), **firmware says
hello, lights the LED …, and has your planner's route** (the same check you ran: `✓ Stop 3: your
firmware says hello, blinks, and its ROUTE matches your planner.`), and **your firmware drives the
robot** (30 seconds of robot time in the simulator, the same run as `npm run sim`, ending
`✓ Your robot ended on G (2 cm from its centre)`). `stop-01` and `stop-02` stay green, and the
other jobs say their stops haven't started.

**Why:** three commits tell the story: hello and blink, the wheels, the route. CI builds your
firmware from scratch on a fresh computer, so if it builds there, it builds from what's in your repo.
The simulator step is the one that catches Step 10's bug: if the robot hits a wall, the step
ends ✗ and the job goes red.

### Step 12 · Read your robot's drive

**Do:** run `npm run sim` once more on `main`, and read the serial monitor's times.

**You'll see:** each straight move about 0.89 s after the one before (one tile, `TILE_MS`), and
1.21 s where there's a turn first (a turn and a tile). The robot ends on G, 2 cm from its centre:
timing alone gets close, not exact.

✅ **Checkpoint D:** your Stop 3 PR is merged with every check green.

---

## The whole file

`firmware/src/main.cpp` at the end of the stop:

```cpp
// firmware/src/main.cpp — your robot's firmware (Stop 3).
//
// Firmware is the one program that runs on the robot's chip. It starts when the power comes on
// and never ends: the chip calls setup() once, then calls loop() again and again, forever.
//
// Build it for the simulator:   pio run -e sim -d firmware
// Build and run it:             pio run -e sim -d firmware -t exec
//
// The walkthrough is in stops/03/WALKTHROUGH.md.

#include <Arduino.h>
#include <courier_pins.h>

// How fast to drive, and for how long: measured in the simulator, one 30 cm tile and one 90° turn
// at SPEED 180.
const int SPEED = 180;
const int TILE_MS = 885;
const int TURN_MS = 324;

// The route your planner prints for maps/office.txt:  python3 planner/plan.py maps/office.txt
const char* ROUTE = "EEEESSSEEEEEEEEEEESSS";

int heading = 1;  // which way the robot faces: 0 = N, 1 = E, 2 = S, 3 = W. It starts facing east.

// One wheel. speed runs from -255 (full backward) to 255 (full forward).
void setWheel(int fwdPin, int revPin, int speed) {
  if (speed >= 0) {
    analogWrite(fwdPin, speed);
    analogWrite(revPin, 0);
  } else {
    analogWrite(fwdPin, 0);
    analogWrite(revPin, -speed);
  }
}

// Both wheels: everything that moves the robot goes through here.
void drive(int left, int right) {
  setWheel(LEFT_FWD, LEFT_REV, left);
  setWheel(RIGHT_FWD, RIGHT_REV, right);
}

void stopMotors() {
  drive(0, 0);
}

// Open loop: drive for a set time and trust that it was one tile. The LED is lit while driving.
void forwardOneTile() {
  digitalWrite(LED_PIN, HIGH);
  drive(SPEED, SPEED);
  delay(TILE_MS);
  stopMotors();
  digitalWrite(LED_PIN, LOW);
}

void turnRight() {
  drive(SPEED, -SPEED);
  delay(TURN_MS);
  stopMotors();
}

void turnLeft() {
  drive(-SPEED, SPEED);
  delay(TURN_MS);
  stopMotors();
}

// N, E, S, W -> 0, 1, 2, 3
int headingOf(char move) {
  if (move == 'N') return 0;
  if (move == 'E') return 1;
  if (move == 'S') return 2;
  return 3;  // 'W'
}

// Turn right by this many quarter-turns: 0 none, 1 right, 2 about-face, 3 = one turn left.
void turnBy(int quarterTurns) {
  if (quarterTurns == 0) return;
  if (quarterTurns == 3) {
    turnLeft();
    return;
  }
  if (quarterTurns == 2) {
    turnRight();
    turnRight();
    return;
  }
  turnRight();
}

void followRoute(const char* route) {
  for (int i = 0; route[i] != '\0'; i++) {
    int target = headingOf(route[i]);
    int turns = (target - heading + 4) % 4;
    Serial.print("move ");
    Serial.print(i + 1);
    Serial.print(": ");
    Serial.print(route[i]);
    Serial.print(", quarter-turns ");
    Serial.println(turns);
    turnBy(turns);
    heading = target;
    forwardOneTile();
  }
  Serial.println("Arrived");
}

void setup() {
  Serial.begin(115200);
  Serial.println("Courier ready");
  pinMode(LED_PIN, OUTPUT);
  pinMode(LEFT_FWD, OUTPUT);
  pinMode(LEFT_REV, OUTPUT);
  pinMode(RIGHT_FWD, OUTPUT);
  pinMode(RIGHT_REV, OUTPUT);
  followRoute(ROUTE);

  // From Stop 5: let the simulator's test drives (npm run sim -- --square, --straight 10) choose
  // the route. courier::route() is the route the simulator asks for, or nullptr when it asks for
  // none; then your own route stays. Keep ROUTE (Stop 3's check reads it), add
  // `const char *route = ROUTE;` next to it and drive `route` instead. With #include <courier.h>
  // at the top (from Stop 4), remove the // from this line:
  // const char *asked = courier::route(); if (asked) route = asked;
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  delay(500);
  digitalWrite(LED_PIN, LOW);
  delay(500);
}
```

## Now you: do it

In **your** repo, make the same change: a branch, `main.cpp` built up in the same steps, three
commits, a PR, green checks, merge. Your `ROUTE` is whatever **your** planner prints for
`maps/office.txt`.

**Make it yours (optional):** add a victory spin on arrival (a `turnRight()` four times after
`"Arrived"`), or print the heading after each move.

## Words you met, and where

| Word | Explained in |
| --- | --- |
| microcontroller, ESP32, firmware, compile, compiler, flash, PlatformIO, `pio run -e sim -d firmware -t exec`, environment, `platformio.ini`, `courier_pins.h`, robot time | Step 1 and the box at the top |
| `setup()` / `loop()`, `#include`, serial monitor, `Serial.begin`, baud rate, `Serial.print` / `println`, `;`, `{ }`, `void` | Step 2 |
| pin, GPIO, `pinMode`, `digitalWrite`, HIGH / LOW, voltage, LED, `delay` | Step 3 |
| type, `int`, `const`, C++ `if` and `for`, `char` and `'c'`, `//`, define before use | C++ next to Stop 2's Python |
| motor driver, H-bridge, `analogWrite`, PWM, duty cycle, `setWheel` | Step 4 |
| differential drive, `drive(left, right)`, `stopMotors()`, compiler error messages | Step 5 |
| tile = 30 cm, open-loop control | Step 6 |
| simulator, `npm run sim`, robot time | the box at the top, Step 8 |
| `const char*`, `'\0'`, heading, global variable, `% 4` turning, C++ `%` of a negative number, `return;` | Step 8 |
| `delay` blocks everything | Step 9 |
