"""CI's last stop-03 step: your firmware drives the office route in the simulator, 30 s of robot time.

Run it from the top folder of your repo (needs `npm ci`):
    python3 checks/drive_office.py

It runs `node tools/courier/cli.mjs run firmware --map maps/office.txt --seconds 30` and writes
the event log and report (courier-events.txt, courier-report.json). Until Stop 5 it passes when
the simulator says ✓. From Stop 5 on, the real-world switch stays on, so it runs with
`--real-world 1`, and hitting a wall on the way is a note that doesn't fail yet, as arriving
with the switch on is in the Stop 6 check (REAL_WORLD_ENFORCED in courier_sim.py). It still fails
if your firmware doesn't build, crashes or gets stuck. From Stop 6 on, Pip waits for a drive
command at power-on, so this drive asks for your planner's route (`--route`, which your firmware
reads with courier::route()).
"""

import json
import os
import subprocess
import sys
from pathlib import Path

from courier_sim import CLI, REAL_WORLD_ENFORCED, ROOT, asked_route, real_world_on

EVENTS, REPORT = ROOT / "courier-events.txt", ROOT / "courier-report.json"


def note(message):
    """A plain note: shown on the CI run, or on your computer."""
    print(f"::notice title=Note::{message}" if os.environ.get("GITHUB_ACTIONS") else f"Note: {message}")


def main():
    world = ["--real-world", "1"] if real_world_on() else []
    REPORT.unlink(missing_ok=True)
    command = ["node", str(CLI), "run", "firmware", "--map", "maps/office.txt", *asked_route(), "--seconds", "30", *world,
               "--events", str(EVENTS), "--json", str(REPORT)]
    if not world or REAL_WORLD_ENFORCED:
        return subprocess.call(command, cwd=ROOT)  # before Stop 5: the simulator's output, as it is
    print("From Stop 5 the real-world switch is on: hitting a wall on this drive doesn't fail it (for now).")
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    report = json.loads(REPORT.read_text()) if REPORT.exists() else None
    walled = result.returncode != 0 and report is not None and report.get("reason") == "hit"
    for line in (result.stdout + result.stderr).splitlines():
        if not (walled and line.startswith("✗ ")):  # its ✗ line would read as a failure in a step that passes
            print(line)
    if not walled:
        return result.returncode  # it didn't build, crashed or got stuck: that still fails
    hit = report["hit"]
    note(
        f"on the office map Pip hit a {hit.get('thing', 'wall')} after move {hit['move']} (row {hit['row']},"
        f" column {hit['col']}). Counting wheel ticks drifts a little every move, so with the real-world switch on"
        " Pip may not reach G yet. That's expected after Stop 5, and this step doesn't fail on it. It still fails"
        " if your firmware doesn't build, crashes or gets stuck."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
