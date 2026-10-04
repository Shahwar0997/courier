"""Stop 3 check: does your firmware say hello, blink, and have your planner's route?

Run it from the top folder of your repo, after building the firmware:
    pio run -e sim -d firmware
    python3 checks/check_stop_03.py

Until setup() or loop() in firmware/src/main.cpp has code in it, Stop 3 hasn't started, so it
says so and passes. CI runs it as job stop-03 (after checking that the firmware builds, with
`python3 checks/check_stop_03.py --build`).

From Stop 4 on (your firmware includes courier.h, or is split into motors and sensors), the
simulator's compiler builds it instead, the one `npm run sim` uses (needs `npm ci`), and this
check runs that build in the simulator: `pio run -e sim` and its stand-in, lib/arduino_sim, are
for Stop 3's firmware only. From then on the LED only has to come on: Stop 4
keeps it steady while Pip drives and blinks it while Pip waits, and Stop 4's check covers that.
"""

import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import courier_sim

ROOT = Path(__file__).resolve().parent.parent
MAIN_CPP = ROOT / "firmware" / "src" / "main.cpp"
PINS = ROOT / "firmware" / "lib" / "courier" / "courier_pins.h"
PROGRAM = ROOT / "firmware" / ".pio" / "build" / "sim" / "program"
ROBOT_TIME_MS = 10000
SPLIT = ["motors.h", "motors.cpp", "sensors.h", "sensors.cpp"]  # Stop 4's files
SIMULATOR_ONLY = re.compile(r"#\s*include\s*[<\"](courier|WiFi)\.h[>\"]")  # not in lib/arduino_sim
NO_NPM = "The simulator's compiler isn't installed on this computer yet. Run `npm ci` once, then try again."
TIP = "  Tip: C++ errors point at the line *after* a missing ; more often than not."


def without_comments(code):
    code = re.sub(r"/\*.*?\*/", "", code, flags=re.S)
    return re.sub(r"//[^\n]*", "", code)


def body_of(code, name):
    """The text between the braces of `void name() { … }`, or None if it isn't there."""
    match = re.search(r"void\s+" + name + r"\s*\(\s*\)\s*\{", code)
    if not match:
        return None
    depth, start = 1, match.end()
    for i in range(start, len(code)):
        depth += {"{": 1, "}": -1}.get(code[i], 0)
        if depth == 0:
            return code[start:i]
    return None


def started(code):
    return any((body_of(code, name) or "").strip() for name in ("setup", "loop"))


def sim_led_pin():
    sim_part = PINS.read_text().split("#else")[0]
    return int(re.search(r"LED_PIN\s*=\s*(\d+)", sim_part).group(1))


def run_firmware():
    """Run the built firmware for ROBOT_TIME_MS of robot time; return its events."""
    with tempfile.TemporaryDirectory() as tmp:
        log = Path(tmp) / "events.txt"
        env = dict(os.environ, COURIER_SIM_MS=str(ROBOT_TIME_MS), COURIER_SIM_EVENTS=str(log))
        try:
            subprocess.run([str(PROGRAM)], env=env, timeout=15, check=False, stdout=subprocess.DEVNULL)
        except subprocess.TimeoutExpired:
            return None
        events = []
        for line in log.read_text().splitlines() if log.exists() else []:
            stamp, kind, *rest = line.split(" ", 2)
            events.append((int(stamp[1:]), kind, rest[0] if rest else ""))
        return events


def simulator_compiler():
    """From Stop 4 on, the simulator's compiler builds your firmware, not `pio run -e sim`."""
    split = any((ROOT / "firmware" / "src" / name).exists() for name in SPLIT)
    return split or bool(SIMULATOR_ONLY.search(courier_sim.firmware_code()))


def build_firmware():
    """CI's "firmware builds" step: `pio run -e sim` for Stop 3's firmware, the simulator's compiler from Stop 4 on."""
    if not simulator_compiler():
        if subprocess.call(["pio", "run", "-e", "sim", "-d", "firmware"], cwd=ROOT) != 0:
            print("✗ The firmware didn't build. The first error above has its file and line.")
            print(TIP)
            return 1
        return 0
    if not (ROOT / "node_modules" / "@yowasp" / "clang").exists():
        print(f"✗ {NO_NPM}")
        return 1
    with tempfile.TemporaryDirectory() as tmp:
        _, error = courier_sim.build(tmp)
    if error:
        print(error)  # the simulator's compiler: "✗ The firmware didn't build: …", its file and line, and the tip
        return 1
    print("✓ Your firmware builds with the simulator's compiler (from Stop 4 on, the one `npm run sim` uses).")
    return 0


