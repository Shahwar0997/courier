// The Courier world: a floor of 30 cm tiles read from a map file, and a two-wheeled robot that
// drives on it. Pure JavaScript with no DOM, so the same code runs in a browser worker, on the
// page and in Node (CI). Deterministic: the same inputs always give the same run.
//
//   import { parseMap, createWorld, OFFICE } from "courier/world.js";
//   const map = parseMap(OFFICE);                 // "#" wall, "." floor, "S" start, "G" goal
//   const world = createWorld({ map });           // the robot on S, facing east
//   world.setMotors(180, 180); world.advance(500_000);   // 0.5 s of robot time
//
// Units: metres, seconds, radians. The floor's x grows to the east (columns) and y to the south
// (rows), so a heading of 0 is east and a positive turn is clockwise, seen from above.

/** One tile is 30 cm, as in the curriculum ("tile = 30 cm"). */
export const TILE = 0.3;

/** Headings as the curriculum numbers them: N 0, E 1, S 2, W 3. */
export const HEADINGS = ["N", "E", "S", "W"];
const HEADING_ANGLE = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
/** Row and column steps for the move letters N, E, S, W. */
export const MOVES = { N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] };

/** The office floor from Stop 0 and Stop 2 (courier-starter `maps/office.txt`). */
export const OFFICE = `###################
#S....#.....#.....#
#.....#.....#.....#
#.....##.####.##..#
#.................#
####.####.####.#.##
#......#....#.....#
#......#....#...G.#
###################`;

/**
 * The robot's physical model. The defaults are the simulator's; they get calibrated against the
 * Freenove FNK0053 kit once a sample is measured (the numbers are marked in the README).
 */
export const DEFAULT_ROBOT = Object.freeze({
  wheelbase: 0.14, // m between the left and right wheels
  radius: 0.09, // m: the robot's footprint for collisions (an 18 cm circle)
  vmax: 0.5, // m/s of a wheel at full power (255)
  deadband: 60, // below this power (of 255) the wheels don't turn at all
  curve: 0.8, // speed rises as ((power − deadband) / (255 − deadband)) ^ curve: not a straight line
  lag: 0.08, // s: how quickly a wheel reaches its new speed (time constant)
  trim: [1, 1], // left, right: 0.97 makes the right motor 3% weaker (for calibration lessons)
  wheelRadius: 0.0325, // m: a 65 mm wheel (the encoders count its turns)
  ticksPerRev: 120, // encoder ticks (rising edges) per wheel turn
});

/** The battery voltage the motor numbers above are measured at (2 × 18650 cells, part charged). */
export const NOMINAL_VOLTS = 8.0;
/** A flat battery (2 cells at 3.0 V): the real-world switch never drains it further. */
export const FLAT_VOLTS = 6.0;

/**
 * The "real world" switch (Stop 5): how far the simulator strays from the ideal robot when it's on.
 * Every number is drawn from a seeded generator, so a run with the same seed is the same run.
 * Pass `realWorld: true` for these, or an object to change some of them.
 */
export const REAL_WORLD = Object.freeze({
  seed: 1, // which "real world": the same seed gives the same slip, motors and battery
  // The three switches of the curriculum's Real world panel (from 0.8). All on by default; Stop 4
  // turns on only `sensorNoise` ({ wheelSlip: false, batterySag: false }). A switch that's off leaves
  // its part of the robot ideal, exactly as with the whole switch off.
  sensorNoise: true, // sonar error and dropouts, line-sensor flicker, missed encoder ticks
  wheelSlip: true, // turn and drive slip, the floor's wander, and the weaker motor
  batterySag: true, // part-charged at power-on, dips under load, drains with use
  slipTurn: 0.12, // turning on the spot scrubs the tyres: the body turns 12% less than the wheels say
  slipDrive: 0.03, // driving straight, the tyres creep: 3% less distance than the wheels say
  slipJitter: 0.05, // and the floor isn't even: slip wanders by ±5% (of the motion) over ~0.2 s
  motorMismatch: 0.05, // one motor is up to 5% weaker than the other (which one depends on the seed)
  battery: [7.7, 8.2], // V at power-on, somewhere in this range (it isn't fully charged)
  drainVoltsPerMin: 0.08, // V lost per minute at full power on both motors (less at lower power)
  sagVolts: 0.35, // V the battery dips while both motors run at full power
  sonarNoiseCm: 1.5, // the sonar's error (standard deviation, cm)
  sonarDropout: 0.02, // the share of sonar readings with no echo (−1)
  lineFlicker: 0.01, // the share of line-sensor readings that come out wrong
  tickMiss: 0.003, // the share of encoder ticks that are missed
});

const SQRT2 = 1.4142135623730951;

/**
 * Things on the floor the camera can tell apart (Stop 20). Each kind has a shape the robot bumps
 * into and the sonar sees, and a look of its own: a parcel is a cardboard box with a tape stripe; a
 * person is two legs (the camera is 8 cm up, so that's what it sees); an obstacle is a striped bin.
 * `size` is metres across (a leg's width for a person), `h` metres tall.
 */
