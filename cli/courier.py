# cli/courier.py — courier, your command-line tool for talking to your robots (Stop 6).
#
# Run it from the top folder of your repo:
#     python3 cli/courier.py --help
#     python3 cli/courier.py ping pip
#     python3 cli/courier.py send pip --to room-2
#     python3 cli/courier.py stop pip
#
# Right now it only prints a placeholder. In Stop 6 you write it: it looks the robot up in
# fleet.json and the room in maps/rooms.json, talks to the robot over TCP with the Courier
# command protocol (one JSON object per line, a reply to every message), and plans the route
# with your planner from Stop 2. The walkthrough is in stops/06/WALKTHROUGH.md.
#
# Exit codes, as in Stop 2: 0 it worked · 1 the robot said no (for example "busy") ·
# 2 couldn't do it (unknown robot or room, robot not reachable, no answer).
#
# The tests in cli/test_courier.py call main() and read FLEET and ROOMS below, so keep those names.

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FLEET = ROOT / "fleet.json"  # robot name → {"host": …, "port": …}
ROOMS = ROOT / "maps" / "rooms.json"  # room name → [row, column]


def main(argv):
    print("not written yet")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
