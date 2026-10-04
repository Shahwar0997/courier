# Stop 1 · Your workshop: Git, GitHub, Codespaces, CI — walkthrough

In this walkthrough you watch an expert do the whole stop once. Then you do the same in your
own repo. By the end the expert has:

- their own copy of this project on GitHub, called `courier`;
- a computer in the cloud with everything installed (a Codespace);
- one small change, naming the robot **Pip** and making it orange. It went in the way
  professional teams do it: **branch → commit → push → pull request → checks → merge**.

**Time:** about 2 hours the first time, including 20–40 minutes of setup (Part A). **You need:**
a browser (Chrome or Edge work best), an email address, and to be 13 or older. That's all you
need for the whole course: every stop runs in the **simulator**, a pretend robot that runs on a
computer in the cloud (Step 18 shows it). (A real robot is an optional extra at the very
end.)

## How to read this walkthrough

Every step has three parts:

- **Do:** exactly what the expert clicks or types. Commands are in grey boxes. Type them yourself
  rather than pasting: your fingers learn them faster.
- **You'll see:** what appears. If you see something else, look for a **Stuck?** note under
  the step.
- **Why:** what the step is for, in terms of your robot. This is the part to understand. The
  clicks you'll soon know by heart.

The steps are grouped into five parts (A–E), and each part ends with a ✅ **checkpoint**. Before
you read a step's *Why*, try to guess it. Guessing first, even wrongly, makes the answer stick.

Words in **bold** are new, and each one is explained where it first appears. The table at the
end says where.

---

## Part A · Get your own copy of the project

> **How Build works.** Each stop's Build part happens on GitHub, in your own copy of this
> starter. Getting there takes four moves: **make a GitHub account** (Step 1), **accept your
> invitation** to the Courier starter (Step 2a–2b), **make your own copy** of it with **Use this
> template** (Step 2c–2f), and **open your copy in a Codespace** (Step 3). Then you follow this
> walkthrough in your Codespace. If you already have a `courier` repo made from the starter, skip
> to Step 3.

Part A is all clicking in the browser; the terminal starts in Part B. It takes about 20–40
minutes the first time, mostly waiting for emails and for your Codespace to be built.

> **Screens change.** GitHub redesigns its pages now and then. The words in **bold** are the
> words on GitHub's screens, and the boxes like the one below are simplified sketches of those
> screens, not pictures of them. Both were checked against GitHub's own help pages on
> 2026-09-30. If a button has moved or been renamed, look for the same word nearby. The steps
> themselves don't change.

### Step 1 · Make a GitHub account (skip if you have one)

