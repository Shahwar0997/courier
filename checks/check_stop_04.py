"""Stop 4 check: is your firmware split into motors, sensors and main, and does it react to a box?

Run it from the top folder of your repo:
    python3 checks/check_stop_04.py

Until firmware/src/ has a motors or sensors file, Stop 4 hasn't started, so it says so and
passes. CI runs it as job stop-04.

It builds your firmware with the Courier simulator's compiler (tools/courier/, the one `npm run
sim` uses; needs `npm ci`), then runs it there on the office map:
- still delivers: no box; ends within half a tile of G without touching anything;
- stops for the box: a box at row 4, column 8 from 0 s to 12 s (`npm run sim -- --box 4,8@0-12`).
  Pip never touches it, stops with at least 5 cm to spare, blinks the LED at least twice while it
  waits, then carries on to G;
- steady under noise: the same with sensor noise on, seeds 1, 2 and 3 (`--noise sensor --seed N`).
  Pip stops for the box once, and never for a −1 (no echo);
- keeps looking: in all of those runs, loop() never goes more than 50 ms without returning.

It also runs walkthrough step 9's box (set down mid-tile, `--box 4,8.31@8.67-11.67`): Pip should
drive only the rest of the tile after it and end on G. That one is a warning for now.

From Stop 5 on, the real-world switch stays on, so these runs use it too (`--real-world N`, seeds
1-3, which brings sensor noise with it). Stop 5's calibration is made with the switch on, and it
over-turns on a perfect floor.
- still delivers: the office route with the switch on. Reaching G is luck of the seed (Stop 5
  says so), so it's a warning that doesn't fail yet (REAL_WORLD_ENFORCED in courier_sim.py);
- stops for the box: on Stop 5's straight test drive (`--straight 10`, no walls to meet first),
  with a box on row 4, column 6 that stays until 3 s after Pip, driving that seed without a box,
  gets near it. Pip must not touch it, must stop with 5 cm to spare, blink while it waits, and
  carry on: the ten tiles come out within 5 cm of the same seed's run without the box (how far
  they go is Stop 5's calibrated tile). If no seed gets to the box, that fails too, and so does
  firmware that doesn't drive the test drive (no `courier::route()`, or Pip doesn't drive about 300 cm). Pip's short pause after every
  move (Stop 5) isn't its stop for the box: that's the longest stop in front of it;
- keeps looking still holds on every run.
Not run with the switch on: the stop-and-start count, "no extra stops for a −1" and the mid-tile
box. With noise on every run there's no quiet run to compare with, and they can't tell correct
firmware from a stutter there. Stop 4's own runs (before Stop 5) still check them.
"""

import re
import sys
import tempfile
from pathlib import Path

from courier_sim import (
    HALF_TILE_CM, REAL_WORLD_ENFORCED, TILE_CM, box_gap_cm, box_there, build, firmware_code, pending, real_world_on,
    run_firmware, sample_at, stops, warn, without_comments,
)

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "firmware" / "src"
SPLIT = ["motors.h", "motors.cpp", "sensors.h", "sensors.cpp"]
ROBOT_SECONDS = 60
BOX = "4,8@0-12"  # Stop 4's box: on move 10's tile, taken away at 12 s
# Walkthrough step 9's box, set down 20 cm ahead as move 10 starts: firmware that forgets msLeft
# drives a whole tile after it and ends far from G. Its times are fixed, so a robot at
# another speed meets it elsewhere: a warning until Learning Design settles it.
MID_TILE_BOX = "4,8.31@8.67-11.67"
NOISE_SEEDS = [1, 2, 3]
MAX_LOOP_GAP_MS = 50
SPARE_CM = 5  # the box check: Pip's nose stays at least this far from the box
NEAR_BOX_CM = 30  # standing still with its nose this close to a box counts as stopping for it
MIN_BLINKS = 2  # the LED comes on at least twice while Pip waits
SAME_STOP_MS = 300  # a stop with noise this close in time to one without noise is the same stop
# From Stop 5 (the real-world switch on), the box is on the straight test drive:
STRAIGHT_BOX_TILE = (4, 6)  # the straight drive's 6th tile (row, column)
BOX_WAIT_S = 3  # the box stays this long after Pip gets near it (Stop 4's box: about 3 s)
STRAIGHT_TILES = 10
BOX_EXTRA_CM = 5  # with the box, the ten tiles come out within this of the same seed's run without it
STRAIGHT_SECONDS = 40


