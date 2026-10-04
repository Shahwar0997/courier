// Arduino.h for the Courier simulator: the part of the ESP32's Arduino API that Courier firmware
// uses (pins, PWM, time, Serial), for a robot that lives in the simulator.
//
// On the real robot these functions come from the ESP32 Arduino core. In the simulator your
// firmware is compiled to WebAssembly and each function below is answered by the simulated board,
// in robot time: delay(500) moves the robot's clock on by 500 ms (and the robot keeps moving).
// Behaves like the chip where learners notice: nothing is printed before Serial.begin(); a pin only
// drives its wire after pinMode(pin, OUTPUT); speeds below the motors' dead band don't turn a wheel.
//
// Built with -DCOURIER_SIM, so courier_pins.h picks the simulator's wiring.
#ifndef COURIER_SIM_ARDUINO_H
#define COURIER_SIM_ARDUINO_H

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>
#include <math.h>  // as on the ESP32: sin, cos, sqrt, atan2… without an #include of your own

#define COURIER_IMPORT(name) __attribute__((import_module("courier"), import_name(#name)))

#ifdef __cplusplus
extern "C" {
#endif
// The simulated board (WebAssembly imports). Call the Arduino functions below, not these.
COURIER_IMPORT(millis) uint32_t __courier_millis(void);
COURIER_IMPORT(micros) uint32_t __courier_micros(void);
COURIER_IMPORT(delay) void __courier_delay(uint32_t ms);
COURIER_IMPORT(delay_us) void __courier_delay_us(uint32_t us);
COURIER_IMPORT(pin_mode) void __courier_pin_mode(int pin, int mode);
COURIER_IMPORT(digital_write) void __courier_digital_write(int pin, int value);
COURIER_IMPORT(digital_read) int __courier_digital_read(int pin);
COURIER_IMPORT(analog_write) void __courier_analog_write(int pin, int value);
COURIER_IMPORT(analog_read) int __courier_analog_read(int pin);
COURIER_IMPORT(serial_begin) void __courier_serial_begin(uint32_t baud);
COURIER_IMPORT(serial_write) void __courier_serial_write(const char *text, int length);
COURIER_IMPORT(attach_interrupt) void __courier_attach_interrupt(int pin, int isr, int mode);
COURIER_IMPORT(detach_interrupt) void __courier_detach_interrupt(int pin);
COURIER_IMPORT(interrupts) void __courier_interrupts(int on);
#ifdef __cplusplus
}
#endif

typedef uint8_t byte;
typedef bool boolean;

#define LOW 0
#define HIGH 1
#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2
#define LED_BUILTIN 2
#define RISING 0x01
#define FALLING 0x02
#define CHANGE 0x03
#define IRAM_ATTR  // on the chip: keep the handler in fast RAM; nothing to do in the simulator

// Time
static inline unsigned long millis(void) { return __courier_millis(); }            // ms since power-on
static inline unsigned long micros(void) { return __courier_micros(); }            // µs since power-on
static inline void delay(unsigned long ms) { __courier_delay((uint32_t)ms); }      // wait; the robot keeps moving
static inline void delayMicroseconds(unsigned int us) { __courier_delay_us(us); }
static inline void yield(void) { __courier_delay_us(1); }

// Pins
static inline void pinMode(uint8_t pin, uint8_t mode) { __courier_pin_mode(pin, mode); }
static inline void digitalWrite(uint8_t pin, uint8_t value) { __courier_digital_write(pin, value); }
static inline int digitalRead(uint8_t pin) { return __courier_digital_read(pin); }
static inline void analogWrite(uint8_t pin, int value) { __courier_analog_write(pin, value); }  // PWM, 0..255
static inline int analogRead(uint8_t pin) { return __courier_analog_read(pin); }  // 0..4095; always 0 for now: nothing analog is wired in the simulator yet

