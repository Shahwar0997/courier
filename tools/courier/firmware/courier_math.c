// courier_math.c — math.h for the Courier simulator, compiled into the firmware (courier_runtime.c
// includes it). Only + − × ÷ and WebAssembly's own exact instructions (sqrt, floor, ceil, trunc,
// abs, copysign), so the results are identical in Node and every browser.
//
// sin, cos, atan, atan2, exp and log follow FreeBSD's msun / musl, derived from Sun's fdlibm:
//   Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
//   Developed at SunPro, a Sun Microsystems, Inc. business.
//   Permission to use, copy, modify, and distribute this software is freely granted, provided that
//   this notice is preserved.
// musl is MIT-licensed (Copyright © 2005-2020 Rich Felker, et al.).
#include <stdint.h>

typedef union { double d; uint64_t u; } courier_f64;
static inline uint64_t bits_of(double x) { courier_f64 b; b.d = x; return b.u; }
static inline double from_bits(uint64_t u) { courier_f64 b; b.u = u; return b.d; }
static inline uint32_t high_word(double x) { return (uint32_t)(bits_of(x) >> 32); }

// ---- exact ones: WebAssembly instructions, or simple exact arithmetic ----
double fabs(double x) { return __builtin_fabs(x); }
double sqrt(double x) { return __builtin_sqrt(x); }
double floor(double x) { return __builtin_floor(x); }
double ceil(double x) { return __builtin_ceil(x); }
double trunc(double x) { return __builtin_trunc(x); }
double copysign(double x, double s) { return __builtin_copysign(x, s); }
double round(double x) {  // halves away from zero, as C's round()
  double t = __builtin_trunc(x);
  if (__builtin_fabs(x - t) >= 0.5) t += __builtin_copysign(1.0, x);
  return t;
}
long lround(double x) { return (long)round(x); }
double fmin(double a, double b) { return a != a ? b : b != b ? a : (a < b || (a == b && __builtin_signbit(a))) ? a : b; }
double fmax(double a, double b) { return a != a ? b : b != b ? a : (a > b || (a == b && !__builtin_signbit(a))) ? a : b; }
double modf(double x, double *whole) {
  double t = __builtin_trunc(x);
  *whole = t;
  return __builtin_isinf(x) ? __builtin_copysign(0.0, x) : __builtin_copysign(x - t, x);
}

double scalbn(double x, int n) {
  double y = x;
  if (n > 1023) {
    y *= 0x1p1023; n -= 1023;
    if (n > 1023) { y *= 0x1p1023; n -= 1023; if (n > 1023) n = 1023; }
  } else if (n < -1022) {
    y *= 0x1p-1022 * 0x1p53; n += 1022 - 53;
    if (n < -1022) { y *= 0x1p-1022 * 0x1p53; n += 1022 - 53; if (n < -1022) n = -1022; }
  }
  return y * from_bits((uint64_t)(0x3ff + n) << 52);
}
double ldexp(double x, int n) { return scalbn(x, n); }

double frexp(double x, int *e) {
  uint64_t u = bits_of(x);
  int ee = (int)(u >> 52 & 0x7ff);
  if (!ee) {
    if (x != 0) { x = frexp(x * 0x1p64, e); *e -= 64; } else *e = 0;
    return x;
  }
  if (ee == 0x7ff) { *e = 0; return x; }
  *e = ee - 0x3fe;
  u &= 0x800fffffffffffffull;
  u |= 0x3fe0000000000000ull;
  return from_bits(u);
}

// Exact: subtracts y·2^k from x, largest first; each subtraction is exact (Sterbenz).
double fmod(double x, double y) {
  if (x != x || y != y || __builtin_isinf(x) || y == 0) return (x * y) / (x * y);
  if (__builtin_isinf(y)) return x;
  double r = __builtin_fabs(x), ay = __builtin_fabs(y);
  while (r >= ay) {
    int er, ey;
    frexp(r, &er);
    frexp(ay, &ey);
    double t = scalbn(ay, er - ey);
    if (t > r) t *= 0.5;
    r -= t;
  }
  return __builtin_copysign(r, x);
}

