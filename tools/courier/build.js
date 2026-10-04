// Builds Courier firmware (Arduino-style C/C++) into WebAssembly for the simulator, with clang for
// WebAssembly (@yowasp/clang, the same compiler the code kit serves at /_lib/clang). Shared by the
// browser (compiler.js, in a worker) and Node (the courier CLI in CI, sim-kit tools/courier/): pass
// in clang's `commands` and the kit's firmware headers, get back the firmware or its first error.
//
// Freestanding wasm32: no operating system, and of the C library only what the kit brings, compiled
// into the firmware: maths (math.h, cmath), snprintf (stdio.h), strings (string.h), the heap and
// number parsing (stdlib.h), new/delete; plus ArduinoJson. Everything else firmware can call is the
// board's (Arduino.h, courier.h, WiFi.h), which the simulator provides (sim.js).

/** The exact clang release this kit version is built and tested with. */
export const CLANG_VERSION = "22.0.0-git20542-10";

/** The kit's firmware files (in firmware/): headers learners include, and the tiny runtime. */
export const FIRMWARE_FILES = ["Arduino.h", "courier.h", "courier_pins.h", "math.h", "cmath", "string.h", "stdlib.h", "stdio.h", "assert.h",
  "WiFi.h", "ArduinoJson.h", "courier_runtime.c", "courier_math.c", "courier_libc.c"];
/** Firmware files a build needs only when its code mentions them (ArduinoJson is 260 KB). */
export const OPTIONAL_FIRMWARE_FILES = Object.freeze({ "ArduinoJson-v7.4.3.h": /ArduinoJson/ });
/** The optional files `files` (the firmware's own, by path) needs. */
export function optionalFilesFor(files) {
  const text = Object.values(files).filter((v) => typeof v === "string");
  return Object.entries(OPTIONAL_FIRMWARE_FILES).filter(([, re]) => text.some((t) => re.test(t))).map(([f]) => f);
}

const SOURCE = /\.(c|cc|cpp|cxx|ino)$/;
const dec = new TextDecoder();
const warmed = new WeakSet();

/** Compiler flags, for authors who want to show them ("what does the build do?"). */
export function compileFlags({ c = false, includeDirs = [] } = {}) {
  return [
    "--target=wasm32-unknown-unknown", "-ffreestanding", "-nostdlib", "-O2", "-Wall",
    "-DCOURIER_SIM", "-DARDUINO=10819", "-DESP32",
    ...(c ? ["-std=gnu17"] : ["-std=gnu++17", "-nostdinc++", "-fno-exceptions", "-fno-rtti", "-fno-threadsafe-statics"]),
    ...includeDirs.map((d) => `-I${d}`),
    "-I__courier",
  ];
}

/**
 * The first compiler or linker error as { file, line, message, text }, with a hint for the usual
 * surprises (a missing ;, a function the board doesn't have).
 */
