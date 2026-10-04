// courier_kit.h — Courier firmware on the Freenove 4WD Car Kit for ESP32 (FNK0053).
//
// On this kit the motors don't hang off the ESP32's own pins: they sit behind a PCA9685 PWM chip on
// I2C, and the status light is a WS2812 colour LED. So that Stop 3's code (pinMode, digitalWrite,
// analogWrite on LED_PIN, LEFT_FWD, …) runs here unchanged, those five are *Courier pins* (200–204),
// and pinMode/digitalWrite/analogWrite pass them to courier_hal.cpp; every other pin number goes
// straight to the ESP32 as usual. Included by courier_pins.h (the kit part), after <Arduino.h>.
//
// Status: compiles with arduino-cli 1.5.1 and esp32:esp32@3.3.12 (board esp32wrover). Not yet run on
// a kit: none has been bought. Pin map from Freenove's published sources (see courier_hal.cpp).
#pragma once
#include <Arduino.h>

enum : uint8_t {
  COURIER_PIN_LEFT_FWD = 200,   // left wheels forward  (PCA9685 channels 15, 9)
  COURIER_PIN_LEFT_REV = 201,   // left wheels backward (PCA9685 channels 14, 8)
  COURIER_PIN_RIGHT_FWD = 202,  // right wheels forward (PCA9685 channels 12, 10)
  COURIER_PIN_RIGHT_REV = 203,  // right wheels backward (PCA9685 channels 13, 11)
  COURIER_PIN_LED = 204,        // the first WS2812 LED, lit green
  COURIER_PIN_NONE = 205,       // a part the kit doesn't have (the wheel encoders): ignored
};

void courier_pinMode(uint8_t pin, uint8_t mode);
void courier_digitalWrite(uint8_t pin, uint8_t value);
void courier_analogWrite(uint8_t pin, int value);
void courier_attachInterrupt(uint8_t pin, void (*isr)(void), int mode);

#ifndef COURIER_HAL_IMPL
#define pinMode courier_pinMode
#define digitalWrite courier_digitalWrite
#define analogWrite courier_analogWrite
#define attachInterrupt courier_attachInterrupt
#endif
