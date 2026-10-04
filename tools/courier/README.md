# tools/courier — the Courier simulator (headless), outside the browser

The courier kit (`kits/courier/0/`, served at `/_lib/courier/<version>/`) has **browser files
only**. The platform's import check rejects any served module that imports `node:`, and Node-only
or hardware files have no place on `/_lib` (curious-sims#33). This folder holds the rest, and it is
never served:

| File | What |
| --- | --- |
| `cli.mjs` | the Courier simulator without a screen, for a learner's CI and Codespace (Node 24), and the keys for signed updates. Learners reach it through courier-starter's `npm run sim`; on screen, `courier` is only the learner's own tool (Stop 6) |
| `fleet.mjs` | `cli.mjs fleet`: many robots, headless, in real time, on MQTT (Stop 18) |
| `mqtt.mjs` | a small MQTT 3.1.1 client (QoS 0), no dependencies |
| `hw/freenove-fnk0053/` | the same firmware on the real kit (Freenove FNK0053, ESP32-WROVER) |

`cli.mjs` imports the engine (`./world.js`, `./sim.js`, `./device.js`, `./sign.js`, `./broker.js`, `./dataset.js`, `./net.js`, `./build.js`) and reads `./firmware/`, so
it doesn't run from here. Pack it with a kit release first:

```sh
node scripts/pack-courier.mjs 0.1.1 ../courier-starter/tools/courier
```

The pack copies the release's engine files (the list above) and `firmware/` **byte for byte**
from `releases/courier/<version>/` (it checks them against `releases/index.json`). It adds
`cli.mjs`, `hw/`, this README and a `package.json` marking the folder as ES modules, and writes
`SOURCE.json`: the kit version, the sim-kit commit and a sha256 per file. That way CI runs exactly
the engine the sim shows, and a vendoring repo can check that nothing drifted. Use `working`
instead of a version to pack the working copy (for tests only).

## CI: `cli.mjs`

```sh
npm install --save-exact @yowasp/clang@22.0.0-git20542-10     # once, in the learner's repo (dev dependency)
node tools/courier/cli.mjs drive "$(python3 planner/plan.py maps/office.txt)" --map maps/office.txt --name Pip
node tools/courier/cli.mjs run firmware --map maps/office.txt --seconds 30 --events events.txt --json report.json
```

- **Firmware folder:** `run` takes a PlatformIO project (`src/`, `include/`, `lib/*`). It skips
  `lib/arduino_sim`, because the simulator brings its own `Arduino.h`.
- **Exit codes:** 0 means it worked. 1 means it didn't: a build error, crash, hit, watchdog, or a
  route with letters other than N/E/S/W. 2 means it couldn't start: an unknown option, an option
  without its value, bad arguments, an unreadable map, or no compiler.
- **Options** (from courier 0.7): each command takes only its own options, and anything else is
  exit 2 with a message, so a typo never looks like success. `--listen` takes no value, and
  `--real-world` takes a seed only if a number follows (`--real-world` alone is seed 1). So
  `npm run sim -- --real-world --listen` means what it says.
- **Event log:** `--events` writes courier-starter's format, one `@<ms> <kind> <detail>` per line, so
  its `checks/check_stop_03.py` reads it unchanged. The kinds are `serial`, `pinMode`,
  `digitalWrite`, `analogWrite`, `motors` and `end`.
- **Speed:** a build and a 30 s run take 0.7 s here (Apple Silicon), most of it loading clang.
- **Over-the-air updates (Stop 17, kit 0.3):**
  ```sh
  node tools/courier/cli.mjs keygen --out keys/robot          # robot.pem (private: never commit), robot.pub, robot.h
  node tools/courier/cli.mjs build firmware --out bucket/courier/latest.wasm
  node tools/courier/cli.mjs sign bucket/courier/latest.wasm --key keys/robot.pem   # → latest.wasm.sig
  node tools/courier/cli.mjs run firmware --flash flash/robot-1 --key keys/robot.pub --serve bucket
  ```
  `--flash DIR` keeps the robot's two slots in `DIR/flash.json` between runs. The first run puts the
  firmware you built into slot A, and later runs boot whatever the robot updated itself to.
  `--serve DIR` is what `courier::net::get` reaches: any URL's path is read from DIR, and never from
  outside it. The run prints the boots: slot, version, and why (power-on, restart, crash, rollback).
- **A fleet (Stop 18, kit 0.4):**
  ```sh
  docker run -d -p 127.0.0.1:1883:1883 eclipse-mosquitto:2.0.22 mosquitto -c /mosquitto-no-auth.conf   # any MQTT broker will do
  node tools/courier/cli.mjs build firmware --out fw.wasm
  node tools/courier/cli.mjs fleet fw.wasm --robots 100 --seconds 60 --mqtt mqtt://localhost:1883 --real-world 1
  ```
  - Robots are named `robot-001`…, and each has its own MQTT connection with that client id.
    `--flash DIR` gives each one its own flash, in `DIR/robot-001/flash.json` and so on, saved at
    every change. `--serve DIR` or `--serve http://…` is what `courier::net::get` reaches, for
    Stop 17's updates across a fleet.
  - All robots share one thread (WebAssembly JSPI, Node 24). A robot ahead of the wall clock waits,
    so they run in real time together. A firmware that never gives the board a turn would freeze
    them all, so a watchdog (`--watchdog MS`, 5000) stops the fleet and names the robot.
  - Every second it prints the messages sent, how many reached the broker (a separate subscriber
    counts them), how far the robots are behind the wall clock, CPU and memory. `--json` writes the
    samples and each robot's report. The exit code is 0 when every robot's run was ok.
  - Throughput: 100 robots at 10 Hz take about a third of a core and about 150 MB. The ceiling is
    about 1,000 robots (10,000 msg/s) per process; the measurements are in the kit's README, Stop 18.
  - Without `--mqtt`, the robots share an in-memory broker, which is handy for CI.
  - `run` and `fleet` also take a built `.wasm` (`build --out`), so the compiler isn't loaded:
    "build once, run many".
- **Datasets (Stop 20, kit 0.5):** `node tools/courier/cli.mjs dataset --count 2000 --size 96x96
  --seed 1 --out data/` writes labelled camera frames as files: `data/images/00001.pgm` (grayscale)
  and `data/labels.csv`. Each row has the file, the label (nothing, parcel, person or obstacle), the
  main object's box, distance and bearing, and the light. The same seed always gives the same
  pictures. The command never writes over an existing dataset.
- **Wi-Fi, in real time (Stop 6, kit 0.7):** `node tools/courier/cli.mjs run firmware --listen`
  runs the robot in real time (robot time keeps pace with the wall clock), until Ctrl+C or SIGTERM,
  or for `--seconds N`.
  - Serial lines and Wi-Fi events print as they happen.
  - When the firmware is on the Wi-Fi and a `WiFiServer` listens, the same port opens on
    `localhost` (127.0.0.1, and ::1 where there's IPv6) and prints `→ the robot's port 7000 is at
    localhost:7000`. Each connection there is a connection to the robot.
  - Before that, and after the run, nothing listens, so a client gets "connection refused". A
    stopped simulator looks the same as a stopped robot.
  - Stopping with Ctrl+C or SIGTERM is exit 0, with the usual report (`reason: "stopped"`).
    `--json` and `--events` work, and the summary adds the Wi-Fi line.
  - The firmware waits (WebAssembly JSPI) whenever it's ahead of the wall clock, so an idle robot
    costs almost no CPU.
  - For CI: `node tools/courier/cli.mjs run firmware --listen & sleep 3`, then talk to
    `localhost:7000`, then `kill %1`.
  - **macOS:** the AirPlay Receiver (System Settings → General → AirDrop & Handoff) listens on
    port 7000. The simulator still gets 127.0.0.1:7000 while it runs. Once it stops, AirPlay
    answers there instead of "connection refused". Codespaces and Linux aren't affected.
- **Stop 4 (kit 0.8): sensor noise, boxes, the loop() gap.**
  ```sh
  node tools/courier/cli.mjs run firmware --box 4,8                       # Stop 3's firmware: "✗ Pip hit a box after move 10 (at row 4, column 8)"
  node tools/courier/cli.mjs run firmware --box 4,8@0-12 --noise sensor   # a box until 12 s; noisy sensors (seed 1)
  node tools/courier/cli.mjs run firmware --box 4,8.31@8.67-11.67 --noise sensor --seed 3 --json report.json
  ```
  - `--box ROW,COL[@FROM-TO]`: a 20 × 20 cm box centred on that tile (5 cm of floor each side), from
    FROM to TO seconds of robot time (`@5` = from 5 s on; no `@` = the whole run). Fractions put it
    between tiles (`4,7.5` sits on the line between columns 7 and 8). Give `--box` again for more.
  - `--noise sensor`: only the sensors are noisy (the distance sensor ±1.5 cm, 2% no echo; the
    line sensors and encoders a little); the wheels and battery stay ideal. `--seed N` picks which
    noise (default 1). `--real-world` is all of it: sensors, wheel slip, battery sag.
  - The summary adds `box at row 4, column 8, from 0 s to 12 s` and `longest loop() gap 25 ms (from 6.24 s)`.
  - **`--json` report, for checks** (the kit's README, "The report", has every field):
    | Field | For the check |
    | --- | --- |
    | `hit` | `{ thing: "wall" \| "box", row, col, move, t }` or null: "Pip hit a box after move 10" (`t` in µs) |
    | `boxes` | `[{ row, col, from, to, size, x0, y0, x1, y1 }]` (`to` null = the whole run; metres) |
    | `loopGap` | `{ ms, fromMs, toMs, running }`: "loop() was busy for `ms` ms at `fromMs`"; `running` = still inside loop() when the run ended |
    | `trace` | `[{ t, x, y, th, row, col, led }]` every 50 ms: how close Pip came to a box (nose = centre + 9 cm along `th`) |
    | `led.changes` | `[{ t, on }]`: did it blink while stopped |
    | `pose`, `goal` | where it ended; `goal.distanceCm` from G's centre |
    | `realWorld` | the settings used (`sensorNoise`, `wheelSlip`, `batterySag`, `seed`, …) or null |
- **Stop 5 (kit 0.9): test drives and ghost Pip.**
  ```sh
  node tools/courier/cli.mjs run firmware --real-world --square        # "square test (ESWN): ended 0.9 cm from where it started, facing 1.3° right of north"
  node tools/courier/cli.mjs run firmware --real-world --straight 10   # "straight test, 10 tiles (300 cm by the book): drove 313.8 cm … 0.1655 cm per tick"
  node tools/courier/cli.mjs run firmware --route EESS                 # any route, on your map
  ```
  - The firmware is asked to drive the route: `courier::route()` returns it (`nullptr` when nobody
    asks). Firmware that reads it once in `setup()` drives the test, and its own route otherwise.
  - `--square` and `--straight N` bring their own open floor (so no `--map`); one test drive at a time.
  - If the firmware prints `pose e=… n=… h=…` lines, the summary adds its last belief next to the truth:
    `belief (last pose line, 19.64 s): e=0.4 n=0.2 h=0.3 · truth now: e=-0.1 n=0.3 h=1.3 · 0.5 cm apart`.
  - **`--json` for checks:** `testDrive` (`{ kind: "square", endGapCm, headingOffDeg, ticks }` or
    `{ kind: "straight", tiles, trueCm, avgTicks, cmPerTick, … }`), `truth` and `belief` (`{ e, n, h }`:
    cm east and north of S's centre, compass degrees), `beliefs` (every pose line, with `t` in µs),
    `beliefGapCm`, `wheels` (`[{ t, cmps: [l, r], ticks: [l, r] }]` every 50 ms: each wheel's speed, for
    "holds speed"), `travelledCm`, `ticks` and `battery`.
- **Real-world switch (Stop 5, kit 0.2):** `--real-world SEED` turns on slip, motor mismatch,
  battery sag and sensor noise, drawn from SEED. The same seed gives the same run as the browser
  (`robot.run({ wasm, realWorld: { seed } })`), so CI can check calibrated firmware against the
  world the learner tuned it in. The summary line adds the battery and encoder ticks, and
  `--json` adds `ticks`, `battery` and `realWorld`.

## The real kit: `hw/freenove-fnk0053/`

The FNK0053's motors sit behind a PCA9685 PWM chip on I2C, and its light is a WS2812. So in the
kit's `courier_pins.h`:
- `LED_PIN`, `LEFT_FWD`, `LEFT_REV`, `RIGHT_FWD` and `RIGHT_REV` are *Courier pins* (200–204);
- `courier_kit.h` routes those through `pinMode`/`digitalWrite`/`analogWrite` to the chip, so
  Stop 3's code runs unchanged;
- every other pin goes to the ESP32 as usual.

`courier_hal.cpp` implements `courier.h` on the kit. Firmware that uses `WiFi.h` gets the ESP32 core's
own, and firmware that mentions ArduinoJson gets the same 7.4.3 single header the simulator has, next
to the sketch (Stop 6's reference: 1,027,928 bytes, 52% of a slot, no warnings). In a packed folder,
`./hw/freenove-fnk0053/build-esp32.sh main.cpp` compiles with arduino-cli (`esp32:esp32@3.3.12`,
`esp32wrover`, partitions `min_spiffs`: two 1.9 MB app slots for updates); it takes `courier.h` from
the pack's `firmware/`. Stop 3's reference firmware is 397,296 bytes (20% of a slot), Stop 5's
(`test/courier/demo/stop5.txt`) 396,716 and Stop 17's (`stop17.txt`) 698,213, or 797,601 with a
`courier_key.h`. All build with no warnings. Firmware that uses `courier::ota` or `courier::net` gets
Wi-Fi, HTTP and libsodium; the script sets `COURIER_WITH_NET` for it, so other firmware stays small.
The script also takes the firmware's other files next to `main.cpp` (its own `.h`, `.hpp`, `.c` and
`.cpp`, e.g. Stop 20's `model.h`, which builds at 414,380 bytes of flash and 45,492 bytes of RAM).
For updates on the kit, put the robots' public key next to `main.cpp` as `courier_key.h` (keygen's
`<name>.h`). The HAL defines `verifyRollbackLater()`, so a new app stays `PENDING` until the firmware
confirms it, as in the simulator.
The kit has no wheel encoders: `ENC_LEFT`/`ENC_RIGHT` are placeholders there (attachInterrupt on
them does nothing, `courier::ticks()` returns −1), and `courier::batteryVolts()` returns −1 until the
battery divider is measured. **Not yet run on a kit: none has been bought.** The
simulator's motor numbers (dead band 60/255, 0.5 m/s, lag 80 ms, no trim) get calibrated against a
real one.

## Versions

These files aren't a kit release. A vendoring repo pins them by `SOURCE.json` (kit version + sim-kit
commit + hashes) and re-packs to update. A change to the CLI's behaviour goes in a sim-kit PR like
any other, and is noted in the kit's release note when it ships with one.
