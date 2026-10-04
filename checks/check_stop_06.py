"""Stop 6 check: do your courier tool's tests pass, and do your planner's still pass?

Run it from the top folder of your repo:
    python3 checks/check_stop_06.py

It runs `pytest cli` (your tool, against a pretend Pip) and `pytest planner` (Stop 2's tests,
which must keep passing after you give plan() a start and a goal). Until you've switched on a
test in cli/test_courier.py or started writing cli/courier.py, Stop 6 hasn't started, so it says
so and passes. Once it has, the starter's five tests must be switched on and pass. CI runs it as
job stop-06.

Then it builds your firmware with the Courier simulator's compiler (the one `npm run sim` uses)
and runs it in the simulator in real time, with the
real-world switch on and its port 7000 on localhost (`run --listen`, needs `npm ci`), and talks
to it the way your tool does: joins and listens, ping, framing, unhappy replies, and
`python3 cli/courier.py send pip --to room-2` (exit code 0, and "busy" to a drive meanwhile).
Pip should then end within half a tile of room 2; with the real-world switch on, that's reported
but doesn't fail the check yet (REAL_WORLD_ENFORCED in courier_sim.py). That part
takes about a minute.

On GitHub it also marks each ✗ line as an error, so it shows on the run (and in the Curious
Sims workshop's pull request panel), and it leaves one note for Curious Sims saying whether
Stop 6 has started, so the workshop can tick the step off once the job passes.
"""

import json
import math
import os
import re
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from courier_sim import HALF_TILE_CM, REAL_WORLD_ENFORCED, TILE_CM, LiveRobot, build, stop_6_started, warn

