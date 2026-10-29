// firmware/src/encoders.cpp — counting wheel ticks with interrupts (Stop 5).
#include <Arduino.h>
#include <courier_pins.h>

#include "encoders.h"

volatile long leftCount = 0; // changed inside an interrupt, so volatile
volatile long rightCount = 0;
volatile int leftDir = 1; // +1 forward, -1 backward: the encoders can't tell
volatile int rightDir = 1;

void IRAM_ATTR onLeftTick() {
  leftCount += leftDir;
}

void IRAM_ATTR onRightTick() {
 rightCount += rightDir;
}

void startEncoders() {
 pinMode(ENC_LEFT, INPUT);
 pinMode(ENC_RIGHT, INPUT);
 attachInterrupt(digitalPinToInterrupt(ENC_LEFT), onLeftTick, RISING);
 attachInterrupt(digitalPinToInterrupt(ENC_RIGHT), onRightTick, RISING);
}

void setDirections(int left, int right) {
 // A wheel told 0 keeps its last direction: it coasts on the same way for a moment.
 if (left > 0) leftDir = 1;
 if (left < 0) leftDir = -1;
 if (right > 0) rightDir = 1;
 if (right < 0) rightDir = -1;
}

long leftTicks() {
    noInterrupts();
    long ticks = leftCount;
    interrupts();
    return ticks;
}

long rightTicks() {
    noInterrupts();
    long ticks=rightCount;
    interrupts();
    return ticks;
}
