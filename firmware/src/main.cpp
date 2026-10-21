// firmware/src/main.cpp — your robot's firmware (Stop 3).
//
// Firmware is the one program that runs on the robot's chip. It starts when the power comes on
// and never ends: the chip calls setup() once, then calls loop() again and again, forever.
//
// Build it for the simulator:   pio run -e sim -d firmware
// Build and run it:             pio run -e sim -d firmware -t exec
//
// The walkthrough is in stops/03/WALKTHROUGH.md. Timing values you'll need in step 6
// (TILE_MS, TURN_MS at SPEED 180) are measured in the simulator and added here when it ships.

#include <Arduino.h>
#include <courier_pins.h>
#include <courier.h>
#include "motors.h"
#include "sensors.h"

const unsigned long SPEED=180;
const unsigned long TILE_MS=885;
const unsigned long TURN_MS=324;
const unsigned long READ_MS=60;
const int STOP_CM=20;
const int GO_CM=30;

const char* ROUTE="EEEESSSEEEEEEEEEEESSS";
enum class State {IDLE, TURNING, DRIVING, BLOCKED, DONE};
State state= State::IDLE;

int dir=1;
int move=0;

unsigned long stepStart=0;
unsigned long msLeft=0;
unsigned long turnMs=0;
unsigned long lastRead=0;
int distance=400;
unsigned long lastBlink=0;
bool ledOn=false;

int headingOf(char move){
    if (move=='N') return 0;
    if (move=='E') return 1;
    if (move=='S') return 2;
    return 3;    
}

void setLed(bool on){
    ledOn=on;
    digitalWrite(LED_PIN, on? HIGH: LOW);
}

int cmLeft(){
    if (state==State::BLOCKED) return 30* msLeft/ TILE_MS;
    unsigned long driven=millis()- stepStart;
    if (driven>TILE_MS) driven=TILE_MS;
    return 30* (TILE_MS-driven)/ TILE_MS;
}

bool inTheWay(int cm, int limit){
    return cm<limit&&cm <cmLeft()+(limit-STOP_CM);
}
void startMove(){
    if (ROUTE[move]=='\0'){
        stopMotors();
        state=State::DONE;
        setLed(false);
        Serial.println("DONE");
        return;
    }

    int target=headingOf(ROUTE[move]);
    int quarterTurns=(target-dir+4)%4;
    dir=target;
    if (quarterTurns==0) turnMs=0;
    else if (quarterTurns==2) turnMs=2*TURN_MS;
    else turnMs=TURN_MS;
    if (quarterTurns==3) drive(-SPEED, SPEED);
    else if (quarterTurns!=0) drive(SPEED, -SPEED);
    stepStart=millis();
    state=State::TURNING;
    setLed(true);
    
}
void setup(){
    Serial.begin(115200);
    Serial.println("Courier ready");
    pinMode(LED_PIN, OUTPUT);
    startMove();
}


void loop() {
  // Runs again and again, forever.
    unsigned long now=millis();
    if (now-lastRead>=READ_MS){
        lastRead=now;
        distance=readDistance();
    }
    switch(state){
        case State::TURNING:
            if (now-stepStart>=turnMs){
                emptyWindow();
                distance=400;
                drive(SPEED, SPEED);
                stepStart=now;
                state=State::DRIVING;
                Serial.print(ROUTE[move]);
                Serial.print(' ');
            }
            break;

        case State::DRIVING:
            if (now-stepStart>=TILE_MS){
                stopMotors();
                move++;
                startMove();
            }else if (inTheWay(distance, STOP_CM)){
                stopMotors();
                msLeft=TILE_MS-(now-stepStart);
                state=State::BLOCKED;
                Serial.print("BLOCKED ");
                Serial.println(distance);
            }
            break;

        case State::BLOCKED:
            if (now-lastBlink>=500){
                lastBlink=now;
                setLed(!ledOn);
            }
            if (!inTheWay(distance, GO_CM)){
                stepStart=now-(TILE_MS-msLeft);
                drive(SPEED, SPEED);
                state=State::DRIVING;
                setLed(true);
                Serial.print("GO ");
                Serial.println(distance);
            }
            break;
        case State::IDLE:
        case State::DONE:
        break;
    }        
}
            