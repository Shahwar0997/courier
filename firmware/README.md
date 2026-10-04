# firmware/ — the program that runs on your robot (from Stop 3)

**Firmware** is the program on the robot's own chip, an ESP32 microcontroller. It's written in
C++ and built with **PlatformIO**, a tool that compiles code for microcontrollers.

| Path | What it is |
| --- | --- |
| `platformio.ini` | Which board to build for. Two *environments*: `sim` (the simulator) and `kit` (the real robot, only if you take the optional last stop, Stop 24). A third, `native`, runs the tests in `test/` (Stop 5). Also the libraries PlatformIO downloads for you (ArduinoJson, Stop 6). |
| `src/main.cpp` | Your firmware: `setup()` runs once at power-on, then `loop()` runs forever. Empty until Stop 3. |
| `src/command_server.h`, `src/command_server.cpp` | Pip's command server (Stop 6): it answers your `courier` tool over Wi-Fi. The header lists what it needs; the `.cpp` is empty until Stop 6. |
| `lib/courier/courier_pins.h` | Which chip pin is wired to the LED and the motors, for the simulator and for the kit. |
| `lib/odometry/` | Your odometry library (Stop 5): wheel ticks added up into where the robot is. No hardware calls, so it can be tested on this computer. |
| `test/test_odometry/` | Its tests (Stop 5), switched off until then. |
| `lib/arduino_sim/` | A stand-in for the chip's Arduino functions, so `sim` builds run here in robot time. You don't need to read it. |

Commands (from the top folder of your repo):

    pio run -e sim -d firmware            # build for the simulator (Stop 3)
    pio run -e sim -d firmware -t exec    # build, then run 10 seconds of robot time (Stop 3)
    npm run sim                           # build, then drive it in the simulator (needs `npm ci` once)
    pio test -e native -d firmware        # run the tests in test/ on this computer (Stop 5)

**From Stop 4 on, build and run with `npm run sim`.** Stop 4 brings in `courier.h` (the motors and
the distance sensor), and later stops encoders and Wi-Fi. Only the simulator's own compiler has
them; `pio run -e sim` and `lib/arduino_sim/` stop at Stop 3. CI follows the same rule.

PlatformIO puts what it builds in `firmware/.pio/`; Git ignores that folder.
