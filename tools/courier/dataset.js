// Labelled camera frames for Stop 20: what the robot's camera sees of parcels, people and obstacles,
// at different distances, angles and light, with the right answer for each. Train a classifier on
// them in the Codespace; run it in the robot's firmware. Seeded: the same settings give the same
// pictures, so a learner's numbers can be checked.
//
//   import { makeDataset, LABELS, toPGM } from "courier/dataset.js";
//   const data = makeDataset({ count: 2000, w: 96, h: 96, seed: 1 });
//   data[0];   // { px: Uint8Array(96*96), label: "person", objects: [{ kind, bbox, pixels, distance, bearing }], light, pose }
//
// The CLI writes the same thing as files: `node cli.mjs dataset --count 2000 --size 96x96 --out data/`
// (data/images/00001.pgm … and data/labels.csv), which Python reads with PIL or numpy.
import { createWorld, parseMap, rng, OBJECT_KINDS, TILE } from "./world.js";

/** The answers a frame can have: what's mostly in front of the robot, or nothing. */
export const LABELS = Object.freeze(["nothing", "parcel", "person", "obstacle"]);

// Rooms of a few sizes, so the walls behind things vary.
const ROOMS = [8, 10, 13].map((n) => parseMap(["#".repeat(n), ...Array.from({ length: n - 2 }, (_, i) => "#" + (i === 0 ? "S" : ".") + ".".repeat(n - 3) + "#"), "#".repeat(n)].join("\n")));

/**
 * One frame. The robot stands somewhere in a room; the main object is in front of it (or, for a
 * "nothing" frame, nowhere in view); up to two more objects stand around as distractors; the light
 * changes.
 * @param {number} seed
 * @param {{ w?: number, h?: number, empty?: number, minPixels?: number }} [opts]
 *   `empty`: the share of frames with nothing in view (0.2). `minPixels`: the smallest share of the
 *   frame an object must cover to be the label (0.03).
 */
export function makeSample(seed, opts = {}) {
  const w = opts.w ?? 96, h = opts.h ?? 96;
  const rand = rng((seed * 2654435761) ^ 0x1b873593);
  const between = (a, b) => a + (b - a) * rand();
  const kinds = Object.keys(OBJECT_KINDS);
  const map = ROOMS[Math.floor(rand() * ROOMS.length)];
  const world = createWorld({ map, seed });
  const inner = (map.width - 2) * TILE;
  // the robot: away from the walls, facing anywhere
  world.robot.x = TILE + between(0.5, inner - 0.5);
  world.robot.y = TILE + between(0.5, inner - 0.5);
  world.robot.th = between(-Math.PI, Math.PI);
  const empty = rand() < (opts.empty ?? 0.2);
  const place = (kind, dist, bearing) => {
    const a = world.robot.th + bearing;
    const x = world.robot.x + Math.cos(a) * dist, y = world.robot.y + Math.sin(a) * dist;
    if (x < TILE + 0.2 || y < TILE + 0.2 || x > TILE + inner - 0.2 || y > TILE + inner - 0.2) return null;
    return world.addObject({ kind, x, y, th: between(0, Math.PI) });
  };
  if (!empty) {
    const kind = kinds[Math.floor(rand() * kinds.length)];
    for (let i = 0; i < 20 && !place(kind, between(0.35, 1.8), between(-0.4, 0.4)); i++);
  }
  // distractors: behind or beside the robot when the frame should show nothing, anywhere otherwise
  const extra = Math.floor(rand() * 3);
  for (let i = 0; i < extra; i++) {
    const kind = kinds[Math.floor(rand() * kinds.length)];
    place(kind, between(0.6, 2.5), empty ? between(0.9, 2 * Math.PI - 0.9) : between(-Math.PI, Math.PI));
  }
  const light = { gain: between(0.5, 1.4), gradient: between(-0.4, 0.4), noise: between(0, 8), seed };
  world.setLight(light);
  const frame = world.cameraFrame(w, h);
  const main = frame.labels.filter((l) => l.pixels >= (opts.minPixels ?? 0.03) * w * h).sort((a, b) => b.pixels - a.pixels)[0];
  return {
    px: frame.px, w, h, label: main ? main.kind : "nothing",
    /** Everything needed to set the same scene again: simulate({ map: scene.map, setup: (w) => setScene(w, scene) }). */
    scene: {
      map: map.text, light,
      robot: { x: world.robot.x, y: world.robot.y, th: world.robot.th },
      objects: world.objects.map(({ kind, x, y, th, size, h }) => ({ kind, x, y, th, size, h })),
    },
    objects: frame.labels.map(({ id, ...l }) => l),
    light: { gain: round(light.gain), gradient: round(light.gradient), noise: round(light.noise) },
    pose: { x: round(world.robot.x), y: round(world.robot.y), th: round(world.robot.th) },
  };
}

/**
 * Sets a sample's scene in a world (the one simulate() gives `setup`): the robot's pose, the objects
 * and the light. The firmware's first cameraGrab() then sees exactly the sample's picture.
 */
export function setScene(world, scene) {
  Object.assign(world.robot, scene.robot);
  for (const o of scene.objects) world.addObject(o);
  world.setLight(scene.light);
}

/**
 * Many frames: makeSample(seed, …), makeSample(seed + 1, …), …
 * @param {{ count: number, w?: number, h?: number, seed?: number, empty?: number, minPixels?: number, offset?: number }} o
 *   `offset`: start further into the same sequence (frame i of a dataset is makeSample(seed·1000003 + offset + i)).
 */
export function makeDataset(o) {
  const out = [];
  for (let i = 0; i < o.count; i++) out.push(makeSample((o.seed ?? 1) * 1_000_003 + (o.offset ?? 0) + i, o));
  return out;
}

/** A frame as a PGM image file (binary, "P5"): any image library reads it. */
export function toPGM(px, w, h) {
  const head = new TextEncoder().encode(`P5\n${w} ${h}\n255\n`);
  const out = new Uint8Array(head.length + px.length);
  out.set(head);
  out.set(px, head.length);
  return out;
}

/** labels.csv for a dataset: file, label, the main object's box and distance, and the light. */
export function toCSV(samples, file = (i) => `images/${String(i + 1).padStart(5, "0")}.pgm`) {
  const rows = ["file,label,x0,y0,x1,y1,distance_m,bearing_deg,objects,gain,gradient,noise"];
  samples.forEach((s, i) => {
    const m = s.objects.filter((o) => o.kind === s.label).sort((a, b) => b.pixels - a.pixels)[0];
    rows.push([file(i), s.label, ...(m ? [...m.bbox, m.distance, m.bearing] : ["", "", "", "", "", ""]), s.objects.length, s.light.gain, s.light.gradient, s.light.noise].join(","));
  });
  return rows.join("\n") + "\n";
}

const round = (v) => Math.round(v * 1000) / 1000;