// ---- trigonometry ----
// x − n·π/2 in two parts (y0 + y1), n = the nearest whole number of quarter turns. Up to about 1.6
// million radians, π/2 in three 33-bit pieces (n·piece is exact for n < 2^20); beyond, Payne–Hanek.
static const double invpio2 = 6.36619772367581382433e-01,
                    pio2_1 = 1.57079632673412561417e+00, pio2_1t = 6.07710050650619224932e-11,
                    pio2_2 = 6.07710050630396597660e-11, pio2_2t = 2.02226624879595063154e-21,
                    pio2_3 = 2.02226624871116645580e-21, pio2_3t = 8.47842766036889956997e-32;
// Bits of 2/π after the binary point (1280 of them; computed with BigInt and checked against
// fdlibm's ipio2 table), for angles too large for the three-piece π/2.
static const uint32_t two_over_pi[40] = {
  0xA2F9836E, 0x4E441529, 0xFC2757D1, 0xF534DDC0, 0xDB629599, 0x3C439041, 0xFE5163AB, 0xDEBBC561,
  0xB7246E3A, 0x424DD2E0, 0x06492EEA, 0x09D1921C, 0xFE1DEB1C, 0xB129A73E, 0xE88235F5, 0x2EBB4484,
  0xE99C7026, 0xB45F7E41, 0x3991D639, 0x835339F4, 0x9C845F8B, 0xBDF9283B, 0x1FF897FF, 0xDE05980F,
  0xEF2F118B, 0x5A0A6D1F, 0x6D367ECF, 0x27CB09B7, 0x4F463F66, 0x9E5FEA2D, 0x7527BAC7, 0xEBE5F17B,
  0x3D0739F7, 0x8A5292EA, 0x6BFB5FB1, 0x1F8D5D08, 0x56033046, 0xFC7B6BAB, 0xF0CFBC20, 0x9AF4361D,
};
static uint32_t pi_bits(int from) {  // 32 bits of 2/π starting after bit `from` (0 = just after the point)
  int w = from >> 5, b = from & 31;
  uint32_t hi = w < 40 ? two_over_pi[w] : 0, lo = w + 1 < 40 ? two_over_pi[w + 1] : 0;
  return b ? hi << b | lo >> (32 - b) : hi;
}
static void two_prod(double a, double b, double *p, double *e) {  // a·b = p + e exactly (Dekker)
  const double split = 134217729.0;  // 2^27 + 1
  double ca = split * a, ah = ca - (ca - a), al = a - ah;
  double cb = split * b, bh = cb - (cb - b), bl = b - bh;
  *p = a * b;
  *e = ((ah * bh - *p) + ah * bl + al * bh) + al * bl;
}
// Payne–Hanek: |x| = m·2^E with m a 53-bit whole number; x·2/π mod 4 needs only the 2/π bits from
// about bit E onwards, multiplied out exactly in 32-bit pieces.
static int rem_pio2_large(double x, double *y0, double *y1) {
  uint64_t u = bits_of(x);
  int sign = (int)(u >> 63), E = (int)(u >> 52 & 0x7ff) - 1075;
  uint64_t m = (u & 0x000fffffffffffffull) | 0x0010000000000000ull;
  int skip = E > 2 ? E - 2 : 0;           // bits before this only add multiples of 4
  uint32_t B[6], M[2] = { (uint32_t)m, (uint32_t)(m >> 32) }, P[8] = { 0 };
  for (int i = 0; i < 6; i++) B[5 - i] = pi_bits(skip + 32 * i);  // little-endian limbs
  for (int i = 0; i < 2; i++) {
    uint64_t carry = 0;
    for (int j = 0; j < 6; j++) {
      uint64_t t = (uint64_t)M[i] * B[j] + P[i + j] + carry;
      P[i + j] = (uint32_t)t;
      carry = t >> 32;
    }
    P[i + 6] += (uint32_t)carry;
  }
  // x·2/π = P · 2^(E − skip − 192): the low `fb` bits of P are the fraction.
  int fb = 192 + skip - E;                 // 190 when E > 2, up to about 225 otherwise
  #define BIT_AT(k) ((P[(k) >> 5] >> ((k) & 31)) & 1u)
  int n = (int)(BIT_AT(fb) | BIT_AT(fb + 1) << 1);
  uint64_t f1 = 0, f2 = 0;                 // the fraction's first 128 bits
  for (int k = 0; k < 128; k++) {
    int at = fb - 1 - k;
    uint32_t bit = at >= 0 ? BIT_AT(at) : 0;
    if (k < 64) f1 = f1 << 1 | bit; else f2 = f2 << 1 | bit;
  }
  #undef BIT_AT
  double s = 1.0;
  if (f1 >> 63) {                          // fraction ≥ ½: count the next quarter turn, go negative
    n++;
    f2 = ~f2 + 1;
    f1 = ~f1 + (f2 == 0);
    s = -1.0;
  }
  int z = f1 ? __builtin_clzll(f1) : 64 + (f2 ? __builtin_clzll(f2) : 64);
  if (z >= 128) { *y0 = 0.0; *y1 = 0.0; return sign ? -n : n; }
  if (z) {                                 // normalise: leading 1 at the top of f1
    if (z >= 64) { f1 = f2 << (z - 64); f2 = 0; }
    else { f1 = f1 << z | f2 >> (64 - z); f2 <<= z; }
  }
  double scale = scalbn(1.0, -64 - z);
  double hi = (double)(f1 >> 11) * 2048.0 * scale;
  double lo = ((double)(f1 & 0x7ff) + (double)f2 * 0x1p-64) * scale;
  // (hi + lo) · π/2, in two parts
  const double pio2_hi = 1.57079632679489655800e+00, pio2_lo = 6.12323399573676603587e-17;
  double p, e;
  two_prod(hi, pio2_hi, &p, &e);
  e += hi * pio2_lo + lo * pio2_hi;
  double r = p + e;
  e -= r - p;
  *y0 = s * (sign ? -r : r);
  *y1 = s * (sign ? -e : e);
  return sign ? -n : n;
}

