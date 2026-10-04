# sim/ — the robot simulator

The simulator is a pretend robot on the office floor, with walls, a distance sensor and wheel
encoders. It runs **your** firmware, in robot time, and tells you what the robot did: the serial
monitor with the time of each line, where it ended up, and whether it hit anything. CI uses the
same simulator to check your work, so what you see in your Codespace is what CI sees.

It answers in text for now. The Codespace's **Ports** tab lists a *Simulator* entry (port 8080),
but nothing answers there yet: a picture of your robot driving is planned for later.

(Notes on how the simulator is packed into this repo are in `MAINTAINERS.md`.)

Until Stop 3 your firmware is empty, so the robot stays on S. Stop 2's CI job also uses the
simulator to drive the route your planner prints.

## Running the simulator from the terminal

`npm run sim` builds your firmware and drives it on the office floor in the simulator, then says
where the robot ended up. It needs the simulator's compiler, which your Codespace installs when it's
created (`npm ci`; run that once yourself anywhere else).
Add options after `--`, for example `npm run sim -- --seconds 60`. Later stops add more options
(boxes in the corridor, sensor noise, the real-world switch, test drives, listening on a port);
each stop's walkthrough shows the ones it needs.
