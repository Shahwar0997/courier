# Courier: build a robot fleet from scratch

> **Next step:** go back to your Curious Sims tab and press **Add Curious Sims to my copy**.
> Then you'll do every stop from your workshop there.

Welcome. This repository holds the code for **Courier**, a small fleet of delivery robots that
you build yourself, one step at a time, on [Curious Sims](https://curiousims.com) (Builders' Isles).
By the end, your robots plan routes, drive, talk to a fleet server, show up on a live map, see
with a (simulated) camera, and take orders in plain English. Every line of that is code you wrote,
in this repo. The robots run in a simulator, so you need only a browser for the whole course; a
real robot kit is an optional extra at the very end (Stop 24).

You don't need to know anything about robots, servers or tools to start. If you're comfortable
with basic algorithms and data structures (functions, loops, lists
or arrays, dictionaries or maps, BFS on a grid), you have everything this course assumes. Every
other word and tool is explained here or in the stop that first needs it.

---

## What is this repository?

A **repository** ("repo") is a project folder that remembers its whole history. Every time you
save a change on purpose (a **commit**), the repo keeps a snapshot of all its files, with a
message that says what changed. **Git** is the tool that keeps that history. **GitHub** is the
website that stores a copy of your repo online, so you can reach it from anywhere, show it to
people, and let robots (CI, below) check each change.

This particular repo is a **template**: a starting point that everyone copies. You don't change
this one. You make **your own copy**, which is yours: your code, your history, your robot.
Stop 1's walkthrough, [`stops/01/WALKTHROUGH.md`](stops/01/WALKTHROUGH.md), takes you through
all of this click by click, with what to do when something looks different.

## Get started

Each stop's Build part happens here, on GitHub, in your own copy of this repo:

1. **Accept your GitHub invitation.** This starter is private. GitHub emails you an invitation to
   `curiousims/courier`: open it, click **View invitation**, then **Accept invitation**
   (no email? signed in to GitHub, open
   [github.com/curiousims/courier/invitations](https://github.com/curiousims/courier/invitations)). **Until you
   accept, `github.com/curiousims/courier` shows "404"**: GitHub hides private projects
   from anyone who isn't in yet. No GitHub account yet? Make one first at
   [github.com/signup](https://github.com/signup) (for people aged 13 and over; your username
   appears on your work, so choose one you'd be happy to put on a resume). No invitation? Reply to
   the email you got your Courier invitation from, with your GitHub username.
2. **Make your own copy.** At the top of this page, click **Use this template → Create a new
   repository**. Name it `courier` and choose **Private** (only you can see it; you can make it
   public later to show it off).
3. **Open it in a Codespace.** On *your* new repo, click **Code → Codespaces → Create codespace
   on main**.
4. **Follow the walkthroughs** in your Codespace, starting with `stops/01/WALKTHROUGH.md`. Stops
   1–5 have one so far.

A **Codespace** is a computer in the cloud that you use through your browser. It opens
**VS Code**, a code editor, with everything this course needs already installed: Python,
the tools that build robot firmware, the robot simulator, and (later) Docker. You install nothing on your own
computer. The Codespace already holds a **clone** of your repo: a working copy, linked to the
one on GitHub.

> **Mind the free hours.** A free GitHub account includes about 60 hours a month on the
> smallest Codespace. When you finish for the day, stop it: on
> [github.com/codespaces](https://github.com/codespaces), click **⋯ → Stop codespace**. Your
> files are kept. (Hours and prices are GitHub's; check their pricing page if they change.)

**Your first commands.** At the bottom of VS Code is the **terminal**, where you type commands
to the computer. Try these (Stop 1's walkthrough explains each one):

```
pwd                                   # where am I? → /workspaces/courier
ls                                    # what's in this folder?
python3 checks/check_robot_json.py    # run a program: checks your robot.json
git status                            # which branch am I on, and what changed?
```

## What each file and folder is for

You'll meet these one at a time. The **Stop** column says when.

| Path | What it is | Stop |
| --- | --- | --- |
| `README.md` | This page: the front page of the repo. Written in **Markdown**, plain text where `#` makes a heading and `**…**` makes bold. | 1 |
| `robot.json` | Your robot's name and colour. Changing it is your first commit. It's **JSON**, data written as text: it looks like a dictionary (a map from keys to values) written with double quotes. | 1 |
| `stops/` | One folder per stop, each with a `WALKTHROUGH.md`: the expert's steps with the *why* for each one. Stops 1–6 so far. | 1 → |
| `checks/` | Small Python programs that check your work and say, in plain English, what to fix. CI runs them; you can too. | 1 → |
| `.github/` | Settings for GitHub. Names that start with `.` are hidden by default. Inside: `workflows/checks.yml` (the CI), `workflows/curiousims-cloud.yml` (deploying, switched off until Stop 15) and `pull_request_template.md` (the questions every pull request answers). | 1 |
| `.devcontainer/` | The recipe for your Codespace: which tools to install and which ports to open. | 1 |
| `maps/` | Floors of the office your robots deliver in, drawn as text: `#` wall, `.` floor, `S` start, `G` goal. | 2 |
| `planner/` | Your route planner: `plan.py` finds the shortest route from S to G, and `test_plan.py` tests it. | 2 |
| `firmware/` | The program that runs on the robot's chip, in C++. `src/main.cpp` is yours (from Stop 4, with more files next to it); `lib/courier/` knows which pin is wired to what. From Stop 5, `lib/odometry/` and its tests in `test/` are yours too. | 3 → |
| `cli/`, `fleet.json` | `courier`, your command-line tool for sending robots on deliveries (`cli/courier.py`, with its tests), and the list of your robots and where to reach them. | 6 |
| `sim/` | About the robot simulator. `npm run sim` runs your firmware in it from the terminal and says where the robot ended up; CI uses the same simulator. | 1 → |
| `package.json`, `package-lock.json`, `tools/` | What `npm run sim` runs: the simulator itself (`tools/courier/`) and its compiler, and `tools/get-course-updates.sh` ([Getting course updates](#getting-course-updates)). You don't change these. `node_modules/` appears when the Codespace installs the compiler; Git ignores it. | 1 |
| `requirements-dev.txt` | The Python tools this repo uses (pytest for Stop 2, PlatformIO for Stop 3), with exact versions. The Codespace installs them when it's created. | 1 |
| `compose.yaml`, `infra/` | The services your fleet server will use: a database, an event stream and a message broker, run with Docker. Not needed until Stop 8. | 8 → |
| `.gitignore` | Files Git should never save, like build output and secrets. | 1 |

## How every stop works

Each stop has the same five beats:

1. **See it** — a short interactive lesson on Curious Sims shows the idea on your robot.
2. **Watch it** — an expert does the stop step by step, saying *why* at each step, in
   `stops/NN/WALKTHROUGH.md` (Stops 1–6 so far).
3. **Do it** — you make the same change in this repo, on a **branch** (a separate line of work,
   so `main` stays safe), and open a **pull request** (a request to merge your branch into `main`).
4. **Check it** — CI runs the stop's checks and shows ✓ or ✗ on your pull request.
5. **Say it** — in the pull request, write one sentence: *what does this change make the robot
   do, and why this way?*

## CI: the checks on every change

**CI** (continuous integration) means that every time you push commits to GitHub, GitHub starts
a fresh computer, gets your code, and runs checks on it. **GitHub Actions** is the GitHub
feature that does it; `.github/workflows/checks.yml` says what to run. Each stop has its own
**job** (`stop-01`, `stop-02`, `stop-03`, …), shown on your pull request's **Checks** tab.

A stop's job says "hasn't started yet" and passes until you begin that stop. After that it stays
on, so a later change can't quietly break an earlier stop. You can run any check yourself first:

| Stop | Run it yourself |
| --- | --- |
| 1 | `python3 checks/check_robot_json.py` |
| 2 | `pytest planner` |
| 3 | `python3 checks/check_stop_03.py --build`, then `python3 checks/check_stop_03.py` |
| 4 | `python3 checks/check_stop_04.py` |
| 5 | `pio test -e native -d firmware` (or `python3 checks/check_stop_05.py`) |
| 6 | `pytest cli` (or `python3 checks/check_stop_06.py`) |

**If your copy of this repo is older than the walkthroughs in `stops/`,** its checks are older
too, and a few go red that aren't about your work:
- from Stop 4 on, **`stop-03`** with `fatal error: 'courier.h' file not found`;
- from Stop 5 on, **`stop-04`** at `✗ Still delivers: Pip hit a wall …`;
- from Stop 6 on, **`stop-03`** at `✗ The LED never came on`.

Your work is fine, and you can merge with those red. Stops 4–6's walkthroughs say what counts.
Stop 5's test drives also need a longer command for now; its walkthrough says which.
[Getting course updates](#getting-course-updates) brings the newer checks into a copy you've
already made.

## Getting course updates

The course keeps improving: checks get fixed, and new walkthroughs arrive. Your repo is a copy of
the template from the day you made it, so it doesn't change by itself. There are two ways to bring
the updates in. Pick the one that matches where you are.

### Haven't built anything yet? Make a fresh copy

This is for you if you've done no more than Stop 1 (naming your robot). It takes five minutes, and
you won't use a terminal.

1. **Move the old repo out of the way.** On your repo: **Settings** → **Repository name** → type
   `courier-old` → **Rename**. Nothing is deleted.
2. **Delete its Codespace**, so it doesn't use your free hours or storage. Anything you
   changed there but didn't commit and push is deleted with it. If it has a change you want to
   keep, note it down first (Stop 1's change is one line). On
   [github.com/codespaces](https://github.com/codespaces), click **⋯** next to it → **Delete**.
3. **Make a new copy**, as in Stop 1's walkthrough, Step 2d: on the template, click **Use this
   template → Create a new repository**, name it `courier`, choose **Private**. Then open a new
   Codespace on it (Step 3).
4. If you'd already named your robot, do Stop 1's change again: it's one line in `robot.json`.

### Already built something? Bring the updates into your repo

This takes about ten minutes. Your work and your history stay exactly as they are. A small
program, `tools/get-course-updates.sh`, does the copying. It follows one rule, file by file:
- a file **you haven't changed** gets the template's new version;
- a file **you have changed** (your planner, your firmware) is kept exactly as it is;
- a file that's **new** in the template (a new walkthrough, a new check) is added.

It works on a new branch and pushes nothing, so you can look first.

1. **Finish the stop you're on first.** Merge its pull request (Stop 1, Step 16), then bring it
   into your Codespace: `git switch main`, then `git pull` (Stop 1, Step 17). The update program
   looks at `main`, so it only sees work that's merged there; work still on a branch would clash
   with the update later. If you have a branch you aren't ready to merge, get the updates after
   you merge it. Then run `git status`: if it lists changed files, commit them on a branch and
   merge that too.
2. **Download the template.** Open
   [github.com/curiousims/courier](https://github.com/curiousims/courier), click
   **<> Code** → **Download ZIP**. Your browser saves `courier-main.zip`.
3. **Put it in your Codespace, and run the update.** Drag the ZIP from your computer onto the
   file list on the left of VS Code (or right-click the empty space under the files →
   **Upload…**). Then paste this into the terminal:

   ```
   cd /workspaces/courier
   git switch main
   git pull
   rm -rf /tmp/courier-update
   python3 -m zipfile -e courier-main.zip /tmp/courier-update
   rm courier-main.zip
   bash /tmp/courier-update/*/tools/get-course-updates.sh
   ```

   If you named your repo something other than `courier`, use that name in the first line.
   `python3 -m zipfile -e` unzips the template into `/tmp`, a scratch folder outside your repo.
   Then the last line runs the template's own copy of the update program.
4. **Read what it says.** It lists the files it **Updated**, the files it **Added**, and the files
   it **Kept as you have them**. To see how one of the kept files differs from the template's
   version, run the `code --diff …` line it prints.
5. **Push the branch:** `git push -u origin course-update` (or the branch name it printed).
6. **If it listed `.github/workflows/checks.yml`, update that file on github.com.** Your Codespace
   isn't allowed to push changes to workflow files (the files that tell CI what to run). This is
   a GitHub safety rule, so you make this one change yourself on the website:
   1. Open the template's
      [`checks.yml`](https://github.com/curiousims/courier/blob/main/.github/workflows/checks.yml)
      and click **Copy raw file** (the two-squares icon above the file).
   2. Open your own repo on github.com. In the branch menu (it says **main**), choose
      **course-update**. Open `.github/workflows/checks.yml` and click the pencil (**Edit this
      file**).
   3. Select all of the text (Ctrl+A, or ⌘A on a Mac), then paste (Ctrl+V or ⌘V).
   4. Click **Commit changes…**, keep **Commit directly to the `course-update` branch**, and click
      **Commit changes**.
7. **Open a pull request and merge it**, as in Stop 1: click **Compare & pull request**, check
   that it says base `main` ← `course-update`, and click **Create pull request**. The checks run
   on the updated files.

   **A check that was ✓ before may now show ✗.** Updated checks can be stricter, or test
   something new, about a stop you've already finished. Merge the update anyway: your work is
   unchanged, and the check stays ✗ until you fix it. To fix it, click the ✗ job and read its
   message, then open that stop's walkthrough at the step where you run its check (if the stop
   has no walkthrough yet, the check's message is what to go on). Fix it on a new branch, as you
   would for any stop; the check turns ✓ when that pull request runs.

   Then merge the update: **Merge pull request** → **Confirm merge**.
8. **Bring it into your Codespace:** `git switch main`, then `git pull`. Start your next stop's
   branch from here, as usual.

**Stuck?**

| What you see | What it means | What to do |
| --- | --- | --- |
| "404" when you open the template | You aren't signed in, or your invitation isn't accepted | See Get started, step 1 |
| `✗ You have changes that aren't committed yet` | Step 1 isn't done | Commit (or undo) them, then run step 3's last line again |
| `✗ You're on the branch '…'` | The update starts from `main` | Run step 3 again from `git switch main` |
| `error: Your local changes … would be overwritten` at `git pull` | Changes on `main` that aren't committed | `git status` shows them. Commit them on a branch, then try again |
| `No such file or directory` for the ZIP | The ZIP isn't in `/workspaces/courier`, or your browser named it differently | Run `ls` to see its name, and use that name in step 3 |
| `! [remote rejected] … refusing to allow … to create or update workflow` when you push | Your branch changes a file in `.github/workflows/`. The program never does that, so the change came from somewhere else | `git checkout main -- .github/workflows`, then `git commit -m "Leave workflows to github.com"`, and push again. Then do step 6 |
| `CONFLICT (content): Merge conflict in …` and `Automatic merge failed`, or your stop's pull request says **This branch has conflicts** | You got the update while that stop's work was still on its branch (step 1). The update and your branch both changed the same file, and Git can't combine them by itself | To go back: `git merge --abort`. Your branch is exactly as it was. To finish, keeping your work: do step 8 first (`git switch main`, then `git pull`), then `git switch <your-branch>` and `git merge --no-edit main`. Then `git checkout --ours -- $(git diff --name-only --diff-filter=U)`, which keeps your version of each file you both changed (the same rule the update follows). Then `git commit -a --no-edit` and `git push`. Your pull request can be merged again |
| `✓ Nothing to bring in` | You already have every update | Nothing to do |

**Why not `git merge`?** A repo made with **Use this template** starts a new history with one
commit, so it shares no history with the template. `git merge` refuses ("refusing to merge
unrelated histories"), and forcing it marks almost every file as a conflict. The update program
compares files instead.

## Later: services in Docker (Stop 8 onwards)

You don't need this yet. From Stop 8 your fleet server stores data in a database and passes
messages around. Those programs run in **Docker**: each one in its own **container**, a small,
sealed-off computer inside your Codespace. `compose.yaml` lists them, and one command starts them:

```
docker compose up -d     # start them in the background
docker compose ps        # are they running and healthy?
docker compose down      # stop them (your data is kept)
```

| Service | What it's for | Address from your Codespace | Stop |
| --- | --- | --- | --- |
| Postgres | the database: robots, missions, telemetry | `localhost:5432` | 8 |
| Mosquitto (MQTT) | robots publish readings and receive commands | `localhost:1883` | 12 |
| Redpanda (Kafka) | a stream for a hundred robots' telemetry | `localhost:19092` | 18 |

They are only reachable from inside your Codespace, never from the internet.

## A note on AI coding assistants

Codespaces can offer an AI assistant (Copilot). We suggest keeping it off until the AI island:
learners who write the code themselves understand it better and debug it faster. The checks
don't forbid it; it's your choice.

## Your code is yours

This repo is yours, not ours. Curious Sims doesn't keep a copy of your code. Keep it private
while you build; making it public at the end, to show your work, is up to you.