def ends_on_g(report):
    """Did the run end within half a tile of G without touching anything? A message, or None."""
    hit = report["hit"]
    if hit:
        thing = hit.get("thing", "wall")
        if thing == "box":
            return f"Pip touched the box at {hit['t'] / 1e6:.1f} s"
        return f"Pip hit a {thing} after move {hit['move']} (row {hit['row']}, column {hit['col']})"
    if not report["ok"]:
        return f"The simulator stopped your firmware: {report['message']}"
    gap = report["goal"]["distanceCm"]
    if gap > HALF_TILE_CM:
        return f"It stopped {gap:.0f} cm from G"
    return None


def still_delivers(wasm, tmp):
    """Stop 4's "still delivers": the office route, no box, ends within half a tile of G. (run, message or None)."""
    run = run_firmware(wasm, tmp, seconds=ROBOT_SECONDS, name="no-box")
    if run.report is None:
        return run, f"The simulator didn't finish:\n{run.output.strip()}"
    problem = ends_on_g(run.report)
    if problem and not run.report["hit"] and run.report["ok"]:
        problem += (
            ". If Pip waits in front of a wall at the end of a move:"
            " is a wall past the end of the tile 'in the way'?"
        )
    return run, problem


def box_stops(run):
    """Your firmware's stops (both motors off, then on again), split: (in front of a box, elsewhere)."""
    report = run.report
    at_box, elsewhere = [], []
    for start, end in stops(run):
        sample = sample_at(report, start)
        near = [b for b in report["boxes"] if sample and box_there(b, start * 1000) and box_gap_cm(sample, b) <= NEAR_BOX_CM]
        (at_box if near else elsewhere).append((start, end))
    return at_box, elsewhere


def stops_for_box(run):
    """Stop 4's "stops for the box", for one run with the box. A list of messages (empty: passed)."""
    report = run.report
    if report is None:
        return [f"The simulator didn't finish:\n{run.output.strip()}"]
    problems = []
    there = [s for s in report["trace"] if any(box_there(b, s["t"]) for b in report["boxes"])]
    closest = min(
        ((box_gap_cm(s, b), s["t"]) for s in there for b in report["boxes"] if box_there(b, s["t"])),
        default=None,
    )
    hit = report["hit"]
    if hit and hit.get("thing") == "box":
        return [f"Pip touched the box at {hit['t'] / 1e6:.1f} s"]
    if closest and closest[0] < SPARE_CM:
        problems.append(f"Pip stopped {closest[0]:.1f} cm from the box (at {closest[1] / 1e6:.1f} s); give it at least {SPARE_CM}")
    at_box, _ = box_stops(run)
    if not at_box and not hit:
        problems.append("Pip didn't stop for the box. Does it read the distance sensor every pass of loop()?")
    on_times = [c["t"] for c in report["led"]["changes"] if c["on"]]
    blinks = sum(1 for t in on_times for start, end in at_box if start * 1000 <= t <= end * 1000)
    if at_box and blinks < MIN_BLINKS:
        problems.append("The LED should blink while Pip waits")
    ending = ends_on_g(report)
    if ending:
        last = sample_at(report, report["virtualMs"])
        if last and not hit and report["ok"] and any(box_gap_cm(last, b) <= NEAR_BOX_CM for b in report["boxes"]):
            ending = "Pip didn't carry on after the box was moved"
        problems.append(ending)
    return problems


def loop_gap(runs):
    """Stop 4's "keeps looking": the longest loop() gap over all runs. A message, or None."""
    gaps = [run.report["loopGap"] for run in runs if run.report and run.report.get("loopGap")]
    if not gaps:
        return "loop() never ran. Does setup() finish?"
    worst = max(gaps, key=lambda g: g["ms"])
    if worst["ms"] > MAX_LOOP_GAP_MS:
        return f"loop() was busy for {worst['ms']:.0f} ms at {worst['fromMs'] / 1000:.1f} s. Is there a delay() left?"
    return None


