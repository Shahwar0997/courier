# Stop 6 · Talk to the robot: Wi-Fi, a command server, a tool for people — walkthrough

In this walkthrough you watch an expert stop pasting routes into the firmware. Pip joins the
office **Wi-Fi**, gets an **IP address**, and runs a small **command server** on **port 7000**.
On your side, a command-line tool, `courier`, asks Pip where it is, plans a route there with your
Stop 2 planner, and sends it as a **JSON message** over **TCP**. Both sides follow one written
**protocol**: one JSON object per line, and a reply to every message, including the unhappy ones.

**Time:** about 4–5 hours. **You need:** Stops 1–5 merged. This stop starts from your Stop 5
firmware (the state machine that drives by ticks) and your Stop 2 planner.

**How to read it:** the same as before: **Do**, **You'll see**, **Why**, in four parts with ✅
checkpoints. The finished files are at the end.

> **Before you start: three things to know.**
> - **Two terminals.** From Step 2, Pip runs in real time in one terminal (`npm run sim --
>   --real-world --listen`, until Ctrl+C), and you talk to it from a second one (the **+** in
>   the terminal panel).
> - **What CI checks at this stop.** `stop-06` runs your tool's tests and Stop 2's, then runs
>   your firmware in the simulator and talks to it: it joins the Wi-Fi, answers `ping`, frames
>   messages, gives every unhappy reply, and `courier send pip --to room-2` exits 0 with Pip
>   driving. Whether Pip *reaches* room 2 is only a warning: it steers by its own ticks, which
>   drift in the office's narrow doors (Stop 5, Step 12). This stop is about the talking.
> - **If your copy of the repo is older than these walkthroughs,** `stop-03` goes red from Step 1
>   on, at `✗ The LED never came on`, because its office drive doesn't ask Pip for a route yet.
>   That's our bug, not yours: you can merge with it red. Trust a green `stop-06`. An older copy
>   also has no `firmware/src/command_server.h` or `firmware/src/command_server.cpp`: Step 2 shows
>   both files' whole text.

---

## Part A · On the network

### Step 1 · A fresh branch, and join the Wi-Fi

From this stop Pip doesn't drive at power-on. It joins the Wi-Fi and waits to be told where to go.

**Do:** start from the latest `main`, on a new branch:

```
git switch main
git pull
git switch -c stop-06-talk-to-the-robot
```

In `main.cpp`:
1. Add `#include <WiFi.h>` under `#include <odometry.h>`.
2. Add a first state, `CONNECTING`: `enum class State { CONNECTING, IDLE, TURNING, DRIVING, BLOCKED, SETTLING, DONE };`
3. At the end of `setup()`, replace the test-drive line and `startMove();` with:

   ```cpp
     // The simulator's test drives (--square, --straight 10) and the checks (--route) ask for a route.
     const char *asked = courier::route();
     if (asked) {
       route = asked;
       startMove();
       return;
     }
     // Otherwise: join the Wi-Fi, then wait for a drive command.
     WiFi.begin("courier-office");
     state = State::CONNECTING;
   ```

4. In `loop()`, add a first case to the `switch`:

   ```cpp
       case State::CONNECTING:
         if (WiFi.status() == WL_CONNECTED) {
           Serial.print("IP ");
           Serial.println(WiFi.localIP());
           state = State::IDLE;
         }
         break;
   ```

Run `npm run sim -- --real-world`.

**You'll see:**

```
Serial monitor:
    0.00 s  Courier ready
    1.51 s  IP 192.168.4.23
✓ Your robot stopped 485 cm from G
  …
  Wi-Fi: on courier-office as 192.168.4.23 · listening on no port · 0 connections, 0 refused · 0 bytes in, 0 out
```

Pip didn't move ("485 cm from G" is just where S is): it joined and is waiting.

**Why:**
- **`WiFi.begin("courier-office")`** asks to join the office network. Joining takes a moment
  (1.5 s here), so the firmware doesn't sit and wait for it: `CONNECTING` is one more state, and
  `loop()` checks **`WiFi.status()`** each time round until it's **`WL_CONNECTED`**. Stop 4 taught
  you never to block `loop()`.
- **`WiFi.localIP()`** is the **IP address** the network gave Pip, the number your laptop needs to
  reach it. The simulator's network always hands out `192.168.4.23`.
- The practice network has no password. A real one does, and keeping passwords out of Git is a
  later stop.
- `courier::route()` still comes first, so Stop 5's test drives (`--square`, `--straight 10`) work
  as before. The checks use it too: from this stop, `stop-03` and `stop-04` ask Pip to drive your
  planner's route with `--route`, because nothing else would start it. `ROUTE` stays where it is:
  Stop 3's check still reads it.

### Step 2 · Listen on a port

**Do:** open `firmware/src/command_server.h`. (In an older copy it isn't there: create it with the
text below.)

```cpp
// firmware/src/command_server.h — Pip's command server (Stop 6).
//
// Once Pip is on the Wi-Fi, it listens on port 7000 for the Courier command protocol: one JSON
// object per line, and one JSON line back for every message. The protocol's table is in
// stops/06/WALKTHROUGH.md. Nothing includes this file until Stop 6, Step 2.

#pragma once

const int COMMAND_PORT = 7000;  // the port your courier tool connects to
const int MAX_LINE = 512;       // the longest message Pip accepts, in bytes
const int MAX_MOVES = 128;      // the longest route Pip accepts

// The server, in command_server.cpp.
void startServer();    // once, when Pip has joined the Wi-Fi
void serveCommands();  // every loop(): read what has arrived, and answer each whole line

// What the server asks the rest of the firmware. main.cpp writes these (Step 6).
bool busy();                         // driving a route (turning, driving, blocked or settling)
const char *stateName();             // "IDLE", "DRIVING", … for ping's reply
int tileRow();                       // the tile Pip believes it's on (from its pose)
int tileCol();
int headingDegrees();                // which way it faces: 0 north, 90 east, 180 south, 270 west
void startRoute(const char *moves);  // drive these moves (N, E, S, W) from where Pip is
void stopRoute();                    // stop now, and wait
```

Replace all of `firmware/src/command_server.cpp` (in an older copy, create it) with a first
version that only prints what arrives:

```cpp
// firmware/src/command_server.cpp — Pip's command server (Stop 6).
#include <Arduino.h>
#include <WiFi.h>

#include "command_server.h"

WiFiServer server(COMMAND_PORT);
WiFiClient client;  // the visitor Pip is talking to

void startServer() {
  server.begin();
}

void serveCommands() {
  if (!client.connected()) {  // nobody, or they hung up: let the next visitor in
    client.stop();
    client = server.accept();
  }
  while (client.available()) {
    char c = client.read();
    Serial.print(c);
  }
}
```