static int rem_pio2(double x, double *y0, double *y1) {
  if ((high_word(x) & 0x7fffffff) >= 0x413921fb) return rem_pio2_large(x, y0, y1);  // |x| ≥ 2^20·π/2
  const double toint = 1.5 / 2.220446049250313080847e-16;  // 1.5·2^52: rounds to a whole number
  double fn = x * invpio2 + toint - toint;
  int n = (int)fn;
  double r = x - fn * pio2_1, w = fn * pio2_1t;
  double y = r - w;
  uint32_t ex = high_word(x) >> 20 & 0x7ff;
  if ((int)ex - (int)(high_word(y) >> 20 & 0x7ff) > 16) {  // lost bits: one more piece of π/2
    double t = r;
    w = fn * pio2_2; r = t - w; w = fn * pio2_2t - ((t - r) - w); y = r - w;
    if ((int)ex - (int)(high_word(y) >> 20 & 0x7ff) > 49) {  // and another
      t = r;
      w = fn * pio2_3; r = t - w; w = fn * pio2_3t - ((t - r) - w); y = r - w;
    }
  }
  *y0 = y;
  *y1 = (r - y) - w;
  return n;
}

static const double S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03,
                    S3 = -1.98412698298579493134e-04, S4 = 2.75573137070700676789e-06,
                    S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
static double ksin(double x, double y, int iy) {  // sin on [−π/4, π/4]; y is x's tail
  double z = x * x, w = z * z;
  double r = S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6), v = z * x;
  if (!iy) return x + v * (S1 + z * r);
  return x - ((z * (0.5 * y - v * r) - y) - v * S1);
}
static const double C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03,
                    C3 = 2.48015872894767294178e-05, C4 = -2.75573143513906633035e-07,
                    C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;
static double kcos(double x, double y) {  // cos on [−π/4, π/4]
  double z = x * x, w = z * z;
  double r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6));
  double hz = 0.5 * z, w1 = 1.0 - hz;
  return w1 + (((1.0 - w1) - hz) + (z * r - x * y));
}

