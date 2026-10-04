"""Stop 1 check: is robot.json filled in correctly?

Run it from the top folder of your repo:
    python3 checks/check_robot_json.py

It prints a ✓ line when robot.json is fine, or says what to fix. CI runs the same check
(job stop-01). It ends with exit code 0 when everything passes and 1 when something doesn't;
Stop 2 explains exit codes.
"""

import json
import os
import re
import sys
from pathlib import Path

ROBOT_JSON = Path(__file__).resolve().parent.parent / "robot.json"
NAME = re.compile(r"[A-Za-z0-9 -]{1,20}")
COLOR = re.compile(r"#[0-9A-Fa-f]{6}")


def github_error(message):
    """On GitHub, also say it as an error annotation: the workshop's PR panel shows that line."""
    if os.environ.get("GITHUB_ACTIONS") == "true":
        line = message.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
        print(f"::error::{line}")


def problems(text):
    """Return a list of plain-English problems with robot.json's text (empty = all good)."""
    try:
        robot = json.loads(text)
    except json.JSONDecodeError as e:
        return [f"robot.json isn't valid JSON: line {e.lineno}, column {e.colno}: {e.msg}"]
    if not isinstance(robot, dict):
        return ['robot.json should be one { … } object, like {"name": "Pip", "color": "#ff8800"}']

    found = []
    name = robot.get("name")
    if not isinstance(name, str) or not NAME.fullmatch(name):
        found.append(f'name should be 1–20 letters, digits, spaces or dashes; it\'s "{name}"')
    color = robot.get("color")
    if not isinstance(color, str) or not COLOR.fullmatch(color):
        found.append(f'color must look like #ff8800 (a # and 6 hex digits); it\'s "{color}"')
    # Any other keys (a "motto", say) are yours to add; this check ignores them.
    return found


def main():
    try:
        text = ROBOT_JSON.read_text(encoding="utf-8")
    except FileNotFoundError:
        print("✗ robot.json is missing. It belongs in the top folder of your repo.")
        github_error("✗ robot.json is missing. It belongs in the top folder of your repo.")
        return 1
    found = problems(text)
    if found:
        for problem in found:
            print(f"✗ {problem}")
        github_error(f"✗ {found[0]}")
        return 1
    robot = json.loads(text)
    print(f"✓ robot.json is fine: your robot is {robot['name']}, colour {robot['color']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