export const OBJECT_KINDS = Object.freeze({
  parcel: Object.freeze({ shape: "box", size: 0.2, h: 0.15 }),
  person: Object.freeze({ shape: "legs", size: 0.11, h: 0.9 }),
  obstacle: Object.freeze({ shape: "round", size: 0.3, h: 0.45 }),
});

/** The full real-world settings for `realWorld: true | object`, or null when it's off. */
export function realWorldOf(opt) {
  if (!opt) return null;
  return { ...REAL_WORLD, ...(opt === true ? {} : opt) };
}

/** Stop 4's setting: the Real world panel with only sensor noise on. `realWorld: SENSOR_NOISE_ONLY`, or with a seed. */
export const SENSOR_NOISE_ONLY = Object.freeze({ sensorNoise: true, wheelSlip: false, batterySag: false });

// The numbers a run uses: a switch that's off zeroes its part. The random draws stay the same, so a
// part that's on behaves as it does with every switch on (the same seed, the same sonar sequence).
function inEffect(RW) {
  if (!RW) return null;
  const e = { ...RW };
  if (RW.sensorNoise === false) Object.assign(e, { sonarNoiseCm: 0, sonarDropout: 0, lineFlicker: 0, tickMiss: 0 });
  if (RW.wheelSlip === false) Object.assign(e, { slipTurn: 0, slipDrive: 0, slipJitter: 0, motorMismatch: 0 });
  if (RW.batterySag === false) Object.assign(e, { battery: [NOMINAL_VOLTS, NOMINAL_VOLTS], drainVoltsPerMin: 0, sagVolts: 0 });
  return e;
}

/**
 * The curriculum's pose frame (Stop 5): centimetres east and north of the start tile's centre, and
 * the heading in compass degrees (0 north, 90 east, clockwise, 0 ≤ h < 360). The firmware prints its
 * belief in it (`pose e=12.5 n=-30.1 h=180`), ghost Pip is drawn from it, and reports give the truth in it.
 * @param {{ start: { row: number, col: number } }} map  a parsed map (its S)
 * @param {{ x: number, y: number, th: number }} p  metres and radians, as the kit keeps them (y south)
 * @returns {{ e: number, n: number, h: number }}
 */
export function toCompass(map, p) {
  const s = tileCentre(map.start.row, map.start.col);
  let h = ((p.th * 180) / Math.PI + 90) % 360;
  if (h < 0) h += 360;
  return { e: (p.x - s.x) * 100, n: (s.y - p.y) * 100, h };
}
/** The other way: a compass pose ({ e, n, h }: cm, cm, degrees) to metres and radians on the map. */
export function fromCompass(map, c) {
  const s = tileCentre(map.start.row, map.start.col);
  return { x: s.x + c.e / 100, y: s.y - c.n / 100, th: wrap(((c.h - 90) * Math.PI) / 180) };
}
/**
 * Reads a belief line, `pose e=12.5 n=-30.1 h=180` (any spacing; whole or decimal numbers), as the
 * firmware prints it every so often (Stop 5's walkthrough step 10). Null if the line isn't one.
 * @param {string} text
 */
export function parsePose(text) {
  const num = "(-?\\d+(?:\\.\\d*)?|-?\\.\\d+)";
  const m = new RegExp(`^\\s*pose\\s+e\\s*=\\s*${num}\\s+n\\s*=\\s*${num}\\s+h\\s*=\\s*${num}\\s*$`).exec(String(text));
  return m ? { e: Number(m[1]), n: Number(m[2]), h: Number(m[3]) } : null;
}

/**
 * The test drives (Stop 5's calibration): a floor and the route the firmware is asked to drive
 * (courier::route()). "square": one tile east, south, west and north on an open 5 × 5 floor, back to
 * the start. { straight: n }: n tiles east down an open floor 9 tiles wide (room to veer).
 * @param {"square" | { straight: number }} drive
 * @returns {{ kind: "square" | "straight", tiles: number, map: string, route: string }}
 */
export function testDriveOf(drive) {
  if (drive === "square") return { kind: "square", tiles: 4, map: "#######\n#.....#\n#.....#\n#..S..#\n#.....#\n#.....#\n#######", route: "ESWN" };
  const n = drive?.straight;
  if (!Number.isInteger(n) || n < 1 || n > 50) throw new Error("a straight test drive is 1 to 50 tiles: { straight: 10 }");
  const w = n + 4, wall = "#".repeat(w), open = "#" + ".".repeat(w - 2) + "#";
  return { kind: "straight", tiles: n, map: [wall, open, open, open, "#S" + ".".repeat(w - 3) + "#", open, open, open, wall].join("\n"), route: "E".repeat(n) };
}

/** A box's default size: a 20 × 20 cm carton, 20 cm tall, in the middle of its tile (5 cm of floor each side). */
export const BOX = Object.freeze({ size: 0.2, h: 0.2 });

/**
 * A box on the floor by tile (Stop 4), as `boxes` options and `--box ROW,COL[@FROM-TO]` give it:
 * centred on tile (row, col); fractions move it between tiles (col 7.5 is the line between columns 7
 * and 8); on the floor from `from` to `to` seconds of robot time (default: the whole run).
 * Returns the box in metres: { x0, y0, x1, y1, h, row, col, from, to }.
 * @param {{ row: number, col: number, from?: number, to?: number, size?: number, h?: number }} b
 */
