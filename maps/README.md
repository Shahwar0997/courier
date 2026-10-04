# maps/ — the floors your robot delivers on

Each file is a **map**: a plain text file that draws a floor from above, one row of tiles per
line. One tile is 30 cm of real floor.

| Letter | Means |
| --- | --- |
| `#` | wall — the robot can't go here |
| `.` | floor — the robot can drive here |
| `S` | start — where the robot is |
| `G` | goal — where the parcel goes |

| File | What it is |
| --- | --- |
| `office.txt` | The office floor from Stop 0. Your planner's main map. |
| `walled.txt` | A floor where a wall cuts S off from G: there is no route. |
| `check.txt` | A small floor used by the Stop 2 check. |
| `rooms.json` | Where each room of the office floor is, as `[row, column]`: reception, and rooms 1 to 5. Your `courier` tool reads it from Stop 6. |

Rows and columns are counted from 0 at the top-left, so in `office.txt` the robot starts at
row 1, column 1. You'll use these maps from Stop 2. Add your own (for example `my-floor.txt`)
whenever you like.
