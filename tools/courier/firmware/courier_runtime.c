// courier_runtime.c — the few C library functions the compiler itself may call (it turns struct
// copies and array clears into memcpy/memset), for firmware built without a C library in the
// Courier simulator. Linked into every simulator build; learners never need to look at it.
#include <stddef.h>

void *memcpy(void *dst, const void *src, size_t n) {
  unsigned char *d = dst; const unsigned char *s = src;
  while (n--) *d++ = *s++;
  return dst;
}
void *memmove(void *dst, const void *src, size_t n) {
  unsigned char *d = dst; const unsigned char *s = src;
  if (d < s) while (n--) *d++ = *s++;
  else { d += n; s += n; while (n--) *--d = *--s; }
  return dst;
}
void *memset(void *dst, int c, size_t n) {
  unsigned char *d = dst;
  while (n--) *d++ = (unsigned char)c;
  return dst;
}
int memcmp(const void *a, const void *b, size_t n) {
  const unsigned char *x = a, *y = b;
  for (; n--; x++, y++) if (*x != *y) return *x - *y;
  return 0;
}
size_t strlen(const char *s) {
  size_t n = 0;
  while (s[n]) n++;
  return n;
}
int strcmp(const char *a, const char *b) {
  while (*a && *a == *b) a++, b++;
  return (unsigned char)*a - (unsigned char)*b;
}
// Static objects with destructors register them here; firmware never exits, so there's nothing to do.
void *__dso_handle = 0;
int __cxa_atexit(void (*fn)(void *), void *arg, void *dso) { (void)fn; (void)arg; (void)dso; return 0; }
void __cxa_pure_virtual(void) { __builtin_trap(); }

// math.h (sin, cos, sqrt…) and the rest of the C library (string.h, stdlib.h, the heap, new/delete):
// in their own files, compiled here so a build runs clang once for the runtime.
#include "courier_math.c"
#include "courier_libc.c"

// snprintf / sprintf for building messages (Stop 18's telemetry): %d %i %u %ld %lu %lld %llu %x %X
// %c %s %f (with a precision: %.2f) %%, widths, zero padding and left-justify (%5d, %04x, %-8s).
// No %e/%g, no %n. %f rounds half up (C rounds an exact tie to even: %.0f of 2.5 is "2" on the chip).
typedef __builtin_va_list va_list;
#define va_start(ap, last) __builtin_va_start(ap, last)
#define va_arg(ap, type) __builtin_va_arg(ap, type)
#define va_end(ap) __builtin_va_end(ap)

struct out { char *buf; size_t cap, n; };
static void put(struct out *o, char c) { if (o->n + 1 < o->cap) o->buf[o->n] = c; o->n++; }
static void pad(struct out *o, int count, char c) { while (count-- > 0) put(o, c); }
static void number(struct out *o, unsigned long long v, int neg, unsigned base, int upper, int width, char fill, int left) {
  char tmp[24]; int n = 0;
  do { unsigned d = (unsigned)(v % base); tmp[n++] = (char)(d < 10 ? '0' + d : (upper ? 'A' : 'a') + d - 10); v /= base; } while (v);
  int len = n + (neg ? 1 : 0);
  if (left) fill = ' ';
  if (neg && fill == '0') put(o, '-');
  if (!left) pad(o, width - len, fill);
  if (neg && fill != '0') put(o, '-');
  while (n) put(o, tmp[--n]);
  if (left) pad(o, width - len, ' ');
}
int vsnprintf(char *buf, size_t cap, const char *fmt, va_list ap) {
  struct out o = { buf, cap, 0 };
  for (; *fmt; fmt++) {
    if (*fmt != '%') { put(&o, *fmt); continue; }
    fmt++;
    char fill = ' '; int width = 0, prec = -1, longs = 0, left = 0;
    for (;; fmt++) { if (*fmt == '-') left = 1; else if (*fmt == '0') fill = '0'; else break; }
    while (*fmt >= '0' && *fmt <= '9') width = width * 10 + (*fmt++ - '0');
    if (*fmt == '.') { prec = 0; fmt++; while (*fmt >= '0' && *fmt <= '9') prec = prec * 10 + (*fmt++ - '0'); }
    while (*fmt == 'l') { longs++; fmt++; }
    switch (*fmt) {
      case 'd': case 'i': {
        long long v = longs >= 2 ? va_arg(ap, long long) : longs ? va_arg(ap, long) : va_arg(ap, int);
        number(&o, v < 0 ? (unsigned long long)(-(v + 1)) + 1 : (unsigned long long)v, v < 0, 10, 0, width, fill, left);
        break;
      }
      case 'u': case 'x': case 'X': {
        unsigned long long v = longs >= 2 ? va_arg(ap, unsigned long long) : longs ? va_arg(ap, unsigned long) : va_arg(ap, unsigned);
        number(&o, v, 0, *fmt == 'u' ? 10 : 16, *fmt == 'X', width, fill, left);
        break;
      }
      case 'c': put(&o, (char)va_arg(ap, int)); break;
      case 's': {
        const char *s = va_arg(ap, const char *);
        if (!s) s = "(null)";
        size_t len = 0; while (s[len] && (prec < 0 || (int)len < prec)) len++;
        if (!left) pad(&o, width - (int)len, ' ');
        for (size_t i = 0; i < len; i++) put(&o, s[i]);
        if (left) pad(&o, width - (int)len, ' ');
        break;
      }
      case 'f': {
        double v = va_arg(ap, double);
        if (prec < 0) prec = 6;
        if (prec > 9) prec = 9;
        if (v != v) { pad(&o, width - 3, ' '); put(&o, 'n'); put(&o, 'a'); put(&o, 'n'); break; }
        int neg = v < 0; if (neg) v = -v;
        double r = 0.5; for (int i = 0; i < prec; i++) r /= 10;
        v += r;
        if (v >= 1e18) { put(&o, neg ? '-' : 'o'); put(&o, 'v'); put(&o, 'f'); break; }
        unsigned long long whole = (unsigned long long)v; double frac = v - (double)whole;
        char digits[12]; int nd = 0;
        for (int i = 0; i < prec; i++) { frac *= 10; int d = (int)frac; digits[nd++] = (char)('0' + d); frac -= d; }
        char w[24]; int nw = 0; do { w[nw++] = (char)('0' + whole % 10); whole /= 10; } while (whole);
        int len = nw + (neg ? 1 : 0) + (prec ? prec + 1 : 0);
        if (neg && fill == '0') put(&o, '-');
        pad(&o, width - len, fill);
        if (neg && fill != '0') put(&o, '-');
        while (nw) put(&o, w[--nw]);
        if (prec) { put(&o, '.'); for (int i = 0; i < nd; i++) put(&o, digits[i]); }
        break;
      }
      case '%': put(&o, '%'); break;
      case 0: fmt--; break;
      default: put(&o, '%'); put(&o, *fmt);
    }
  }
  if (cap) buf[o.n < cap ? o.n : cap - 1] = 0;
  return (int)o.n;
}
int snprintf(char *buf, size_t cap, const char *fmt, ...) {
  va_list ap; va_start(ap, fmt);
  int n = vsnprintf(buf, cap, fmt, ap);
  va_end(ap);
  return n;
}
int sprintf(char *buf, const char *fmt, ...) {
  va_list ap; va_start(ap, fmt);
  int n = vsnprintf(buf, (size_t)-1 >> 1, fmt, ap);
  va_end(ap);
  return n;
}