export function firstError(log) {
  const m = /^(\S+?):(\d+):(?:\d+:)? (?:fatal )?error: (.*)$/m.exec(log);
  const undef = /undefined symbol: (\S+)/.exec(log) ?? /use of undeclared identifier '(\w+)'/.exec(log);
  let text = log.replace(/^Exited with status.*$/gm, "").trim();
  let message = m ? m[3] : "the firmware didn't build";
  if (undef) {
    const name = undef[1].replace(/\(.*$/, "");
    const linker = undef[0].startsWith("undefined");
    message = BOARD_HINTS[name]
      ? `${name} isn't on the Courier board: ${BOARD_HINTS[name]}`
      : linker
        ? `${name} is used but never defined. Is it spelled the same everywhere, and is its body written?`
        : message;
    text = `${message}\n\n${text}`;
  } else if (/expected ';'/.test(log)) {
    text += "\n\nTip: C++ errors point at the line *after* a missing ; more often than not.";
  }
  return { message, file: m ? m[1].replace(/^src\//, "src/") : null, line: m ? Number(m[2]) : null, text };
}
const BOARD_HINTS = {
  printf: "use Serial.print() and Serial.println(), or snprintf() into a buffer and print that",
  puts: "use Serial.println()",
  atof: "there's no atof/strtod in the simulator; parse whole numbers with atoi/strtol, or let ArduinoJson read numbers",
  strtod: "there's no atof/strtod in the simulator; parse whole numbers with atoi/strtol, or let ArduinoJson read numbers",
  sinh: "the hyperbolic functions aren't in the simulator's math.h; use exp(): sinh(x) = (exp(x) - exp(-x)) / 2",
  cosh: "the hyperbolic functions aren't in the simulator's math.h; use exp(): cosh(x) = (exp(x) + exp(-x)) / 2",
  tanh: "the hyperbolic functions aren't in the simulator's math.h; use exp()",
};

/**
 * Compiles and links firmware.
 * @param {Record<string, Function>} commands  clang's commands (`import { commands } from "@yowasp/clang"`)
 * @param {{ files: Record<string, string | Uint8Array>, kitFiles: Record<string, string>,
 *           includeDirs?: string[], sources?: string[] }} job
 *   `files`: the firmware's own files by path (e.g. "src/main.cpp", "lib/courier/courier_pins.h").
 *   `kitFiles`: this kit's firmware/ files by name (FIRMWARE_FILES).
 *   `includeDirs`: folders (in `files`) searched for #include <…>, before the kit's own headers.
 *      Default: every folder holding a .h file, so a learner's courier_pins.h wins over the kit's.
 *   `sources`: which files to compile (default: every .c/.cpp/.ino in `files`).
 * @returns {Promise<{ ok: true, wasm: Uint8Array, log: string, ms: number } |
 *                   { ok: false, error: ReturnType<typeof firstError>, log: string, ms: number }>}
 */
export async function buildFirmware(commands, job) {
  const t0 = now();
  if (!warmed.has(commands)) {
    // clang's first call downloads its resources and, left alone, prints progress to stdout; an
    // LLVM tool called first with a quiet progress callback loads them silently.
    await run(commands, "nm", ["--version"], {});
    warmed.add(commands);
  }
  const tree = {};
  for (const [path, body] of Object.entries(job.files)) put(tree, path, body);
  tree.__courier = { ...job.kitFiles };
  const sources = job.sources ?? Object.keys(job.files).filter((p) => SOURCE.test(p)).sort();
  if (!sources.length) return fail("there's no .cpp file to build", "", t0);
  const includeDirs = job.includeDirs ?? [...new Set(Object.keys(job.files).filter((p) => /\.(h|hpp)$/.test(p)).map(dirOf))];
  let log = "";
  const objects = {};
  for (const [i, src] of sources.entries()) {
    const c = /\.c$/.test(src);
    const args = [...compileFlags({ c, includeDirs }), ...(src.endsWith(".ino") ? ["-x", "c++"] : []), "-c", src, "-o", `o${i}.o`];
    const r = await run(commands, c ? "clang" : "clang++", args, tree);
    log += r.log;
    if (!r.ok || !r.out[`o${i}.o`]) return fail(null, log, t0);
    objects[`o${i}.o`] = r.out[`o${i}.o`];
  }
  const rt = await run(commands, "clang", [...compileFlags({ c: true }), "-fno-builtin", "-c", "__courier/courier_runtime.c", "-o", "rt.o"], tree);
  if (!rt.ok || !rt.out["rt.o"]) return fail("the kit's runtime didn't build", log + rt.log, t0);
  objects["rt.o"] = rt.out["rt.o"];
  const link = await run(commands, "wasm-ld", [
    "--no-entry", "--export=setup", "--export=loop", "--export-if-defined=__wasm_call_ctors", "--export-table", "--export-if-defined=courier_version",
    "-z", "stack-size=65536", "--initial-memory=1048576", "--max-memory=1048576", "--gc-sections",
    "-o", "fw.wasm", ...Object.keys(objects),
  ], objects);
  log += link.log;
  if (!link.ok || !link.out["fw.wasm"]) return fail(null, log, t0);
  const wasm = link.out["fw.wasm"].slice();
  // Anything the firmware imports must be a board function.
  const mod = await WebAssembly.compile(wasm);
  const exports = WebAssembly.Module.exports(mod).map((e) => e.name);
  const bad = WebAssembly.Module.imports(mod).filter((i) => i.module !== "courier").map((i) => i.name);
  if (bad.length) return fail(`not available on the Courier board: ${bad.join(", ")}`, log, t0);
  for (const fn of ["setup", "loop"])
    if (!exports.includes(fn)) return fail(`the firmware needs a ${fn}() function`, log, t0);
  return { ok: true, wasm, log, ms: Math.round(now() - t0) };
}

function fail(message, log, t0) {
  const error = firstError(log);
  if (message) { error.message = message; error.text = log ? `${message}\n\n${error.text}` : message; }
  return { ok: false, error, log, ms: Math.round(now() - t0) };
}

async function run(commands, tool, args, files) {
  let log = "";
  const collect = (b) => { if (b) log += dec.decode(b); };
  try {
    const out = await commands[tool](args, files, { stdout: collect, stderr: collect, fetchProgress: () => {} });
    return { ok: true, out: out ?? {}, log };
  } catch (err) {
    return { ok: false, out: {}, log: log || String(err?.message ?? err) };
  }
}

function put(tree, path, body) {
  const parts = path.split("/").filter(Boolean);
  let dir = tree;
  for (const p of parts.slice(0, -1)) dir = dir[p] ??= {};
  dir[parts[parts.length - 1]] = body;
}
const dirOf = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : ".");
const now = () => globalThis.performance?.now?.() ?? Date.now();