In `main.cpp`, add `#include "command_server.h"` above `#include "encoders.h"`; in the
`CONNECTING` case, call `startServer();` just before `state = State::IDLE;`; and make
`serveCommands();` the first line of the `switch` part of `loop()`, just above `switch (state) {`.

**Why:**
- A **port** picks which program on a device gets a message: the IP address finds the building,
  the port finds the room. **`WiFiServer server(7000)`** opens door 7000, once Pip is on the
  network (`server.begin()`).
- Pip is the **server** here: it waits for others to connect. Your tool will be the **client**.
  "Server" is a role, not a kind of computer.
- **`server.accept()`** lets the next visitor in, as a **`WiFiClient`**: one end of the
  connection (a **socket**). If nobody is waiting, the client it returns isn't `connected()`, so
  `loop()` simply tries again next time. When a visitor hangs up, `client.stop()` closes Pip's
  end and the next one can come in. (Older examples use `server.available()`; it's the old name.)
- **`client.available()`** says how many bytes have arrived and not been read yet, and
  **`client.read()`** takes the next one. Reading only while `available()` means `read()` always
  has a byte to give.
- `serveCommands()` runs every time round `loop()`, in every state: Pip must answer while it
  drives, too. Before the Wi-Fi is up, the server isn't open, so nobody gets in.
- The header lists what the server will need from the rest of the firmware (`busy()`,
  `startRoute()`, …). Nothing calls them yet, so the firmware builds without them; Step 6 writes
  them.

### Step 3 · First contact, from the terminal

**Do:** start Pip in real time:

```
npm run sim -- --real-world --listen
```

Wait for `→ the robot's port 7000 is at localhost:7000`. In a **second terminal**:

```
python3 -c "import socket; socket.create_connection(('localhost', 7000)).sendall(b'hello\n')"
```

**You'll see** in the first terminal (between the `pose` lines, which keep coming every half
second):

```
    1.51 s  IP 192.168.4.23
    1.51 s  · net listen 7000
  → the robot's port 7000 is at localhost:7000
    1.63 s  · net connect 7000 #1
    1.64 s  · net close #1 (peer)
    1.64 s  hello
    1.64 s  · net close #1 (robot)
```

Press **Ctrl+C** to stop Pip.

**Why:**
- Prove the pipe works before building on it. The `·` lines are the simulator's network log: a
  connection came in, your one-liner hung up (`peer`), Pip printed what it read, then closed its
  end (`robot`).
- **`--listen`** runs Pip in real time, and when its firmware listens on a port, the simulator
  opens the same port on your computer: it **forwards** `localhost:7000` to Pip's port 7000.
  **`localhost`** means "this computer". On a real network you'd use Pip's IP address instead.
- `python3 -c` runs the quoted text as a short program; `;` separates its two statements.
- `socket.create_connection((host, port))` connects, and `sendall` sends. Sockets carry **bytes**,
  not text: `b'hello\n'` is a **bytes** value, the letters as the numbers that actually travel.
- Run the one-liner while Pip *isn't* running and Python says `ConnectionRefusedError`: the
  address answered, but nothing had door 7000 open. Step 9 turns that into a message for people.

✅ **Checkpoint A:** Pip prints its IP address and shows the `hello` you sent.

---

## Part B · A protocol

Both sides need the same rules: what a message looks like, what each one means, and what comes
back. That's a **protocol**. Courier's command protocol, version 1: a TCP connection to port
7000; each message is **one JSON object on one line**, ending with a newline; Pip answers every
message with one JSON line.

| You send | Pip replies | When |
| --- | --- | --- |
| `{"cmd":"ping"}` | `{"ok":true,"name":"Pip","row":1,"col":1,"heading":90,"state":"IDLE"}` | always: Pip's tile (from its pose), its heading and its state |
| `{"cmd":"drive","moves":"EEEE…"}` | `{"ok":true,"moves":20}` | Pip is `IDLE` or `DONE`, and every letter is N, E, S or W. Pip starts driving after it replies |
| | `{"ok":false,"error":"busy"}` | Pip is driving a route |
| | `{"ok":false,"error":"bad moves"}` | `moves` missing, not a string, empty, or a letter other than N, E, S, W |
| | `{"ok":false,"error":"too many moves"}` | more than 128 moves. Nothing is driven: a route arrives whole or not at all |
| `{"cmd":"stop"}` | `{"ok":true}` | always. Pip stops and waits |
| anything that isn't JSON | `{"ok":false,"error":"bad json"}` | |
| JSON that isn't an object, or has no `cmd` string | `{"ok":false,"error":"bad message"}` | |
| JSON with another `cmd` | `{"ok":false,"error":"unknown cmd"}` | |
| a line over 512 bytes | `{"ok":false,"error":"too long"}` | Pip drops the line up to its newline |

After any error, Pip keeps running and the connection stays open.

### Step 4 · Frame the bytes

TCP delivers a **stream** of bytes, not separate messages: one read can bring half a message, or
one and a half. Pip needs to know where each message ends. That's **message framing**, and ours is
the newline.

**Do:** in `command_server.cpp`, collect the bytes into a line, and handle it at the newline. Under
`WiFiClient client;` add:

```cpp
char line[MAX_LINE + 1];  // the message so far, with room for its '\0'
int length = 0;           // how many bytes of it have arrived
bool tooLong = false;     // past MAX_LINE: skip the rest of this line

void reply(const char *json) {
  client.print(json);
  client.print("\n");
}

void handle(const char *text) {
  Serial.print("message: ");
  Serial.println(text);
}
```

and replace `serveCommands()` with:

```cpp
void serveCommands() {
  if (!client.connected()) {  // nobody, or they hung up: let the next visitor in
    client.stop();
    client = server.accept();
    length = 0;
    tooLong = false;
  }
  while (client.available()) {
    char c = client.read();
    if (c == '\n') {  // the end of a message
      if (tooLong) {
        reply("{\"ok\":false,\"error\":\"too long\"}");
      } else {
        line[length] = '\0';
        handle(line);
      }
      length = 0;
      tooLong = false;
    } else if (length < MAX_LINE) {
      line[length] = c;
      length++;
    } else {
      tooLong = true;
    }
  }
}
```

Start Pip again (`npm run sim -- --real-world --listen`), and in the second terminal open Python
by typing `python3`, then send half a message, wait a moment, and send the rest. Python shows
`>>>` when it's waiting: type what comes after it. A line without `>>>` is Python's answer.

```
>>> import socket
>>> pip = socket.create_connection(("localhost", 7000))
>>> pip.sendall(b'{"cmd":')
>>> pip.sendall(b'"ping"}\n')
>>> pip.sendall(b'{"cmd":"ping"}\n{"cmd":"stop"}\n')
>>> pip.sendall(b"x" * 600 + b"\n")
>>> pip.recv(200)
b'{"ok":false,"error":"too long"}\n'
```