ROOT = Path(__file__).resolve().parent.parent
TESTS = ROOT / "cli" / "test_courier.py"
STARTER_TESTS = ["test_help", "test_unknown_robot", "test_unknown_room", "test_robot_not_running", "test_busy"]
NO_TESTS_COLLECTED = 5  # pytest's exit code when it found no tests
PORT = 7000
JOIN_MS = 5000  # Pip must be on the Wi-Fi within 5 s of power-on
REPLY_S = 3  # how long to wait for a reply (wall clock)
ROOM, ROOM_TILE = "room-2", (1, 15)
DRIVE_S = 60  # how long Pip may take to reach the room
IP = re.compile(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b")


ON_GITHUB = os.environ.get("GITHUB_ACTIONS") == "true"


def github_error(message):
    """On GitHub, also say it as an error annotation: the workshop's PR panel shows that line."""
    if ON_GITHUB:
        line = message.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
        print(f"::error::{line}")


def tell_curious_sims(state):
    """On GitHub, one note for Curious Sims: "not-started", "started" (some check failed) or "done"."""
    if ON_GITHUB:
        print('::notice title=curiousims::{"stop":"courier-06","state":"%s"}' % state)


class Problem(Exception):
    """One failed check, with the message for the learner."""


class Pip:
    """A TCP connection to the robot: send bytes, read one reply line (JSON) at a time."""

    def __init__(self, port):
        try:
            self.sock = socket.create_connection(("127.0.0.1", port), timeout=REPLY_S)
        except OSError:
            raise Problem(f"Nothing is listening on port {PORT}")
        self.buffer = b""

    def send(self, data):
        self.sock.sendall(data)

    def reply(self, wait=REPLY_S):
        """The next reply as text, or None if none arrives within `wait` seconds."""
        deadline = time.monotonic() + wait
        while b"\n" not in self.buffer:
            left = deadline - time.monotonic()
            if left <= 0:
                return None
            self.sock.settimeout(left)
            try:
                chunk = self.sock.recv(4096)
            except socket.timeout:
                return None
            except OSError:
                return None
            if not chunk:
                return None
            self.buffer += chunk
        line, self.buffer = self.buffer.split(b"\n", 1)
        return line.decode(errors="replace")

    def ask(self, data):
        self.send(data)
        return self.reply()

    def ping(self):
        text = self.ask(b'{"cmd":"ping"}\n')
        try:
            return json.loads(text) if text else None
        except ValueError:
            return None

    def close(self):
        self.sock.close()


def error_of(text):
    try:
        message = json.loads(text)
    except (TypeError, ValueError):
        return None
    return message.get("error") if isinstance(message, dict) and message.get("ok") is False else None


def unhappy(pip):
    """Each bad message gets its error reply, and a ping still works after it."""
    cases = [
        ("bad JSON", b"{cmd: ping\n", "bad json"),
        ("[1,2]", b"[1,2]\n", "bad message"),
        ('{"x":1}', b'{"x":1}\n', "bad message"),
        ("moves XYZ", b'{"cmd":"drive","moves":"XYZ"}\n', "bad moves"),
        ("a drive with no moves", b'{"cmd":"drive"}\n', "bad moves"),
        ("200 moves", b'{"cmd":"drive","moves":"' + b"E" * 200 + b'"}\n', "too many moves"),
        ("a 600-byte line", b'{"cmd":"ping","pad":"' + b"x" * 580 + b'"}\n', "too long"),
    ]
    for case, data, expected in cases:
        text = pip.ask(data)
        if error_of(text) != expected:
            got = "nothing" if text is None else text
            raise Problem(f'After {case}, Pip replied {got}; the protocol says {{"ok":false,"error":"{expected}"}}')
        after = pip.ping()
        if not after or after.get("ok") is not True:
            raise Problem(f"Pip stopped answering after {case}")
        if case == "200 moves" and (after.get("state") not in ("IDLE", "DONE") or (after.get("row"), after.get("col")) != (1, 1)):
            raise Problem("After 200 moves, Pip started driving; a route arrives whole or not at all")


def framing(pip):
    """A message in two writes gets one reply; two messages in one write get two."""
    pip.send(b'{"cmd":')
    time.sleep(0.1)
    pip.send(b'"ping"}\n')
    first = pip.reply()
    if first is None:
        raise Problem("Pip didn't answer a message that arrived in two pieces")
    if pip.reply(wait=0.5) is not None:
        raise Problem("Pip answered a half message")
    pip.send(b'{"cmd":"ping"}\n{"cmd":"ping"}\n')
    if pip.reply() is None or pip.reply() is None:
        raise Problem("Pip answered only the first of two messages")


def send_to_room(port):
    """`courier send pip --to room-2` exits 0, a drive meanwhile is busy, and Pip ends in room 2.

    Pip may serve one connection at a time (as the walkthrough's does), so nothing else is
    connected while your tool runs.
    """
    result = subprocess.run(
        [sys.executable, "cli/courier.py", "send", "pip", "--to", ROOM], cwd=ROOT, capture_output=True, text=True, timeout=30
    )
    if result.returncode != 0:
        raise Problem(f"`courier send pip --to {ROOM}`: exit code {result.returncode}: {result.stderr.strip() or result.stdout.strip()}")
    pip = Pip(port)
    try:
        wait_until_there(pip)
    finally:
        pip.close()


def wait_until_there(pip):
    """A drive while Pip is driving gets "busy"; then wait until Pip is IDLE or DONE (or DRIVE_S passes)."""
    text = pip.ask(b'{"cmd":"drive","moves":"E"}\n')
    if error_of(text) != "busy":
        raise Problem(f'After a drive while driving, Pip replied {text}; the protocol says {{"ok":false,"error":"busy"}}')
    deadline = time.monotonic() + DRIVE_S
    while time.monotonic() < deadline:
        state = (pip.ping() or {}).get("state")
        if state in ("IDLE", "DONE"):
            return
        time.sleep(1)


def against_firmware():
    """Stop 6's checks against your firmware in the simulator. A list of problems (empty: all passed)."""
    with tempfile.TemporaryDirectory() as tmp:
        wasm, error = build(tmp)
        if error:
            return [f"The firmware didn't build. The compiler's first error has its file and line:\n{error}"]
        problems = []
        with LiveRobot(wasm, tmp, "--real-world", "1") as robot:
            port = robot.wait_for_port(PORT, seconds=JOIN_MS / 1000 + 10)
            if port is None:
                problems.append(f"Nothing is listening on port {PORT}. Is there a WiFiServer on {PORT}, started with begin()?")
            elif port != PORT:
                problems.append(f"Port {PORT} on this computer is taken, so the robot's port is at localhost:{port}. Stop what's using {PORT} and run again.")
            else:
                pip = None
                try:
                    pip = Pip(port)
                    hello = pip.ping()
                    if not hello or hello.get("ok") is not True or (hello.get("row"), hello.get("col")) != (1, 1) or hello.get("state") != "IDLE":
                        raise Problem(f"ping should answer with Pip's tile; got: {hello}")
                    framing(pip)
                    unhappy(pip)
                    pip.close()
                    send_to_room(port)
                except Problem as problem:
                    problems.append(str(problem))
                finally:
                    if pip:
                        pip.close()
        run = robot.result
        joined = [t for t, kind, text in run.events if kind == "serial" and IP.search(text) and t <= JOIN_MS]
        if not joined:
            problems.insert(0, "Pip never joined the Wi-Fi (no IP address on the serial monitor within 5 s): is WiFi.begin in setup()?")
        if run.report is None:
            return problems or [f"The simulator didn't finish:\n{run.output.strip()}"]
        if not problems:
            arrival = arrived(run.report)
            if arrival and REAL_WORLD_ENFORCED:
                problems.append(arrival)
            elif arrival:
                warn(f"{arrival} (real-world switch on, seed 1; not failing yet: the real-world numbers are still being measured)")
        return problems


def arrived(report):
    """Did Pip end within half a tile of the room, without touching anything? A message, or None."""
    if report["hit"]:
        hit = report["hit"]
        return f"Pip hit a wall on the way to {ROOM} (row {hit['row']}, column {hit['col']})"
    pose = report["pose"]
    room = ((ROOM_TILE[1] + 0.5) * TILE_CM, (ROOM_TILE[0] + 0.5) * TILE_CM)
    off = math.dist((pose["x"] * 100, pose["y"] * 100), room)
    return f"Pip stopped {off:.0f} cm from {ROOM}" if off > HALF_TILE_CM else None


def main():
    tests = TESTS.read_text() if TESTS.exists() else ""
    switched_on = set(re.findall(r"^def (test_\w+)", tests, flags=re.M))
    if not stop_6_started():
        print("Stop 6 hasn't started yet: no tests are switched on in cli/test_courier.py. Nothing to check.")
        tell_curious_sims("not-started")
        return 0

    off = [name for name in STARTER_TESTS if name not in switched_on]
    if off:
        message = f"Switch on the starter's courier tests too (remove the # from each line): {', '.join(off)}"
        print(f"✗ {message}")
        github_error(message)
        tell_curious_sims("started")
        return 1

    failed = []
    if subprocess.call([sys.executable, "-m", "pytest", "cli"], cwd=ROOT) != 0:
        failed.append("Stop 6: some courier tests fail. Each failure above says what went wrong.")
    if subprocess.call([sys.executable, "-m", "pytest", "planner"], cwd=ROOT) not in (0, NO_TESTS_COLLECTED):
        failed.append("Stop 2's planner tests fail now. Do plan()'s new start and goal default to S and G?")
    failed += against_firmware()

    for message in failed:
        print(f"✗ {message}")
        github_error(message)
    if failed:
        tell_curious_sims("started")
        return 1
    tell_curious_sims("done")
    print(f"✓ Stop 6: Pip joins the Wi-Fi and speaks the protocol, `courier send pip --to {ROOM}` works, and your tool's and planner's tests pass.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
