// courier_libc.c — the rest of the C library firmware may use in the Courier simulator (string.h,
// stdlib.h, and C++'s new/delete), compiled into every build by courier_runtime.c. Unused functions
// are dropped by the linker.
#include <stddef.h>
#include <stdint.h>

// ---- string.h (strlen, strcmp, memcpy, memmove, memset, memcmp are in courier_runtime.c) ----
int strncmp(const char *a, const char *b, size_t n) {
  for (; n; n--, a++, b++) {
    if (*a != *b) return (unsigned char)*a - (unsigned char)*b;
    if (!*a) return 0;
  }
  return 0;
}
char *strcpy(char *dst, const char *src) {
  char *d = dst;
  while ((*d++ = *src++)) {}
  return dst;
}
char *strncpy(char *dst, const char *src, size_t n) {
  size_t i = 0;
  for (; i < n && src[i]; i++) dst[i] = src[i];
  for (; i < n; i++) dst[i] = 0;
  return dst;
}
size_t strlcpy(char *dst, const char *src, size_t size) {
  size_t len = 0;
  while (src[len]) len++;
  if (size) {
    size_t n = len < size - 1 ? len : size - 1;
    for (size_t i = 0; i < n; i++) dst[i] = src[i];
    dst[n] = 0;
  }
  return len;
}
size_t strlcat(char *dst, const char *src, size_t size) {
  size_t d = 0;
  while (d < size && dst[d]) d++;
  if (d == size) { size_t s = 0; while (src[s]) s++; return size + s; }
  return d + strlcpy(dst + d, src, size - d);
}
char *strcat(char *dst, const char *src) {
  char *d = dst;
  while (*d) d++;
  while ((*d++ = *src++)) {}
  return dst;
}
char *strncat(char *dst, const char *src, size_t n) {
  char *d = dst;
  while (*d) d++;
  while (n-- && *src) *d++ = *src++;
  *d = 0;
  return dst;
}
char *strchr(const char *s, int c) {
  for (;; s++) {
    if (*s == (char)c) return (char *)s;
    if (!*s) return 0;
  }
}
char *strrchr(const char *s, int c) {
  const char *last = 0;
  for (;; s++) {
    if (*s == (char)c) last = s;
    if (!*s) return (char *)last;
  }
}
char *strstr(const char *hay, const char *needle) {
  if (!*needle) return (char *)hay;
  for (; *hay; hay++) {
    const char *h = hay, *n = needle;
    while (*h && *n && *h == *n) h++, n++;
    if (!*n) return (char *)hay;
  }
  return 0;
}
void *memchr(const void *s, int c, size_t n) {
  const unsigned char *p = s;
  for (; n; n--, p++) if (*p == (unsigned char)c) return (void *)p;
  return 0;
}

// ---- stdlib.h: whole numbers from text ----
static int digit_of(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'z') return c - 'a' + 10;
  if (c >= 'A' && c <= 'Z') return c - 'A' + 10;
  return 99;
}
// Shared by strtol/strtoul: skips spaces, a sign and a 0x/0 prefix as C does; saturates on overflow.
static unsigned long parse_ul(const char *s, char **end, int base, int *neg, int *over) {
  const char *p = s;
  *neg = 0; *over = 0;
  while (*p == ' ' || (*p >= '\t' && *p <= '\r')) p++;
  if (*p == '+' || *p == '-') *neg = *p++ == '-';
  if ((base == 0 || base == 16) && p[0] == '0' && (p[1] == 'x' || p[1] == 'X') && digit_of(p[2]) < 16) { p += 2; base = 16; }
  else if (base == 0) base = p[0] == '0' ? 8 : 10;
  const char *start = p;
  unsigned long v = 0;
  if (base >= 2 && base <= 36) {
    for (int d; (d = digit_of(*p)) < base; p++) {
      if (v > (~0UL - (unsigned long)d) / (unsigned long)base) *over = 1;
      else v = v * (unsigned long)base + (unsigned long)d;
    }
  }
  if (end) *end = (char *)(p == start ? s : p);
  return v;
}
unsigned long strtoul(const char *s, char **end, int base) {
  int neg, over;
  unsigned long v = parse_ul(s, end, base, &neg, &over);
  if (over) return ~0UL;
  return neg ? (unsigned long)(-(long)v) : v;
}
long strtol(const char *s, char **end, int base) {
  int neg, over;
  unsigned long v = parse_ul(s, end, base, &neg, &over);
  const unsigned long max = (unsigned long)(~0UL >> 1);
  if (neg) return over || v > max + 1 ? (long)(-(long)max - 1) : (long)(0 - v);
  return over || v > max ? (long)max : (long)v;
}
long atol(const char *s) { return strtol(s, 0, 10); }
int atoi(const char *s) { return (int)strtol(s, 0, 10); }
int abs(int x) { return x < 0 ? -x : x; }
long labs(long x) { return x < 0 ? -x : x; }
void abort(void) { __builtin_trap(); }

