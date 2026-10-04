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