def box_on_straight(boxed, plain, box):
    """Stop 4's box rows on one straight test drive with the box. A list of messages (empty: passed)."""
    report = boxed.report
    hit = report["hit"]
    if hit and hit.get("thing") == "box":
        return [f"Pip touched the box at {hit['t'] / 1e6:.1f} s"]
    if not hit and not report["ok"]:
        return [f"The simulator stopped your firmware: {report['message']}"]
    # Compared with the same seed's run without the box, not with 300 cm: how far your tiles
    # really go is Stop 5's calibrated tile. Stopping for the box adds a little coasting (0.6-2.9 cm
    # for the walkthrough's firmware); driving a whole tile again after it adds tens of cm.
    driven = report["testDrive"]["trueCm"] if report.get("testDrive") else 0
    without = plain.report["testDrive"]["trueCm"]
    last = sample_at(report, report["virtualMs"])
    if abs(driven - without) > BOX_EXTRA_CM and last and box_gap_cm(last, box) <= NEAR_BOX_CM:
        return ["Pip didn't carry on after the box was moved"]
    problems = []
    there = [(box_gap_cm(s, b), s["t"]) for s in report["trace"] for b in report["boxes"] if box_there(b, s["t"])]
    closest = min(there, default=None)
    if closest and closest[0] < SPARE_CM:
        problems.append(f"Pip stopped {closest[0]:.1f} cm from the box (at {closest[1] / 1e6:.1f} s); give it at least {SPARE_CM}")
    # The stop for the box is the longest one in front of it: Stop 5's own pause after a move can
    # also fall there, but it lasts SETTLE_MS (300 ms), while Pip waits for the box for seconds.
    near = []
    for start, end in stops(boxed):
        sample = sample_at(report, start)
        if sample and box_there(box, start * 1000) and box_gap_cm(sample, box) <= NEAR_BOX_CM:
            near.append((start, end))
    at_box = [max(near, key=lambda stop: stop[1] - stop[0])] if near else []
    if not at_box:
        problems.append("Pip didn't stop for the box. Does it read the distance sensor every pass of loop()?")
    on_times = [c["t"] for c in report["led"]["changes"] if c["on"]]
    blinks = sum(1 for t in on_times for start, end in at_box if start * 1000 <= t <= end * 1000)
    if at_box and blinks < MIN_BLINKS:
        problems.append("The LED should blink while Pip waits")
    if driven - without > BOX_EXTRA_CM:
        problems.append(
            f"With the box, the {STRAIGHT_TILES} tiles came out {driven:.1f} cm, {driven - without:.1f} cm more than"
            f" without it ({without:.1f} cm). After the box, does Pip drive only what was left of the tile (ticksLeft)?"
        )
    elif without - driven > BOX_EXTRA_CM:
        problems.append(
            f"With the box, the {STRAIGHT_TILES} tiles came out {driven:.1f} cm, {without - driven:.1f} cm less than"
            f" without it ({without:.1f} cm). After the box, does Pip finish the tile it was on?"
        )
    return problems


def real_world(message):
    """A real-world arrival result: it fails only once REAL_WORLD_ENFORCED is on. [message] or []."""
    if REAL_WORLD_ENFORCED:
        return [message]
    warn(f"{message} (not failing yet: arriving with the real-world switch on is still being measured)")
    return []


