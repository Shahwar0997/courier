// The robot-time Arduino stand-in (see Arduino.h). Only built for the `sim` environment.
#include "Arduino.h"

#include <cstdio>
#include <cstdlib>
#include <string>

SimSerial Serial;

namespace {

unsigned long now_ms = 0;       // the robot's clock
unsigned long limit_ms = 10000;  // how much robot time to run (COURIER_SIM_MS)
bool serial_started = false;
std::string line;                // the serial line being printed
FILE* events = nullptr;          // COURIER_SIM_EVENTS, or nothing

void event(const char* kind, const std::string& detail) {
  if (events) std::fprintf(events, "@%lu %s %s\n", now_ms, kind, detail.c_str());
}

void finish() {
  if (!line.empty()) {
    event("serial", line);
    line.clear();
  }
  event("end", "");
  if (events) std::fclose(events);
  std::fflush(stdout);
  std::fprintf(stderr, "[sim] ran %lu ms of robot time\n", now_ms);
  std::exit(0);
}

size_t out(const std::string& text) {
  if (!serial_started) return 0;  // like a real chip: nothing is sent before Serial.begin
  std::fputs(text.c_str(), stdout);
  line += text;
  return text.size();
}

}  // namespace

void pinMode(uint8_t pin, uint8_t mode) {
  event("pinMode", std::to_string(pin) + (mode == OUTPUT ? " OUTPUT" : " INPUT"));
}
void digitalWrite(uint8_t pin, uint8_t value) {
  event("digitalWrite", std::to_string(pin) + (value ? " HIGH" : " LOW"));
}
int digitalRead(uint8_t) { return LOW; }
void analogWrite(uint8_t pin, int value) {
  event("analogWrite", std::to_string(pin) + " " + std::to_string(value));
}

void delay(unsigned long ms) {
  if (now_ms + ms >= limit_ms) {
    now_ms = limit_ms;
    finish();
  }
  now_ms += ms;
}
unsigned long millis() { return now_ms; }

void SimSerial::begin(unsigned long) { serial_started = true; }
size_t SimSerial::print(const char* text) { return out(text); }
size_t SimSerial::print(char c) { return out(std::string(1, c)); }
size_t SimSerial::print(int n) { return out(std::to_string(n)); }
size_t SimSerial::print(unsigned int n) { return out(std::to_string(n)); }
size_t SimSerial::print(long n) { return out(std::to_string(n)); }
size_t SimSerial::print(unsigned long n) { return out(std::to_string(n)); }
size_t SimSerial::print(double n) {
  char buf[32];
  std::snprintf(buf, sizeof buf, "%.2f", n);
  return out(buf);
}
size_t SimSerial::println() {
  if (!serial_started) return 0;
  std::fputc('\n', stdout);
  event("serial", line);
  line.clear();
  return 1;
}

int main() {
  if (const char* ms = std::getenv("COURIER_SIM_MS")) limit_ms = std::strtoul(ms, nullptr, 10);
  if (const char* path = std::getenv("COURIER_SIM_EVENTS")) events = std::fopen(path, "w");
  setup();
  while (now_ms < limit_ms) {
    unsigned long before = now_ms;
    loop();
    if (now_ms == before) now_ms += 1;  // a loop() with no delay still takes a little time
  }
  finish();
}
