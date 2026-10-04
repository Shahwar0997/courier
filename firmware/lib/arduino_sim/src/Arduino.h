// A small stand-in for the Arduino functions, used by the `sim` environment only.
//
// On the real robot these come from the ESP32's Arduino framework. Here they run on this
// computer in *robot time*: delay(500) doesn't wait half a second, it moves the robot's clock
// on by 500 ms. That's why ten seconds of your robot's life take a moment to run.
//
// Serial output is printed to the terminal, like a serial monitor. If the environment variable
// COURIER_SIM_EVENTS names a file, every pin change and printed line is also written there
// with its time, which is what the CI checks read. Replaced by the Courier simulator
// when it ships.
#pragma once

#include <stddef.h>
#include <stdint.h>

typedef uint8_t byte;
typedef bool boolean;

#define LOW 0
#define HIGH 1
#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2

void pinMode(uint8_t pin, uint8_t mode);
void digitalWrite(uint8_t pin, uint8_t value);
int digitalRead(uint8_t pin);
void analogWrite(uint8_t pin, int value);
void delay(unsigned long ms);
unsigned long millis();

template <typename T>
T constrain(T value, T low, T high) {
  return value < low ? low : (value > high ? high : value);
}

class SimSerial {
 public:
  void begin(unsigned long baud);
  size_t print(const char* text);
  size_t print(char c);
  size_t print(int n);
  size_t print(unsigned int n);
  size_t print(long n);
  size_t print(unsigned long n);
  size_t print(double n);
  size_t println();
  template <typename T>
  size_t println(T value) {
    size_t n = print(value);
    return n + println();
  }
};

extern SimSerial Serial;

// Your firmware provides these two.
void setup();
void loop();