**You'll see** in Pip's terminal:

```
    1.65 s  · net connect 7000 #1
    2.15 s  message: {"cmd":"ping"}
    2.46 s  message: {"cmd":"ping"}
    2.46 s  message: {"cmd":"stop"}
```

**Why:**
- The half message waited in `line` until its newline arrived (2.15 s, when you sent the rest),
  and two messages in one write came out as two. Framing works however the bytes are split.
- `line` is a C string (Stop 3): the bytes, then a `'\0'` to say where they end. It holds at most
  512 bytes plus that `'\0'`, so it's `MAX_LINE + 1` long.
- **The 512-byte limit.** Pip's memory is small, and anyone on the network can connect and send a
  gigabyte. So past 512 bytes Pip stops storing, skips to the next newline, and replies
  `too long`. It never writes past the end of `line`.
- `pip.recv(200)` reads up to 200 bytes of what Pip sent back. Leave Python with `exit()`.

### Step 5 · Parse JSON

**Do:** at the top of `command_server.cpp`, add `#include <ArduinoJson.h>` under
`#include <Arduino.h>`. Replace `handle()` with:

```cpp
void handle(const char *text) {
  JsonDocument message;
  if (deserializeJson(message, text)) {
    reply("{\"ok\":false,\"error\":\"bad json\"}");
    return;
  }
  const char *cmd = message["cmd"] | "";
  if (cmd[0] == '\0') {
    reply("{\"ok\":false,\"error\":\"bad message\"}");
    return;
  }
  reply("{\"ok\":false,\"error\":\"unknown cmd\"}");  // Step 6 answers the real commands
}
```

Start Pip again, connect again in Python (the `import` and `pip = …` lines from Step 4), and send:

```
>>> pip.sendall(b'{cmd: ping}\n')
>>> pip.recv(200)
b'{"ok":false,"error":"bad json"}\n'
>>> pip.sendall(b'[1,2]\n')
>>> pip.recv(200)
b'{"ok":false,"error":"bad message"}\n'
>>> pip.sendall(b'{"cmd":"ping"}\n')
>>> pip.recv(200)
b'{"ok":false,"error":"unknown cmd"}\n'
```

**Why:**
- To **parse** is to turn text into values the code can use. **ArduinoJson** is a library that
  parses JSON (and writes it, in Step 6). `platformio.ini` already pins it
  (`lib_deps = bblanchon/ArduinoJson@7.4.3`: PlatformIO downloads exactly that version for the
  real robot), and the simulator's compiler has the same version built in.
- **`JsonDocument`** holds the parsed message. **`deserializeJson(message, text)`** parses `text`
  into it and returns an error, which counts as true in an `if`, when the text isn't JSON. Checking
  it means a typo gets an answer instead of a crash.
- **`message["cmd"] | ""`** means "the `cmd` string, or `""` if it's missing or not a string". So
  `[1,2]`, `{"x":1}` and `{"cmd":5}` all get an empty `cmd`, and the code never touches a value
  that isn't there (on the chip, that's a crash).

### Step 6 · Answer each command

**Do:** at the top of `command_server.cpp`, add `#include <string.h>` under `#include <WiFi.h>`.
In `handle()`, replace the last `reply(…unknown cmd…)` line with the protocol's table:

```cpp
  if (strcmp(cmd, "ping") == 0) {
    JsonDocument answer;
    answer["ok"] = true;
    answer["name"] = "Pip";
    answer["row"] = tileRow();
    answer["col"] = tileCol();
    answer["heading"] = headingDegrees();
    answer["state"] = stateName();
    serializeJson(answer, client);
    client.print("\n");
  } else if (strcmp(cmd, "stop") == 0) {
    stopRoute();
    reply("{\"ok\":true}");
  } else if (strcmp(cmd, "drive") == 0) {
    if (busy()) {
      reply("{\"ok\":false,\"error\":\"busy\"}");
      return;
    }
    const char *moves = message["moves"] | "";
    int count = strlen(moves);
    bool good = count > 0;
    for (int i = 0; i < count; i++) {
      if (strchr("NESW", moves[i]) == nullptr) good = false;
    }
    if (!good) {
      reply("{\"ok\":false,\"error\":\"bad moves\"}");
      return;
    }
    if (count > MAX_MOVES) {
      reply("{\"ok\":false,\"error\":\"too many moves\"}");
      return;
    }
    JsonDocument answer;
    answer["ok"] = true;
    answer["moves"] = count;
    serializeJson(answer, client);
    client.print("\n");
    startRoute(moves);
  } else {
    reply("{\"ok\":false,\"error\":\"unknown cmd\"}");
  }
```

Then write what the server asks for, in `main.cpp`. Under `const char* route = ROUTE;` add:

```cpp
char sent[MAX_MOVES + 1];   // the last route a drive command sent
const int START_ROW = 1;    // S on the office map: the tile the pose counts from
const int START_COL = 1;
```

and above `void setup() {`:

```cpp
// What the command server asks (command_server.h).
bool busy() {
  return state == State::TURNING || state == State::DRIVING || state == State::BLOCKED ||
         state == State::SETTLING;
}

const char *stateName() {
  switch (state) {
    case State::CONNECTING: return "CONNECTING";
    case State::IDLE: return "IDLE";
    case State::TURNING: return "TURNING";
    case State::BLOCKED: return "BLOCKED";
    case State::DONE: return "DONE";
    default: return "DRIVING";  // DRIVING, and SETTLING between two moves
  }
}

int tileRow() {
  return START_ROW - lround(pose.north / 30);  // rows count southwards
}

int tileCol() {
  return START_COL + lround(pose.east / 30);
}

int headingDegrees() {
  int degrees = lround(pose.heading * RAD_TO_DEG) % 360;
  return degrees < 0 ? degrees + 360 : degrees;
}

void startRoute(const char *moves) {
  strlcpy(sent, moves, sizeof(sent));
  route = sent;
  move = -1;
  startMove();
}

void stopRoute() {
  stopMotors();
  state = State::IDLE;
  setLed(false);
}
```

Start Pip, connect again in Python, and send:

```
>>> pip.sendall(b'{"cmd":"ping"}\n')
>>> pip.recv(200)
b'{"ok":true,"name":"Pip","row":1,"col":1,"heading":90,"state":"IDLE"}\n'
>>> pip.sendall(b'{"cmd":"drive","moves":"EEEESSSEEEEEEEENNNEE"}\n')
>>> pip.recv(200)
b'{"ok":true,"moves":20}\n'
>>> pip.sendall(b'{"cmd":"ping"}\n')
>>> pip.recv(200)
b'{"ok":true,"name":"Pip","row":1,"col":3,"heading":91,"state":"DRIVING"}\n'
>>> pip.sendall(b'{"cmd":"drive","moves":"E"}\n')
>>> pip.recv(200)
b'{"ok":false,"error":"busy"}\n'
>>> pip.sendall(b'{"cmd":"stop"}\n')
>>> pip.recv(200)
b'{"ok":true}\n'
```