**Already have an account?** Sign in at [github.com](https://github.com) and go to Step 2. Your
existing account is fine. You don't need a new one for this course.

**Before you start, you need:**
- **To be 13 or older.** That's GitHub's rule, in its Terms of Service, not ours. Some countries
  set a higher minimum age, and that one applies to you. If you're younger, you can't make a
  GitHub account yet, and every Courier stop from here on needs one.
- **An email address you can open right now.** GitHub sends a code to it. Temporary
  "throwaway" addresses don't work: GitHub refuses them. School email sometimes blocks outside
  messages, so a personal address is safer.
- About 10 minutes.

**Why an account:** **GitHub** is the website where your robot's code will live. It keeps the
code safe, lets you show it to people, and runs checks on it for you. Your account is your
identity there: everything you make carries your username.

#### 1a · Open the sign-up page

**Do:** go to [github.com/signup](https://github.com/signup). (Or go to github.com and click
**Sign up** at the top right.)

**You'll see:** a form to create your free account, something like this. The fields may come
one at a time instead of all together.

```
┌─ Sign up for GitHub ─────────────────────────────┐
│  [ Continue with Google ]  [ Continue with Apple ] │
│  ─────────────────── or ───────────────────        │
│  Email*               [                        ]   │
│  Password*            [                        ]   │
│  Username*            [                        ]   │
│  Your Country/Region* [                      ▾ ]   │
│  ☐ Email preferences: product updates             │
│                  [ Continue ]                     │
└──────────────────────────────────────────────────┘
```

**Why:** **Continue with Google** or **Continue with Apple** would sign you up with that account
instead of a GitHub password. Either way works. The steps below use the email form, because it
doesn't tie your GitHub account to another company's account.

#### 1b · Email and password

**Do:** type your email. Then choose a password: **at least 15 characters, or at least 8 with a
number and a lowercase letter** (GitHub's rule). A short sentence you'll remember is a good
password. Don't reuse a password from another site.

**Why:** GitHub sends your sign-up code and any password reset to this email. It isn't shown on
your profile unless you choose to show it.

**Stuck?**
- *"Email is invalid or already taken":* check for a typo. If you made an account with this email
  before, sign in instead (**Sign in**, then **Forgot password?** if you need to).
- *The password is refused:* GitHub also refuses passwords that have leaked from other websites.
  Choose a different one.

#### 1c · Username

**Do:** type a username. It may contain **letters, numbers and single hyphens** (`-`), can't
start or end with a hyphen, and can be up to 39 characters.

**Why:**
- Your username is in the address of everything you make: your repo will be
  `github.com/<your-username>/courier`. It's also on every change you save and every pull
  request you open.
- **You don't need your real name.** If you're under 18, don't use your full name. A nickname
  is fine.
- Pick one you'd be happy to put on a resume one day, like `sam-builds` or `pip-the-maker`.
  Avoid ones you'll outgrow.

**Stuck?** *"Username … is not available":* someone already has it. Add a word or a number and
try again. GitHub may suggest free ones under the field. You can change your username later in
your settings, but links you've already shared may stop working, so choose carefully now.

#### 1d · Country or region, and the email box

**Do:** choose your country or region. The **Email preferences** tick box is optional: it's for
GitHub's product news. Leave it empty if you don't want those emails. Click **Continue**.

**You'll see:** the puzzle in 1e. If a field turns red instead, its message says what to fix
(1b and 1c list the usual ones).

**Why:** GitHub asks where you live because its rules, such as the minimum age, can depend on
the country.

#### 1e · Prove you're a person

**Do:** GitHub shows a short puzzle to check that a person, not a program, is signing up. Follow
its instructions.

**Why:** GitHub's rules say a person has to create each account, and each person may have only
one free account.

**Stuck?** If the puzzle keeps failing, try its audio version if there is one, or try another
browser. Ad blockers and privacy extensions can stop the puzzle from loading, so turn them off
for github.com.

#### 1f · Enter the code from your email

**Do:** open your email. Find the message from GitHub with a code, and type that code into the
page GitHub is showing.

**You'll see:**

```
┌─ Confirm your email address ───────────┐
│  We sent a code to you@example.com     │
│  Enter code  [ _ _ _ _ _ _ _ _ ]       │
│  Didn't get your email? Resend the code │
└────────────────────────────────────────┘
```

**Why:** this proves the email is yours. Without a confirmed email, GitHub won't let you make a
repository (a project folder on GitHub; Step 2 explains it).

**Stuck?**
- *No email after 5 minutes:* check your spam, junk and "promotions" folders. Then click the
  resend link on the page.
- *You typed the email wrong:* go back to github.com/signup and start again with the right one.
- *The code or link has expired:* codes and links only work for a while (a link for 24 hours).
  Ask for a new one.

#### 1g · Sign in, and skip the questions

**Do:** if GitHub asks you to sign in, use your new username (or email) and password. GitHub
may then ask a few questions (how many people you work with, what you want to use GitHub for)
and show you its plans. Answer "just me", or click the **Skip** link. If it asks you to choose a
plan, choose **Free**. **Never enter a payment card.** Courier only needs the Free plan.

**You'll see:** your GitHub home page (your **dashboard**), with your profile picture at the top
right. It's a coloured pattern until you change it.

**Why:** the Free plan includes everything Courier uses: private repos, Codespaces hours (Step 3)
and the automatic checks (Part E).

**Stuck?** *A page offers a free trial of a paid plan or an AI assistant:* you don't need it.
Look for **Skip**, **Continue for free** or **Not now**, or just go to
[github.com](https://github.com).

#### 1h · Signing in again later

**Do:** nothing yet. Just know this for later. When you sign in from a new browser or computer,
GitHub may email you a code to type in, even with the right password.

**You'll see:** after your password, a page asking for a **verification code** that GitHub has
just emailed you. Type the code from the email.

**Why:** it's GitHub checking that the person signing in can also open your email. It happens
less once your browser is known to GitHub. Don't clear your browser's cookies for github.com
every day, or it will happen every time.

**Stuck?** *No email:* check your spam folder, wait a minute, and use the page's link to send a
new code. Check that it went to the email address on your GitHub account.

#### 1i · Two-factor authentication, when GitHub asks for it

**Two-factor authentication** (**2FA**) means that signing in takes two things: your password,
and a 6-digit code from an app on your phone. The code changes every 30 seconds. With 2FA, a
stolen password alone can't get into your account.

**When:** GitHub requires 2FA from accounts that do certain things, like publishing releases.
You'll know if you are asked: GitHub shows a banner and sends an email, with a date by which to
turn it on. You can also turn it on now, and we recommend it.

**Do** (GitHub's steps):
1. Install an **authenticator app** on your phone. Any app that makes "TOTP" codes works. If
   you're under 18, ask a parent which app to use.
2. On GitHub, click your profile picture (top right) → **Settings** → **Password and
   authentication** (in the "Access" part of the left sidebar).
3. Click **Enable two-factor authentication**.
4. Scan the QR code with the app. The app now shows a 6-digit code for GitHub. Type it under
   **Verify the code from the app**.
5. Under **Save your recovery codes**, click **Download**, and keep the file somewhere safe.
   Print it, or store it in a password manager.
6. Click **I have saved my recovery codes**.

**You'll see:** while you set it up, one page with three parts: a **QR code** to scan, a box
under **Verify the code from the app**, and **Save your recovery codes** with a **Download**
button. When you're done, the **Two-factor authentication** part of the settings page says it's
on. From then on, signing in asks for your password and then the 6-digit code from the app.

**Why step 5 matters most:** **recovery codes** are one-time codes that let you in if you lose
your phone. If you lose both your phone and your recovery codes, **GitHub can't give your
account back**, and your robot's code goes with it. Keep them where you keep important papers.

**Stuck?**
- *The app can't scan the QR code:* click **setup key** under the QR code. GitHub shows a code
  you can type into the app instead.
- *GitHub says the 6-digit code is wrong:* type the code the app shows *now*, since it changes
  every 30 seconds. If it keeps failing, your phone's clock may be off. Set its date and time to
  "automatic".
- *You've lost your phone:* on the sign-in page that asks for the 6-digit code, choose the option
  to use a recovery code, and type one of your saved codes. Each code works once.

### Step 2 · Accept your invitation, and make your repository from the template

The Courier **starter** is a private project on GitHub, `curiousims/courier`. Private
means GitHub only shows it to people who have been invited. Curious Sims invites your GitHub
account, and you accept.

#### 2a · Make sure Curious Sims knows your GitHub username

**Do:** if you haven't yet, reply to the email you got your Courier invitation from, and tell us
your GitHub **username** (the name from 1c, not your email or password). We never need your
password. Then wait for 2b's email; it usually comes within a day.

**Why:** an invitation goes to one GitHub account, so we need to know which one is yours.

#### 2b · Accept the invitation from GitHub

**Do:** open the email from GitHub that says you've been **invited to collaborate** on
`curiousims/courier`, and click **View invitation**. On the page that opens, click
**Accept invitation**. (No email? Signed in to GitHub, open
[github.com/curiousims/courier/invitations](https://github.com/curiousims/courier/invitations).)

**You'll see:** the starter's page, `curiousims/courier`, with its list of files.

**Why:**
- **Until you accept, the starter's address shows "404"** (GitHub's "page not found"). Nothing is
  broken: GitHub hides private projects from everyone who isn't in yet, and a hidden page looks
  the same as a missing one.
- The invitation gives you **read** access: you can see the starter and copy it, but not change
  it. Your own copy (2c–2f) is the one you change.

**Stuck?**
- *The email isn't there after a day:* check your spam, junk and "promotions" folders, then
  [github.com/curiousims/courier/invitations](https://github.com/curiousims/courier/invitations).
  Still nothing? Reply to the email you got your Courier invitation from, with your GitHub
  username.
- *"This invitation has expired":* GitHub invitations last 7 days. Reply to that same email and
  we'll send a new one.
- *The invitation went to a different account:* sign out of GitHub and sign in to the account
  whose username you sent us.

A **repository** (**repo**) is a folder for one project, here your robot, together with the
complete history of every change ever made to it. Now you make yours from the Courier starter.

#### 2c · Open the starter, signed in

**Do:** check you're signed in: your profile picture is at the top right. Then open
[github.com/curiousims/courier](https://github.com/curiousims/courier).

**You'll see:**

```
 curiousims / courier           [Private template]
 ────────────────────────────────────────────────────────────
 [ main ▾ ]  Branches  Tags     [ Use this template ▾ ]  [ <> Code ▾ ]
 ┌──────────────────────────────────────────────────────────┐
 │ 📁 .devcontainer  📁 .github  📁 checks  📁 firmware        │
 │ 📁 maps  📁 planner  📁 sim  📁 stops                       │
 │ 📄 README.md  📄 robot.json  …                              │
 └──────────────────────────────────────────────────────────┘
 README: Courier, build a robot fleet from scratch …
```

**Why:** the **template** label means this repo is a starting point that anyone invited can copy. The green
**Use this template** button only appears when you're signed in and have accepted your invitation.

#### 2d · Use this template → Create a new repository

**Do:** click the green **Use this template** button. A small menu opens with two choices. Click
**Create a new repository**.

**Why:** the other choice, **Open in a codespace**, starts working without a repo of your own,
and everything after Part A needs one. Always choose **Create a new repository**.

#### 2e · Fill in the form

**You'll see:** a **Create a new repository** page, with `curiousims/courier` named as
the template at the top:

```
┌─ Create a new repository ───────────────────────────────┐
│ Repository template:  curiousims/courier                 │
│ ☐ Include all branches                                   │
│ Owner*            Repository name*                       │
│ [ your-username ▾ ] / [ courier              ] ✓         │
│ Description (optional) [                          ]      │
│ ○ Public    Anyone on the internet can see this…         │
│ ● Private   You choose who can see and commit…           │
│                          [ Create repository ]           │
└─────────────────────────────────────────────────────────┘
```

**Do,** field by field:
1. **Include all branches:** leave it **off** (not ticked).
2. **Owner:** your username. It's usually the only choice. If you also see a school or company
   name, choose **your username**, so the repo is yours, not theirs.
3. **Repository name:** type `courier`. A green tick or "courier is available" means the name
   is free.
4. **Description:** optional. For example: "My delivery robot, built step by step."
5. **Visibility:** choose **Private**.
6. Click **Create repository**. On some screens it says **Create repository from template**.

**Why:**
- **Include all branches:** a **branch** is a separate line of work (Step 8 explains it). The
  starter's `main` branch has everything you need. Its other branches are our work in progress,
  and you'd only have to ignore them.
- **Name `courier`:** this walkthrough's paths, like `/workspaces/courier`, use that name.
  Repository names may use letters, digits, `.`, `-` and `_`, with no spaces.
- **Private** means only you can see it. You can make it **public** later, when you want to show
  it off (Stop 23). Your code is yours: Curious Sims doesn't keep a copy.

#### 2f · Your new repo

**You'll see:** "Generating your repository…" for a few seconds, then your own repo page:

```
 your-username / courier   [Private]
 generated from curiousims/courier
 ────────────────────────────────────────────────────────────
 [ main ▾ ]                                    [ <> Code ▾ ]
 ┌──────────────────────────────────────────────────────────┐
 │ your-username  Initial commit           1a2b3c4 · now  🕘 1 Commit │
 │ 📁 .devcontainer  📁 .github  📁 checks  📁 firmware        │
 │ 📄 README.md  📄 robot.json  …                              │
 └──────────────────────────────────────────────────────────┘
 README: Courier, build a robot fleet from scratch …
```

The address bar says `github.com/<your-username>/courier`, and the page shows the same files as
the starter.

**Why:**
- Your copy has the same files but a **fresh history that is only yours**. **1 Commit** is that
  history so far: one saved snapshot, the starting point. Every change after it will be yours.
  (Step 7 explains commits.)
- **generated from curiousims/courier** is only a label. Nothing you do here changes the
  starter, and nothing we change in the starter changes your repo. When the course improves, the README's
  **Getting course updates** section shows how to bring the changes in.
- The green **<> Code** button is where you'll open your Codespace next.

**Stuck?**

| What you see | What it means | What to do |
| --- | --- | --- |
| No **Use this template** button | You're signed out, your invitation to the starter isn't accepted yet, or you're already on your own `courier` repo (it isn't a template) | Sign in, and accept the invitation (see the next row). If the address has your username, your repo already exists: go on to Step 3 |
| "404: This is not the web page you are looking for" on the starter | The starter is private, and you haven't accepted your invitation to it yet (or you're signed in to a different GitHub account) | Accept the invitation: 2b. If you have no invitation yet, see 2a |
| "The repository courier already exists on this account" | You made it before | Open `github.com/<your-username>/courier` and use it. If it's something else, name the new one `courier-robot`, and read `/workspaces/courier-robot` wherever this course says `/workspaces/courier` |
| Your repo says **Public** | You chose Public by mistake | On your repo: **Settings** (top) → scroll down to **Danger Zone** → next to "Change repository visibility", click **Change visibility** → **Make private**, and confirm |
| Your repo lists several branches | **Include all branches** was ticked | It's harmless. Ignore the other branches and always start from `main` |

### Step 3 · Open your Codespace

A **Codespace** is a computer in the cloud that you use through your browser. You'll write and
run all your code there, so you install **nothing** on your own computer.

#### 3a · Make sure you're on your own repo

**Do:** look at the address bar. It must say `github.com/<your-username>/courier`, **not**
`curiousims/courier`.

**Why:** a Codespace belongs to the repo you open it from. One opened on the starter can't send
your changes anywhere, because the starter isn't yours.

#### 3b · Code → Codespaces

**Do:** click the green **<> Code** button, then the **Codespaces** tab (next to **Local**).

**You'll see:**

```
┌─ [ Local ]  [ Codespaces ] ───────────────────────────┐
│ Codespaces                                   [+] [⋯]  │
│ Your workspaces in the cloud                          │
│                                                       │
│ No codespaces                                         │
│ You don't have any codespaces with this repository    │
│ checked out                                           │
│            [ Create codespace on main ]               │
│                                                       │
│ Codespace usage for this repository is paid for by    │
│ your-username                                         │
└───────────────────────────────────────────────────────┘
```

**Why:** "paid for by your-username" means the time counts against **your account's free
monthly hours** (3g). It isn't money: without a payment card on your account, GitHub stops you
at the free limit and never charges you.

#### 3c · Create codespace on main

**Do:** click **Create codespace on main**.

**You'll see:** a new browser tab, **Setting up your codespace**, with a progress list and a
**View logs** link. The first time takes a few minutes, because it's installing the tools.

**Why:** GitHub is starting a computer for you and setting it up from a recipe in your repo,
`.devcontainer/devcontainer.json`. The recipe installs Python, the tools that build robot
**firmware** (the program that runs on the robot's own chip, from Stop 3), and the robot
simulator, so every learner gets exactly the same setup. *"on main":*
`main` is the repo's main line of work. Step 8 explains it.

#### 3d · Wait for the setup to finish

**You'll see:** **VS Code** opens in the tab, with `README.md` showing. A **terminal** panel at the
bottom may still be busy with the recipe's last step (lines like `Collecting pytest …`,
`Installing …` and `added 1 package` as it installs the test, firmware and simulator tools). Wait until it stops and shows a
line ending in `$`, something like:

```
@your-username ➜ /workspaces/courier (main) $
```

Small pop-ups may appear at the bottom right. You can close them. If a **Copilot** chat panel
opens on the right, close it too. Copilot is an AI that writes code for you, and this course
suggests learning without it until the AI island (Stop 22): people who code by hand understand
their code better, especially when debugging.

**Why:**
- **VS Code** is a code editor: a program for writing code, with a file list, tabs and a
  terminal built in. Step 4 tours it.
- The Codespace already holds a **clone** of your repo: a full copy, history and all, on the
  computer you're working on, linked to the copy on GitHub. You change the clone, then send your
  changes to GitHub (Step 12).

**Stuck?**

| What you see | What to do |
| --- | --- |
| **Setting up your codespace** for more than 15 minutes, or it says setup failed | Click **View logs** and look at the last lines. Then go to [github.com/codespaces](https://github.com/codespaces), click **⋯** next to the broken codespace → **Delete**, and go back to 3b to create a new one. If GitHub itself is having problems, [githubstatus.com](https://www.githubstatus.com) says so |
| "This codespace is currently running in recovery mode due to a container error." | The recipe failed, so this computer doesn't have Courier's tools. Don't work in it. Delete it as above and create a new one. If it happens twice, reply to the email you got your Courier invitation from and tell us. |
| A blank page, "reconnecting", or "you are offline" | Reload the tab. If it keeps happening, use Chrome or Edge, which GitHub recommends for Codespaces. Your codespace keeps running meanwhile: open it again from [github.com/codespaces](https://github.com/codespaces) |
| No **Codespaces** tab, or "you don't have access to create a codespace" | Check 3a: you're probably on the starter, not your own repo |
| Later, a command says `pytest: command not found` or `pio: command not found`, or `npm run sim` says it can't find the compiler | The recipe's last step didn't finish. Create a fresh codespace (3b), after pushing any work (Step 12) |

#### 3e · Stop your Codespace when you're done

**Do this at the end of every session:**
1. Go to [github.com/codespaces](https://github.com/codespaces) (**Your codespaces**).
2. Click **⋯** to the right of your codespace.
3. Click **Stop codespace**.

(Or, inside VS Code: press **Ctrl+Shift+P** on Windows or Linux, **Cmd+Shift+P** on a Mac, type
`stop`, and choose **Codespaces: Stop Codespace**.)

**Why:** **closing the browser tab doesn't stop a Codespace.** It keeps running, and using your
hours, until 30 minutes pass with no typing or clicking. Stopping keeps all your files, ready for
next time.

#### 3f · Coming back to it later

**Do:** go to [github.com/codespaces](https://github.com/codespaces) and click your codespace's
**name**. GitHub gives each codespace a made-up name of two or three random words. You'll see it
listed next to `your-username/courier`.

**You'll see:** "Starting codespace…", then VS Code as you left it. The terminal starts empty. If
there's no terminal, open the menu (☰ at the top left) → **Terminal → New Terminal**.

**Why:** your files are still in that codespace. **Don't click Create codespace on main again**:
that makes a second, empty codespace, and any work you hadn't pushed stays in the first one.

**Stuck?** *Your codespace isn't in the list:* GitHub **deletes a codespace that has been
stopped for 30 days**. Everything you pushed is safe on GitHub, so create a new codespace (3b).
Anything you hadn't pushed is gone. That's why every session ends with a push (Step 12).

#### 3g · Your free hours, and where to see them

A free GitHub account includes, every month:
- **120 core-hours** of Codespace time. Courier's Codespace has 2 cores, so that's about
  **60 hours** of real time.
- **15 GB-months of storage**: roughly, 15 GB of codespaces kept for a whole month.

**Do:** to see how much you've used, go to [github.com/settings/billing](https://github.com/settings/billing)
(profile picture → **Settings** → **Billing and licensing**) and find **Codespaces**. It shows the
hours and storage used since your monthly allowance last reset.

**Why:** 60 hours is plenty for a few stops a month if you stop your codespace when you're done
(3e). Only a *running* codespace uses hours. A stopped one only uses storage.

**Stuck?** *GitHub says you've used your included Codespaces usage:* you can't start or create a
codespace until your allowance resets at the start of next month. You won't be charged, and your
pushed work is safe on GitHub. To rescue work you hadn't pushed: on
[github.com/codespaces](https://github.com/codespaces), click **⋯** → **Export changes to a
branch**. It saves the codespace's changes to a new branch of your repo on GitHub. Don't add a payment card for this course. To make your hours last, delete codespaces you
no longer use (**⋯ → Delete**, only after pushing).

✅ **Checkpoint A:** you're signed in to GitHub. `github.com/<your-username>/courier` says
**Private** and **generated from curiousims/courier**. VS Code is open in your Codespace,
with a terminal line ending in `$`, and you know how to stop your codespace (3e) and come back to
it (3f).

---

## Part B · Find your way around

### Step 4 · Tour the editor

**Do:** look at the three areas of VS Code.

**You'll see:**
- **Left:** the **Explorer**, a list of the repo's files and folders. Click a file to open it.
- **Middle:** the open file. Each open file gets a tab at the top.
- **Bottom:** the **terminal**. If you don't see it, open the menu (☰ at the top left) →
  **Terminal → New Terminal**. Next to the **Terminal** tab is a **Ports** tab. You won't need it
  for now.
- **Bottom edge:** a thin **status bar**. At its left it shows the branch you're on (`main`).

**Why:** the **terminal** is where you type **commands**: short instructions that run a program,
like `ls` or `git status`. Most developer tools, including every tool in this course, are used
this way. It feels slow at first, but a typed command is exact and repeatable, and easy to copy
into notes. You'll type far more commands than you click buttons.

### Step 5 · Tour the repo

**Do:** in the Explorer, click through these. You don't need to understand what's inside yet.

| Name | What it is | You'll use it at |
| --- | --- | --- |
| `README.md` | The repo's front page (GitHub shows it under the file list). `.md` means **Markdown**: plain text where `#` makes a heading and `**…**` makes bold | now |
| `robot.json` | Your robot's name and colour | this stop |
| `stops/` | One folder per stop, each with a `WALKTHROUGH.md` like this one | every stop |
| `checks/` | Small programs that check your work and say, in plain English, what to fix | every stop |
| `.github/` | Settings for GitHub, including the automatic checks (Part E) | this stop |
| `maps/`, `planner/` | The delivery floor and the route planner | Stop 2 |
| `firmware/` | The program that runs on the robot's chip | Stop 3 |

**Why:** knowing where things live saves you hunting later. Names that start with a dot, like
`.github/` and `.devcontainer/`, are **hidden** in most file lists (VS Code shows them). The dot
means "settings, not the project itself".

### Step 6 · Move around in the terminal

**Do:** click in the terminal. Type each command and press **Enter** after each one:

```
pwd
ls
cd planner
ls
cd ..
pwd
```

**You'll see:**

```
/workspaces/courier
MAINTAINERS.md  README.md  checks  cli  compose.yaml  firmware  fleet.json  infra  maps  node_modules  package-lock.json  package.json  planner  requirements-dev.txt  robot.json  sim  stops  tools
plan.py  test_plan.py
/workspaces/courier
```

`pwd` printed the first and last lines. The first `ls` listed the top folder, and the second
listed the two files in `planner`. Folder names may be coloured, and the names may be in a
different order or spread over more or fewer lines, depending on how wide your terminal is.
`node_modules` is made by the Codespace's setup: it holds the simulator's **compiler** (the program
that turns the robot's code into instructions it can run; Stop 3 explains it). You never edit it,
and Git ignores it. `MAINTAINERS.md` is notes for the people who look after this starter: you
don't need it.

**Why:**
- The terminal always "stands in" one folder. `pwd` (print working directory) tells you which.
- `/workspaces/courier` is a **path**: folders separated by `/`, starting from the very top of the
  computer. So `courier` is inside `workspaces`.
- `ls` (list) shows what's in the folder you're standing in. Hidden names aren't listed.
- `cd planner` (change directory) steps into the `planner` folder. `cd ..` steps back out: `..`
  always means "the folder one level up".
- Most commands in this course are typed from the top folder, `/workspaces/courier`. If a command
  says it can't find a file, run `pwd` first: you're probably in the wrong folder.

### Step 7 · Ask Git what's going on

**Do:**

```
git status
git log --oneline
```

**You'll see:**

```
On branch main
Your branch is up to date with 'origin/main'.

nothing to commit, working tree clean
```
```
1a2b3c4 (HEAD -> main, origin/main, origin/HEAD) Initial commit
```

Your 7-character code will be different, and the message may be too.

**Why:**
- **Git** is the program that records your repo's history. It runs here, in the Codespace. GitHub
  is the website that keeps a copy online. Every Git command starts with `git`.
- `git status` is the question you'll ask most: *which branch am I on, and what have I changed?*
  "Working tree clean" means your files match the last saved snapshot. "Up to date with
  'origin/main'" compares you with GitHub's copy as it was *the last time your clone talked to
  GitHub*, not live.
- `git log --oneline` lists the **commits**, newest first, one per line. A commit is a saved
  snapshot of your robot's code, with a message that says what changed. You have one: the
  template's starting point. The code at the start (`1a2b3c4`) is the commit's short **id**. Every
  commit has its own, so you can name exactly which snapshot you mean. Each commit also remembers
  the one before it, like a node in a linked list: that chain *is* your history.
- `(HEAD -> main, origin/main, origin/HEAD)` are labels on that commit. `HEAD -> main` means
  "you're here, on the branch `main`". `origin/main` is where GitHub's copy of `main` was the last
  time your clone talked to GitHub (Step 12 explains `origin`). All on one commit means you and
  GitHub agree.

✅ **Checkpoint B:** `pwd` says `/workspaces/courier`, and `git status` says `On branch main`.

---

## Part C · Make the change on a branch

### Step 8 · Start a branch

**Do:**

```
git switch -c stop-01-name-your-robot
```

**You'll see:** `Switched to a new branch 'stop-01-name-your-robot'`

**Why:**
- `main` is the **branch** that holds the working version of your robot. A branch is a separate
  line of commits for one change. Your commits go on the new branch, and `main` isn't touched
  until you decide the change is good (Part E).
- `git switch -c <name>` **c**reates a branch and switches to it in one go. The new branch starts
  from where you are now: the latest commit on `main`.
- We name each branch after its stop, so you can always tell what a branch is for. Branch names
  can't contain spaces, so use `-` between words.

### Step 9 · Edit `robot.json`

**Do:** open `robot.json` from the Explorer. It says:

```json
{"name": "Courier", "color": "#3b82f6"}
```

Change it to your robot's name and colour. The expert's robot is Pip, in orange:

```json
{"name": "Pip", "color": "#ff8800"}
```

Save the file: **Ctrl+S** (Windows or Linux) or **Cmd+S** (Mac). A dot on the file's tab means
it isn't saved yet.

**Why:**
- **JSON** is a way to write data as text. It looks like a dictionary (a map from keys to values),
  with two strict rules: keys and text use **double quotes** `"`, never single, and there's **no
  comma after the last item**. Many programs read JSON. Here, the simulator reads your robot's name
  and colour from it.
- A **hex colour** is `#` followed by three pairs of **hex** digits, for red, green and blue. Hex
  counts in sixteens: the digits are `0`–`9`, then `a`–`f`, so `00` means none and `ff` means the
  most (255). `#ff8800` is full red, about half green and no blue: orange. To pick your own, search
  the web for "colour picker" and copy the `#` code.
- The name can be 1–20 letters, digits, spaces or dashes.

### Step 10 · Run the check yourself

**Do:**

```
python3 checks/check_robot_json.py
```

**You'll see:**

```
✓ robot.json is fine: your robot is Pip, colour #ff8800
```

**Stuck?** Here is what the check says for the three most common slips:

| You wrote | The check says |
| --- | --- |
| `{'name': 'Pip', 'color': '#ff8800'}` (single quotes) | `✗ robot.json isn't valid JSON: line 1, column 2: Expecting property name enclosed in double quotes` |
| `{"name": "Pip" "color": "#ff8800"}` (missing comma) | `✗ robot.json isn't valid JSON: line 1, column 16: Expecting ',' delimiter` |
| `{"name": "Pip", "color": "orange"}` (a colour word) | `✗ color must look like #ff8800 (a # and 6 hex digits); it's "orange"` |

The line and column point to where the reader got confused. The mistake is there, or just before it.

**Why:**
- `python3 <file>` runs a Python program. This one came with the template. In Stop 2 you write
  your own and look inside.
- It's **the same check** GitHub will run on your change in Part E. Running it yourself first
  takes seconds, and it saves a round trip.

### Step 11 · Commit: save a snapshot

**Do:**

```
git status
git add robot.json
git status
git commit -m "Name my robot Pip"
```

**You'll see:** the first `git status` lists `modified: robot.json` under **Changes not staged for
commit** (in red). After `git add`, the second lists it under **Changes to be committed** (in
green). Then the commit prints:

```
[stop-01-name-your-robot 5d6e7f8] Name my robot Pip
 1 file changed, 1 insertion(+), 1 deletion(-)
```

**Why:**
- Saving a commit takes two moves, like taking a photo. `git add robot.json` puts that file's
  changes in the frame: the **staging area**, the set of changes that go into the *next*
  snapshot. `git commit` takes the photo. The two moves let you choose what goes in: if you'd also
  changed a file by accident, you'd simply leave it out.
- `-m "…"` gives the snapshot its message.
- A good commit message says **what the change does, in the present tense**: "Name my robot Pip",
  not "changes" or "fixed stuff". Imagine it finishing the sentence "This commit will…". You'll
  read these messages months from now, and so will anyone who reviews your code.
- "1 insertion, 1 deletion": Git counts lines. Changing a line counts as removing the old one and
  adding the new one.
- Git signs each commit with a name and email. In a Codespace, GitHub sets them for you.

**Stuck?** If the commit opens a strange full-screen editor, you left out `-m "…"`. It's an old
terminal editor called Vim, which Git opens to ask for the message. To get out without saving,
press **Esc**, type `:q!` and press **Enter**. Then run the command again with the message.

✅ **Checkpoint C:** `git log --oneline` shows two commits, with yours on top.

---

## Part D · Send it to GitHub and open a pull request

### Step 12 · Push your branch

**Do:**

```
git push -u origin stop-01-name-your-robot
```

**You'll see:** a few lines of progress, then something like:

```
remote: Create a pull request for 'stop-01-name-your-robot' on GitHub by visiting:
remote:      https://github.com/<your-username>/courier/pull/new/stop-01-name-your-robot
 * [new branch]      stop-01-name-your-robot -> stop-01-name-your-robot
branch 'stop-01-name-your-robot' set up to track 'origin/stop-01-name-your-robot'.
```

**Why:**
- So far your commit exists only in the Codespace. **Push** sends your branch's commits to
  GitHub. A commit isn't on GitHub until you push it. Before that, nobody can see it, not even the
  checks, and it would be lost if the Codespace were deleted.
- **origin** is Git's name for the copy on GitHub. A copy somewhere else that you push to and pull
  from is called a **remote**. `origin` is the one your clone came from.
- `-u` makes Git remember that this branch goes to `origin`. From now on, on this branch, a plain
  `git push` is enough.

**Stuck?**
- *`remote: Permission to curiousims/courier.git denied`, then `… error: 403`:* this
  Codespace was opened on the starter, not on your own repo (Step 3a). Your commit is only in this
  Codespace. Ask for help before deleting anything: reply to the email you got your Courier
  invitation from.
- *`fatal: The current branch … has no upstream branch`:* you typed `git push` without
  `-u origin <branch-name>`. Run the full command above.

### Step 13 · Open the pull request

**Do:** go to your repo on GitHub. It's probably still open in the browser tab you started the
Codespace from. If not, open `github.com/<your-username>/courier` in a new tab. A yellow banner
says **stop-01-name-your-robot had recent pushes**, with a green **Compare & pull request**
button. Click it.

**You'll see:** an **Open a pull request** page:

```
┌─ Open a pull request ───────────────────────────────────────────┐
│ base: main  ←  compare: stop-01-name-your-robot   ✓ Able to merge │
│ Add a title                                                     │
│ [ Name my robot Pip                                  ]          │
│ Add a description                                               │
│ [ **Stop:** …                                                 ] │
│ [ ### What does this change make the robot do, and why …      ] │
│                                        [ Create pull request ]  │
└─────────────────────────────────────────────────────────────────┘
```

`base: main ← compare: stop-01-name-your-robot` means "bring the commits from my branch into
`main`". The title is already filled in from your commit message.

You'll see the **pull request template**: the questions every pull request in this repo answers.
Fill it in:

```
**Stop:** 1

### What does this change make the robot do, and why this way?

Names my robot Pip and makes it orange, on a branch so main only gets it once the checks pass.
```

Lines between `<!--` and `-->` are notes for you. They don't show on GitHub, so you can leave them.
Click **Create pull request**.

**Stuck?**
- *No yellow banner:* it disappears after a while. Open the link that `git push` printed (the
  line after "Create a pull request … by visiting:"). Or, on your repo, click the **Pull
  requests** tab → **New pull request** → set **compare:** to `stop-01-name-your-robot` (leave
  **base:** as `main`) → **Create pull request**.
- *The page says "There isn't anything to compare":* **compare:** is set to `main`. Choose your
  branch instead. If your branch isn't in the list, the push in Step 12 didn't work. Run it again
  and read what it prints.

**Why:**
- A **pull request** (**PR**) asks to bring a branch's commits into `main`. It shows exactly what
  changed (the **Files changed** tab: red lines removed, green lines added), and it's where a
  reviewer comments. In this course the reviewer is you. In a company it's a teammate. Every change goes in this way.
- The one-sentence answer is your **explain-back**. Putting a change into words is the quickest
  way to find out whether you understand it. It's also what a reviewer reads first, and what you'll
  read when you come back in six months.

✅ **Checkpoint D:** your PR page is open, titled "Name my robot Pip", with one commit.

---

## Part E · Checks, merge, and back to `main`

### Step 14 · Watch the checks

**Do:** scroll to the bottom of the PR's **Conversation** tab and wait a minute.

**You'll see:** a box of checks, maybe folded up as "All checks have passed" or "Some checks
haven't completed yet" (click **Show all checks** to open it). Each shows a yellow dot while it
runs, then a green ✓. There is one per **job**, eight in all:

```
checks / stop-01 · your robot and your PR
checks / stop-02 · route planner tests
checks / stop-03 · firmware
checks / stop-04 · sense and react
checks / stop-05 · know where you are
checks / stop-06 · talk to the robot
checks / stop-17 · over-the-air updates (early check)
checks / stop-18 · a hundred robots (early check)
```

Each is listed twice, once with **(push)** after it (because you pushed) and once with
**(pull_request)** (because a PR is open). Open the **Checks** tab and click a job to read what it
printed. Every job except `stop-01` says its stop hasn't started yet, for example `Stop 2 hasn't
started yet: no tests are switched on in planner/test_plan.py. Nothing to check.` They pass until
you begin those stops, so you can ignore them for now. A job's log can also show the commands it
ran, and some of those contain a ✗ message that only prints when something fails: **only a red ✗
next to the job's name means a failure.**

**Why:**
- **CI** (**continuous integration**) runs your project's checks automatically on every push and
  every pull request. Each check ends ✓ (passed) or ✗ (failed, with a message that says why).
- **GitHub Actions** is GitHub's CI. A **workflow** file in your repo,
  `.github/workflows/checks.yml`, tells it which checks to run. Open it: the comments explain each
  part. Each stop has its own **job**, a group of checks.
- Where does it run? On a **fresh computer that GitHub starts just for this check, then throws
  away**. Not your Codespace. So "it works on my computer" isn't enough: it has to work from what's
  in the repo alone. That catches the classic "I forgot to commit that file".
- `stop-01` checks two things: your `robot.json` (the same check as Step 10), and that you wrote
  your explain-back.

### Step 15 · Break it on purpose, then fix it

**Do:** back in the Codespace, still on your branch, change the colour to a word:

```json
{"name": "Pip", "color": "orange"}
```

Save, then:

```
git add robot.json
git commit -m "Try a colour word instead of a hex code"
git push
```

Go back to the PR and watch the checks.

**You'll see:** after a minute, `stop-01` turns to a red ✗. Click **Details** next to it and open
the step **robot.json is filled in**. It says:

```
✗ color must look like #ff8800 (a # and 6 hex digits); it's "orange"
```

Now fix it. Put `#ff8800` back and save. Run `python3 checks/check_robot_json.py` (✓), then:

```
git add robot.json
git commit -m "Use a hex code for the colour"
git push
```

The PR updates by itself. It now has three commits, the checks run again, and they go green.

**Why:**
- A PR is **live**. Every push to its branch updates it, and the checks run again. You never need
  a new PR to fix a mistake: fix it on the same branch.
- `main` was never touched. The mistake stayed on its branch, which is exactly what branches are for.
- Reading a failing check calmly (open it, find the ✗ line, read it word by word) is a skill
  you'll use every day. Our checks are written in plain English on purpose. Most tools' messages
  aren't, and later stops show you how to read those too.

**Bonus experiment:** edit the PR description (**⋯ → Edit** on it), delete your explain-back
sentence, and save. `stop-01` runs again and fails with `✗ Add one sentence under 'What does this
change make the robot do?' in your PR description.` Put the sentence back. The check only
looks for *an* answer and never judges it: the answer is for you.

### Step 16 · Merge

**Do:** with every check green, click **Merge pull request** → **Confirm merge**. Then click
**Delete branch**.

**You'll see:** a purple **Merged** label. On your repo's front page, `robot.json` now says Pip,
`#ff8800`.

**Why:**
- **Merging** adds the branch's commits to `main`. `main` now has the working, checked change,
  plus one extra commit that records the merge itself.
- Deleting the branch on GitHub is only tidying up. Its commits live on in `main`.
- That's the whole professional loop: **branch → commit → push → PR → checks → merge**. You'll use
  it at every stop from now on, and in any software job.

### Step 17 · Bring `main` back into your Codespace

**Do:**

```
git switch main
git pull
git log --oneline
```

**You'll see:** `git pull` lists the files that changed (`robot.json`). The log's top line is the
merge, `Merge pull request #1 from <your-username>/stop-01-name-your-robot`, with your three commits
below it.

**Why:** GitHub merged the PR, but your Codespace doesn't know that yet: its `main` is the old one.
`git switch main` moves you back to `main`, and **`git pull`** brings the new commits from GitHub
into your clone. It's the opposite of push. **Start every stop like this** (switch to `main`, then
pull), so your new branch starts from the latest version.

### Step 18 · Meet the simulator

**Do:** in the terminal, on `main`:

```
npm run sim
```

**You'll see:**

```
> sim
> node tools/courier/cli.mjs run firmware --map maps/office.txt

✓ firmware built: 477 bytes in 1.1 s
✓ Your robot stopped 485 cm from G
  robot time 30.0 s · LED toggled 0 times · 0 bumps
  longest loop() gap 0 ms (from 0.00 s)
```

(The build time will differ a little.)

**Why:**
- The **simulator** is a pretend robot on the office floor, inside your Codespace. `npm run sim`
  builds the robot's program and lets the pretend robot run it for 30 seconds of robot time, then
  says where it ended up. (`npm` is a tool that runs the commands a project lists in its
  `package.json`; `sim` is the one name you'll use.)
- The robot didn't move ("stopped 485 cm from G" is where it started, at S), because its program is
  still empty: you write it in Stop 3. In Stop 2, CI uses the same simulator to drive the route your
  planner prints.
- The last two lines are the run's summary. **Robot time** is the robot's own clock: 30 seconds
  of it take about a second to simulate. **LED toggled** counts how often the robot's light
  switched on or off, and **bumps** how often it touched something. **Longest loop() gap** matters
  from Stop 4. For now, all you need is the ✓: it means the run worked and the robot didn't hit
  anything (it hasn't moved yet).
- The simulator answers in text: everything you need is in the terminal and in your PR's checks.

✅ **Checkpoint E:** your PR is merged with green checks, and `git log --oneline` on `main` in the
Codespace shows the merge on top. **Stop your Codespace** when you're done (Step 3e).

---

## The whole change

What went into `main`, as the PR's **Files changed** tab shows it (red = removed, green = added):

```diff
-{"name": "Courier", "color": "#3b82f6"}
+{"name": "Pip", "color": "#ff8800"}
```

One line. The skill wasn't the line: it was getting it into `main` the way teams do.

The commands you used, in order. This is your loop for every stop:

```
git switch main                        # start from main...
git pull                               # ...with the latest from GitHub
git switch -c stop-NN-short-name       # a branch for this change
# edit, save, run the check
git add <file>                         # choose what goes in the snapshot
git commit -m "Say what it does"       # save the snapshot
git push -u origin stop-NN-short-name  # send it to GitHub (after that, plain git push)
# on GitHub: open the PR, read the checks, merge, delete the branch
```

## Now you: do it

In **your** repo and Codespace, do Steps 1–18 with **your** robot's name and colour. Everything
else is the same. You're done when your PR is merged with a green `stop-01` check.

**Make it yours (optional):** in a second PR, add a motto:
`{"name": "Pip", "color": "#ff8800", "motto": "Parcels, promptly."}`. The check ignores keys it
doesn't know.

## How people use GitHub at work

Almost every software company keeps its code in Git, on GitHub or a similar site (GitLab,
Bitbucket). The loop you just did (branch, PR, review, green checks, merge) is how changes get
in at nearly all of them. Teams also track work in **issues** (to-do items and bug reports
attached to the repo), and use GitHub Actions to test and deploy every change. In open source,
anyone can read a public repo, **star** it (a bookmark and a thank-you), **fork** it (make their
own copy), and send changes back as a PR. Your profile's repos are also what recruiters look at.
By the end of this course, `courier` will be one of them.

## Words you met, and where

| Word | Explained in |
| --- | --- |
| GitHub, account, username, verification code, dashboard, Free plan | Step 1 |
| two-factor authentication (2FA), authenticator app, recovery codes | Step 1i |
| invitation, 404, repository, template repository, owner, private / public | Step 2 |
| Codespace, VS Code, clone, stopping and reopening a codespace, core-hours, storage, Copilot | Step 3 |
| terminal, command, Explorer, status bar | Step 4 |
| Markdown, README, hidden dot-files | Step 5 |
| `pwd`, `ls`, `cd`, `..`, path | Step 6 |
| Git, `git status`, `git log --oneline`, commit, commit id, history | Step 7 |
| branch, `main`, `git switch -c` | Step 8 |
| JSON, hex colour | Step 9 |
| `python3 <file>` | Step 10 |
| staging area, `git add`, `git commit -m`, commit messages | Step 11 |
| push, origin, remote, `git push -u` | Step 12 |
| pull request, base / compare, Files changed, PR template, explain-back | Step 13 |
| CI, GitHub Actions, workflow, job, check ✓ / ✗, Checks tab | Step 14 |
| merge | Step 16 |
| `git switch main`, `git pull` | Step 17 |
| simulator, `npm run sim`, robot time | Step 18 |
| issue, star, fork | How people use GitHub at work |
