// stdlib.h for the Courier simulator: memory from the heap (malloc and friends), whole numbers from
// text, abs. In the kit's runtime (courier_libc.c). Arduino.h includes it, as on the ESP32.
// The heap is what's left of the firmware's 1 MB after its globals and its 64 KB stack; malloc
// returns NULL when it's full, as on the chip (whose heap is about 300 KB).
#ifndef COURIER_SIM_STDLIB_H
#define COURIER_SIM_STDLIB_H
#include <stddef.h>
#ifdef __cplusplus
extern "C" {
#endif
void *malloc(size_t size);
void *calloc(size_t count, size_t size);
void *realloc(void *ptr, size_t size);
void free(void *ptr);
int atoi(const char *s);
long atol(const char *s);
long strtol(const char *s, char **end, int base);
unsigned long strtoul(const char *s, char **end, int base);
int abs(int x);
long labs(long x);
void abort(void) __attribute__((noreturn));
#ifdef __cplusplus
}
#endif
#endif