(`EEEESSSEEEEEEEENNNEE` is your planner's route from S to room 2. Your row, column and heading
while it drives depend on how far Pip got.)

Commit:

```
git add firmware
git commit -m "Join the Wi-Fi and serve the Courier protocol on port 7000"
```

**Why:**
- This is the protocol's table, in code. **`strcmp(a, b)`** compares two C strings and gives 0
  when they're the same. **`strchr("NESW", c)`** looks for `c` in `"NESW"` and gives `nullptr`
  when it isn't there. **`strlen`** counts a string's bytes up to its `'\0'`.
- The checks run in the protocol's order: busy first (a busy Pip doesn't look at the route), then
  the letters, then the length. A route that's too long is refused whole: half a route would leave
  a parcel somewhere in the corridor.
- **`serializeJson(answer, client)`** writes the JSON straight into the connection, and the `"\n"`
  after it is the frame. Writing JSON from values is **serializing**, the opposite of parsing.
- **`strlcpy(sent, moves, sizeof(sent))`** copies the route into Pip's own buffer. `moves` lives
  inside `message`, which is gone when `handle()` returns, so the route must be copied. `strlcpy`
  copies at most the buffer's size, always ends with `'\0'`, and never writes past the end.
- `tileRow()` and `tileCol()` turn Stop 5's pose into a tile: 30 cm a tile, counted from S (row 1,
  column 1). Rows grow southwards, so north takes rows away. **`lround`** rounds to the nearest whole
  number. `% 360` keeps the heading between 0 and 359 (and a negative angle gets 360 added).
- `SETTLING`, the pause between two moves, reads as `DRIVING` to the outside: from your laptop,
  Pip is in the middle of a route.
- A new route starts from where Pip believes it is and the way it faces (`dir` stays from the last
  route), so its letters are compass directions, as the planner prints them.

✅ **Checkpoint B:** by hand, `ping` answers with row 1, column 1, `drive` starts Pip, and a second
`drive` gets `busy`.

---

## Part C · A tool for people

