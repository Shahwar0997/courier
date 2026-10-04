// Firmware signatures for over-the-air updates (Stop 17): Ed25519 verification (RFC 8032) and
// SHA-512 (FIPS 180-4), synchronous and in plain JavaScript, so the simulated robot checks an image
// the moment its firmware asks, in the browser (no SharedArrayBuffer, and WebCrypto is async) and in
// Node alike. Verification only: signing happens on the learner's computer (the courier CLI's
// `sign`, or any Ed25519 tool). About 2–3 ms per check.
//
//   import { verify } from "courier/sign.js";
//   verify(publicKey32, imageBytes, signature64);   // true / false

const P = 2n ** 255n - 19n;
const L = 2n ** 252n + 27742317777372353535851937790883648493n;
const mod = (a, m = P) => { const r = a % m; return r < 0n ? r + m : r; };
function pow(b, e, m = P) {
  let r = 1n;
  b = mod(b, m);
  while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; }
  return r;
}
const inv = (x) => pow(x, P - 2n);
const D = mod(-121665n * inv(121666n));
const SQRT_M1 = pow(2n, (P - 1n) / 4n);

// Points in extended coordinates (X, Y, Z, T).
function add(p, q) {
  const A = mod((p[1] - p[0]) * (q[1] - q[0])), B = mod((p[1] + p[0]) * (q[1] + q[0]));
  const C = mod(2n * p[3] * q[3] * D), E2 = mod(2n * p[2] * q[2]);
  const E = B - A, F = E2 - C, G = E2 + C, H = B + A;
  return [mod(E * F), mod(G * H), mod(F * G), mod(E * H)];
}
function mul(s, p) {
  let q = [0n, 1n, 1n, 0n];
  while (s > 0n) { if (s & 1n) q = add(q, p); p = add(p, p); s >>= 1n; }
  return q;
}
const same = (p, q) => mod(p[0] * q[2] - q[0] * p[2]) === 0n && mod(p[1] * q[2] - q[1] * p[2]) === 0n;
function recoverX(y, sign) {
  if (y >= P) return null;
  const x2 = mod((y * y - 1n) * inv(D * y * y + 1n));
  if (x2 === 0n) return sign ? null : 0n;
  let x = pow(x2, (P + 3n) / 8n);
  if (mod(x * x - x2) !== 0n) x = mod(x * SQRT_M1);
  if (mod(x * x - x2) !== 0n) return null;
  if (Number(x & 1n) !== sign) x = P - x;
  return x;
}
const littleEndian = (b) => { let n = 0n; for (let i = b.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(b[i]); return n; };
function decode(b) {
  const y = littleEndian(b) & ((1n << 255n) - 1n), x = recoverX(y, b[31] >> 7);
  return x === null ? null : [x, y, 1n, mod(x * y)];
}
const BASE = (() => { const y = mod(4n * inv(5n)), x = recoverX(y, 0); return [x, y, 1n, mod(x * y)]; })();

// Plain RFC 8032 verification: non-canonical encodings (y ≥ p) and s ≥ L are rejected, but small-order
// points aren't (libsodium rejects those too). That's fine here: the robot's key is fixed on the robot,
// not chosen by whoever sends an update, and nothing is batch-verified.
/**
 * Checks an Ed25519 signature: did the holder of `publicKey`'s private key sign exactly `message`?
 * @param {Uint8Array} publicKey 32 bytes
 * @param {Uint8Array} message
 * @param {Uint8Array} signature 64 bytes
 * @returns {boolean}
 */
export function verify(publicKey, message, signature) {
  if (publicKey?.length !== 32 || signature?.length !== 64) return false;
  const A = decode(publicKey), R = decode(signature.subarray(0, 32));
  if (!A || !R) return false;
  const s = littleEndian(signature.subarray(32));
  if (s >= L) return false;
  const h = mod(littleEndian(sha512(concat(signature.subarray(0, 32), publicKey, message))), L);
  return same(mul(s, BASE), add(R, mul(h, A)));
}

const K = (
  "428a2f98d728ae22 7137449123ef65cd b5c0fbcfec4d3b2f e9b5dba58189dbbc 3956c25bf348b538 59f111f1b605d019 923f82a4af194f9b ab1c5ed5da6d8118 " +
  "d807aa98a3030242 12835b0145706fbe 243185be4ee4b28c 550c7dc3d5ffb4e2 72be5d74f27b896f 80deb1fe3b1696b1 9bdc06a725c71235 c19bf174cf692694 " +
  "e49b69c19ef14ad2 efbe4786384f25e3 0fc19dc68b8cd5b5 240ca1cc77ac9c65 2de92c6f592b0275 4a7484aa6ea6e483 5cb0a9dcbd41fbd4 76f988da831153b5 " +
  "983e5152ee66dfab a831c66d2db43210 b00327c898fb213f bf597fc7beef0ee4 c6e00bf33da88fc2 d5a79147930aa725 06ca6351e003826f 142929670a0e6e70 " +
  "27b70a8546d22ffc 2e1b21385c26c926 4d2c6dfc5ac42aed 53380d139d95b3df 650a73548baf63de 766a0abb3c77b2a8 81c2c92e47edaee6 92722c851482353b " +
  "a2bfe8a14cf10364 a81a664bbc423001 c24b8b70d0f89791 c76c51a30654be30 d192e819d6ef5218 d69906245565a910 f40e35855771202a 106aa07032bbd1b8 " +
  "19a4c116b8d2d0c8 1e376c085141ab53 2748774cdf8eeb99 34b0bcb5e19b48a8 391c0cb3c5c95a63 4ed8aa4ae3418acb 5b9cca4f7763e373 682e6ff3d6b2b8a3 " +
  "748f82ee5defb2fc 78a5636f43172f60 84c87814a1f0ab72 8cc702081a6439ec 90befffa23631e28 a4506cebde82bde9 bef9a3f7b2c67915 c67178f2e372532b " +
  "ca273eceea26619c d186b8c721c0c207 eada7dd6cde0eb1e f57d4f7fee6ed178 06f067aa72176fba 0a637dc5a2c898a6 113f9804bef90dae 1b710b35131c471b " +
  "28db77f523047d84 32caab7b40c72493 3c9ebe0a15c9bebc 431d67c49c100d4c 4cc5d4becb3e42b6 597f299cfc657e2a 5fcb6fab3ad6faec 6c44198c4a475817"
).split(" ").map((h) => BigInt("0x" + h));
const H0 = "6a09e667f3bcc908 bb67ae8584caa73b 3c6ef372fe94f82b a54ff53a5f1d36f1 510e527fade682d1 9b05688c2b3e6c1f 1f83d9abfb41bd6b 5be0cd19137e2179"
  .split(" ").map((h) => BigInt("0x" + h));
const M64 = (1n << 64n) - 1n;
const rotr = (x, n) => ((x >> n) | (x << (64n - n))) & M64;

/**
 * SHA-512 of some bytes (64 bytes out).
 * @param {Uint8Array} msg
 */
export function sha512(msg) {
  const len = msg.length, padded = new Uint8Array(Math.ceil((len + 17) / 128) * 128);
  padded.set(msg);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setBigUint64(padded.length - 8, (BigInt(len) * 8n) & M64);
  const h = H0.slice(), w = new Array(80);
  for (let off = 0; off < padded.length; off += 128) {
    for (let i = 0; i < 16; i++) w[i] = view.getBigUint64(off + i * 8);
    for (let i = 16; i < 80; i++) {
      const s0 = rotr(w[i - 15], 1n) ^ rotr(w[i - 15], 8n) ^ (w[i - 15] >> 7n);
      const s1 = rotr(w[i - 2], 19n) ^ rotr(w[i - 2], 61n) ^ (w[i - 2] >> 6n);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) & M64;
    }
    let [a, b, c, d, e, f, g, k] = h;
    for (let i = 0; i < 80; i++) {
      const t1 = (k + (rotr(e, 14n) ^ rotr(e, 18n) ^ rotr(e, 41n)) + ((e & f) ^ (~e & M64 & g)) + K[i] + w[i]) & M64;
      const t2 = ((rotr(a, 28n) ^ rotr(a, 34n) ^ rotr(a, 39n)) + ((a & b) ^ (a & c) ^ (b & c))) & M64;
      k = g; g = f; f = e; e = (d + t1) & M64; d = c; c = b; b = a; a = (t1 + t2) & M64;
    }
    [a, b, c, d, e, f, g, k].forEach((v, i) => { h[i] = (h[i] + v) & M64; });
  }
  const out = new Uint8Array(64), ov = new DataView(out.buffer);
  h.forEach((v, i) => ov.setBigUint64(i * 8, v));
  return out;
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Hex for bytes (for logs and keys in JSON). */
export const toHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
/** Bytes for hex. */
export const fromHex = (h) => new Uint8Array((String(h).match(/../g) ?? []).map((x) => parseInt(x, 16)));