// ---- the heap: malloc, calloc, realloc, free ----
// A first-fit free list kept in address order, joining neighbours on free (Kernighan & Ritchie,
// §8.7). The heap is the memory after the firmware's globals and stack, up to the end of its 1 MB.
// Blocks are counted in 16-byte units, so every pointer malloc returns is 16-byte aligned.
typedef union header {
  struct { union header *next; size_t units; } s;
  long double align;
} header;
extern unsigned char __heap_base;
static header base_block;
static header *freep = 0;

static void heap_init(void) {
  base_block.s.next = freep = &base_block;
  base_block.s.units = 0;
  uintptr_t start = ((uintptr_t)&__heap_base + sizeof(header) - 1) & ~(uintptr_t)(sizeof(header) - 1);
  uintptr_t end = (uintptr_t)__builtin_wasm_memory_size(0) * 65536u;
  if (end <= start + sizeof(header)) return;
  header *h = (header *)start;
  h->s.units = (end - start) / sizeof(header);
  h->s.next = &base_block;
  base_block.s.next = h;
}

void free(void *ptr) {
  if (!ptr) return;
  header *bp = (header *)ptr - 1, *p;
  for (p = freep; !(bp > p && bp < p->s.next); p = p->s.next)
    if (p >= p->s.next && (bp > p || bp < p->s.next)) break;  // at either end of the list
  if (bp + bp->s.units == p->s.next) { bp->s.units += p->s.next->s.units; bp->s.next = p->s.next->s.next; }
  else bp->s.next = p->s.next;
  if (p + p->s.units == bp) { p->s.units += bp->s.units; p->s.next = bp->s.next; }
  else p->s.next = bp;
  freep = p;
}

void *malloc(size_t size) {
  if (!freep) heap_init();
  if (size > ((size_t)-1) / 2) return 0;
  size_t units = (size + sizeof(header) - 1) / sizeof(header) + 1;
  header *prev = freep;
  for (header *p = prev->s.next;; prev = p, p = p->s.next) {
    if (p->s.units >= units) {
      if (p->s.units == units) prev->s.next = p->s.next;
      else { p->s.units -= units; p += p->s.units; p->s.units = units; }
      freep = prev;
      return (void *)(p + 1);
    }
    if (p == freep) return 0;  // went all the way round: the heap is full
  }
}

void *calloc(size_t count, size_t size) {
  if (size && count > ((size_t)-1) / size) return 0;
  size_t n = count * size;
  unsigned char *p = malloc(n);
  if (p) for (size_t i = 0; i < n; i++) p[i] = 0;
  return p;
}

void *realloc(void *ptr, size_t size) {
  if (!ptr) return malloc(size);
  if (!size) { free(ptr); return 0; }
  header *h = (header *)ptr - 1;
  size_t have = (h->s.units - 1) * sizeof(header);
  if (size <= have) return ptr;
  unsigned char *q = malloc(size);
  if (!q) return 0;
  for (size_t i = 0; i < have; i++) q[i] = ((unsigned char *)ptr)[i];
  free(ptr);
  return q;
}

// ---- C++: new and delete use the heap (no exceptions: running out of memory crashes) ----
void *_Znwm(unsigned long n) { void *p = malloc(n ? n : 1); if (!p) __builtin_trap(); return p; }  // new
void *_Znam(unsigned long n) { return _Znwm(n); }                                                   // new[]
void _ZdlPv(void *p) { free(p); }                                                                    // delete
void _ZdaPv(void *p) { free(p); }                                                                    // delete[]
void _ZdlPvm(void *p, unsigned long n) { (void)n; free(p); }                                         // sized delete
void _ZdaPvm(void *p, unsigned long n) { (void)n; free(p); }
