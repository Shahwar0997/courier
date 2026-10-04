"""Stop 2 check: run the planner's tests.

Run it from the top folder of your repo:
    python3 checks/check_stop_02.py

It runs `pytest planner`. Until you've switched on at least one test in planner/test_plan.py,
there is nothing to check yet, so it says so and passes. CI runs it as job stop-02.
"""

import subprocess
import sys

NO_TESTS_COLLECTED = 5  # pytest's exit code when it found no tests


def main():
    code = subprocess.call([sys.executable, "-m", "pytest", "planner"])
    if code == NO_TESTS_COLLECTED:
        print("Stop 2 hasn't started yet: no tests are switched on in planner/test_plan.py. Nothing to check.")
        return 0
    if code == 0:
        print("✓ Stop 2: all planner tests pass.")
    else:
        print("✗ Stop 2: some planner tests fail. Each failure above says what went wrong.")
    # The simulator replay (your robot drives the printed route on the office floor) is added
    # here when the Courier simulator ships.
    return code


if __name__ == "__main__":
    sys.exit(main())