double sin(double x) {
  uint32_t ix = high_word(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return ix < 0x3e500000 ? x : ksin(x, 0, 0);  // |x| ≤ π/4
  if (ix >= 0x7ff00000) return x - x;                                // NaN, ±∞ → NaN
  double y0, y1;
  switch (rem_pio2(x, &y0, &y1) & 3) {
    case 0: return ksin(y0, y1, 1);
    case 1: return kcos(y0, y1);
    case 2: return -ksin(y0, y1, 1);
    default: return -kcos(y0, y1);
  }
}

double cos(double x) {
  uint32_t ix = high_word(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return ix < 0x3e46a09e ? 1.0 : kcos(x, 0);
  if (ix >= 0x7ff00000) return x - x;
  double y0, y1;
  switch (rem_pio2(x, &y0, &y1) & 3) {
    case 0: return kcos(y0, y1);
    case 1: return -ksin(y0, y1, 1);
    case 2: return -kcos(y0, y1);
    default: return ksin(y0, y1, 1);
  }
}

double tan(double x) {
  uint32_t ix = high_word(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return ix < 0x3e400000 ? x : ksin(x, 0, 0) / kcos(x, 0);
  if (ix >= 0x7ff00000) return x - x;
  double y0, y1;
  int n = rem_pio2(x, &y0, &y1);
  double s = ksin(y0, y1, 1), c = kcos(y0, y1);
  return n & 1 ? -c / s : s / c;
}

static const double atanhi[] = { 4.63647609000806093515e-01, 7.85398163397448278999e-01,
                                 9.82793723247329054082e-01, 1.57079632679489655800e+00 };
static const double atanlo[] = { 2.26987774529616870924e-17, 3.06161699786838301793e-17,
                                 1.39033110312309984516e-17, 6.12323399573676603587e-17 };
static const double aT[] = {
  3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01,
  -1.11111104054623557880e-01, 9.09088713343650656196e-02, -7.69187620504482999495e-02,
  6.66107313738753120669e-02, -5.83357013379057348645e-02, 4.97687799461593236017e-02,
  -3.65315727442169155270e-02, 1.62858201153657823623e-02,
};
double atan(double x) {
  uint32_t ix = high_word(x), sign = ix >> 31;
  int id;
  ix &= 0x7fffffff;
  if (ix >= 0x44100000) {  // |x| ≥ 2^66
    if (x != x) return x;
    double z = atanhi[3] + 0x1p-120;
    return sign ? -z : z;
  }
  if (ix < 0x3fdc0000) {   // |x| < 0.4375
    if (ix < 0x3e400000) return x;
    id = -1;
  } else {
    x = __builtin_fabs(x);
    if (ix < 0x3ff30000) {
      if (ix < 0x3fe60000) { id = 0; x = (2.0 * x - 1.0) / (2.0 + x); }
      else { id = 1; x = (x - 1.0) / (x + 1.0); }
    } else if (ix < 0x40038000) { id = 2; x = (x - 1.5) / (1.0 + 1.5 * x); }
    else { id = 3; x = -1.0 / x; }
  }
  double z = x * x, w = z * z;
  double s1 = z * (aT[0] + w * (aT[2] + w * (aT[4] + w * (aT[6] + w * (aT[8] + w * aT[10])))));
  double s2 = w * (aT[1] + w * (aT[3] + w * (aT[5] + w * (aT[7] + w * aT[9]))));
  if (id < 0) return x - x * (s1 + s2);
  z = atanhi[id] - (x * (s1 + s2) - atanlo[id] - x);
  return sign ? -z : z;
}

double atan2(double y, double x) {
  static const double pi = 3.1415926535897931160e+00, pi_lo = 1.2246467991473531772e-16;
  if (x != x || y != y) return x + y;
  uint64_t ux = bits_of(x), uy = bits_of(y);
  uint32_t ix = ux >> 32, lx = (uint32_t)ux, iy = uy >> 32, ly = (uint32_t)uy;
  if (((ix - 0x3ff00000) | lx) == 0) return atan(y);  // x = 1
  uint32_t m = ((iy >> 31) & 1) | ((ix >> 30) & 2);    // sign of y, sign of x
  ix &= 0x7fffffff;
  iy &= 0x7fffffff;
  if ((iy | ly) == 0) {
    switch (m) { case 0: case 1: return y; case 2: return pi; default: return -pi; }
  }
  if ((ix | lx) == 0) return m & 1 ? -pi / 2 : pi / 2;
  if (ix == 0x7ff00000) {
    if (iy == 0x7ff00000) {
      switch (m) { case 0: return pi / 4; case 1: return -pi / 4; case 2: return 3 * pi / 4; default: return -3 * pi / 4; }
    }
    switch (m) { case 0: return 0.0; case 1: return -0.0; case 2: return pi; default: return -pi; }
  }
  if (ix + (64 << 20) < iy || iy == 0x7ff00000) return m & 1 ? -pi / 2 : pi / 2;
  double z = (m & 2) && iy + (64 << 20) < ix ? 0.0 : atan(__builtin_fabs(y / x));
  switch (m) {
    case 0: return z;
    case 1: return -z;
    case 2: return pi - (z - pi_lo);
    default: return (z - pi_lo) - pi;
  }
}

double asin(double x) { return atan2(x, __builtin_sqrt((1.0 - x) * (1.0 + x))); }
double acos(double x) { return atan2(__builtin_sqrt((1.0 - x) * (1.0 + x)), x); }
double hypot(double x, double y) {
  x = __builtin_fabs(x);
  y = __builtin_fabs(y);
  if (__builtin_isinf(x) || __builtin_isinf(y)) return __builtin_inf();
  if (x != x || y != y) return x + y;
  if (x < y) { double t = x; x = y; y = t; }
  if (x == 0) return 0.0;
  double r = y / x;
  return x * __builtin_sqrt(1.0 + r * r);
}

// ---- exponentials and logarithms ----
static const double ln2hi = 6.93147180369123816490e-01, ln2lo = 1.90821492927058770002e-10;

double exp(double x) {
  static const double half[2] = { 0.5, -0.5 }, invln2 = 1.44269504088896338700e+00,
                      P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03,
                      P3 = 6.61375632143793436117e-05, P4 = -1.65339022054652515390e-06,
                      P5 = 4.13813679705723846039e-08;
  uint32_t hx = high_word(x);
  int sign = hx >> 31, k = 0;
  hx &= 0x7fffffff;
  if (hx >= 0x4086232b) {  // |x| ≥ 708.39 or NaN
    if (x != x) return x;
    if (x > 709.782712893383973096) return x * 0x1p1023;  // overflow: ∞
    if (x < -745.13321910194110842) return 0.0;           // underflow
  }
  double hi, lo = 0.0;
  if (hx > 0x3fd62e42) {  // |x| > ln2/2
    k = hx >= 0x3ff0a2b2 ? (int)(invln2 * x + half[sign]) : 1 - sign - sign;
    hi = x - k * ln2hi;
    lo = k * ln2lo;
    x = hi - lo;
  } else if (hx > 0x3e300000) {  // |x| > 2^-28
    hi = x;
  } else {
    return 1.0 + x;
  }
  double t = x * x;
  double c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  double y = 1.0 + (x * c / (2.0 - c) - lo + hi);
  return k == 0 ? y : scalbn(y, k);
}

double log(double x) {
  static const double Lg1 = 6.666666666666735130e-01, Lg2 = 3.999999999940941908e-01,
                      Lg3 = 2.857142874366239149e-01, Lg4 = 2.222219843214978396e-01,
                      Lg5 = 1.818357216161805012e-01, Lg6 = 1.531383769920937332e-01,
                      Lg7 = 1.479819860511658591e-01;
  uint64_t u = bits_of(x);
  uint32_t hx = u >> 32;
  int k = 0;
  if (hx < 0x00100000 || hx >> 31) {
    if (u << 1 == 0) return -1.0 / (x * x);      // log(±0) = −∞
    if (hx >> 31) return (x - x) / 0.0;          // log(negative) = NaN
    k -= 54; x *= 0x1p54; u = bits_of(x); hx = u >> 32;  // subnormal
  } else if (hx >= 0x7ff00000) {
    return x;
  } else if (hx == 0x3ff00000 && u << 32 == 0) {
    return 0.0;
  }
  hx += 0x3ff00000 - 0x3fe6a09e;
  k += (int)(hx >> 20) - 0x3ff;
  hx = (hx & 0x000fffff) + 0x3fe6a09e;
  x = from_bits((uint64_t)hx << 32 | (u & 0xffffffff));
  double f = x - 1.0, hfsq = 0.5 * f * f, s = f / (2.0 + f), z = s * s, w = z * z;
  double t1 = w * (Lg2 + w * (Lg4 + w * Lg6)), t2 = z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7)));
  double R = t2 + t1, dk = k;
  return s * (hfsq + R) + dk * ln2lo - hfsq + f + dk * ln2hi;
}

