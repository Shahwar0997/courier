# cli/test_courier.py — the tests for your courier tool (Stop 6).
#
# Run them from the top folder of your repo:
#     pytest cli
#
# They don't need the simulator: a few lines below play a pretend Pip on this computer, which
# answers the protocol the way the real one does. CI runs these tests on every push (job stop-06),
# and talks to your real firmware in the simulator separately.
#
# Everything below is switched off with a # at the start of each line, because courier.py isn't
# written yet. In Stop 6 you remove the # from the imports and the helpers, then from one test at
# a time, and run pytest after each. Until you switch a test on, pytest says "no tests ran" and
# CI's stop-06 job says Stop 6 hasn't started yet. That's expected.

# import json
# import socket
# import socketserver
# import threading
#
# import pytest
#
# import courier
#
#
# class PretendPip(socketserver.StreamRequestHandler):
#     """Answers like Pip while it's driving: ping gives its tile, drive says busy."""
#
#     def handle(self):
#         for line in self.rfile:
#             message = json.loads(line)
#             if message.get("cmd") == "ping":
#                 reply = {"ok": True, "name": "Pip", "row": 1, "col": 1, "heading": 90, "state": "DRIVING"}
#             elif message.get("cmd") == "drive":
#                 reply = {"ok": False, "error": "busy"}
#             else:
#                 reply = {"ok": True}
#             self.wfile.write((json.dumps(reply) + "\n").encode())
#
#
# @pytest.fixture
# def pretend_pip():
#     server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), PretendPip)
#     server.daemon_threads = True
#     threading.Thread(target=server.serve_forever, daemon=True).start()
#     yield server.server_address[1]
#     server.shutdown()
#     server.server_close()
#
#
# def free_port():
#     """A port that nothing is listening on."""
#     with socket.socket() as s:
#         s.bind(("127.0.0.1", 0))
#         return s.getsockname()[1]
#
#
# def use_fleet(tmp_path, monkeypatch, port):
#     fleet = tmp_path / "fleet.json"
#     fleet.write_text(json.dumps({"pip": {"host": "127.0.0.1", "port": port}}))
#     monkeypatch.setattr(courier, "FLEET", fleet)
#
#
# def run(*args):
#     """Run courier with these arguments; return its exit code (argparse exits on --help)."""
#     try:
#         return courier.main(["courier.py", *args])
#     except SystemExit as e:
#         return e.code
#
#
# def test_help(capsys):
#     code = run("--help")
#     assert code == 0, f"Expected exit code 0 for --help, got {code}"
#     assert "send" in capsys.readouterr().out, "--help should list the send command"
#
#
# def test_unknown_robot(capsys):
#     code = run("ping", "nobody")
#     assert code == 2, f"Expected exit code 2 for an unknown robot, got {code}"
#     assert "nobody" in capsys.readouterr().err, "Say which robot isn't in fleet.json, on standard error"
#
#
# def test_unknown_room(tmp_path, monkeypatch, pretend_pip, capsys):
#     use_fleet(tmp_path, monkeypatch, pretend_pip)
#     code = run("send", "pip", "--to", "the-moon")
#     assert code == 2, f"Expected exit code 2 for an unknown room, got {code}"
#     assert "the-moon" in capsys.readouterr().err, "Say which room isn't in maps/rooms.json, on standard error"
#
#
# def test_robot_not_running(tmp_path, monkeypatch, capsys):
#     use_fleet(tmp_path, monkeypatch, free_port())
#     code = run("ping", "pip")
#     assert code == 2, f"Expected exit code 2 when Pip isn't running, got {code}"
#     assert "can't reach" in capsys.readouterr().err, "Say \"can't reach pip at …\" when the connection is refused"
#
#
# def test_busy(tmp_path, monkeypatch, pretend_pip, capsys):
#     use_fleet(tmp_path, monkeypatch, pretend_pip)
#     code = run("send", "pip", "--to", "room-2")
#     assert code == 1, f"Expected exit code 1 when Pip says no, got {code}"
#     assert "pip said: busy" in capsys.readouterr().err, 'Pass on what Pip said: "pip said: busy"'
