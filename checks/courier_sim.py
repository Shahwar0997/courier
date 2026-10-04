"""Runs your firmware in the Courier simulator (tools/courier/) for the stop checks.

The stop checks (check_stop_04.py and later) import this file; you don't run it yourself. It
needs Node 24 and `npm ci` (the devcontainer and CI have both). It builds your firmware/ folder
once into WebAssembly, then runs that build as often as a check needs:

    wasm, error = build(tmp)           # error is the compiler's message, or None
    run = run_firmware(wasm, tmp, "--real-world", "1")
    run.report["goal"]["distanceCm"], run.events, run.serial

The same simulator runs `npm run sim` and the sims on the website, so what CI sees is what you see.
"""

import json
import math
import os
import queue
import re
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLI = ROOT / "tools" / "courier" / "cli.mjs"
OFFICE = ROOT / "maps" / "office.txt"
TILE_CM = 30
HALF_TILE_CM = TILE_CM / 2
START = (1, 1)  # Pip's start tile (row, column): S on the office map
# Whether arriving with the real-world switch on (Stop 6) fails a check, or only warns. Off until
# a reference solution delivers on the checks' seeds (Stop 5 measured that it doesn't yet).
REAL_WORLD_ENFORCED = False
BUILD_SECONDS = 180  # a build takes about a second; this only stops a stuck compiler


def without_comments(code):
    code = re.sub(r"/\*.*?\*/", "", code, flags=re.S)
    return re.sub(r"//[^\n]*", "", code)


def firmware_code():
    """All of your firmware's own code (src/ and lib/, without the simulator's stand-in), comments removed."""
    files = sorted((ROOT / "firmware" / "src").rglob("*")) + sorted((ROOT / "firmware" / "lib").rglob("*"))
    texts = [
        p.read_text(errors="replace")
        for p in files
        if p.is_file() and p.suffix in (".c", ".cpp", ".h", ".hpp") and "arduino_sim" not in p.parts
    ]
    return without_comments("\n".join(texts))


def real_world_on():
    """Has Stop 5 started? From then on the real-world switch stays on, so the earlier stops'
    simulator checks run with it too (as check_stop_05.py decides: a test switched on in
    firmware/test/test_odometry/test_main.cpp, or firmware/lib/odometry/odometry.cpp written)."""
    tests = ROOT / "firmware" / "test" / "test_odometry" / "test_main.cpp"
    odometry = ROOT / "firmware" / "lib" / "odometry" / "odometry.cpp"
    switched_on = tests.exists() and re.search(r"RUN_TEST\s*\(", without_comments(tests.read_text()))
    written = odometry.exists() and "(void)dLeft;" not in odometry.read_text()
    return bool(switched_on or written)


def stop_6_started():
    """Has Stop 6 started? (as check_stop_06.py decides: a test switched on in cli/test_courier.py,
    or cli/courier.py written)."""
    tests = ROOT / "cli" / "test_courier.py"
    tool = ROOT / "cli" / "courier.py"
    switched_on = tests.exists() and re.search(r"^def test_\w+", tests.read_text(), flags=re.M)
    written = tool.exists() and 'print("not written yet")' not in tool.read_text()
    return bool(switched_on or written)


def office_route():
    """The route your planner prints for the office map, or None if it prints no route."""
    result = subprocess.run(
        [sys.executable, "planner/plan.py", str(OFFICE)], cwd=ROOT, capture_output=True, text=True, timeout=30
    )
    route = result.stdout.strip()
    return route if result.returncode == 0 and re.fullmatch(r"[NESW]+", route) else None


def joins_wifi():
    """Does your firmware call WiFi.begin (Stop 6, Step 1)? From then on it waits for commands."""
    return "WiFi.begin" in firmware_code()


def asked_route():
    """From Stop 6, Pip drives only when it's asked: by a drive command, or by the simulator
    (courier::route()). So the office drives ask for your planner's route: ["--route", route], or [].
    Stop 6 counts as begun here once the tool or its tests are started, or once the firmware joins
    the Wi-Fi (Step 1, before the tool), so a push in between doesn't turn stop-03 red."""
    route = office_route() if stop_6_started() or joins_wifi() else None
    return ["--route", route] if route else []


def pending(message):
    """Say what isn't checked yet: as a note on the CI run, or plainly on your computer."""
    print(f"::notice title=Not checked yet::{message}" if os.environ.get("GITHUB_ACTIONS") else f"Note: {message}")


def warn(message):
    """A result that doesn't fail the check (yet): a warning on the CI run, or plainly on your computer."""
    print(f"::warning title=Not failing yet::{message}" if os.environ.get("GITHUB_ACTIONS") else f"Warning: {message}")


def build(tmp):
    """Build firmware/ for the simulator. Returns (path to the .wasm, None) or (None, the compiler's output)."""
    out = Path(tmp) / "firmware.wasm"
    try:
        result = subprocess.run(
            ["node", str(CLI), "build", "firmware", "--out", str(out)],
            cwd=ROOT, capture_output=True, text=True, timeout=BUILD_SECONDS,
        )
    except subprocess.TimeoutExpired:
        return None, f"The compiler didn't finish within {BUILD_SECONDS} s. Run `npm run sim` to see where it stops."
    if result.returncode != 0:
        return None, (result.stdout + result.stderr).strip()
    return out, None