double log10(double x) { return log(x) * 0.43429448190325182765; }
double log2(double x) { return log(x) * 1.44269504088896340736; }

double pow(double x, double y) {
  if (y == 0 || x == 1.0) return 1.0;
  if (x != x || y != y) return x + y;
  int yint = __builtin_trunc(y) == y;
  int odd = yint && __builtin_fabs(y) < 0x1p53 && fmod(y, 2.0) != 0;
  if (__builtin_isinf(y)) {
    double ax = __builtin_fabs(x);
    if (ax == 1.0) return 1.0;
    return (ax > 1.0) == (y > 0) ? __builtin_inf() : 0.0;
  }
  if (x == 0 || __builtin_isinf(x)) {  // ±0 or ±∞: only the sign and size of y matter
    double big = (x == 0) == (y < 0) ? __builtin_inf() : 0.0;
    return odd && __builtin_signbit(x) ? -big : big;
  }
  if (x < 0) {
    if (!yint) return (x - x) / 0.0;  // a negative number to a fractional power: NaN
    double r = pow(-x, y);
    return odd ? -r : r;
  }
  if (yint && __builtin_fabs(y) <= 64) {  // whole powers by repeated squaring
    double r = 1.0, b = x;
    for (long n = (long)__builtin_fabs(y); n; n >>= 1) {
      if (n & 1) r *= b;
      b *= b;
    }
    return y < 0 ? 1.0 / r : r;
  }
  return exp(y * log(x));
}

