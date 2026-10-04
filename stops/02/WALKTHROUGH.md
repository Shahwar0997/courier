# Stop 2 · Plan a route: your first real program — walkthrough

In this walkthrough you watch an expert turn BFS, which you already know, into a
**program**: `planner/plan.py`. It reads a map file, prints your robot's moves from S to G, says
clearly when something is wrong, and has tests that GitHub runs on every change.

**Time:** about 2–3 hours. **You need:** Stop 1 finished (your repo, your Codespace, and the
branch → commit → push → PR → merge loop).

**How to read it:** the same as Stop 1. Each step says what to **Do**, what **You'll see** and
**Why**. The steps are grouped into five parts, each ending in a ✅ checkpoint. The code grows a
few lines at a time. Type it rather than paste it: typing is how you notice each line. The whole
file is at the end.

The map you'll plan on is `maps/office.txt`, the office floor from Stop 0:

```
###################
#S....#.....#.....#
#.....#.....#.....#
#.....##.####.##..#
#.................#
####.####.####.#.##
#......#....#.....#
#......#....#...G.#
###################
```

`#` is a wall, `.` is floor, `S` is where the robot starts, and `G` is where the parcel goes.
The robot moves one tile at a time: **N**orth (up), **E**ast (right), **S**outh (down) or
**W**est (left).

---

## Part A · Start from something that runs

### Step 1 · A fresh branch, and run the starter

