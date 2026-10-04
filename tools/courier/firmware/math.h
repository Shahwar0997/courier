// math.h for the Courier simulator: the C maths library, as on the ESP32 (newlib). Arduino.h
// includes it, so sin(), cos(), sqrt() and PI work in firmware without an #include, as on the chip.
//
// The functions are compiled into your firmware (courier_math.c, in the kit's runtime), not taken
// from the browser, so a run gives the same numbers, to the last bit, in Node and in every browser.
// Accuracy: sin, cos, atan, atan2, exp and log are within 1 unit in the last place (ulp), tan,
// asin, acos, log10, log2 and hypot within a few; pow within about 1e-13 of the answer. sqrt,
// fabs, floor, ceil, trunc, round and fmod are exact; trig functions stay accurate for any angle.
// The float versions (sinf, cosf, …) are the double ones rounded to float.
// Not here: the hyperbolic functions, erf/gamma, and errno (nothing sets it).
#ifndef COURIER_SIM_MATH_H
#define COURIER_SIM_MATH_H

#ifdef __cplusplus
extern "C" {
#endif

#define M_E        2.7182818284590452354
#define M_LOG2E    1.4426950408889634074
#define M_LOG10E   0.43429448190325182765
#define M_LN2      0.69314718055994530942
#define M_LN10     2.30258509299404568402
#define M_PI       3.14159265358979323846
#define M_PI_2     1.57079632679489661923
#define M_PI_4     0.78539816339744830962
#define M_1_PI     0.31830988618379067154
#define M_2_PI     0.63661977236758134308
#define M_2_SQRTPI 1.12837916709551257390
#define M_SQRT2    1.41421356237309504880
#define M_SQRT1_2  0.70710678118654752440

#define HUGE_VAL  __builtin_huge_val()
#define HUGE_VALF __builtin_huge_valf()
#define INFINITY  __builtin_inff()
#define NAN       __builtin_nanf("")

double sin(double x);
double cos(double x);
double tan(double x);
double asin(double x);
double acos(double x);
double atan(double x);
double atan2(double y, double x);
double exp(double x);
double log(double x);
double log10(double x);
double log2(double x);
double pow(double x, double y);
double sqrt(double x);
double hypot(double x, double y);
double fabs(double x);
double floor(double x);
double ceil(double x);
double trunc(double x);
double round(double x);
long lround(double x);
double fmod(double x, double y);
double modf(double x, double *whole);
double fmin(double a, double b);
double fmax(double a, double b);
double copysign(double x, double sign);
double ldexp(double x, int exp);
double scalbn(double x, int exp);
double frexp(double x, int *exp);

float sinf(float x);
float cosf(float x);
float tanf(float x);
float asinf(float x);
float acosf(float x);
float atanf(float x);
float atan2f(float y, float x);
float expf(float x);
float logf(float x);
float log10f(float x);
float log2f(float x);
float powf(float x, float y);
float sqrtf(float x);
float hypotf(float x, float y);
float fabsf(float x);
float floorf(float x);
float ceilf(float x);
float truncf(float x);
float roundf(float x);
long lroundf(float x);
float fmodf(float x, float y);
float modff(float x, float *whole);
float fminf(float a, float b);
float fmaxf(float a, float b);
float copysignf(float x, float sign);
float ldexpf(float x, int exp);

#ifdef __cplusplus
}
// C++: functions, not macros (a macro called isnan would break libraries that declare their own).
static inline bool isnan(double x) { return __builtin_isnan(x); }
static inline bool isinf(double x) { return __builtin_isinf(x); }
static inline bool isfinite(double x) { return __builtin_isfinite(x); }
static inline bool signbit(double x) { return __builtin_signbit(x); }
#else
#define isnan(x) __builtin_isnan(x)
#define isinf(x) __builtin_isinf(x)
#define isfinite(x) __builtin_isfinite(x)
#define signbit(x) __builtin_signbit(x)
#endif

#endif