class Run:
    """One simulator run: its exit code, report (--json), event log (--events) and printed output."""

    def __init__(self, code, report, events, output):
        self.code, self.report, self.events, self.output = code, report, events, output

    @property
    def serial(self):
        """Your firmware's serial lines, as (milliseconds since power-on, text)."""
        return [(t, text) for t, kind, text in self.events if kind == "serial"]

    def true_offset_cm(self):
        """Where Pip really is, in cm east and north of the start tile's centre (the simulator's truth)."""
        pose = self.report["pose"]
        east = pose["x"] * 100 - (START[1] + 0.5) * TILE_CM
        north = (START[0] + 0.5) * TILE_CM - pose["y"] * 100  # rows grow southwards
        return east, north


def read_events(path):
    events = []
    for line in Path(path).read_text().splitlines() if Path(path).exists() else []:
        if " " not in line:
            continue  # a stopped run (the watchdog) can leave an empty line
        stamp, kind, *rest = line.split(" ", 2)
        events.append((int(stamp[1:]), kind, rest[0] if rest else ""))
    return events


def run_firmware(wasm, tmp, *options, seconds=60, name="run", office=True):
    """Run a build for `seconds` of robot time (fast: not in real time).

    On the office map, unless `office` is False: the test drives (--square, --straight N) bring
    their own open floor. From Stop 6, an office run asks for your planner's route (asked_route).
    """
    report_path, events_path = Path(tmp) / f"{name}.json", Path(tmp) / f"{name}-events.txt"
    where = ["--map", str(OFFICE), *asked_route()] if office else []
    result = subprocess.run(
        ["node", str(CLI), "run", str(wasm), *where, "--seconds", str(seconds),
         "--json", str(report_path), "--events", str(events_path), *options],
        cwd=ROOT, capture_output=True, text=True, timeout=seconds + 60,
    )
    report = json.loads(report_path.read_text()) if report_path.exists() else None
    return Run(result.returncode, report, read_events(events_path), result.stdout + result.stderr)


NOSE_M = 0.09  # Pip's nose is 9 cm ahead of its centre (its radius)
STOP_MS = 10  # both motors at 0 for at least this long counts as a stop (not just between two moves)


def stops(run):
    """When your firmware stopped both motors and later started again: [(from ms, to ms)].

    Read from the event log (`motors L R`). A stop shorter than STOP_MS (a move ending and the
    next one starting in the same pass of loop()) doesn't count, and neither does the last one,
    which lasts to the end of the run.
    """
    found, since = [], None
    for t, kind, text in run.events:
        if kind != "motors":
            continue
        if text.split() == ["0", "0"]:
            since = t if since is None else since
        elif since is not None:
            if t - since >= STOP_MS:
                found.append((since, t))
            since = None
    return found


def sample_at(report, t_ms):
    """The trace sample (every 50 ms) closest to t_ms, or None if the run has no trace (the watchdog stopped it)."""
    if not report["trace"]:
        return None
    return min(report["trace"], key=lambda s: abs(s["t"] - t_ms * 1000))


def box_gap_cm(sample, box):
    """How far Pip's nose is from a box's side (cm) at one trace sample; 0 if it's touching or inside."""
    nx = sample["x"] + NOSE_M * math.cos(sample["th"])  # th 0 faces east, +90° south (rows grow south)
    ny = sample["y"] + NOSE_M * math.sin(sample["th"])
    dx = max(box["x0"] - nx, 0, nx - box["x1"])
    dy = max(box["y0"] - ny, 0, ny - box["y1"])
    return math.hypot(dx, dy) * 100


def box_there(box, t_us):
    return box["from"] * 1e6 <= t_us and (box["to"] is None or t_us < box["to"] * 1e6)


class LiveRobot:
    """Your firmware running in real time with its Wi-Fi ports on localhost (`run --listen`, Stop 6).

    Use it with `with`: it stops the simulator (as Ctrl+C would) when the block ends, then
    `.result` holds the Run (report and events) of the whole session.
    """

    PORT_LINE = re.compile(r"port (\d+) is at localhost:(\d+)")

    def __init__(self, wasm, tmp, *options):
        self.wasm, self.tmp, self.options = wasm, Path(tmp), options
        self.lines, self.ports, self.result = queue.Queue(), {}, None

    def __enter__(self):
        self.proc = subprocess.Popen(
            ["node", str(CLI), "run", str(self.wasm), "--map", str(OFFICE), "--listen",
             "--json", str(self.tmp / "live.json"), "--events", str(self.tmp / "live-events.txt"), *self.options],
            cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        )
        self.output = []
        threading.Thread(target=self._read, daemon=True).start()
        return self

    def _read(self):
        for line in self.proc.stdout:
            self.output.append(line)
            match = self.PORT_LINE.search(line)
            if match:
                self.ports[int(match.group(1))] = int(match.group(2))
            self.lines.put(line)
        self.lines.put(None)

    def wait_for_port(self, port, seconds):
        """The localhost port the robot's `port` is forwarded to, once it listens; None if it doesn't in time.

        Waits for the simulator to say so rather than trying to connect: on a Mac, something else
        (AirPlay) answers on port 7000 when the robot doesn't.
        """
        deadline = time.monotonic() + seconds
        while port not in self.ports:
            left = deadline - time.monotonic()
            if left <= 0:
                return None
            try:
                if self.lines.get(timeout=left) is None:  # the simulator ended
                    return self.ports.get(port)
            except queue.Empty:
                return None
        return self.ports[port]

    def __exit__(self, *exc):
        if self.proc.poll() is None:
            self.proc.terminate()  # SIGTERM: the simulator stops the robot and writes its report
        try:
            code = self.proc.wait(timeout=20)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            code = self.proc.wait()
        report_path = self.tmp / "live.json"
        report = json.loads(report_path.read_text()) if report_path.exists() else None
        self.result = Run(code, report, read_events(self.tmp / "live-events.txt"), "".join(self.output))
        return False
