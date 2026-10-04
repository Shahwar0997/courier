// string.h for the Courier simulator: the C string functions firmware uses (in the kit's runtime,
// courier_libc.c). Arduino.h includes it, as on the ESP32.
#ifndef COURIER_SIM_STRING_H
#define COURIER_SIM_STRING_H
#include <stddef.h>
#ifdef __cplusplus
extern "C" {
#endif
size_t strlen(const char *s);
int strcmp(const char *a, const char *b);
int strncmp(const char *a, const char *b, size_t n);
char *strcpy(char *dst, const char *src);
char *strncpy(char *dst, const char *src, size_t n);
// Copies at most size − 1 characters, always ends dst with '\0', never writes past it; returns
// strlen(src), so `strlcpy(d, s, sizeof d) >= sizeof d` means it was cut short.
size_t strlcpy(char *dst, const char *src, size_t size);
size_t strlcat(char *dst, const char *src, size_t size);
char *strcat(char *dst, const char *src);
char *strncat(char *dst, const char *src, size_t n);
char *strchr(const char *s, int c);
char *strrchr(const char *s, int c);
char *strstr(const char *hay, const char *needle);
void *memcpy(void *dst, const void *src, size_t n);
void *memmove(void *dst, const void *src, size_t n);
void *memset(void *dst, int c, size_t n);
int memcmp(const void *a, const void *b, size_t n);
void *memchr(const void *s, int c, size_t n);
#ifdef __cplusplus
}
#endif
#endif
