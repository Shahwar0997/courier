# checks/ — the checks CI runs on every change

CI (`.github/workflows/checks.yml`) runs these on GitHub every time you push. You can run them
yourself first, from the top folder of your repo, with `python3 checks/<file>`.
Each one prints ✓, or ✗ with what to fix in plain English. On GitHub, Stop 1's and Stop 6's
checks also mark their ✗ lines as errors, so they show on the run (and in the Curious Sims
workshop's pull request panel). Stop 6's also leaves a note for Curious Sims saying whether the
stop has started, so the workshop can tick it off when its job passes.

| File | Stop | Checks |
| --- | --- | --- |
| `check_robot_json.py` | 1 | `robot.json` has a name (1–20 letters, digits, spaces or dashes) and a colour like `#ff8800` |
| `check_explain_back.py` | 1 → all | your pull request says what the change makes the robot do (CI only: it reads the PR) |
| `check_stop_02.py` | 2 | runs your planner's tests (`pytest planner`) |
| `check_stop_03.py` | 3 | your firmware builds, says "Courier ready", blinks the LED, and its `ROUTE` is what your planner prints. From Stop 4 on it's built with the simulator's compiler and run in the simulator, and the LED only has to come on (Stop 4 checks the blink) |
| `check_stop_04.py` | 4 | your firmware is split into `motors`, `sensors` and `main` and builds; in the simulator it still drives the office route to G, stops for a box (`--box 4,8@0-12`) with 5 cm to spare and blinks while it waits, stays steady with sensor noise on (seeds 1–3), and `loop()` never takes more than 50 ms |
| `check_stop_05.py` | 5 | your odometry tests pass (`pio test -e native`), including the starter's four; then the simulator's test drives with the real-world switch on, seeds 1–3. The square (`--square`) ends within 5 cm of the start, the pose your firmware prints is within 5 cm and 10° of the truth, and `loop()` never takes more than 50 ms. Ten tiles (`--straight 10`) come out 300 ± 6 cm, and Pip ends within 12° of its line. Steady speed isn't checked yet (a note says so), and the pose after ten tiles (within 25 cm) is a warning for now. No office route: with the switch on, reaching G is luck of the seed |
| `check_stop_06.py` | 6 | your `courier` tool's tests pass (`pytest cli`), including the starter's five, and Stop 2's planner tests still do; then your firmware in the simulator, in real time: it joins the Wi-Fi, answers on port 7000 as the protocol says, and `courier send pip --to room-2` works (Pip starts driving: a drive meanwhile is answered "busy") |
| `check_stop_17.py` | 17 | early version, until Stop 17 is designed: firmware that uses `courier::ota` boots from slot A with its flash, key and update bucket, and never crashes or rolls back |
| `check_stop_18.py` | 18 | early version, until Stop 18 is designed: 10 robots run your firmware together (in-memory broker), none crashes or freezes them, and they publish |
| `drive_office.py` | 3 | CI's last stop-03 step: your firmware drives the office route for 30 s (`npm run sim`, with the real-world switch from Stop 5) |
| `courier_sim.py` | — | not a check: the helper the checks above use to build your firmware and run it in the simulator |

From Stop 4, "builds" means the simulator's compiler builds it (the same one `npm run sim` uses),
for every stop's check, Stop 3's included: `pio run -e sim` is for Stop 3's firmware only.
These checks need `npm ci` once, as `npm run sim` does.

Some simulator checks aren't there yet, and the jobs say so:
- Stop 4: walkthrough step 9's mid-tile box (`--box 4,8.31@8.67-11.67`, "drive only the rest of
  the tile") shows as a warning. Its times are fixed, so a slower or faster robot meets it elsewhere.
- Stop 5: steady speed (each wheel within 8% of its usual speed, over every 200 ms) isn't checked
  yet. Stop 4's sensor reads stretch the controller's 50 ms windows: a controller that assumes
  exactly 50 ms swings about 12%, one that scales by the real window stays within 5–7%. Its limit
  is being re-measured (`STEADY_ENFORCED` in `check_stop_05.py`).
- Stop 5: the pose after ten tiles straight (within 25 cm of the truth) is a warning. It catches a
  pose that never updates, which the square can't, but isn't in Stop 5's design table yet.
- Arriving with the real-world switch on (Stop 6) shows as a warning and doesn't fail yet.
  Its numbers are still being measured; `REAL_WORLD_ENFORCED` in `courier_sim.py` switches it on.

**After Stop 6 starts, the office drives ask for your planner's route.** From Stop 6 Pip waits
for a drive command at power-on, so once your firmware calls `WiFi.begin` (or your courier tool
is started), stop-03's and stop-04's office runs pass your planner's route with `--route` (your
firmware reads it with `courier::route()`, as the test drives do).

A stop's checks say "hasn't started yet" and pass until you begin that stop. After that they
stay on, so a later change can't quietly break an earlier stop.

**After Stop 5, the real-world switch stays on in the earlier checks too.** Stop 5 calibrates
Pip with the switch on, and calibrated that way it over-turns on a perfect floor. So once Stop 5
has started, stop-03's office drive and stop-04's runs use `--real-world` (seeds 1–3 in stop-04).
Hitting a wall on the office route is a note or a warning for now, not a failure, as arriving is
in Stop 6. Stop 4's box moves to Stop 5's straight test drive (`--straight 10`, row 4, column 6),
timed to meet your Pip: it stays until 3 s after Pip, on that seed without a box, gets near it.
Pip still mustn't touch it, must stop with 5 cm to spare, blink while it waits and carry on (the
ten tiles come out within 5 cm of that seed's run without the box; how far they go is Stop 5's
calibrated tile). If no seed gets to the box, stop-04 fails, because nothing was tested. And
`loop()` still never takes more than 50 ms. Stop 4's
stop-and-start count, its −1 comparison and its mid-tile box don't run with the switch on: with
noise on every run they can't tell correct firmware from a stutter.

While you're partway through a
stop, its job can show ✗ on your in-between commits (Stop 3 wants hello, blink *and* `ROUTE`):
that's normal. It goes ✓ when the stop is done.
