"""Stop 5 check: do your odometry tests pass on this computer?

Run it from the top folder of your repo:
    python3 checks/check_stop_05.py

It runs `pio test -e native -d firmware`: the tests in firmware/test/, without the simulator.
Until you've switched on a test in firmware/test/test_odometry/test_main.cpp or started writing
firmware/lib/odometry/odometry.cpp, Stop 5 hasn't started, so it says so and passes. Once it
has, the starter's four tests must be switched on and pass, along with any you add. CI runs it
as job stop-05.

Then it builds your firmware with the Courier simulator's compiler (tools/courier/, the one `npm
run sim` uses; needs `npm ci`) and runs the simulator's two test drives with the real-world switch
on, seeds 1, 2 and 3. Your firmware drives them when it reads `courier::route()` in setup() (see
firmware/src/main.cpp).

The square (`node tools/courier/cli.mjs run firmware --real-world N --square`):
- calibrated square: it ends within SQUARE_CM of where it started;
- honest odometry: the last `pose e=… n=… h=…` line your firmware prints is within HONEST_CM of
  where Pip really is, and its heading within HONEST_DEG of the way Pip really faces (the square
  ends where it started, so a pose that never updates is only caught by its heading);
- keeps looking: loop() never goes more than MAX_LOOP_GAP_MS without returning (Stop 4's check;
  pause after a stop with a clock check, not delay()).

Ten tiles straight (`node tools/courier/cli.mjs run firmware --real-world N --straight 10`):
- calibrated tile: Pip really drives 300 cm, give or take TILE_SPARE_CM;
- drives straight: it ends facing within STRAIGHT_DEG of east;
- steady speed: while it drives, each wheel's speed, averaged over every 200 ms, stays within
  STEADY_PCT of the run's usual speed. Not checked yet (STEADY_ENFORCED), only noted: Stop 4's
  sensor reads (up to 25 ms each) stretch the controller's 50 ms windows. A controller that
  assumes exactly 50 ms then swings about 12%; one that scales each window's ticks by how long it
  really lasted stays within about 5–7%. The limit is being re-measured with that in the walkthrough.
- honest odometry after ten tiles: the last pose is within STRAIGHT_HONEST_CM of the truth. A
  warning for now: it catches a pose that never updates (the square ends where it started, so
  there it can't), and isn't in Stop 5's design table yet.
Before a drive's rows, Pip has to have driven about the drive's length (DRIVEN_SHARE): if it
didn't, the calibration hints wouldn't fit, so the check says so instead.

The office route isn't driven here: with the switch on, reaching G is luck of the seed (Stop 5
says so), so Stop 5 checks the square and the straight run instead.
"""

import re
import subprocess
import sys
import tempfile
from pathlib import Path

from courier_sim import build, firmware_code, pending, run_firmware, warn, without_comments

ROOT = Path(__file__).resolve().parent.parent
TESTS = ROOT / "firmware" / "test" / "test_odometry" / "test_main.cpp"
ODOMETRY = ROOT / "firmware" / "lib" / "odometry" / "odometry.cpp"
STARTER_TESTS = ["test_straight", "test_turn_in_place", "test_quarter_turn", "test_curve"]
STUB_LINE = "(void)dLeft;"  # in the starter's odometry.cpp until you write step()
SEEDS = [1, 2, 3]  # three seeds, so constants tuned to a single run don't pass by luck
HONEST_CM = 5  # "honest odometry" on the square (Stop 5's design; the reference: 1.4–2.9 cm)
HONEST_DEG = 10  # and its heading (the walkthrough: 2.4–5.5°; a pose that never updates: 85° or more)
SQUARE_CM = 5  # "calibrated square": the design's goal, the same as Make it move's try-it
SQUARE_SECONDS = 60  # the square takes about 20 s of robot time
MAX_LOOP_GAP_MS = 50  # "keeps looking": Stop 4's check, on the square
STRAIGHT_TILES = 10
STRAIGHT_SECONDS = 40  # ten tiles take about 15 s of robot time
TILE_SPARE_CM = 6  # "calibrated tile": 10 tiles come out 300 ± 6 cm (the reference: 300.5–301.3; 30 / CM_PER_TICK: 322)
STRAIGHT_DEG = 12  # "drives straight" (pilot decision): correct firmware up to 11.2° off across 720 measured runs; no LEVEL 12.3° or more
STEADY_PCT = 8  # "steady speed", over 200 ms: the reference ≤ 4.9%; KP × 10: 9.8–11.6%
MOVING_CMPS = 20  # a wheel faster than this is driving
STEADY_ENFORCED = False  # steady speed is only noted until its limit is re-measured with Stop 4's sensor code in
STRAIGHT_HONEST_CM = 25  # the pose after ten tiles (the reference: 5–13 cm; a pose that never updates: 300)
DRIVEN_SHARE = 0.5  # Pip drove at least half and at most one and a half times the drive's length
SQUARE_LENGTH_CM = 4 * 30
RUN = "node tools/courier/cli.mjs run firmware"  # the hints' command: works with or without `npm run sim`'s --map
ROUTE_LINE = "const char *asked = courier::route(); if (asked) route = asked;"