def run_in_simulator():
    """From Stop 4 on: build with the simulator's compiler and run it for ROBOT_TIME_MS; (events, problem)."""
    if not (ROOT / "node_modules" / "@yowasp" / "clang").exists():
        return None, NO_NPM
    with tempfile.TemporaryDirectory() as tmp:
        wasm, error = courier_sim.build(tmp)
        if error:
            return None, error  # the compiler's own "✗ The firmware didn't build: …", with its file and line
        run = courier_sim.run_firmware(wasm, tmp, seconds=ROBOT_TIME_MS // 1000, name="stop-03")
    if run.report is None:
        return None, f"The simulator didn't finish:\n{run.output.strip()}"
    if run.report.get("reason") == "watchdog":
        return None, (
            "Your firmware got stuck: robot time stopped moving. Is `setup()` or `loop()` stuck in a loop that never"
            " reads the sensor or calls delay()?"
        )
    return run.events, None


def planner_route():
    result = subprocess.run(
        [sys.executable, "planner/plan.py", "maps/office.txt"], cwd=ROOT, capture_output=True, text=True
    )
    return result.stdout.strip() if result.returncode == 0 else None


def main():
    code = without_comments(MAIN_CPP.read_text())
    if not started(code):
        print("Stop 3 hasn't started yet: setup() and loop() in firmware/src/main.cpp are empty. Nothing to check.")
        return 0
    stop4 = simulator_compiler()
    if stop4:
        events, problem = run_in_simulator()
        if problem:
            print(problem if problem.startswith("✗") else f"✗ {problem}")
            return 1
    elif not PROGRAM.exists():
        print("✗ The firmware isn't built yet. Run: pio run -e sim -d firmware")
        return 1
    else:
        events = run_firmware()
        if events is None:
            print("✗ Your firmware got stuck: robot time stopped moving. Is `setup()` stuck in a loop that never calls delay()?")
            return 1

    failed = []

    said_hello = any(kind == "serial" and "Courier ready" in text and t <= 2000 for t, kind, text in events)
    if not said_hello:
        failed.append("Nothing on the serial monitor. Is `Serial.begin(115200)` in `setup()`?")

    led = f"{sim_led_pin()} "
    levels = [text.split()[1] for t, kind, text in events if kind == "digitalWrite" and text.startswith(led)]
    toggles = sum(1 for a, b in zip(levels, levels[1:]) if a != b)
    if stop4 and "HIGH" not in levels:
        failed.append(
            "The LED never came on. Once your firmware uses courier.h (Stop 4), it's checked as steady while Pip"
            " drives: check `pinMode(LED_PIN, OUTPUT)`"
        )
    elif not stop4 and toggles < 8:
        failed.append("The LED didn't blink. Check `pinMode(LED_PIN, OUTPUT)` and the `loop()`")

    route = re.search(r"\bROUTE(?:\[\s*\])?\s*=\s*\"([NESW]*)\"", code)
    if not route:
        failed.append(
            "No ROUTE in main.cpp yet. Add `const char* ROUTE = \"…\";` with the moves your planner prints"
            " (walkthrough step 8)"
        )
    elif route.group(1) != planner_route():
        failed.append("ROUTE in main.cpp isn't the route your planner prints")
    # "Drives the route" (ends within half a tile of G without touching a wall) needs the
    # Courier simulator's robot world; it's added here when that ships.

    for message in failed:
        print(f"✗ {message}")
    if failed:
        return 1
    light = "turns its LED on" if stop4 else "blinks"
    print(f"✓ Stop 3: your firmware says hello, {light}, and its ROUTE matches your planner.")
    return 0


if __name__ == "__main__":
    sys.exit(build_firmware() if sys.argv[1:] == ["--build"] else main())