// ---- float versions: the double result, rounded to float ----
float sinf(float x) { return (float)sin(x); }
float cosf(float x) { return (float)cos(x); }
float tanf(float x) { return (float)tan(x); }
float asinf(float x) { return (float)asin(x); }
float acosf(float x) { return (float)acos(x); }
float atanf(float x) { return (float)atan(x); }
float atan2f(float y, float x) { return (float)atan2(y, x); }
float expf(float x) { return (float)exp(x); }
float logf(float x) { return (float)log(x); }
float log10f(float x) { return (float)log10(x); }
float log2f(float x) { return (float)log2(x); }
float powf(float x, float y) { return (float)pow(x, y); }
float sqrtf(float x) { return __builtin_sqrtf(x); }
float hypotf(float x, float y) { return (float)hypot(x, y); }
float fabsf(float x) { return __builtin_fabsf(x); }
float floorf(float x) { return __builtin_floorf(x); }
float ceilf(float x) { return __builtin_ceilf(x); }
float truncf(float x) { return __builtin_truncf(x); }
float roundf(float x) { return (float)round(x); }
long lroundf(float x) { return lround(x); }
float fmodf(float x, float y) { return (float)fmod(x, y); }
float modff(float x, float *whole) { double w; float f = (float)modf(x, &w); *whole = (float)w; return f; }
float fminf(float a, float b) { return (float)fmin(a, b); }
float fmaxf(float a, float b) { return (float)fmax(a, b); }
float copysignf(float x, float s) { return __builtin_copysignf(x, s); }
float ldexpf(float x, int n) { return (float)scalbn(x, n); }