def real_world_checks(wasm, tmp):
    """Stop 4's simulator rows once Stop 5 has started: the real-world switch on, seeds 1-3. A list of messages."""
    row, col = STRAIGHT_BOX_TILE
    tile_box = {"x0": (col * TILE_CM + 5) / 100, "x1": (col * TILE_CM + 25) / 100,
                "y0": (row * TILE_CM + 5) / 100, "y1": (row * TILE_CM + 25) / 100}
    failed, runs, tried = [], [], 0
    drives_test = "courier::route" in firmware_code()
    if not drives_test:
        failed.append(
            "Stops for the box: your firmware doesn't drive the simulator's test drives, where Stop 4's box is tried"
            " from Stop 5 on. In setup(), read the route it asks for: `const char *asked = courier::route();"
            " if (asked) route = asked;` (with your own route variable)"
        )
    for seed in NOISE_SEEDS:
        office = run_firmware(wasm, tmp, "--real-world", str(seed), seconds=ROBOT_SECONDS, name=f"real-world-{seed}")
        runs.append(office)
        how = f"`npm run sim -- --real-world {seed}`"
        if office.report is None:
            failed.append(f"Still delivers ({how}): the simulator didn't finish:\n{office.output.strip()}")
        elif not office.report["hit"] and not office.report["ok"]:
            failed.append(f"Still delivers ({how}): The simulator stopped your firmware: {office.report['message']}")
        elif ends_on_g(office.report):
            failed += real_world(f"Still delivers ({how}): {ends_on_g(office.report)}")

        if not drives_test:
            continue
        drive = ["--real-world", str(seed), "--straight", str(STRAIGHT_TILES)]
        plain = run_firmware(wasm, tmp, *drive, seconds=STRAIGHT_SECONDS, office=False, name=f"straight-{seed}")
        runs.append(plain)
        not_tried = f"Stops for the box, seed {seed}: with the real-world switch on, Pip {{}}, so the box wasn't tried on this seed (not failing)"
        if plain.report is None or not plain.report.get("testDrive"):
            failed.append(f"Stops for the box, seed {seed}: the straight test drive didn't finish:\n{plain.output.strip()}")
            continue
        length = STRAIGHT_TILES * TILE_CM
        travelled = plain.report.get("travelledCm") or 0
        if abs(travelled - length) > length / 2:  # the same test as stop-05's before its rows
            failed.append(
                f"Stops for the box, seed {seed}: Pip drove {travelled:.0f} cm, but the straight test drive is {length} cm,"
                " so the box couldn't be tried. Is it driving the route `courier::route()` asks for, all the way?"
                f" (`node tools/courier/cli.mjs run firmware --real-world {seed} --straight {STRAIGHT_TILES}`)"
            )
            continue
        near = next((s["t"] for s in plain.report["trace"] if box_gap_cm(s, tile_box) <= NEAR_BOX_CM), None)
        if near is None:
            warn(not_tried.format(f"didn't get near row {row}, column {col} on the straight test drive"))
            continue
        box = f"{row},{col}@0-{near / 1e6 + BOX_WAIT_S:.2f}"
        how = f"`node tools/courier/cli.mjs run firmware --real-world {seed} --straight {STRAIGHT_TILES} --box {box}`"
        boxed = run_firmware(wasm, tmp, *drive, "--box", box, seconds=STRAIGHT_SECONDS, office=False, name=f"box-{seed}")
        runs.append(boxed)
        if boxed.report is None or not boxed.report["boxes"]:
            failed.append(f"Stops for the box ({how}): the simulator didn't finish:\n{boxed.output.strip()}")
            continue
        hit = boxed.report["hit"]
        if hit and hit.get("thing", "wall") != "box" and hit["t"] < near:
            warn(not_tried.format(f"hit a {hit.get('thing', 'wall')} before it got to the box"))
            continue
        tried += 1
        failed += [f"Stops for the box ({how}): {p}" for p in box_on_straight(boxed, plain, boxed.report["boxes"][0])]
    if not tried and not failed:
        failed.append(
            f"Stops for the box: on no seed did Pip get to the box on the straight test drive (row {row}, column {col}),"
            " so Stop 4's box wasn't tested. Does it drive the route `courier::route()` asks for?"
        )
    pending(
        "With the real-world switch on (from Stop 5), Stop 4's stop-and-start count, \"no extra stops for a −1\" and"
        " the mid-tile box aren't run: with noise on every run they can't tell correct firmware from a stutter."
        " Stop 4's own runs check them before Stop 5."
    )
    problem = loop_gap(runs)
    if problem:
        failed.append(f"Keeps looking: {problem}")
    return failed


