// stdio.h for the Courier simulator: only text into a buffer (snprintf). There is no printf: the
// robot has no screen; print with Serial.print() / Serial.println().
#ifndef COURIER_SIM_STDIO_H
#define COURIER_SIM_STDIO_H
#include <stddef.h>
#include <stdarg.h>
#ifdef __cplusplus
extern "C" {
#endif
// %d %i %u %ld %lu %lld %llu %x %X %c %s %f %.Nf %%, widths, zero padding and '-'.
int snprintf(char *buf, size_t size, const char *format, ...);
int sprintf(char *buf, const char *format, ...);
int vsnprintf(char *buf, size_t size, const char *format, va_list ap);
#ifdef __cplusplus
}
#endif
#endif
