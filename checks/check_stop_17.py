"""Stop 17 check (early version): does your firmware with over-the-air updates boot cleanly?

Run it from the top folder of your repo:
    python3 checks/check_stop_17.py

Until your firmware uses `courier::ota` (its two firmware slots), Stop 17 hasn't started, so it
says so and passes. CI runs it as job stop-17.

Once it has, this builds your firmware with the Courier simulator's compiler (needs `npm ci`) and
powers the robot on with what an updatable robot has: its flash (two slots), a public key for
checking updates (a throwaway one, made here), and an empty update bucket. It passes when the
robot boots from slot A, never crashes or rolls back, and keeps running for 20 s of robot time.

Stop 17 isn't designed yet. Its full checks (a signed update is taken and confirmed, a tampered
one is refused, a bad build rolls back) come with its design; until then this check says so.
"""

import subprocess
import sys
import tempfile
from pathlib import Path

from courier_sim import CLI, ROOT, build, firmware_code, pending, run_firmware

ROBOT_SECONDS = 20
BAD_BOOTS = {"crash", "rollback"}


def main():
    if "ota::" not in firmware_code():
        print("Stop 17 hasn't started yet: your firmware doesn't use courier::ota. Nothing to check.")
        return 0

    with tempfile.TemporaryDirectory() as tmp:
        wasm, error = build(tmp)
        if error:
            print(f"✗ The firmware didn't build. The compiler's first error has its file and line:\n{error}")
            return 1
        key = Path(tmp) / "ci"
        made = subprocess.run(["node", str(CLI), "keygen", "--out", str(key)], cwd=ROOT, capture_output=True, text=True)
        if made.returncode != 0:
            print(f"✗ Couldn't make a throwaway key for the check:\n{made.stdout}{made.stderr}")
            return 1
        bucket = Path(tmp) / "bucket"
        bucket.mkdir()
        run = run_firmware(
            wasm, tmp, "--flash", str(Path(tmp) / "flash"), "--key", f"{key}.pub", "--serve", str(bucket),
            seconds=ROBOT_SECONDS, name="ota",
        )

    if run.report is None:
        print(f"✗ The simulator didn't finish:\n{run.output.strip()}")
        return 1
    failed = []
    boots = run.report.get("boots") or []
    if not boots or boots[0].get("slot") != "A":
        failed.append(f"A new robot should boot from slot A; it booted: {boots}")
    bad = [b for b in boots if b.get("reason") in BAD_BOOTS]
    if bad:
        failed.append(f"With no update waiting, your robot still had a {bad[0]['reason']} at {bad[0]['t'] / 1e6:.1f} s")
    if run.report["reason"] in ("crash", "watchdog"):
        failed.append(f"The simulator stopped your firmware: {run.report['message']}")

    for message in failed:
        print(f"✗ {message}")
    if failed:
        return 1
    print("✓ Stop 17 (early check): your firmware boots from slot A with its flash, key and bucket, and keeps running.")
    pending("Stop 17's full checks (a signed update is taken, a tampered one refused, a bad build rolled back) come with its design.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