def simulator_checks(wasm, tmp):
    """Stop 4's simulator rows. A list of messages (empty: all passed)."""
    if real_world_on():
        return real_world_checks(wasm, tmp)
    failed = []
    plain, problem = still_delivers(wasm, tmp)
    if problem:
        failed.append(f"Still delivers: {problem}")
        gap = loop_gap([plain])
        return failed + ([f"Keeps looking: {gap}"] if gap else [])  # the box runs drive the same route: fix this first

    boxed = run_firmware(wasm, tmp, "--box", BOX, seconds=ROBOT_SECONDS, name="box")
    failed += [f"Stops for the box (`npm run sim -- --box {BOX}`): {p}" for p in stops_for_box(boxed)]

    noisy = []
    ideal_elsewhere = box_stops(boxed)[1] if boxed.report else []
    for seed in NOISE_SEEDS:
        run = run_firmware(wasm, tmp, "--box", BOX, "--noise", "sensor", "--seed", str(seed), seconds=ROBOT_SECONDS, name=f"noise-{seed}")
        noisy.append(run)
        how = f"`npm run sim -- --box {BOX} --noise sensor --seed {seed}`"
        problems = stops_for_box(run)
        if run.report and not (run.report["hit"] or {}).get("thing") == "box":
            at_box, elsewhere = box_stops(run)
            if len(at_box) > 1:
                problems.append(
                    f"Pip stopped and started {len(at_box)} times in front of the box. Average the readings,"
                    " and go again only above a higher distance"
                )
            if len(elsewhere) > len(ideal_elsewhere):
                # The stops the noise-free run doesn't have (sensor noise only shifts a tick-driven run a little)
                extra = [a for a, _ in elsewhere if all(abs(a - b) > SAME_STOP_MS for b, _ in ideal_elsewhere)]
                when = f" (at {', '.join(f'{t / 1000:.1f} s' for t in extra[:3])})" if extra else ""
                problems.append(
                    f"Pip stopped {len(elsewhere) - len(ideal_elsewhere)} more time(s) where nothing was in the way"
                    f" than without noise{when}. A −1 means no echo, not something close"
                )
        failed += [f"Steady under noise ({how}): {p}" for p in problems]

    resumed = run_firmware(wasm, tmp, "--box", MID_TILE_BOX, seconds=ROBOT_SECONDS, name="mid-tile")
    if resumed.report is None:
        warn(f"Resumes the tile (`npm run sim -- --box {MID_TILE_BOX}`): the simulator didn't finish")
    else:
        problem = ends_on_g(resumed.report)
        if problem:
            warn(
                f"Resumes the tile (`npm run sim -- --box {MID_TILE_BOX}`): {problem}. After the box,"
                " does Pip drive only the rest of the tile (msLeft)? (Not failing yet.)"
            )

    problem = loop_gap([plain, boxed, *noisy, resumed])
    if problem:
        failed.append(f"Keeps looking: {problem}")
    return failed


def main():
    if not any((SRC / name).exists() for name in SPLIT):
        print("Stop 4 hasn't started yet: firmware/src/ has no motors or sensors files. Nothing to check.")
        return 0

    if not (SRC / "main.cpp").exists():
        print("✗ firmware/src/main.cpp is missing. Stop 4 keeps setup() and loop() there, next to motors and sensors.")
        return 1

    failed = []
    missing = [name for name in SPLIT if not (SRC / name).exists()]
    main_cpp = without_comments((SRC / "main.cpp").read_text())
    includes = set(re.findall(r'#\s*include\s*"([^"]+)"', main_cpp))
    if missing or not {"motors.h", "sensors.h"} <= includes:
        failed.append("Stop 4 splits the firmware: motors.h/.cpp and sensors.h/.cpp, included from main.cpp")

    with tempfile.TemporaryDirectory() as tmp:
        wasm, error = build(tmp)
        if error:
            hint = "If a function is \"not declared\": is its header included at the top of this file?"
            failed.append(f"The firmware didn't build. The compiler's first error has its file and line. {hint}\n{error}")
        elif not failed:
            failed += simulator_checks(wasm, tmp)

    for message in failed:
        print(f"✗ {message}")
    if failed:
        return 1
    if real_world_on():
        print(
            "✓ Stop 4 (real-world switch on, seeds 1–3): your firmware builds, split into motors, sensors and main."
            " On the straight test drive it stops for the box and blinks, then carries on. It keeps looking."
        )
        return 0
    print(
        "✓ Stop 4: your firmware builds, split into motors, sensors and main. It still delivers to G,"
        " stops for the box and blinks, stays steady with sensor noise on, and keeps looking."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