export function boxAt(b) {
  const size = b.size ?? BOX.size, cx = (b.col + 0.5) * TILE, cy = (b.row + 0.5) * TILE;
  if (![b.row, b.col, size].every(Number.isFinite) || size <= 0) throw new Error("a box needs a row, a column and a size above 0");
  const from = b.from ?? 0, to = b.to ?? Infinity;
  if (!(from >= 0) || !(to > from)) throw new Error(`a box's time must run forwards: from ${from} s to ${to} s`);
  return { x0: cx - size / 2, y0: cy - size / 2, x1: cx + size / 2, y1: cy + size / 2, h: b.h ?? BOX.h, row: b.row, col: b.col, size, from, to };
}

/**
 * Reads `ROW,COL[@FROM-TO]` (the CLI's --box): "4,8" all the time, "4,8@0-12" until 12 s,
 * "4,8@5" from 5 s on, "4,7.5@8.2-20" between two tiles from 8.2 s to 20 s. Null if it isn't one.
 * @param {string} text
 */
export function parseBox(text) {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*(?:@\s*(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?)?\s*$/.exec(String(text));
  if (!m) return null;
  const b = { row: Number(m[1]), col: Number(m[2]) };
  if (m[3] != null) b.from = Number(m[3]);
  if (m[4] != null) b.to = Number(m[4]);
  if (b.to != null && !(b.to > (b.from ?? 0))) return null;
  return b;
}

/**
 * Reads a map file: "#" wall, "." floor, "S" start, "G" goal (other letters are floor too).
 * Blank lines at the ends and trailing spaces are ignored; short rows are padded with wall.
 * Throws an Error with a plain message when there's no S (a map needs a start).
 * @param {string} text
 */
export function parseMap(text) {
  const lines = String(text).replace(/\r/g, "").split("\n").map((l) => l.replace(/\s+$/, ""));
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  if (!lines.length) throw new Error("the map is empty");
  const cols = Math.max(...lines.map((l) => l.length));
  const rows = lines.map((l) => l.padEnd(cols, "#"));
  let start = null, goal = null;
  rows.forEach((row, r) => {
    for (let c = 0; c < cols; c++) {
      if (row[c] === "S") start ??= { row: r, col: c };
      if (row[c] === "G") goal ??= { row: r, col: c };
    }
  });
  if (!start) throw new Error("the map has no S (where the robot starts)");
  return { rows, height: rows.length, width: cols, start, goal, text: rows.join("\n") };
}

/** Is (row, col) a wall? Everything outside the map is wall. */
export function isWall(map, row, col) {
  return row < 0 || col < 0 || row >= map.height || col >= map.width || map.rows[row][col] === "#";
}

/** The centre of a tile, in metres. */
export const tileCentre = (row, col) => ({ x: (col + 0.5) * TILE, y: (row + 0.5) * TILE });
/** The tile under a point. */
export const tileAt = (x, y) => ({ row: Math.floor(y / TILE), col: Math.floor(x / TILE) });
/** The nearest of N/E/S/W (0–3) to an angle. */
export const headingOf = (th) => ((Math.round((th + Math.PI / 2) / (Math.PI / 2)) % 4) + 4) % 4;
/** The angle of a heading 0–3 (N/E/S/W). */
export const angleOf = (heading) => HEADING_ANGLE[((heading % 4) + 4) % 4];
/** An angle wrapped into (−π, π]. */
export const wrap = (a) => {
  a = (a + Math.PI) % (2 * Math.PI);
  return (a <= 0 ? a + 2 * Math.PI : a) - Math.PI;
};

/**
 * A wheel's steady speed (m/s) for a motor power of −255..255: zero inside the dead band, then
 * rising, but not in proportion. Sims can draw it (Stop 3's speed-vs-duty chart).
 * @param {number} power
 * @param {Partial<typeof DEFAULT_ROBOT>} [robot]
 */
export function wheelSpeed(power, robot = DEFAULT_ROBOT) {
  const p = { ...DEFAULT_ROBOT, ...robot };
  const a = Math.min(255, Math.abs(power));
  if (a < p.deadband) return 0;
  return Math.sign(power) * ((a - p.deadband) / (255 - p.deadband)) ** p.curve * p.vmax;
}

// Deterministic noise (xorshift32), so every run with the same seed is the same run.
export function rng(seed) {
  let s = seed >>> 0 || 0x9e3779b9;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/**
 * A world: the map, the robot on S, and virtual time. Advance it by calling `advance(µs)`; it
 * steps the physics every millisecond. Nothing here is asynchronous.
 *
 * @param {{ map: ReturnType<typeof parseMap> | string, robot?: Partial<typeof DEFAULT_ROBOT>,
 *           heading?: number, seed?: number, realWorld?: boolean | Partial<typeof REAL_WORLD>,
 *           tape?: Array<Array<[number, number]>>, boxes?: Array<{ row: number, col: number, from?: number, to?: number, size?: number, h?: number }>,
 *           onStep?: (world: object) => void, onEdge?: (side: 0 | 1, rising: boolean) => void }} opts
 *   `heading`: 0–3, where the robot faces at the start (default 1, east).
 *   `tape`: dark lines on the floor for the line sensors, each a list of [row, col] points in
 *   tile units (fractions allowed; [1.5, 1.5] is the middle of tile (1, 1)).
 *   `realWorld`: the Real world switch (REAL_WORLD). Off (the default), the robot is the ideal one and
 *   runs are exactly as without it; on, the floor slips, the motors differ, the battery sags and
 *   the sensors are noisy, all from `realWorld.seed`. Its three parts switch separately
 *   (`sensorNoise`, `wheelSlip`, `batterySag`; Stop 4 is SENSOR_NOISE_ONLY).
 *   `boxes`: boxes on the floor by tile, each for a time if you like (boxAt). They appear and go at
 *   the 1 ms step their time falls in.
 *   `onStep`: called after every 1 ms physics step.
 *   `onEdge`: called for every encoder edge (side 0 left, 1 right; rising or falling).
 */
export function createWorld(opts) {
  const map = typeof opts.map === "string" ? parseMap(opts.map) : opts.map;
  const P = { ...DEFAULT_ROBOT, ...opts.robot };
  const rand = rng(opts.seed ?? 0x9e3779b9);
  const s = tileCentre(map.start.row, map.start.col);
  const robot = { x: s.x, y: s.y, th: angleOf(opts.heading ?? 1), vL: 0, vR: 0, cmdL: 0, cmdR: 0, led: false };
  // The real world draws from its own generator, so switching it off leaves every other number as it was.
  const RW = realWorldOf(opts.realWorld);
  const E = inEffect(RW); // the numbers in effect (switches that are off are zero)
  const rw = RW ? rng((RW.seed * 2654435761) ^ 0x5bd1e995) : null;
  // Bell-shaped noise from six uniform draws (Irwin–Hall), using only + − ×: Math.log/cos may round
  // differently in different browsers, and a seeded run must be the same run everywhere.
  const gauss = () => (rw() + rw() + rw() + rw() + rw() + rw() - 3) * SQRT2;
  const gains = [1, 1];
  if (RW) gains[rw() < 0.5 ? 0 : 1] = 1 - E.motorMismatch * (0.5 + 0.5 * rw());
  const battery = { open: RW ? E.battery[0] + (E.battery[1] - E.battery[0]) * rw() : NOMINAL_VOLTS, volts: 0 };
  battery.volts = battery.open;
  const startVolts = battery.open;
  let jitter = 0; // the floor's slip right now, −1..1-ish (a slow random wander)
  // Encoders: a wheel's angle in ticks, and the edges seen so far (a missed tick skips both its edges).
  const enc = { phase: [0, 0], ticks: [0, 0], half: [0, 0], missing: [false, false] };
  const boxes = []; // boxes on the floor now: { x0, y0, x1, y1, h } in metres
  const timed = []; // boxes with a time (placeBox): each is in `boxes` while from ≤ t < to
  const tape = (opts.tape ?? []).map((line) => line.map(([r, c]) => [c * TILE, r * TILE]));
  const objects = []; // things on the floor (Stop 20): { id, kind, x, y, th, size, h }
  let nextId = 1;
  // The camera's light (Stop 20): gain, a left-to-right gradient and sensor noise, from its own seed.
  let light = null, lightRand = null;
  const world = {
    map, robot, params: P, boxes,
    /** Virtual time in µs since power-on. */
    t: 0,
    /**
     * The first time the robot touched something: { t, thing, row, col, x, y, move }. `thing` is
     * "wall", "box" or an object's kind; row/col is the tile of the wall, or of the box's centre (−1 for
     * an object, and for a box added in metres with addBox). `move` is the move it was making, counted
     * from 1, for a robot that drives from tile centre to tile centre: the tiles it entered, plus one
     * once its centre is past the middle of the tile it's on (it's leaving that tile).
     */
    hit: null,
    /** How far the robot's centre has really travelled, metres (the path, not the straight line; Stop 5's true distance). */
    travelled: 0,
    /** How many separate times it bumped into something. */
    bumps: 0,
    /** Every tile the robot's centre entered, in order: { t, row, col }. */
    tiles: [{ t: 0, ...map.start }],
    rand,
    /** The real-world settings when the switch is on, else null. */
    realWorld: RW,
    /** Encoder ticks (rising edges) counted on each wheel since power-on: [left, right]. */
    ticks: enc.ticks,
    /** The battery: the voltage at the motors now, and at power-on. */
    battery: { get volts() { return battery.volts; }, startVolts },
    /** The encoder's output pin for a wheel (0 left, 1 right) right now: 1 over a slot, 0 between. */
    encoderLevel: (side) => enc.half[side] & 1,
    setMotors(left, right) {
      robot.cmdL = clamp(Math.round(left), -255, 255);
      robot.cmdR = clamp(Math.round(right), -255, 255);
    },
    /** Moves time on by `us` microseconds (physics in 1 ms steps; the rest carries over). */
    advance(us) {
      acc += us;
      while (acc >= 1000) {
        acc -= 1000;
        world.t += 1000;
        if (timed.length) schedule();
        step();
        opts.onStep?.(world);
      }
    },
    /** Time including the part of a millisecond not yet stepped. */
    now: () => world.t + acc,
    /** Puts a box on the floor (metres), for the whole run. */
    addBox(box) { boxes.push({ h: 0.2, ...box }); },
    /**
     * Puts a box on a tile, for the whole run or from `from` to `to` seconds (boxAt). A box that
     * appears where the robot stands counts as a hit. Returns it (metres, with its row and col).
     * @param {{ row: number, col: number, from?: number, to?: number, size?: number, h?: number }} spec
     */
    placeBox(spec) {
      const b = boxAt(spec);
      timed.push(b);
      schedule();
      return b;
    },
    /** Every box placed by tile (placeBox / `boxes`), whether it's on the floor now or not. */
    placed: timed,
    /** Things on the floor (Stop 20): parcels, people and obstacles. */
    objects,
    /**
     * Puts a parcel, person or obstacle on the floor, at (x, y) metres, turned `th` radians. The robot
     * bumps into it, the sonar sees it and the camera shows it. Returns it (with an `id`).
     * @param {{ kind: "parcel" | "person" | "obstacle", x: number, y: number, th?: number, size?: number, h?: number }} o
     */
    addObject(o) {
      const k = OBJECT_KINDS[o.kind];
      if (!k) throw new Error(`no such kind of object: ${o.kind} (parcel, person or obstacle)`);
      const obj = { id: nextId++, kind: o.kind, x: o.x, y: o.y, th: o.th ?? 0, size: o.size ?? k.size, h: o.h ?? k.h, shape: k.shape };
      objects.push(obj);
      return obj;
    },
    /** Takes an object off the floor. */
    removeObject(obj) { const i = objects.indexOf(obj); if (i >= 0) objects.splice(i, 1); },
    /**
     * The camera's light: `gain` (1 = as it is; 0.5 dim, 1.4 bright), `gradient` (−0.5..0.5: darker on
     * one side), `noise` (sensor noise, grey levels), `seed` (the noise's). null = the plain camera.
     * @param {{ gain?: number, gradient?: number, noise?: number, seed?: number } | null} l
     */
    setLight(l) {
      light = l ? { gain: 1, gradient: 0, noise: 0, seed: 1, ...l } : null;
      lightRand = light ? rng((light.seed * 2246822519) ^ 0x27d4eb2f) : null;
    },
    /**
     * A camera frame with labels: `px` (as camera()) and, for each object in view, its kind, bounding
     * box [x0, y0, x1, y1] (pixels, inclusive), how many pixels show it, its distance (m) and bearing
     * (degrees, + to the right). For datasets (dataset.js) and for checking what firmware should see.
     */
    cameraFrame(w, h) { return render(w, h, true); },
    /** Where the robot is: pose, tile, nearest heading and the distance to G. */
    pose() {
      const tile = tileAt(robot.x, robot.y);
      const g = map.goal ? tileCentre(map.goal.row, map.goal.col) : null;
      return {
        x: robot.x, y: robot.y, th: robot.th, heading: headingOf(robot.th), ...tile, led: robot.led,
        goalCm: g ? dist(g.x - robot.x, g.y - robot.y) * 100 : null, // not Math.hypot: its rounding differs between browsers
      };
    },
    /** The ultrasonic sensor: distance ahead in cm (2–400), or -1 when no echo comes back. */
    sonarCm() {
      const fx = robot.x + Math.cos(robot.th) * P.radius, fy = robot.y + Math.sin(robot.th) * P.radius;
      let d = Infinity;
      for (const da of [-0.13, 0, 0.13]) d = Math.min(d, (objects.length ? sonarRay : ray)(fx, fy, robot.th + da).d);
      let cm = d * 100 + (rand() - 0.5);
      if (RW) {
        if (rw() < E.sonarDropout) return -1;
        cm += gauss() * E.sonarNoiseCm;
      }
      return cm >= 2 && cm <= 400 ? Math.round(cm) : -1;
    },
    /** Line sensor i (0 left, 1 middle, 2 right), 6 cm ahead of the centre: true over tape. */
    onTape(i) {
      const off = (1 - i) * 0.015, f = 0.06; // + is to the robot's left
      const x = robot.x + Math.cos(robot.th) * f + Math.sin(robot.th) * off;
      const y = robot.y + Math.sin(robot.th) * f - Math.cos(robot.th) * off;
      const on = tapeAt(x, y);
      return RW && rw() < E.lineFlicker ? !on : on;
    },
    /** A grayscale camera frame, w×h (up to 160×120), ray-cast from the robot's nose. */
    camera(w, h) { return render(w, h, false).px; },
  };
  let acc = 0;
  let touching = false;
  // Which move the robot is making (world.hit.move): a move runs from one tile's centre to the next.
  function moveNow() {
    const entered = world.tiles.length - 1, c = tileCentre(world.tiles[entered].row, world.tiles[entered].col);
    const past = (robot.x - c.x) * Math.cos(robot.th) + (robot.y - c.y) * Math.sin(robot.th) >= -0.005;
    return Math.max(1, entered + (past ? 1 : 0));
  }
  // Timed boxes: on the floor while from ≤ t < to (in seconds of robot time).
  function schedule() {
    const s = world.t / 1e6;
    for (const b of timed) {
      const on = s >= b.from && s < b.to, i = boxes.indexOf(b);
      if (on && i < 0) boxes.push(b);
      else if (!on && i >= 0) boxes.splice(i, 1);
    }
  }
  for (const b of opts.boxes ?? []) world.placeBox(b);

  // The camera: walls, boxes and tape as before; objects painted over them, far to near; then the
  // light. With no objects and no light it's exactly the 0.1–0.4 camera.
  function render(w, h, withLabels) {
    const out = new Uint8Array(w * h);
    const owner = withLabels || objects.length ? new Int32Array(w * h) : null; // object id per pixel
    const fov = Math.PI / 3, camH = 0.08, focal = w / 2 / Math.tan(fov / 2);
    for (let c = 0; c < w; c++) {
      const a = robot.th + Math.atan((c - w / 2 + 0.5) / focal);
      const hit = ray(robot.x, robot.y, a);
      const cosA = Math.cos(a - robot.th);
      const perp = Math.max(1e-3, hit.d * cosA);
      const top = h / 2 - ((hit.h - camH) / perp) * focal, bottom = h / 2 + (camH / perp) * focal;
      for (let y = 0; y < h; y++) {
        let v;
        if (y < top) v = 230;
        else if (y <= bottom) v = Math.max(20, hit.shade - perp * 20);
        else {
          const g = (camH * focal) / (y - h / 2 + 0.5) / cosA;
          v = tapeAt(robot.x + Math.cos(a) * g, robot.y + Math.sin(a) * g) ? 35 : 200;
        }
        out[y * w + c] = v;
      }
      if (!objects.length) continue;
      const dx = Math.cos(a), dy = Math.sin(a);
      const hits = [];
      for (const o of objects) {
        const t = rayObject(o, robot.x, robot.y, dx, dy);
        if (t && t.t < hit.d && t.t > 0.02) hits.push(t);
      }
      hits.sort((p, q) => q.t - p.t); // far first: nearer things paint over them
      for (const t of hits) {
        const op = Math.max(1e-3, t.t * cosA);
        const oTop = Math.max(0, Math.ceil(h / 2 - ((t.o.h - camH) / op) * focal)), oBottom = Math.min(h - 1, Math.floor(h / 2 + (camH / op) * focal));
        for (let y = oTop; y <= oBottom; y++) {
          const z = Math.max(0, camH - ((y - h / 2 + 0.5) * op) / focal); // the height this pixel looks at, m
          out[y * w + c] = Math.max(15, Math.min(250, look(t.o, t.u, z, t.facing) - op * 15));
          owner[y * w + c] = t.o.id;
        }
      }
    }
    if (light) {
      for (let y = 0; y < h; y++) {
        for (let c = 0; c < w; c++) {
          const i = y * w + c;
          let v = out[i] * light.gain * (1 + light.gradient * ((c + 0.5) / w - 0.5) * 2);
          if (light.noise) v += (lightRand() + lightRand() + lightRand() + lightRand() + lightRand() + lightRand() - 3) * SQRT2 * light.noise;
          out[i] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
        }
      }
    }
    if (!withLabels) return { px: out };
    const labels = [];
    for (const o of objects) {
      let x0 = w, y0 = h, x1 = -1, y1 = -1, n = 0;
      for (let i = 0; i < owner.length; i++) {
        if (owner[i] !== o.id) continue;
        const x = i % w, y = (i - x) / w;
        n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      if (!n) continue;
      const ddx = o.x - robot.x, ddy = o.y - robot.y;
      labels.push({ id: o.id, kind: o.kind, bbox: [x0, y0, x1, y1], pixels: n,
        distance: Math.round(Math.sqrt(ddx * ddx + ddy * ddy) * 1000) / 1000,
        bearing: Math.round((wrap(Math.atan2(ddy, ddx) - robot.th) * 180) / Math.PI * 10) / 10 });
    }
    return { px: out, labels };
  }

  // How an object looks at height z (m) and across-position u (0..1 around or along it), lit from
  // the front (facing: 1 = square on, 0 = edge on).
  function look(o, u, z, facing) {
    if (o.kind === "parcel") {
      const tape = Math.abs(u - 0.5) < 0.08 || z > o.h - 0.02; // a tape stripe down the middle and along the top edge
      return (tape ? 105 : 165) * (0.75 + 0.25 * facing);
    }
    if (o.kind === "person") return z < 0.06 ? 215 : 55 + 20 * facing; // shoes, then trousers
    return Math.floor(z / 0.07) % 2 ? 72 : 205; // a bin with bands
  }

  // A ray from (ox, oy) along (dx, dy) against an object: { t, u, facing, o } or null.
  function rayObject(o, ox, oy, dx, dy) {
    if (o.shape === "round") return rayCircle(o, o.x, o.y, o.size / 2, ox, oy, dx, dy);
    if (o.shape === "legs") {
      const sx = -Math.sin(o.th) * 0.1, sy = Math.cos(o.th) * 0.1; // legs 20 cm apart
      const a = rayCircle(o, o.x + sx, o.y + sy, o.size / 2, ox, oy, dx, dy), b = rayCircle(o, o.x - sx, o.y - sy, o.size / 2, ox, oy, dx, dy);
      return !a ? b : !b ? a : a.t < b.t ? a : b;
    }
    // a box turned by th: the ray in the box's own frame
    const c = Math.cos(o.th), s = Math.sin(o.th), half = o.size / 2;
    const lx = (ox - o.x) * c + (oy - o.y) * s, ly = -(ox - o.x) * s + (oy - o.y) * c;
    const ldx = dx * c + dy * s, ldy = -dx * s + dy * c;
    const t = rayBox(lx, ly, ldx, ldy, { x0: -half, y0: -half, x1: half, y1: half });
    if (!isFinite(t) || t <= 0) return null;
    const px = lx + ldx * t, py = ly + ldy * t;
    const onX = Math.abs(Math.abs(px) - half) < Math.abs(Math.abs(py) - half); // hit an x face
    return { t, o, u: ((onX ? py : px) + half) / o.size, facing: Math.abs(onX ? ldx : ldy) };
  }
  function rayCircle(o, cx, cy, r, ox, oy, dx, dy) {
    const fx = ox - cx, fy = oy - cy, b = fx * dx + fy * dy, cc = fx * fx + fy * fy - r * r, disc = b * b - cc;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    if (t <= 0) return null;
    const hx = fx + dx * t, hy = fy + dy * t;
    return { t, o, u: (Math.atan2(hy, hx) / Math.PI + 1) / 2, facing: Math.max(0, -(hx * dx + hy * dy) / r) };
  }

  function step() {
    const dt = 0.001;
    let kL = P.trim[0], kR = P.trim[1];
    if (RW) {
      // The battery: it drains with use and dips under load; the motors get weaker with it.
      const load = (Math.abs(robot.cmdL) + Math.abs(robot.cmdR)) / 510;
      // A flat 2-cell pack stops at about 6 V (its protection cuts out below that).
      battery.open = Math.max(FLAT_VOLTS, battery.open - (E.drainVoltsPerMin / 60) * (load + 0.02) * dt);
      battery.volts = Math.max(0, battery.open - E.sagVolts * load);
      const k = battery.volts / NOMINAL_VOLTS;
      kL *= gains[0] * k; kR *= gains[1] * k;
      jitter += (-jitter * dt) / 0.2 + gauss() * Math.sqrt((2 * dt) / 0.2); // wanders with a ~0.2 s memory
    }
    robot.vL += (wheelSpeed(robot.cmdL, P) * kL - robot.vL) * (dt / P.lag);
    robot.vR += (wheelSpeed(robot.cmdR, P) * kR - robot.vR) * (dt / P.lag);
    countTicks(0, robot.vL, dt);
    countTicks(1, robot.vR, dt);
    let v = (robot.vL + robot.vR) / 2, w = (robot.vL - robot.vR) / P.wheelbase; // y grows south: + is clockwise
    if (RW) {
      // The wheels turned this much; the body moved less: tyres scrub on turns and creep when driving.
      const wobble = 1 + E.slipJitter * jitter;
      v *= Math.max(0, 1 - E.slipDrive * wobble);
      w *= Math.max(0, 1 - E.slipTurn * wobble);
    }
    const nx = robot.x + v * Math.cos(robot.th) * dt, ny = robot.y + v * Math.sin(robot.th) * dt;
    const blocked = collide(nx, ny);
    if (blocked) {
      if (!touching) {
        world.bumps++;
        world.hit ??= { t: world.t, ...blocked, x: robot.x, y: robot.y, move: moveNow() };
      }
      touching = true;
      robot.vL = robot.vR = 0; // it stops against the wall (it can still turn on the spot)
    } else {
      touching = false;
      world.travelled += dist(nx - robot.x, ny - robot.y);
      robot.x = nx;
      robot.y = ny;
    }
    robot.th = wrap(robot.th + w * dt);
    const tile = tileAt(robot.x, robot.y), last = world.tiles[world.tiles.length - 1];
    if (tile.row !== last.row || tile.col !== last.col) world.tiles.push({ t: world.t, ...tile });
  }

  // The encoder on one wheel: it counts the wheel's turning (whichever way, as a one-channel encoder
  // does), not the robot's movement: a slipping wheel still ticks.
  function countTicks(side, speed, dt) {
    const before = enc.phase[side];
    enc.phase[side] += (Math.abs(speed) * dt / (2 * Math.PI * P.wheelRadius)) * P.ticksPerRev;
    const halves = Math.floor(enc.phase[side] * 2) - Math.floor(before * 2);
    for (let i = 0; i < halves; i++) {
      enc.half[side]++;
      const rising = (enc.half[side] & 1) === 1;
      if (rising) enc.missing[side] = !!RW && rw() < E.tickMiss;
      if (enc.missing[side]) continue;
      if (rising) enc.ticks[side]++;
      (world.onEdge ?? opts.onEdge)?.(side, rising);
    }
  }

  // The first wall tile or box the robot's circle would overlap at (x, y), or null.
  function collide(x, y) {
    const r = P.radius, r2 = r * r;
    const c0 = Math.floor((x - r) / TILE), c1 = Math.floor((x + r) / TILE);
    const r0 = Math.floor((y - r) / TILE), r1 = Math.floor((y + r) / TILE);
    let best = null, bestD = Infinity;
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        if (!isWall(map, row, col)) continue;
        const d = distToBox(x, y, col * TILE, row * TILE, (col + 1) * TILE, (row + 1) * TILE);
        if (d < r2 && d < bestD) { bestD = d; best = { thing: "wall", row, col }; }
      }
    }
    if (best) return best;
    for (const b of boxes) {
      if (distToBox(x, y, b.x0, b.y0, b.x1, b.y1) >= r2) continue;
      // a box placed by tile names its tile (the tile its centre is on); one added in metres doesn't
      const tile = b.row == null ? { row: -1, col: -1 } : tileAt((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
      return { thing: "box", ...tile };
    }
    for (const o of objects) if (objectDist2(o, x, y) < r2) return { thing: o.kind, row: -1, col: -1, object: o.kind };
    return null;
  }

  // Squared distance from (x, y) to an object's footprint.
  function objectDist2(o, x, y) {
    if (o.shape === "round") { const d = Math.max(0, Math.sqrt((x - o.x) ** 2 + (y - o.y) ** 2) - o.size / 2); return d * d; }
    if (o.shape === "legs") {
      const sx = -Math.sin(o.th) * 0.1, sy = Math.cos(o.th) * 0.1;
      const leg = (cx, cy) => Math.max(0, Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) - o.size / 2);
      const d = Math.min(leg(o.x + sx, o.y + sy), leg(o.x - sx, o.y - sy));
      return d * d;
    }
    const c = Math.cos(o.th), s = Math.sin(o.th), half = o.size / 2;
    const lx = (x - o.x) * c + (y - o.y) * s, ly = -(x - o.x) * s + (y - o.y) * c;
    return distToBox(lx, ly, -half, -half, half, half);
  }

  // A ray from (ox, oy) at angle a: the distance to the first wall or box, its height and shade.
  function ray(ox, oy, a) {
    const dx = Math.cos(a), dy = Math.sin(a);
    let d = Infinity, h = 0.3, shade = 150;
    // walls: step through the grid tile by tile (DDA)
    let col = Math.floor(ox / TILE), row = Math.floor(oy / TILE);
    const stepC = dx > 0 ? 1 : -1, stepR = dy > 0 ? 1 : -1;
    let tMaxX = Math.abs(dx) < 1e-12 ? Infinity : ((dx > 0 ? (col + 1) * TILE : col * TILE) - ox) / dx;
    let tMaxY = Math.abs(dy) < 1e-12 ? Infinity : ((dy > 0 ? (row + 1) * TILE : row * TILE) - oy) / dy;
    const tdX = Math.abs(dx) < 1e-12 ? Infinity : TILE / Math.abs(dx), tdY = Math.abs(dy) < 1e-12 ? Infinity : TILE / Math.abs(dy);
    for (let i = 0; i < 200; i++) {
      let t;
      if (tMaxX < tMaxY) { t = tMaxX; tMaxX += tdX; col += stepC; } else { t = tMaxY; tMaxY += tdY; row += stepR; }
      if (t > 4) break;
      if (isWall(map, row, col)) { d = t; break; }
    }
    for (const b of boxes) {
      const t = rayBox(ox, oy, dx, dy, b);
      if (t < d) { d = t; h = b.h; shade = 110; }
    }
    return { d, h, shade };
  }
  // The sonar sees objects too (the camera paints them itself, over ray()'s walls).
  function sonarRay(ox, oy, a) {
    const r = ray(ox, oy, a);
    const dx = Math.cos(a), dy = Math.sin(a);
    for (const o of objects) { const t = rayObject(o, ox, oy, dx, dy); if (t && t.t < r.d) r.d = t.t; }
    return r;
  }

  function tapeAt(x, y) {
    const half = 0.01; // tape is 2 cm wide
    for (const line of tape) {
      for (let i = 0; i + 1 < line.length; i++) {
        const [ax, ay] = line[i], [bx, by] = line[i + 1];
        const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy || 1;
        const t = clamp(((x - ax) * vx + (y - ay) * vy) / L, 0, 1);
        if ((ax + t * vx - x) ** 2 + (ay + t * vy - y) ** 2 < half * half) return true;
      }
    }
    return false;
  }

  return world;
}

// √(dx² + dy²) with only exactly-rounded operations, so it's the same number in every engine.
function dist(dx, dy) {
  return Math.sqrt(dx * dx + dy * dy);
}
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function distToBox(x, y, x0, y0, x1, y1) {
  const cx = clamp(x, x0, x1), cy = clamp(y, y0, y1);
  return (x - cx) ** 2 + (y - cy) ** 2;
}
function rayBox(ox, oy, dx, dy, b) {
  let tmin = 0, tmax = Infinity;
  for (const [o, d, lo, hi] of [[ox, dx, b.x0, b.x1], [oy, dy, b.y0, b.y1]]) {
    if (Math.abs(d) < 1e-12) { if (o < lo || o > hi) return Infinity; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}