// Interrupts: run a function the moment a pin changes (the encoders, ENC_LEFT and ENC_RIGHT).
// The handler runs between the firmware's own steps, one at a time; variables it shares with
// loop() must be `volatile`. noInterrupts() holds edges back until interrupts() (several become one).
#define digitalPinToInterrupt(pin) (pin)
static inline void attachInterrupt(uint8_t pin, void (*isr)(void), int mode) {
  __courier_attach_interrupt(pin, (int)(intptr_t)isr, mode);
}
static inline void detachInterrupt(uint8_t pin) { __courier_detach_interrupt(pin); }
static inline void interrupts(void) { __courier_interrupts(1); }
static inline void noInterrupts(void) { __courier_interrupts(0); }

// The C library pieces the ESP32's Arduino.h brings: text into a buffer (snprintf, stdio.h), strings
// (strlen, strcmp, strlcpy…, string.h) and memory and numbers (malloc, atoi…, stdlib.h).
// snprintf(buf, sizeof buf, "{\"t\":%lu,\"v\":%.2f}", millis(), volts) works as on the chip.
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

// Maths helpers from the Arduino core (the C maths library itself is math.h, included above)
#define PI 3.1415926535897932384626433832795
#define HALF_PI 1.5707963267948966192313216916398
#define TWO_PI 6.283185307179586476925286766559
#define DEG_TO_RAD 0.017453292519943295769236907684886
#define RAD_TO_DEG 57.295779513082320876798154814105
#define EULER 2.718281828459045235360287471352
#define radians(deg) ((deg) * DEG_TO_RAD)
#define degrees(rad) ((rad) * RAD_TO_DEG)
#define sq(x) ((x) * (x))
static inline long map(long x, long inMin, long inMax, long outMin, long outMax) {
  return (x - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
}
static unsigned long __courier_seed = 1;
static inline void randomSeed(unsigned long seed) { __courier_seed = seed ? seed : 1; }
static inline long random(long howBig) {  // the same numbers every run: runs are repeatable
  __courier_seed = __courier_seed * 1103515245UL + 12345UL;
  return howBig > 0 ? (long)((__courier_seed >> 8) % (unsigned long)howBig) : 0;
}

#ifdef __cplusplus
// constrain() takes mixed types (a long and two ints), as the ESP32 core's macro does.
template <typename V, typename L, typename H>
static inline auto constrain(V value, L low, H high) -> decltype(true ? value : (true ? low : high)) {
  return value < low ? low : (value > high ? high : value);
}
template <typename T> static inline T min(T a, T b) { return a < b ? a : b; }
template <typename T> static inline T max(T a, T b) { return a > b ? a : b; }
template <typename T> static inline T abs(T a) { return a < 0 ? -a : a; }

// Print: anything text can be printed to (Serial, a WiFiClient). Classes say how to write bytes;
// print/println turn numbers and text into bytes, as in the Arduino core.
class Print;
class Printable {  // something that knows how to print itself (IPAddress does)
 public:
  virtual size_t printTo(Print &p) const = 0;
};
class Print {
 public:
  virtual size_t write(uint8_t c) = 0;
  virtual size_t write(const uint8_t *buf, size_t n) { size_t k = 0; while (n--) k += write(*buf++); return k; }
  size_t write(const char *text) { return text ? write((const uint8_t *)text, strlen(text)) : 0; }
  size_t write(const char *buf, size_t n) { return write((const uint8_t *)buf, n); }
  virtual void flush() {}
  size_t print(const char *text) { return write(text); }
  size_t print(char c) { return write((uint8_t)c); }
  size_t print(unsigned char n, int base = 10) { return printUnsigned(n, base); }
  size_t print(int n, int base = 10) { return printSigned(n, base); }
  size_t print(unsigned int n, int base = 10) { return printUnsigned(n, base); }
  size_t print(long n, int base = 10) { return printSigned(n, base); }
  size_t print(unsigned long n, int base = 10) { return printUnsigned(n, base); }
  size_t print(long long n, int base = 10) { return printSigned(n, base); }
  size_t print(unsigned long long n, int base = 10) { return printUnsigned(n, base); }
  size_t print(bool b) { return printSigned(b ? 1 : 0, 10); }
  size_t print(const Printable &x) { return x.printTo(*this); }
  size_t print(double x, int digits = 2) {
    char buf[48]; int n = 0;
    if (x != x) return print("nan");
    if (x < 0) { buf[n++] = '-'; x = -x; }
    if (x > 4e18) return print(buf[0] == '-' ? "-ovf" : "ovf");
    double rounding = 0.5; for (int i = 0; i < digits; i++) rounding /= 10;
    x += rounding;
    unsigned long long whole = (unsigned long long)x; double frac = x - (double)whole;
    n += digits10(whole, buf + n);
    if (digits > 0) { buf[n++] = '.'; for (int i = 0; i < digits && n < 46; i++) { frac *= 10; int d = (int)frac; buf[n++] = (char)('0' + d); frac -= d; } }
    return write((const uint8_t *)buf, (size_t)n);
  }
  size_t println() { return write((const uint8_t *)"\r\n", 2); }
  template <typename T> size_t println(T value) { size_t n = print(value); return n + println(); }
  template <typename T> size_t println(T value, int format) { size_t n = print(value, format); return n + println(); }

 private:
  static int digits10(unsigned long long v, char *out) { return digits(v, 10, out); }
  static int digits(unsigned long long v, int base, char *out) {
    char tmp[66]; int n = 0;
    if (base < 2 || base > 16) base = 10;
    do { int d = (int)(v % (unsigned)base); tmp[n++] = (char)(d < 10 ? '0' + d : 'A' + d - 10); v /= (unsigned)base; } while (v);
    for (int i = 0; i < n; i++) out[i] = tmp[n - 1 - i];
    return n;
  }
  size_t printUnsigned(unsigned long long v, int base) { char buf[66]; int n = digits(v, base, buf); return write((const uint8_t *)buf, (size_t)n); }
  size_t printSigned(long long v, int base) {
    if (v < 0 && base == 10) { write((uint8_t)'-'); return 1 + printUnsigned((unsigned long long)(-(v + 1)) + 1, base); }
    return printUnsigned((unsigned long long)v, base);
  }
};

// Stream: a Print you can also read from (a WiFiClient). readBytes() waits up to setTimeout() ms
// (default 1000) for each byte, as on the chip.
class Stream : public Print {
 public:
  virtual int available() = 0;
  virtual int read() = 0;
  virtual int peek() = 0;
  void setTimeout(unsigned long ms) { timeout_ = ms; }
  unsigned long getTimeout() const { return timeout_; }
  size_t readBytes(char *buf, size_t n) {
    size_t k = 0;
    while (k < n) { int c = timedRead(); if (c < 0) break; buf[k++] = (char)c; }
    return k;
  }
  size_t readBytes(uint8_t *buf, size_t n) { return readBytes((char *)buf, n); }

 protected:
  int timedRead() {
    unsigned long t0 = millis();
    do { int c = read(); if (c >= 0) return c; delay(1); } while (millis() - t0 < timeout_);
    return -1;
  }
  unsigned long timeout_ = 1000;
};

// The serial monitor. begin(115200) first; print/println numbers, text and characters. Nothing
// comes in from the monitor in the simulator: available() is 0 and read() −1.
class CourierSerial : public Stream {
 public:
  void begin(unsigned long baud) { __courier_serial_begin((uint32_t)baud); }
  void end() {}
  operator bool() const { return true; }
  using Print::write;
  size_t write(uint8_t c) override { __courier_serial_write((const char *)&c, 1); return 1; }
  size_t write(const uint8_t *buf, size_t n) override { __courier_serial_write((const char *)buf, (int)n); return n; }
  int available() override { return 0; }
  int read() override { return -1; }
  int peek() override { return -1; }
};
static CourierSerial Serial;
#endif

// Your firmware provides these two: setup() runs once at power-on, then loop() runs forever.
#ifdef __cplusplus
extern "C" {
#endif
void setup(void);
void loop(void);
#ifdef __cplusplus
}
#endif

#endif
