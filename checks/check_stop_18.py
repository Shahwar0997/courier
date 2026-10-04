"""Stop 18 check (early version): does a fleet of your robots run and publish?

Run it from the top folder of your repo:
    python3 checks/check_stop_18.py

Until your firmware uses `courier::mqtt`, Stop 18 hasn't started, so it says so and passes. CI
runs it as job stop-18.

Once it has, this builds your firmware once with the Courier simulator's compiler (needs `npm ci`)
and runs ROBOTS copies of it together for 10 s, on an in-memory broker (no Docker needed). It
passes when no robot crashes or freezes the fleet and the robots publish messages. A robot that
bumps a wall doesn't fail it.

Stop 18 isn't designed yet. Its full checks (the 100-robot load test against your server) come
with its design; until then this check says so.
"""

import json
import subprocess
import sys
import tempfile
from pathlib import Path

from courier_sim import CLI, OFFICE, ROOT, build, firmware_code, pending

ROBOTS = 10
SECONDS = 10
FINE = {"time", "hit"}  # how a robot's run may end: time's up, or it bumped into something


def main():
    if "mqtt::" not in firmware_code():
        print("Stop 18 hasn't started yet: your firmware doesn't use courier::mqtt. Nothing to check.")
        return 0

    with tempfile.TemporaryDirectory() as tmp:
        wasm, error = build(tmp)
        if error:
            print(f"✗ The firmware didn't build. The compiler's first error has its file and line:\n{error}")
            return 1
        report_path = Path(tmp) / "fleet.json"
        result = subprocess.run(
            ["node", str(CLI), "fleet", str(wasm), "--robots", str(ROBOTS), "--seconds", str(SECONDS),
             "--map", str(OFFICE), "--json", str(report_path)],
            cwd=ROOT, capture_output=True, text=True, timeout=SECONDS + 120,
        )
        report = json.loads(report_path.read_text()) if report_path.exists() else None

    if report is None:
        print(f"✗ The fleet didn't finish:\n{(result.stdout + result.stderr).strip()}")
        return 1
    if report.get("reason") in ("watchdog", "crash", "no-broker"):
        print(f"✗ {report.get('message') or report['reason']}")
        return 1
    failed = []
    for robot in report.get("robotsReport") or []:
        if robot.get("reason") not in FINE:
            failed.append(f"{robot['robot']}: {robot.get('message') or robot.get('reason')}")
            break  # one is enough: they all run the same firmware
    if not report.get("robotsReport"):
        failed.append(f"The fleet stopped before the robots ran:\n{(result.stdout + result.stderr).strip()}")
    if not report.get("published"):
        failed.append("Your robots didn't publish anything. Does loop() call courier::mqtt::publish?")

    for message in failed:
        print(f"✗ {message}")
    if failed:
        return 1
    print(f"✓ Stop 18 (early check): {ROBOTS} robots ran {SECONDS} s together and published {report['published']} messages.")
    pending("Stop 18's full checks (the 100-robot load test) come with its design.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