def test_drive(wasm, tmp, seed, drive, seconds):
    """One test drive with the switch on: (report, None), or (None, why it didn't finish)."""
    run = run_firmware(wasm, tmp, "--real-world", str(seed), *drive, seconds=seconds, office=False, name=f"{drive[0][2:]}-{seed}")
    what = "square" if drive == ["--square"] else "straight run"
    if run.report is None or not run.report.get("testDrive"):
        return None, f"Seed {seed}: the {what} didn't finish:\n{run.output.strip()}"
    if run.report["hit"]:
        hit = run.report["hit"]
        return None, f"Seed {seed}: Pip hit a {hit.get('thing', 'wall')} during the {what}, after move {hit['move']}"
    if not run.report["ok"]:
        return None, f"Seed {seed}: the simulator stopped your firmware: {run.report['message']}"
    return run.report, None


def drove_it(report, seed, length, how):
    """Did Pip drive about the test drive's length? [] or one (row, message) pair."""
    driven = report.get("travelledCm") or 0
    if abs(driven - length) <= DRIVEN_SHARE * length:
        return []
    return [("Drives the test drive", f"Seed {seed}: Pip drove {driven:.0f} cm, but this test drive is {length} cm."
                                      " Is it driving the route `courier::route()` asks for, all the way?"
                                      f" (`{RUN} {how}`)")]


def heading_gap(a, b):
    """How far apart two compass headings are, in degrees, around the circle (0–180)."""
    d = abs(a - b) % 360
    return min(d, 360 - d)


def square_rows(report, seed):
    """Calibrated square, honest odometry and keeps looking, on one square run: (row, message) pairs."""
    found = drove_it(report, seed, SQUARE_LENGTH_CM, f"--real-world {seed} --square")
    if found:
        return found
    gap = report["testDrive"]["endGapCm"]
    if gap > SQUARE_CM:
        found.append(("Calibrated square", f"Seed {seed}: the square ended {gap:.1f} cm from the start. Re-calibrate TICKS_PER_TURN"
                                           f" (`{RUN} --real-world {seed} --square`)"))
    belief = report.get("belief")
    if not belief:
        found.append(("Honest odometry", f"Seed {seed}: no `pose e=… n=… h=…` line on the serial monitor. Print the pose every 500 ms, as the walkthrough does"))
    elif report["beliefGapCm"] > HONEST_CM:
        found.append(("Honest odometry", f"Seed {seed}: Pip believed it was {belief['e']:.0f} cm east and {belief['n']:.0f} cm north"
                                         f" of the start, but it was {report['beliefGapCm']:.0f} cm away from there. Calibrate WHEELBASE_CM"))
    elif heading_gap(belief["h"], report["truth"]["h"]) > HONEST_DEG:
        found.append(("Honest odometry", f"Seed {seed}: Pip believed it faced {belief['h'] % 360:.0f}°, but it faced"
                                         f" {report['truth']['h'] % 360:.0f}°. Is the pose updated as Pip drives?"
                                         " Odometry adds up small moves"))
    loop = report.get("loopGap")
    if loop and loop["ms"] > MAX_LOOP_GAP_MS:
        found.append(("Keeps looking", f"Seed {seed}: loop() was busy for {loop['ms']:.0f} ms at {loop['fromMs'] / 1000:.1f} s."
                                       " Is there a delay() left? Pause with a clock check"))
    return found