Typing JSON into Python works, but it's not a tool. `courier` is: `python3 cli/courier.py send pip
--to room-2`. Its tests are in `cli/test_courier.py`, switched off like Stop 2's: you switch them on
one at a time. They don't need the simulator: a few lines at the top play a pretend Pip.

### Step 7 · The tool's shape

**Do:** in `cli/test_courier.py`, switch on everything from `# import json` down to the end of
`test_help` (select those lines and press **Ctrl+/**, or **Cmd+/** on a Mac). Run `pytest cli`:

```
>       assert "send" in capsys.readouterr().out, "--help should list the send command"
E       AssertionError: --help should list the send command
E       assert 'send' in 'not written yet\n'
```

Now replace `main()` in `cli/courier.py`, and add `import argparse` at the top:

```python
def main(argv):
    parser = argparse.ArgumentParser(prog="courier", description="Talk to your Courier robots.")
    commands = parser.add_subparsers(dest="command", required=True)
    for command, about in [("ping", "ask where a robot is"), ("send", "send a robot to a room"), ("stop", "stop a robot")]:
        sub = commands.add_parser(command, help=about)
        sub.add_argument("robot", help="its name in fleet.json, like pip")
        if command == "send":
            sub.add_argument("--to", required=True, metavar="ROOM", help="a room in maps/rooms.json, like room-2")
    args = parser.parse_args(argv[1:])
    print(args)
    return 0
```

Run `python3 cli/courier.py --help`:

```
usage: courier [-h] {ping,send,stop} ...

Talk to your Courier robots.

positional arguments:
  {ping,send,stop}
    ping            ask where a robot is
    send            send a robot to a room
    stop            stop a robot

options:
  -h, --help        show this help message and exit
```

and `pytest cli`: `1 passed`.

**Why:**
- A tool has **subcommands**, one per job: `ping`, `send`, `stop`, each with its own arguments.
  **`argparse`** builds that, writes the `--help` text, and answers mistakes for you:
  `python3 cli/courier.py send pip` says `courier send: error: the following arguments are
  required: --to` and exits 2. It's Stop 2's `sys.argv`, grown up.
- `argv[1:]` leaves out the program's own name, as in Stop 2. `--help` makes `argparse` print and
  exit straight away, which is why the test's `run()` catches `SystemExit`.

### Step 8 · Find the robot and the room

**Do:** switch on `test_unknown_robot` and `test_unknown_room`. In `cli/courier.py`, under the
`ROOMS = …` line, add:

```python
class Failed(Exception):
    """Something went wrong: the message for people, and the exit code for programs."""

    def __init__(self, message, code):
        super().__init__(message)
        self.code = code


def find_robot(name):
    fleet = json.loads(FLEET.read_text())
    if name not in fleet:
        raise Failed(f"no robot called '{name}' in fleet.json", 2)
    return fleet[name]


def find_room(name):
    rooms = json.loads(ROOMS.read_text())
    if name not in rooms:
        raise Failed(f"no room called '{name}' in maps/rooms.json", 2)
    return tuple(rooms[name])
```

add `import json` at the top, and in `main()` replace `print(args)` and `return 0` with:

```python
    try:
        robot = find_robot(args.robot)
        if args.command == "send":
            find_room(args.to)
        print(robot)
    except Failed as failed:
        print(failed, file=sys.stderr)
        return failed.code
    return 0
```

**You'll see:** `python3 cli/courier.py ping nobody` prints `no robot called 'nobody' in
fleet.json` and exits 2; `pytest cli`: `3 passed`.

**Why:**
- `fleet.json` (`{"pip": {"host": "localhost", "port": 7000}}`) and `maps/rooms.json` (`"room-2":
  [1, 15]`, …) give names for people and addresses for machines. The tool looks one up from the
  other, so you never type an IP address.
- `class Failed(Exception)` makes a new kind of error that carries an exit code. Any function can
  `raise` it, and `main()` turns it into a message on standard error and the exit code, in one
  place (Stop 2's rules: 2 means "couldn't even ask").

### Step 9 · Talk

**Do:** switch on `test_robot_not_running`. Add `import socket` at the top, and
under `find_room()`:

```python
def talk(name, robot, message):
    """Send one message to the robot and return its reply (a dict)."""
    host, port = robot["host"], robot["port"]
    try:
        with socket.create_connection((host, port), timeout=5) as sock:
            sock.sendall((json.dumps(message) + "\n").encode())
            line = sock.makefile("r").readline()
    except ConnectionRefusedError:
        raise Failed(f"can't reach {name} at {host}:{port} (connection refused)", 2)
    except TimeoutError:
        raise Failed(f"{name} didn't answer within 5 s", 2)
    reply = json.loads(line)
    if not reply.get("ok"):
        raise Failed(f"{name} said: {reply.get('error')}", 1)
    return reply
```

In `main()`, replace the `if` and `print(robot)` lines with a `ping` and a `stop` (`send` only
checks the room until Step 10):

```python
        if args.command == "ping":
            reply = talk(args.robot, robot, {"cmd": "ping"})
            print(f"{args.robot}: row {reply['row']}, column {reply['col']}, heading {reply['heading']}, {reply['state']}")
        elif args.command == "send":
            find_room(args.to)
        elif args.command == "stop":
            talk(args.robot, robot, {"cmd": "stop"})
            print(f"{args.robot}: stopped")
```

With Pip running in the first terminal, `python3 cli/courier.py ping pip`:

```
pip: row 1, column 1, heading 90, IDLE
```

Stop Pip (Ctrl+C) and run it again:

```
can't reach pip at localhost:7000 (connection refused)
```

with exit code 2 (`echo $?` prints the last exit code). `pytest cli`: `4 passed`. Commit:

```
git add cli
git commit -m "courier: ping and stop a robot over TCP"
```

**Why:**
- **`json.dumps`** serializes the message, the `"\n"` is the frame, and **`.encode()`** turns the
  text into bytes for the socket. **`json.loads`** parses the reply.
- **`sock.makefile("r").readline()`** reads up to the newline however the bytes arrive: framing
  again, on the laptop's side. A bare `recv` can return half a line.
- **`timeout=5`** means "give up after 5 seconds instead of waiting for ever". What to do after
  giving up is the next stop's whole subject.
- `with … as sock:` closes the connection when the block ends, even after an error. Pip sees the
  close and lets the next visitor in.
- **`ConnectionRefusedError`**: the address answered, but no program had the port open.
  **`TimeoutError`**: nothing answered in time. Each becomes a plain sentence and exit code 2.
  "Pip said no" (`busy`, `bad moves`) is exit code 1, as "no route" was in Stop 2.
- This tool's JSON has spaces (`json.dumps` writes `{"cmd": "ping"}`); Pip's replies don't. JSON
  doesn't mind either way.

### Step 10 · Plan from where Pip is

**Do:** switch on the last test, `test_busy`. In `planner/plan.py`, give `plan()` a start and a
goal, which default to S and G. Replace the top three lines of `plan()` with these six. The three
lines are the `def` line, its docstring and `start, goal = find(grid, "S"), find(grid, "G")`.

```python
def plan(grid, start=None, goal=None):
    """Return the shortest route from start to goal (S and G if not given) as a string of moves, or None if there is none."""
    if start is None:
        start = find(grid, "S")
    if goal is None:
        goal = find(grid, "G")
```

Keep everything under them as it is, starting with the check
`if start is None or goal is None:`. In `cli/courier.py`, under the
imports, tell Python where the planner is and import it:

```python
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "planner"))
from plan import plan, read_map  # noqa: E402  (after the line above, which tells Python where plan.py is)
```

add `OFFICE = ROOT / "maps" / "office.txt"` under `ROOMS`, then a `send()` above `main()`:

```python
def send(name, robot, room):
    goal = find_room(room)
    here = talk(name, robot, {"cmd": "ping"})
    route = plan(read_map(OFFICE), start=(here["row"], here["col"]), goal=goal)
    if route is None:
        raise Failed(f"no route from row {here['row']}, column {here['col']} to {room}", 1)
    if route == "":
        print(f"{name}: already in {room}")
        return
    reply = talk(name, robot, {"cmd": "drive", "moves": route})
    print(f"{name}: driving {reply['moves']} moves to {room}")
```

and in `main()`, replace `find_room(args.to)` with:

```python
            send(args.robot, robot, args.to)
```

Start Pip, then:

```
python3 cli/courier.py send pip --to room-2
python3 cli/courier.py ping pip
python3 cli/courier.py send pip --to room-4
python3 cli/courier.py stop pip
```

**You'll see:**

```
pip: driving 20 moves to room-2
pip: row 1, column 3, heading 91, DRIVING
pip said: busy
pip: stopped
```

Run all the tests: `pytest planner cli` gives `10 passed`. Commit:

```
git add cli planner
git commit -m "courier send: plan from where the robot is, and send the route"
```

**Why:**
- The planner from Stop 2, now used by another program. That's what the
  `if __name__ == "__main__":` line was for: importing `plan.py` doesn't run its `main()`.
- **`sys.path`** is the list of folders Python looks in for imports. It starts with the folder of
  the file you run (`cli/`), so the tool adds `planner/` to the front.
  `Path(__file__).resolve().parent.parent` is the repo's top folder, wherever you run from.
- **Default arguments** (`start=None`) keep Stop 2's behaviour when nobody passes them, so
  `python3 planner/plan.py maps/office.txt` and Stop 2's tests don't change. Stop 2's
  `start, goal = find(grid, "S"), find(grid, "G")` has to go: left in, it would overwrite the
  start and goal you pass, and every `send` would drive Pip to G.
- `send` asks Pip where it is first, so the route starts from Pip's tile, not from S. Each `talk` is
  its own connection: Pip lets the next visitor in after each one.

### Step 11 · Break it on purpose

**Do:** in `talk()`, remove the `+ "\n"`. Start Pip and run `python3 cli/courier.py ping pip`.

**You'll see,** after five seconds:

```
pip didn't answer within 5 s
```

and in Pip's terminal, a connection that sends 15 bytes and gets nothing back:

```
    2.09 s  · net connect 7000 #1
    7.09 s  · net close #1 (peer)
```

Put the `+ "\n"` back.

**Why:** Pip got `{"cmd": "ping"}` and is still waiting for the end of the message. A missing frame
looks exactly like a dead robot from the outside. Now you know which it is.

✅ **Checkpoint C:** `courier send pip --to room-2` starts Pip driving, a second `send` says `pip
said: busy`, and `pytest planner cli` passes.

---

## Part D · Ship it

### Step 12 · Check, push, pull request, merge

**Do:** stop Pip (Ctrl+C: the check starts its own), then run the stop's check:

```
python3 checks/check_stop_06.py
```

**You'll see** the tests (`5 passed` twice), then, after about a minute:

```
Warning: Pip hit a wall on the way to room-2 (row 5, column 7) (real-world switch on, seed 1; not failing yet: the real-world numbers are still being measured)
✓ Stop 6: Pip joins the Wi-Fi and speaks the protocol, `courier send pip --to room-2` works, and your tool's and planner's tests pass.
```

The warning is the drift from Stop 5, Step 12, not your protocol. Your row and column may differ.

Push, and open the pull request as in Stop 1 (Steps 13–16):

```
git push -u origin stop-06-talk-to-the-robot
```

Explain-back, for example: *"Pip joins the Wi-Fi and serves the Courier protocol on port 7000:
one JSON object per line, a reply to every message. `courier send` pings Pip, plans from where it
is, and sends the route over TCP."*

**You'll see** on the PR: `stop-06 · talk to the robot` green, and `stop-01` to `stop-05` green.
`stop-03` and `stop-04` drive your planner's route now (`stop-03`'s office drive says `asked to
drive … (courier::route())`), with notes or warnings when Pip meets a wall, as in Stop 5. In an older copy,
`stop-03` is red: see the note at the top.

Merge, delete the branch, and bring `main` into your Codespace (`git switch main`, `git pull`).

✅ **Checkpoint D:** your Stop 6 PR is merged with `stop-06` green.

---

## The whole files

`firmware/src/main.cpp` at the end of the stop:

```cpp
// firmware/src/main.cpp — your robot's firmware (Stops 3, 4, 5 and 6).
//
// Build it and run it in the simulator:     npm run sim -- --listen   (then send it a route: cli/courier.py)
// The real-world switch on:                 npm run sim -- --real-world
// The test drives, --square and --straight 10: see stops/05/WALKTHROUGH.md, Step 2

#include <Arduino.h>
#include <courier.h>
#include <courier_pins.h>
#include <odometry.h>
#include <WiFi.h>

#include "command_server.h"
#include "encoders.h"
#include "motors.h"
#include "sensors.h"

// The robot's numbers, calibrated with the real-world switch on (Steps 9 and 11).
const long TICKS_PER_TURN = 59;     // where the motors stop for a 90° turn
const long TICKS_PER_TILE = 168;    // where the motors stop for one 30 cm tile (they coast on ~2 cm)
const float CM_PER_TICK = 0.1655f;  // how far one tick rolls a wheel on this floor
const float WHEELBASE_CM = 15.5f;   // the distance between the wheels, as the floor turns them

const int TURN_POWER = 170;
const int BASE = 170;                 // the power both wheels drive with
const long TARGET = 9;                // the speed to hold: ticks per 50 ms, about 31 cm/s
const long KP = 20;                   // power per tick of speed error
const long LEVEL = 8;                 // power per tick one wheel is ahead of the other
const unsigned long CONTROL_MS = 50;  // correct the power every 50 ms
const unsigned long SETTLE_MS = 300;  // the pause after every stop, while the wheels coast
const unsigned long READ_MS = 60;     // read the sensor every 60 ms
const unsigned long POSE_MS = 500;    // print the pose every 500 ms
const int STOP_CM = 20;               // stop when something in the way is closer than this
const int GO_CM = 30;                 // go again only when it's further than this

// The route your planner prints for maps/office.txt:  python3 planner/plan.py maps/office.txt
const char* ROUTE = "EEEESSSEEEEEEEEEEESSS";
const char* route = ROUTE;  // what the robot drives: a route sent to it, or a test drive the simulator asks for
char sent[MAX_MOVES + 1];   // the last route a drive command sent
const int START_ROW = 1;    // S on the office map: the tile the pose counts from
const int START_COL = 1;

enum class State { CONNECTING, IDLE, TURNING, DRIVING, BLOCKED, SETTLING, DONE };
State state = State::IDLE;

int dir = 1;                  // which way the route faces: 0 = N, 1 = E, 2 = S, 3 = W
int move = -1;                // which move of the route the robot is on (none yet)
long startLeft = 0;           // both tick counts when this turn or tile began
long startRight = 0;
long goalTicks = 0;           // how many ticks this turn or tile takes
long ticksLeft = 0;           // how many ticks of the tile were left when the robot stopped
bool driveAfterSettling = false;  // after the pause: drive a tile (true) or start the next move
unsigned long settleStart = 0;
unsigned long lastRead = 0;
int distance = 400;           // the latest averaged reading, in cm
unsigned long lastBlink = 0;
bool ledOn = false;
Pose pose = {0, 0, HALF_PI};  // where the robot believes it is: on S, facing east (pi/2)
long seenLeft = 0;            // the ticks the pose has already counted
long seenRight = 0;
unsigned long lastPose = 0;
unsigned long lastControl = 0;
long windowLeft = 0;          // both tick counts at the start of this 50 ms window
long windowRight = 0;

// N, E, S, W -> 0, 1, 2, 3
int headingOf(char m) {
  if (m == 'N') return 0;
  if (m == 'E') return 1;
  if (m == 'S') return 2;
  return 3;  // 'W'
}

void setLed(bool on) {
  ledOn = on;
  digitalWrite(LED_PIN, on ? HIGH : LOW);
}

// Remember both tick counts: this turn or tile counts from here.
void startCounting() {
  startLeft = leftTicks();
  startRight = rightTicks();
  windowLeft = startLeft;
  windowRight = startRight;
}

// How many ticks the wheels have turned since startCounting(): the average of the two.
long ticksDone() {
  return (labs(leftTicks() - startLeft) + labs(rightTicks() - startRight)) / 2;
}

// How many cm of this tile are still to drive.
int cmLeft() {
  long left = state == State::BLOCKED ? ticksLeft : goalTicks - ticksDone();
  if (left < 0) left = 0;
  return left * CM_PER_TICK;
}

// Something is in the way if it's closer than `limit` and nearer than where this tile ends.
bool inTheWay(int cm, int limit) {
  return cm < limit && cm < cmLeft();
}

// Add the ticks since last time to the pose.
void updatePose() {
  long l = leftTicks();
  long r = rightTicks();
  pose = step(pose, l - seenLeft, r - seenRight, CM_PER_TICK, WHEELBASE_CM);
  seenLeft = l;
  seenRight = r;
}

// Print the pose as cm east, cm north and compass degrees, for the simulator's summary.
void printPose() {
  float degrees = pose.heading * RAD_TO_DEG;
  while (degrees < 0) degrees += 360;
  while (degrees >= 360) degrees -= 360;
  Serial.print("pose e=");
  Serial.print(pose.east, 1);
  Serial.print(" n=");
  Serial.print(pose.north, 1);
  Serial.print(" h=");
  Serial.println(degrees, 1);
}

// Stop, and pause for SETTLE_MS before driving a tile or starting the next move.
void settle(bool thenDrive) {
  stopMotors();
  driveAfterSettling = thenDrive;
  settleStart = millis();
  state = State::SETTLING;
}

// Drive one tile.
void startTile() {
  startCounting();
  goalTicks = TICKS_PER_TILE;
  emptyWindow();    // those readings faced somewhere else
  distance = 400;   // the last reading faced somewhere else
  drive(BASE, BASE);
  state = State::DRIVING;
  setLed(true);
  Serial.print(route[move]);
  Serial.print(' ');
}

// Start the next move: turn to face it, or drive it straight away, or finish.
void startMove() {
  move++;
  if (route[move] == '\0') {
    state = State::DONE;
    setLed(false);
    updatePose();
    printPose();
    Serial.println("DONE");
    return;
  }
  int target = headingOf(route[move]);
  int quarterTurns = (target - dir + 4) % 4;
  dir = target;
  if (quarterTurns == 0) {
    startTile();
    return;
  }
  startCounting();
  goalTicks = quarterTurns == 2 ? 2 * TICKS_PER_TURN : TICKS_PER_TURN;
  if (quarterTurns == 3) drive(-TURN_POWER, TURN_POWER);  // one turn left
  else drive(TURN_POWER, -TURN_POWER);                    // right, or right twice
  state = State::TURNING;
  setLed(true);
}

// What the command server asks (command_server.h).
bool busy() {
  return state == State::TURNING || state == State::DRIVING || state == State::BLOCKED ||
         state == State::SETTLING;
}

const char *stateName() {
  switch (state) {
    case State::CONNECTING: return "CONNECTING";
    case State::IDLE: return "IDLE";
    case State::TURNING: return "TURNING";
    case State::BLOCKED: return "BLOCKED";
    case State::DONE: return "DONE";
    default: return "DRIVING";  // DRIVING, and SETTLING between two moves
  }
}

int tileRow() {
  return START_ROW - lround(pose.north / 30);  // rows count southwards
}

int tileCol() {
  return START_COL + lround(pose.east / 30);
}

int headingDegrees() {
  int degrees = lround(pose.heading * RAD_TO_DEG) % 360;
  return degrees < 0 ? degrees + 360 : degrees;
}

void startRoute(const char *moves) {
  strlcpy(sent, moves, sizeof(sent));
  route = sent;
  move = -1;
  startMove();
}

void stopRoute() {
  stopMotors();
  state = State::IDLE;
  setLed(false);
}

void setup() {
  Serial.begin(115200);
  Serial.println("Courier ready");
  pinMode(LED_PIN, OUTPUT);
  startEncoders();

  // The simulator's test drives (--square, --straight 10) and the checks (--route) ask for a route.
  const char *asked = courier::route();
  if (asked) {
    route = asked;
    startMove();
    return;
  }
  // Otherwise: join the Wi-Fi, then wait for a drive command.
  WiFi.begin("courier-office");
  state = State::CONNECTING;
}

void loop() {
  unsigned long now = millis();
  if (now - lastRead >= READ_MS) {
    lastRead = now;
    distance = readDistance();
  }
  if (now - lastPose >= POSE_MS) {
    lastPose = now;
    updatePose();
    printPose();
  }

  serveCommands();

  switch (state) {
    case State::CONNECTING:
      if (WiFi.status() == WL_CONNECTED) {
        Serial.print("IP ");
        Serial.println(WiFi.localIP());
        startServer();
        state = State::IDLE;
      }
      break;

    case State::TURNING:
      if (ticksDone() >= goalTicks) settle(true);
      break;

    case State::DRIVING:
      if (ticksDone() >= goalTicks) {
        settle(false);
      } else if (inTheWay(distance, STOP_CM)) {
        stopMotors();
        ticksLeft = goalTicks - ticksDone();
        state = State::BLOCKED;
        Serial.print("BLOCKED ");
        Serial.println(distance);
      } else if (now - lastControl >= CONTROL_MS) {
        lastControl = now;
        long l = leftTicks();
        long r = rightTicks();
        long measuredLeft = l - windowLeft;    // each wheel's ticks in the last 50 ms
        long measuredRight = r - windowRight;
        windowLeft = l;
        windowRight = r;
        long ahead = (l - startLeft) - (r - startRight);  // how far the left wheel is ahead this tile
        int powerLeft = constrain(BASE + KP * (TARGET - measuredLeft) - LEVEL * ahead, 0, 255);
        int powerRight = constrain(BASE + KP * (TARGET - measuredRight) + LEVEL * ahead, 0, 255);
        drive(powerLeft, powerRight);
      }
      break;

    case State::BLOCKED:
      if (now - lastBlink >= 250) {
        lastBlink = now;
        setLed(!ledOn);
      }
      if (!inTheWay(distance, GO_CM)) {
        startCounting();          // carry on with what was left of the tile
        goalTicks = ticksLeft;
        drive(BASE, BASE);
        state = State::DRIVING;
        setLed(true);
        Serial.print("GO ");
        Serial.println(distance);
      }
      break;

    case State::SETTLING:
      if (now - settleStart >= SETTLE_MS) {
        if (driveAfterSettling) startTile();
        else startMove();
      }
      break;

    case State::IDLE:
    case State::DONE:
      break;
  }
}
```

`firmware/src/command_server.cpp`:

```cpp
// firmware/src/command_server.cpp — Pip's command server (Stop 6): the Courier command protocol on
// port 7000. One JSON object per line, and one JSON line back for every message.
#include <Arduino.h>
#include <ArduinoJson.h>
#include <WiFi.h>
#include <string.h>

#include "command_server.h"

WiFiServer server(COMMAND_PORT);
WiFiClient client;        // the visitor Pip is talking to
char line[MAX_LINE + 1];  // the message so far, with room for its '\0'
int length = 0;           // how many bytes of it have arrived
bool tooLong = false;     // past MAX_LINE: skip the rest of this line

void reply(const char *json) {
  client.print(json);
  client.print("\n");
}

void handle(const char *text) {
  JsonDocument message;
  if (deserializeJson(message, text)) {
    reply("{\"ok\":false,\"error\":\"bad json\"}");
    return;
  }
  const char *cmd = message["cmd"] | "";
  if (cmd[0] == '\0') {
    reply("{\"ok\":false,\"error\":\"bad message\"}");
    return;
  }

  if (strcmp(cmd, "ping") == 0) {
    JsonDocument answer;
    answer["ok"] = true;
    answer["name"] = "Pip";
    answer["row"] = tileRow();
    answer["col"] = tileCol();
    answer["heading"] = headingDegrees();
    answer["state"] = stateName();
    serializeJson(answer, client);
    client.print("\n");
  } else if (strcmp(cmd, "stop") == 0) {
    stopRoute();
    reply("{\"ok\":true}");
  } else if (strcmp(cmd, "drive") == 0) {
    if (busy()) {
      reply("{\"ok\":false,\"error\":\"busy\"}");
      return;
    }
    const char *moves = message["moves"] | "";
    int count = strlen(moves);
    bool good = count > 0;
    for (int i = 0; i < count; i++) {
      if (strchr("NESW", moves[i]) == nullptr) good = false;
    }
    if (!good) {
      reply("{\"ok\":false,\"error\":\"bad moves\"}");
      return;
    }
    if (count > MAX_MOVES) {
      reply("{\"ok\":false,\"error\":\"too many moves\"}");
      return;
    }
    JsonDocument answer;
    answer["ok"] = true;
    answer["moves"] = count;
    serializeJson(answer, client);
    client.print("\n");
    startRoute(moves);
  } else {
    reply("{\"ok\":false,\"error\":\"unknown cmd\"}");
  }
}

void startServer() {
  server.begin();
}

void serveCommands() {
  if (!client.connected()) {  // nobody, or they hung up: let the next visitor in
    client.stop();
    client = server.accept();
    length = 0;
    tooLong = false;
  }
  while (client.available()) {
    char c = client.read();
    if (c == '\n') {  // the end of a message
      if (tooLong) {
        reply("{\"ok\":false,\"error\":\"too long\"}");
      } else {
        line[length] = '\0';
        handle(line);
      }
      length = 0;
      tooLong = false;
    } else if (length < MAX_LINE) {
      line[length] = c;
      length++;
    } else {
      tooLong = true;
    }
  }
}
```

`cli/courier.py`:

```python
# cli/courier.py — courier, your command-line tool for talking to your robots (Stop 6).
#
# Run it from the top folder of your repo:
#     python3 cli/courier.py --help
#     python3 cli/courier.py ping pip
#     python3 cli/courier.py send pip --to room-2
#     python3 cli/courier.py stop pip
#
# Exit codes, as in Stop 2: 0 it worked · 1 the robot said no (for example "busy") ·
# 2 couldn't do it (unknown robot or room, robot not reachable, no answer).

import argparse
import json
import socket
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "planner"))
from plan import plan, read_map  # noqa: E402  (after the line above, which tells Python where plan.py is)

ROOT = Path(__file__).resolve().parent.parent
FLEET = ROOT / "fleet.json"  # robot name → {"host": …, "port": …}
ROOMS = ROOT / "maps" / "rooms.json"  # room name → [row, column]
OFFICE = ROOT / "maps" / "office.txt"


class Failed(Exception):
    """Something went wrong: the message for people, and the exit code for programs."""

    def __init__(self, message, code):
        super().__init__(message)
        self.code = code


def find_robot(name):
    fleet = json.loads(FLEET.read_text())
    if name not in fleet:
        raise Failed(f"no robot called '{name}' in fleet.json", 2)
    return fleet[name]


def find_room(name):
    rooms = json.loads(ROOMS.read_text())
    if name not in rooms:
        raise Failed(f"no room called '{name}' in maps/rooms.json", 2)
    return tuple(rooms[name])


def talk(name, robot, message):
    """Send one message to the robot and return its reply (a dict)."""
    host, port = robot["host"], robot["port"]
    try:
        with socket.create_connection((host, port), timeout=5) as sock:
            sock.sendall((json.dumps(message) + "\n").encode())
            line = sock.makefile("r").readline()
    except ConnectionRefusedError:
        raise Failed(f"can't reach {name} at {host}:{port} (connection refused)", 2)
    except TimeoutError:
        raise Failed(f"{name} didn't answer within 5 s", 2)
    reply = json.loads(line)
    if not reply.get("ok"):
        raise Failed(f"{name} said: {reply.get('error')}", 1)
    return reply


def send(name, robot, room):
    goal = find_room(room)
    here = talk(name, robot, {"cmd": "ping"})
    route = plan(read_map(OFFICE), start=(here["row"], here["col"]), goal=goal)
    if route is None:
        raise Failed(f"no route from row {here['row']}, column {here['col']} to {room}", 1)
    if route == "":
        print(f"{name}: already in {room}")
        return
    reply = talk(name, robot, {"cmd": "drive", "moves": route})
    print(f"{name}: driving {reply['moves']} moves to {room}")


def main(argv):
    parser = argparse.ArgumentParser(prog="courier", description="Talk to your Courier robots.")
    commands = parser.add_subparsers(dest="command", required=True)
    for command, about in [("ping", "ask where a robot is"), ("send", "send a robot to a room"), ("stop", "stop a robot")]:
        sub = commands.add_parser(command, help=about)
        sub.add_argument("robot", help="its name in fleet.json, like pip")
        if command == "send":
            sub.add_argument("--to", required=True, metavar="ROOM", help="a room in maps/rooms.json, like room-2")
    args = parser.parse_args(argv[1:])

    try:
        robot = find_robot(args.robot)
        if args.command == "ping":
            reply = talk(args.robot, robot, {"cmd": "ping"})
            print(f"{args.robot}: row {reply['row']}, column {reply['col']}, heading {reply['heading']}, {reply['state']}")
        elif args.command == "send":
            send(args.robot, robot, args.to)
        elif args.command == "stop":
            talk(args.robot, robot, {"cmd": "stop"})
            print(f"{args.robot}: stopped")
    except Failed as failed:
        print(failed, file=sys.stderr)
        return failed.code
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
```

`command_server.h` is as in Step 2, `plan()` starts as in Step 10, and the other firmware files are
unchanged from Stop 5.

## Now you: do it

In **your** repo, make the same change: a branch; the firmware joins the Wi-Fi and serves the
protocol; `cli/courier.py` with its five tests switched on; `plan()`'s start and goal; three
commits; a PR with `stop-06` green; merge. You may shape the tool your own way: the checks talk to
it only through its commands and exit codes.

**Make it yours (optional):** add `courier where pip`, which prints Pip's tile, heading and state
every second until Ctrl+C.

## Words you met, and where

| Word | Explained in |
| --- | --- |
| Wi-Fi, `WiFi.begin`, `WiFi.status`, `WL_CONNECTED`, IP address, `WiFi.localIP` | Step 1 |
| port, `WiFiServer`, server, client, `accept`, `WiFiClient`, socket, `available`, `read` | Step 2 |
| `--listen`, forwarding, `localhost`, bytes, `b'…'`, `sendall`, `ConnectionRefusedError` | Step 3 |
| protocol | Part B |
| stream, message framing, the 512-byte limit, `recv` | Step 4 |
| parse, ArduinoJson, `lib_deps`, `JsonDocument`, `deserializeJson`, `\| ""` | Step 5 |
| `strcmp`, `strchr`, `strlen`, serialize, `serializeJson`, `strlcpy`, `lround`, `START_ROW` / `START_COL` | Step 6 |
| command-line tool, subcommand, `argparse`, `add_subparsers`, `--help` | Step 7 |
| `fleet.json`, `maps/rooms.json`, `class Failed(Exception)`, `raise` | Step 8 |
| `json.dumps`, `json.loads`, `.encode()`, `makefile().readline()`, `timeout=5`, `TimeoutError`, `with` | Step 9 |
| `sys.path`, default arguments | Step 10 |
