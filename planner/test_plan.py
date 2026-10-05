# planner/test_plan.py — the tests for your planner (Stop 2).
#
# A test is a small program that runs your code on a known input and checks the result.
# pytest finds every function whose name starts with test_ in files named test_*.py, runs it,
# and reports pass or fail. Run them from the top folder of your repo:
#     pytest planner
#
# Everything below is switched off with a # at the start of each line (a "comment"), because
# plan.py isn't written yet. In Stop 2 you remove the # from the imports, then from one test at a
# time, and run pytest after each. CI runs these tests on every push (job stop-02).
#
# Until you switch a test on, pytest says "no tests ran" and CI's stop-02 job says Stop 2 hasn't
# started yet. That's expected.

from pathlib import Path

import pytest

from plan import main, plan, read_map

MAPS = Path(__file__).resolve().parent.parent / "maps"
STEP = {"N": (-1, 0), "E": (0, 1), "S": (1, 0), "W": (0, -1)}


def follow(grid, route):
    """Walk the route from S. Fail if it walks into a wall; return the tile it ends on."""
    row, col = next((r, c) for r, line in enumerate(grid) for c, ch in enumerate(line) if ch == "S")
    for move in route:
        dr, dc = STEP[move]
        row, col = row + dr, col + dc
        assert grid[row][col] != "#", f"the route walks into a wall at row {row}, column {col}"
    return row, col


def test_straight_corridor():
    route = plan(["S...G"])
    assert route == "EEEE", f'In a straight corridor the route should be EEEE; yours is "{route}"'


def test_office_route_reaches_goal_by_the_shortest_way():
    grid = read_map(MAPS / "office.txt")
    route = plan(grid)
    assert route is not None, "plan() found no route on the office floor, but there is one"
    row, col = follow(grid, route)
    assert grid[row][col] == "G", "the route doesn't end on G"
    assert len(route) == 21, f"the shortest route is 21 moves; yours is {len(route)}"


def test_no_route_returns_none():
    route = plan(read_map(MAPS / "walled.txt"))
    assert route is None, "When there's no route, plan() should return None"


def test_map_without_goal_is_an_error():
    try:
        plan(["S...."])
    except ValueError:
        return
    pytest.fail("a map with no G should raise ValueError")


def test_exit_codes(capsys):
    cases = [
        ("the office map", ["plan.py", str(MAPS / "office.txt")], 0),
        ("a map with no route", ["plan.py", str(MAPS / "walled.txt")], 1),
        ("a missing map file", ["plan.py", str(MAPS / "no-such-map.txt")], 2),
        ("no map argument", ["plan.py"], 2),
    ]
    for case, argv, expected in cases:
        code = main(argv)
        assert code == expected, f"Expected exit code {expected} for {case}, got {code}"
    printed = capsys.readouterr().out.strip().splitlines()
    assert printed and printed[0] == "EEEESSSEEEEEEEEEEESSS", "the route should be printed on standard output"