def worst_swing(wheels):
    """Steady speed: the 200 ms average furthest from the run's usual speed, as (wheel, % of usual, t in s), or None.

    Only while driving steadily: from 2 s on, both wheels above MOVING_CMPS for 300 ms before
    and 50 ms after. The usual speed is the median of each wheel's speed then, averaged over both.
    """
    moving = [w["cmps"][0] > MOVING_CMPS and w["cmps"][1] > MOVING_CMPS for w in wheels]
    steady = [i for i in range(6, len(wheels) - 1) if wheels[i]["t"] >= 2e6 and all(moving[i - 6 : i + 2])]
    if not steady:
        return None
    medians = [sorted(wheels[i]["cmps"][side] for i in steady)[len(steady) // 2] for side in (0, 1)]
    usual = sum(medians) / 2
    swings = [
        (abs(avg / usual - 1), side, avg / usual * 100, wheels[i]["t"] / 1e6)
        for i in steady for side in (0, 1)
        for avg in [sum(wheels[i - k]["cmps"][side] for k in range(4)) / 4]
    ]
    _, side, pct, t = max(swings)
    return ("left", "right")[side], pct, t


def straight_rows(report, seed):
    """Calibrated tile, drives straight, honest odometry and steady speed, on one straight run: (row, message) pairs."""
    how = f"--real-world {seed} --straight {STRAIGHT_TILES}"
    found = drove_it(report, seed, STRAIGHT_TILES * 30, how)
    if found:
        return found
    drive = report["testDrive"]
    if drive["trueCm"] > STRAIGHT_TILES * 30 + TILE_SPARE_CM:
        found.append(("Calibrated tile", f"Seed {seed}: {STRAIGHT_TILES} tiles came out {drive['trueCm']:.1f} cm."
                                         f" Take the wheels' roll-on off TICKS_PER_TILE (`{RUN} {how}`)"))
    elif drive["trueCm"] < STRAIGHT_TILES * 30 - TILE_SPARE_CM:
        found.append(("Calibrated tile", f"Seed {seed}: {STRAIGHT_TILES} tiles came out {drive['trueCm']:.1f} cm, short of 300:"
                                         f" TICKS_PER_TILE is too small (`{RUN} {how}`)"))
    if abs(drive["headingOffDeg"]) > STRAIGHT_DEG:
        found.append(("Drives straight", f"Seed {seed}: after {STRAIGHT_TILES} tiles Pip faced {abs(drive['headingOffDeg']):.1f}° off its line"
                                         f" (straight is within {STRAIGHT_DEG}°). Is something holding the two wheels level?"))
    if report.get("belief") and report["beliefGapCm"] > STRAIGHT_HONEST_CM:
        found.append(("Honest after ten tiles", f"Seed {seed}: after {STRAIGHT_TILES} tiles Pip believed it was"
                                                f" {report['belief']['e']:.0f} cm east and {report['belief']['n']:.0f} cm north"
                                                f" of the start, but it was {report['beliefGapCm']:.0f} cm away from there."
                                                " Does the pose add up every move?"))
    if STEADY_ENFORCED:
        swing = worst_swing(report.get("wheels") or [])
        if swing is None:
            found.append(("Steady speed", f"Seed {seed}: Pip never drove steadily (both wheels above {MOVING_CMPS} cm/s) on the straight run"))
        elif abs(swing[1] - 100) > STEADY_PCT:
            found.append(("Steady speed", f"Seed {seed}: the {swing[0]} wheel swung to {swing[1]:.0f}% of its usual speed at {swing[2]:.1f} s."
                                          " Is the gain too high?"))
    return found


def real_world():
    """Stop 5's simulator rows, with the switch on. Returns (failure messages, build error or None)."""
    if "courier::route" not in firmware_code():
        return [
            "Your firmware doesn't drive the simulator's test drives. In setup(), read the route it asks for:"
            f" `{ROUTE_LINE}` (with your own route variable), then `{RUN} --real-world --square`"
        ], None
    found = []
    with tempfile.TemporaryDirectory() as tmp:
        wasm, error = build(tmp)
        if error:
            return [], error
        for seed in SEEDS:
            report, problem = test_drive(wasm, tmp, seed, ["--square"], SQUARE_SECONDS)
            found += [("Calibrated square", problem)] if problem else square_rows(report, seed)
            report, problem = test_drive(wasm, tmp, seed, ["--straight", str(STRAIGHT_TILES)], STRAIGHT_SECONDS)
            found += [("Calibrated tile", problem)] if problem else straight_rows(report, seed)
    order = ["Drives the test drive", "Calibrated square", "Honest odometry", "Keeps looking", "Calibrated tile",
             "Drives straight", "Honest after ten tiles", "Steady speed"]
    failed = []
    for row, message in sorted(found, key=lambda f: order.index(f[0])):
        if row == "Honest after ten tiles":
            warn(f"{row}: {message} (not failing yet: this row isn't in Stop 5's design yet)")
        else:
            failed.append(f"{row}: {message}")
    if not STEADY_ENFORCED:
        pending("Steady speed isn't checked yet: its limit is being re-measured with Stop 4's sensor code in.")
    return failed, None


def main():
    tests = without_comments(TESTS.read_text()) if TESTS.exists() else ""
    switched_on = set(re.findall(r"RUN_TEST\s*\(\s*(\w+)\s*\)", tests))
    written = ODOMETRY.exists() and STUB_LINE not in ODOMETRY.read_text()
    if not switched_on and not written:
        print("Stop 5 hasn't started yet: no tests are switched on in firmware/test/test_odometry/test_main.cpp. Nothing to check.")
        return 0

    off = [name for name in STARTER_TESTS if name not in switched_on]
    if off:
        print(f"✗ Switch on the starter's odometry tests too (remove the // and keep their RUN_TEST lines): {', '.join(off)}")
        return 1

    if subprocess.call(["pio", "test", "-e", "native", "-d", "firmware"], cwd=ROOT) != 0:
        print("✗ Stop 5: some odometry tests fail. Each failure above says what went wrong, with its line.")
        return 1

    failed, error = real_world()
    if error:
        print(error)  # the compiler's own "✗ The firmware didn't build: …", with its file and line
        return 1
    if failed:
        for message in failed:
            print(f"✗ {message}")
        return 1

    print(
        "✓ Stop 5: your firmware builds and your odometry tests pass. With the real-world switch on, seeds 1–3:"
        f" the square ends within {SQUARE_CM} cm and the square's pose is honest, loop() keeps looking, and {STRAIGHT_TILES}"
        f" tiles come out 300 ± {TILE_SPARE_CM} cm and straight."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