**Do:** open your Codespace: go to [github.com/codespaces](https://github.com/codespaces) and
click your codespace's name (Stop 1, Step 3f). Wait until VS Code shows a terminal with a line
ending in `$`. No terminal? Menu (☰) → **Terminal → New Terminal**. Then, in the terminal:

```
git switch main
git pull
git switch -c stop-02-plan-a-route
python3 planner/plan.py maps/office.txt
```

**You'll see:** `not written yet`

**Why:**
- The first three lines are Stop 1's loop: start from the latest `main`, on a new branch.
- `planner/plan.py` is a **program**: code you run yourself, rather than a function a website
  calls. Right now it's one line, `print("not written yet")`.
- Experts always start from something that runs, and keep it running after every small step.
  When something breaks, you know it was the last few lines you typed.

**Stuck?** *Your codespace isn't listed, or GitHub says you've used your free hours:* see Stop
1, Steps 3f and 3g. If the codespace was deleted, create a new one from your repo (**<> Code →
Codespaces → Create codespace on main**, Stop 1, Step 3c). Your merged work is safe on GitHub.

✅ **Checkpoint A:** you're on the branch `stop-02-plan-a-route`, and the planner prints `not written yet`.

---

## Part B · Read the input

### Step 2 · Which map? Read the command-line argument

**Do:** open `planner/plan.py`. Replace the `print("not written yet")` line (keep the comments at
the top) with:

```python
import sys

print(sys.argv)
print(sys.argv[1])
```

Save and run the same command again:

```
python3 planner/plan.py maps/office.txt
```

**You'll see:**

```
['planner/plan.py', 'maps/office.txt']
maps/office.txt
```

**Why:**
- On a coding-practice website, the site calls your function and hands it the input. Here nobody
  calls you: the program has to find its own input. The words you type after the program's name are
  **command-line arguments**. They tell the program what to work on: here, which map.
- `import sys` loads the `sys` **module**. A module is a file of ready-made code. `sys` comes with
  Python, and it knows about the program that's running.
- `sys.argv` is the list of words on the command line, as strings. Item `0` is the program itself
  and item `1` is the first argument. So `sys.argv[1]` is the map's file name.

**Try it:** run `python3 planner/plan.py` with no map. Python crashes with `IndexError: list index
out of range`, because `sys.argv` has only one item. Leave it for now: Step 8 turns this crash into a
proper message.

### Step 3 · Read the map file

**Do:** replace the two `print` lines with a function and a few lines that use it:

```python
import sys


def read_map(path):
    """Read a map file and return its rows as a list of strings."""
    with open(path) as f:
        return [line.rstrip("\n") for line in f if line.strip()]


grid = read_map(sys.argv[1])
for row in grid:
    print(row)
print(len(grid), "rows,", len(grid[0]), "columns")
```

Run it again.

**You'll see:** the map, then `9 rows, 19 columns`.

**Why:**
- A **text file** is just lines of characters. The map file is one row of the floor per line.
- `open(path)` opens the file so you can read it. `with … as f:` closes it again when the block
  ends, even if something goes wrong inside. Always open files this way.
- `for line in f` gives you the file one line at a time. Each line ends with an invisible
  **newline** character, written `\n`, which isn't part of the map. `rstrip("\n")` removes it.
- `if line.strip()` skips blank lines, like an empty last line. `strip()` removes spaces and
  newlines from both ends, and an empty string counts as false.
- The last lines are **scaffolding**: temporary code that shows the function works. You'll replace
  them as the program grows.

### Step 4 · Find S and G

**Do:** add this function under `read_map`, and change the scaffolding at the bottom:

```python
def find(grid, letter):
    """Return (row, col) of the first `letter` in the grid, or None if it isn't there."""
    for row, line in enumerate(grid):
        col = line.find(letter)
        if col != -1:
            return (row, col)
    return None


grid = read_map(sys.argv[1])
print("S is at", find(grid, "S"))
print("G is at", find(grid, "G"))
print("X is at", find(grid, "X"))
```

Run it.

**You'll see:**

```
S is at (1, 1)
G is at (7, 16)
X is at None
```

**Why:**
- The map marks places with letters, but BFS needs **coordinates**: (row, column), both counted
  from 0 at the top-left. Row 0 is the top wall, so S is at row 1, column 1.
- `line.find(letter)` returns the position of `letter` in the string, or `-1` if it isn't there.
- **`None`** is Python's "nothing". Returning it for a missing letter lets the caller check, and
  you'll use that in Step 7.

✅ **Checkpoint B:** your program reads the map named on the command line and prints where S and G are.

---

## Part C · Find the route

### Step 5 · BFS that remembers where it came from

**Do:** add `from collections import deque` under `import sys`. Then add the moves and a
`plan` function under `find`, and replace the scaffolding again:

```python
MOVES = {"N": (-1, 0), "E": (0, 1), "S": (1, 0), "W": (0, -1)}


def plan(grid):
    """Return the shortest route from S to G as a string of moves, like "EESW"."""
    start, goal = find(grid, "S"), find(grid, "G")
    came_from = {start: None}   # tile -> (the tile before it, the move from there)
    queue = deque([start])
    while queue:
        cell = queue.popleft()
        if cell == goal:
            break
        row, col = cell
        for move, (dr, dc) in MOVES.items():
            nxt = (row + dr, col + dc)
            r, c = nxt
            if 0 <= r < len(grid) and 0 <= c < len(grid[r]) and grid[r][c] != "#" and nxt not in came_from:
                came_from[nxt] = (cell, move)
                queue.append(nxt)
    print("G was reached from", came_from[goal])
    print("tiles reached:", len(came_from))


grid = read_map(sys.argv[1])
plan(grid)
```

Run it.

**You'll see:**

```
G was reached from ((6, 16), 'S')
tiles reached: 90
```

**Why:**
- This is the grid BFS you already know (finding the nearest exit from a maze is the same
  idea). A queue holds tiles still to explore, and you look at the four neighbours of each
  one. Because BFS reaches tiles in order of distance, the first time it reaches G is by a
  **shortest** route. DFS would also find *a* route, but here its route is 10 moves longer.
- **The one new idea is `came_from`.** In algorithm exercises you usually return a *number*, the
  distance. The robot needs the *moves*. So when you first reach a tile, you store where you came
  from and which move you took: `came_from[nxt] = (cell, move)`. The start maps to `None` (it has
  no parent). `came_from` is also your visited set: `nxt not in came_from` means "not seen yet".
- `deque` (say "deck") is Python's queue. `popleft()` takes from the front quickly, while a list's
  `pop(0)` gets slow on big maps.
- `MOVES` maps each letter to how it changes (row, column). North is one row *up*, so `-1`.
- **Keep the order N, E, S, W.** Many tiles can be reached by two equally short routes, and the
  neighbour order decides which one BFS finds. The tests expect the route this order gives.
- The output says G was reached by the move `S` from the tile above it. That's the last move of
  the route. The next step walks back from there.

### Step 6 · Walk back from G, and print the route

**Do:** in `plan`, replace the two `print` lines at the end with:

```python
    moves = []
    cell = goal
    while came_from[cell] is not None:
        cell, move = came_from[cell]
        moves.append(move)
    return "".join(reversed(moves))
```

and the scaffolding at the bottom with:

```python
grid = read_map(sys.argv[1])
route = plan(grid)
print(route)
print(len(route), "moves")
```

Run it.

**You'll see:**

```
EEEESSSEEEEEEEEEEESSS
21 moves
```

**Why:**
- Start at G and follow the parents: each `came_from[cell]` gives the tile before it and the move
  that led here. Stop at S, whose parent is `None`. That collects the moves **from G back to S**,
  so they come out backwards, and `reversed(moves)` turns them round.
- `"".join(...)` glues a list of strings into one string with nothing between them:
  `["E", "E", "S"]` becomes `"EES"`.
- 21 moves: 4 east, 3 south, 11 east and 3 south. Trace it on the map with your finger.

**Commit this working step:**

```
git add planner/plan.py
git commit -m "Plan the office route with BFS"
```

A commit is a snapshot you can come back to (Stop 1). Making one each time something works
means you can always get back to a working version.

✅ **Checkpoint C:** `python3 planner/plan.py maps/office.txt` prints `EEEESSSEEEEEEEEEEESSS`.

---

## Part D · Handle the unhappy cases

### Step 7 · What if there's no route?

**Do:** first run the program on a map where a wall cuts S off from G:

```
python3 planner/plan.py maps/walled.txt
```

**You'll see:** a crash that ends with `KeyError: (2, 5)`.

**Why it crashed:** G is at (2, 5), but BFS never reached it, so it's not in `came_from`, and
`came_from[goal]` fails. **`KeyError`** is Python's error for "that key isn't in the dict", and
it names the missing key. A crash like this means *the program* is broken. But "there's no route"
isn't a bug: it's a normal answer the program should give clearly. The same goes for a map with
no S or no G.

**Do:** in `plan`, add two checks. Right after the line that finds `start` and `goal`:

```python
    if start is None or goal is None:
        raise ValueError("the map needs one S and one G")
```

and right after the `while queue:` loop, before the walk back:

```python
    if goal not in came_from:
        return None
```

Also change the docstring to say `…, or None if there is none.`

**Why:**
- No route is a normal answer, so `plan` returns `None`: "nothing to drive". Whoever calls `plan`
  decides what to do about it.
- A map without S or G is a *bad input*, and `plan` can't give any sensible answer. `raise
  ValueError("…")` stops the function and reports the problem. **`raise`** is how Python code says
  "this went wrong". `ValueError` is Python's built-in error for "the value you gave me doesn't
  make sense".

### Step 8 · Messages for people, exit codes for programs

**Do:** replace the scaffolding at the bottom with a `main` function, then one line that runs it:

```python
def main(argv):
    """Run the planner on the map named in argv; return the exit code."""
    if len(argv) != 2:
        print("usage: python3 planner/plan.py <map file>", file=sys.stderr)
        return 2
    try:
        grid = read_map(argv[1])
    except FileNotFoundError:
        print(f"can't open {argv[1]}", file=sys.stderr)
        return 2
    try:
        route = plan(grid)
    except ValueError as err:
        print(err, file=sys.stderr)
        return 2
    if route is None:
        print("no route from S to G", file=sys.stderr)
        return 1
    print(route)
    return 0


sys.exit(main(sys.argv))
```

Now try every case. **`echo $?`** prints the exit code of the command just before it:

```
python3 planner/plan.py maps/office.txt
echo $?
python3 planner/plan.py maps/walled.txt
echo $?
python3 planner/plan.py maps/nope.txt
echo $?
python3 planner/plan.py
echo $?
```

**You'll see:**

```
EEEESSSEEEEEEEEEEESSS
0
no route from S to G
1
can't open maps/nope.txt
2
usage: python3 planner/plan.py <map file>
2
```

**Why:**
- When a program ends, it hands back a number called its **exit code**: `0` means it worked, and
  anything else means something went wrong. People read the message. Other programs, like CI or
  a script, read the number. That's how CI knew your Stop 1 check failed: the check ended with 1.
- Our program's codes: **0** = route printed · **1** = no route · **2** = couldn't read the map (no
  argument, a missing file, no S or G).
- A program has two outputs. Normal output (the route) goes to **standard output**, the terminal
  unless you send it elsewhere. Error messages go to a second output, **standard error**, so they
  never get mixed into the real output. `print(..., file=sys.stderr)` prints there. Both show up in
  your terminal, but a program reading the route only gets standard output.
- `open` **raises** `FileNotFoundError` when the file isn't there. **`try: … except
  FileNotFoundError:`** catches that one error and runs your code instead of crashing. Catch only
  the errors you expect: anything else is a real bug, and you want to see it.
- `f"can't open {argv[1]}"` is an **f-string**: text with an `f` in front, where anything in
  `{ }` is replaced by its value. So it prints `can't open maps/nope.txt`.
- `except ValueError as err:` catches the error from Step 7, and `err` holds its message.
- `main` takes `argv` as a parameter instead of reading `sys.argv` itself. That lets the tests call
  `main(["plan.py", "maps/walled.txt"])` without typing a command.
- `sys.exit(n)` ends the program with exit code `n`.

### Step 9 · Only run `main` when the file is run

**Do:** change the last line to:

```python
if __name__ == "__main__":
    sys.exit(main(sys.argv))
```

Run `python3 planner/plan.py maps/office.txt` once more. It prints the same route.

**Why:**
- The tests in Part E will **import** your file (`from plan import plan`) to call its functions.
  Importing a file runs all of its top-level code. Without this `if`, importing it would run
  `main` with pytest's own command line and end the tests before they start.
- Python sets `__name__` to `"__main__"` only in the file you ran. In a file that's being imported,
  `__name__` is the module's name (`"plan"`). So this line means "run `main` only when this file
  is the program".

✅ **Checkpoint D:** the four commands in Step 8 print the four results shown, with exit codes 0, 1, 2, 2.

---

## Part E · Tests

### Step 10 · Switch on the tests, one at a time

**Do:** open `planner/test_plan.py`. Everything in it is switched off with a `#` at the start of
each line. To switch lines on, select them and press **Ctrl+/** (Windows or Linux) or **Cmd+/**
(Mac): this adds or removes the `#`.

1. Switch on everything from `from pathlib import Path` down to the end of `def follow(…)`: the
   imports and the helper. Save, and run:

   ```
   pytest planner
   ```

   **You'll see:** `no tests ran`. Nothing is broken, because no test is switched on yet.

2. Switch on `test_straight_corridor` (three lines). Run `pytest planner`: **`1 passed`**.
3. Switch on `test_office_route_reaches_goal_by_the_shortest_way`. Run it: **`2 passed`**.
4. Then `test_no_route_returns_none`, `test_map_without_goal_is_an_error` and `test_exit_codes`,
   running after each. At the end:

   ```
   planner/test_plan.py .....                                               [100%]

   ============================== 5 passed in 0.01s ===============================
   ```

   Each `.` is one test that passed.

**Why:**
- A **test** is a small program that runs your code on a known input and checks the result.
  Until now, *you* checked each step by reading the output. Tests do that checking for you, on
  every change, forever.
- **pytest** is the Python tool that finds and runs tests: every function named `test_…` in a
  file named `test_….py`. `pytest planner` means "look in the `planner` folder".
- **`assert`** checks that something is true. If it isn't, the test fails with the message after
  the comma. Read one: `assert route == "EEEE", f'In a straight corridor the route should be EEEE;
  yours is "{route}"'`.
- Each test pins down one promise: a straight corridor; the shortest office route (21 moves, never
  through a wall, ending on G); `None` when there's no route; `ValueError` without a G; the exit
  codes 0, 1, 2, 2 and the route on standard output. `follow(grid, route)` is a helper: it walks
  the route tile by tile and fails if it steps on a `#`.
- `MAPS = Path(__file__).resolve().parent.parent / "maps"` finds the `maps` folder: `__file__` is
  the test file's own path, `.parent.parent` goes up two folders (to the top of your repo), and
  `/ "maps"` goes into `maps`. So the tests find the maps wherever pytest is run from.
- `pytest.fail("…")` fails a test on purpose, with that message. `test_map_without_goal_is_an_error`
  uses it when `plan` should have raised `ValueError` but didn't.
- `test_exit_codes(capsys)`: **`capsys`** is a helper pytest hands to any test that asks for it by
  name. It catches what the program prints, and `capsys.readouterr().out` gives you the standard
  output, so the test can check that the route was printed there.
- One at a time, because if something fails, you know exactly which promise broke.

**Stuck?** If pytest stops with `IsADirectoryError: … 'planner'` (Python's error for "that's a
folder, not a file") before running any test, the last
line of `plan.py` is missing its `if __name__ == "__main__":` (Step 9). The import ran `main` with
pytest's arguments, so it tried to open the folder `planner` as a map.

### Step 11 · Break it on purpose

**Do:** in `plan`, change `"".join(reversed(moves))` to `"".join(moves)`. Save and run
`pytest planner`.

**You'll see:** red, ending in `2 failed, 3 passed`. The two failures say:

```
E           AssertionError: the route walks into a wall at row 5, column 12
```
```
E       AssertionError: the route should be printed on standard output
```

Below the second, pytest shows the two strings one above the other:
`EEEESSSEEEEEEEEEEESSS` is expected, and yours is `SSSEEEEEEEEEEESSSEEEE`.

Put `reversed` back, and run `pytest planner` again: `5 passed`.

**Why:**
- Without `reversed`, the moves are in G-to-S order: `SSSEEEEEEEEEEESSSEEEE`. Driven from S, that
  goes down 3 tiles, east 11, then south, straight into the wall at row 5, column 12. The test
  walked it and caught it.
- `test_straight_corridor` still passed. Reversing `EEEE` gives `EEEE`, so that test can't see this
  bug. That's why you need several tests, each on a different case.
- Now you know what this failure looks like and what it means. Next time you see it, you'll know
  where to look. Reading a failure calmly, and working out *what* the test was checking, is most
  of debugging.

### Step 12 · Commit, push, pull request

**Do:**

```
git add planner/plan.py planner/test_plan.py
git commit -m "Handle no route and bad maps; add tests"
git push -u origin stop-02-plan-a-route
```

**Do,** on GitHub. Stop 1 showed each of these screens in full (Steps 13–16):

1. Open your repo, `github.com/<your-username>/courier`. On the yellow banner, click **Compare &
   pull request**. *No banner?* Open the link `git push` printed, or click **Pull requests** →
   **New pull request** → set **compare:** to `stop-02-plan-a-route` → **Create pull request**
   (Stop 1, Step 13).
2. Fill in the template: **Stop:** 2, and your explain-back, for example: *"Plans the robot's shortest route with BFS and remembers each tile's parent, so the moves can be rebuilt; bad maps give a message and exit code 2."*
   Click **Create pull request**.
3. Scroll to the box of checks at the bottom of the **Conversation** tab. Wait until every check
   shows a green ✓ (about a minute). *A red ✗?* Click **Details** next to it and read the ✗ line
   (Stop 1, Step 15). Fix it in the Codespace on the same branch, then `git add`, `git commit` and
   `git push`. The PR updates and the checks run again.
4. Click **Merge pull request** → **Confirm merge**. Then click **Delete branch**.
5. Back in the Codespace terminal, bring the merged `main` into your Codespace:

   ```
   git switch main
   git pull
   ```

6. Stop your Codespace if you're done for the day: [github.com/codespaces](https://github.com/codespaces)
   → **⋯** → **Stop codespace** (Stop 1, Step 3e).

**You'll see:** on the PR, `stop-02 · route planner tests` is green. Click **Details** next to it.
The step **planner tests** ends with `✓ Stop 2: all planner tests pass.`, and the step after it,
**your robot drives the planner's route (simulator)**, ends with:

```
Pip drove 21 of 21 moves
✓ Pip ended on G (0.5 cm from its centre)
  robot time 22.4 s · LED toggled 0 times · 0 bumps
```

with your robot's name from `robot.json`. `stop-01` stays green: its checks keep running, so a
later change can't quietly break an earlier stop. The other jobs still say their stops haven't
started.

**Why:**
- Two commits, each of which works, tell the story of the change: first the route, then the
  unhappy cases and tests. A reviewer can read them in order.
- CI runs exactly what you ran (`pytest planner`), on a fresh computer. The same tests now guard
  your planner on every future change.
- Then CI hands your route to the **simulator** (Stop 1, Step 18), which drives a robot along it
  on the office floor and checks that it ends on G without touching a wall. That's why a route
  that passes the tests but walks through a wall would still go red here.

### Step 13 · Your robot drove it

**Do:** nothing new: you already saw it in Step 12. The step **your robot drives the planner's
route (simulator)** in the `stop-02` job is your robot driving `EEEESSSEEEEEEEEEEESSS` across the
office floor, from S to G, 21 moves in about 22 seconds of robot time.

**Why:** the letters you printed are what the robot follows. In this job, a driver we wrote reads
them and drives. **In Stop 3 you write that driver yourself**, in the robot's own program, and
`npm run sim` (Stop 1, Step 18) shows it driving in your own terminal.

✅ **Checkpoint E:** your Stop 2 PR is merged, with green `stop-01` and `stop-02` checks.

---

## The whole file

`planner/plan.py` at the end of the stop (81 lines, with comments):

```python
# planner/plan.py — your robot's route planner (Stop 2).
#
# Run it from the top folder of your repo:
#     python3 planner/plan.py maps/office.txt
#
# It reads the map file, finds the shortest route from S to G with BFS, and prints the moves
# (N, E, S, W). Exit codes: 0 route printed · 1 no route · 2 couldn't read the map.

import sys
from collections import deque

MOVES = {"N": (-1, 0), "E": (0, 1), "S": (1, 0), "W": (0, -1)}


def read_map(path):
    """Read a map file and return its rows as a list of strings."""
    with open(path) as f:
        return [line.rstrip("\n") for line in f if line.strip()]


def find(grid, letter):
    """Return (row, col) of the first `letter` in the grid, or None if it isn't there."""
    for row, line in enumerate(grid):
        col = line.find(letter)
        if col != -1:
            return (row, col)
    return None


def plan(grid):
    """Return the shortest route from S to G as a string of moves, or None if there is none."""
    start, goal = find(grid, "S"), find(grid, "G")
    if start is None or goal is None:
        raise ValueError("the map needs one S and one G")
    came_from = {start: None}   # tile -> (the tile before it, the move from there)
    queue = deque([start])
    while queue:
        cell = queue.popleft()
        if cell == goal:
            break
        row, col = cell
        for move, (dr, dc) in MOVES.items():
            nxt = (row + dr, col + dc)
            r, c = nxt
            if 0 <= r < len(grid) and 0 <= c < len(grid[r]) and grid[r][c] != "#" and nxt not in came_from:
                came_from[nxt] = (cell, move)
                queue.append(nxt)
    if goal not in came_from:
        return None
    moves = []
    cell = goal
    while came_from[cell] is not None:
        cell, move = came_from[cell]
        moves.append(move)
    return "".join(reversed(moves))


def main(argv):
    """Run the planner on the map named in argv; return the exit code."""
    if len(argv) != 2:
        print("usage: python3 planner/plan.py <map file>", file=sys.stderr)
        return 2
    try:
        grid = read_map(argv[1])
    except FileNotFoundError:
        print(f"can't open {argv[1]}", file=sys.stderr)
        return 2
    try:
        route = plan(grid)
    except ValueError as err:
        print(err, file=sys.stderr)
        return 2
    if route is None:
        print("no route from S to G", file=sys.stderr)
        return 1
    print(route)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
```

## Now you: do it

In **your** repo, make the same change: a branch, `plan.py` built up in the same steps, the five
tests switched on, two commits, a PR, green checks, merge. You may write the code your own way:
the tests check what it does, not how it's written. Keep the neighbour order N, E, S, W (Step 5).

**Make it yours (optional):** draw your own floor in `maps/my-floor.txt`. Work out its shortest
route by hand, and add a test that checks `plan` finds a route of that length.

## What's new here, compared with an algorithm exercise

| In an exercise | In a program |
| --- | --- |
| the website calls your function with the input | you run the program, and it reads its input: a file named by an argument |
| you return the distance | you keep the path (`came_from`) and print the moves |
| inputs are always valid | bad input gets a clear message on standard error and an exit code |
| the website checks your answer | your own tests check it, on every push, in CI |

## Words you met, and where

| Word | Explained in |
| --- | --- |
| program | Step 1 |
| command-line argument, `sys.argv`, `import`, module | Step 2 |
| text file, `open`, `with`, newline `\n`, `rstrip`, `strip`, scaffolding | Step 3 |
| coordinates (row, column), `None` | Step 4 |
| `came_from`, `deque`, why BFS gives the shortest route | Step 5 |
| `reversed`, `"".join` | Step 6 |
| `raise`, `ValueError` | Step 7 |
| exit code, `echo $?`, standard output, standard error, `try … except`, `FileNotFoundError`, f-string, `sys.exit` | Step 8 |
| `if __name__ == "__main__"` | Step 9 |
| test, pytest, `pytest planner`, `assert`, `follow`, `Path(__file__)`, `pytest.fail`, `capsys` | Step 10 |
