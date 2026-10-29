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

#include "encoders.h"
#include "motors.h"
#include "sensors.h"
#include "odometry.h"

const long TICKS_PER_TILE=181;
const long COAST_TICKS=13;
const float CM_PER_TICK=0.1655f;
const float WHEELBASE_CM=14.0f;

const int TURN_POWER=170;
const int SLOW_POWER=75;
const float TURNED_DEG=1;
const int BASE=170;
const long TARGET=9;
const long KP=20;
const long KH=10;
const unsigned long CONTROL_MS=50;
const unsigned long SETTLE_MS=300;
const unsigned long READ_MS=60;
const unsigned long POSE_MS=500;
const int STOP_CM=20;
const int GO_CM=30;

const char* route="EEEESSSEEEEEEEEEEESSS";
enum class State {IDLE, TURNING, DRIVING, SETTLING, BLOCKED, DONE};
State state= State::IDLE;

int dir=1;
int move=-1;
int run=1;
float targetHeading=90;
long startLeft=0;
long startRight=0;
long goalTicks=0;
long ticksLeft=0;
bool driveAfterSettling=false;
unsigned long settleStart=0;
unsigned long lastRead=0;
int distance=400;
unsigned long lastBlink=0;
bool ledOn=false;
Pose pose={0,0, HALF_PI};
long seenLeft=0;
long seenRight=0;
unsigned long lastPose=0;
unsigned long lastControl=0;
long windowLeft=0;
long windowRight=0;

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
float headingError(){
    float error= targetHeading-courier::headingDeg();
    while (error>180) error -=360;
    while (error<=-180) error +=360;
    return error;
}

void turnTowards(float error){
    int power= constrain(SLOW_POWER+3*(int)fabsf(error), SLOW_POWER, TURN_POWER);
    if (error>0) drive(power, -power);
    else drive(-power, power);
    state=State::TURNING;
    setLed(true);
}
void startCounting(){
    startLeft=leftTicks();
    startRight=rightTicks();
    windowLeft=startLeft;
    windowRight=startRight;
}
long ticksDone(){
    return (labs(leftTicks()-startLeft)+labs(rightTicks()-startRight))/2;
    
}

int cmLeft(){
    long left=state==State::BLOCKED ? ticksLeft : goalTicks- ticksDone();
    if (left<0) left=0;
    return left * CM_PER_TICK;
}

bool inTheWay(int cm, int limit){
    return cm<limit&&cm <cmLeft();
}
void updatePose(){
    long l=leftTicks();
    long r=rightTicks();
    pose= step(pose, l-seenLeft, r-seenRight, CM_PER_TICK, WHEELBASE_CM);
    pose.heading=courier::headingDeg()*DEG_TO_RAD;
    seenLeft=l;
    seenRight=r;
}

void printPose(){
    float degrees = pose.heading * RAD_TO_DEG;

    while (degrees < 0) degrees += 360;
    while (degrees >= 360) degrees -= 360;

    Serial.print("pose e=");
    Serial.print(pose.east, 1);

    Serial.print(" n=");
    Serial.print(pose.north, 1);

    Serial.print(" h=");
    Serial.println(degrees, 1);
}

void settle(bool thenDrive){
    stopMotors();
    driveAfterSettling=thenDrive;
    settleStart=millis();
    state=State::SETTLING;
}

void startRun(){
    run=1;
    while (route[move+run]==route[move]) run++;
    startCounting();
    goalTicks=run*TICKS_PER_TILE-COAST_TICKS;
    emptyWindow();
    distance=400;
    drive(BASE, BASE);
    state=State::DRIVING;
    setLed(true);
    for (int i=0; i<run; i++){
        Serial.print(route[move]);
        Serial.print(' ');
    }
}

void afterTurn(){
    float error= headingError();
    if (fabsf(error)>=TURNED_DEG) turnTowards(error);
    else startRun();
}
void startMove(){
    move++;
    if (route[move]=='\0'){
        state= State::DONE;
        setLed(false);
        updatePose();
        printPose();
        Serial.println("DONE");
        return;
    }

    dir=headingOf(route[move]);
    targetHeading=90*dir;
    afterTurn();
    
}
void setup(){
    Serial.begin(115200);
    Serial.println("Courier ready");
    pinMode(LED_PIN, OUTPUT);
    startEncoders();
    const char *asked=courier::route(); if (asked) route=asked;
    startMove();
}


void loop() {
  // Runs again and again, forever.
    unsigned long now=millis();
    if (now-lastRead>=READ_MS){
        lastRead=now;
        distance=readDistance();
    }
    if (now-lastPose>=POSE_MS){
        lastPose=now;
        updatePose();
        printPose();
    }
    switch(state){
        case State::TURNING:
            if (fabsf(headingError())<TURNED_DEG) settle(true);
            else turnTowards(headingError());
            break;

        case State::DRIVING:
            if (ticksDone()>=goalTicks) {
                move+=run-1;
                settle(false);
            } else if (inTheWay(distance, STOP_CM)){
                stopMotors();
                ticksLeft=goalTicks-ticksDone();
                state=State::BLOCKED;
                Serial.print("BLOCKED ");
                Serial.println(distance);
                
            }else if (now-lastControl>=CONTROL_MS){
                lastControl=now;
                long l=leftTicks();
                long r=rightTicks();
                long measuredLeft=l-windowLeft;
                long measuredRight= r-windowRight;
                windowLeft=l;
                windowRight=r;
                int fix=KH * headingError();
                int powerLeft= constrain(BASE+KP*(TARGET-measuredLeft)+fix, 0, 255);
                int powerRight= constrain(BASE+KP*(TARGET-measuredRight)-fix,0, 255);
                drive(powerLeft, powerRight);
            }
            break;

        case State::BLOCKED:
            if (now-lastBlink>=250){
                lastBlink=now;
                setLed(!ledOn);
            }
            if (!inTheWay(distance, GO_CM)){
                startCounting();
                goalTicks=ticksLeft;
                drive(BASE, BASE);
                state=State::DRIVING;
                setLed(true);
                Serial.print("GO ");
                Serial.println(distance);
            }
            break;
        case State::SETTLING:
            if (now-settleStart>=SETTLE_MS){
                if (driveAfterSettling) afterTurn();
                else startMove();
            }
        break;
        case State::IDLE:
        case State::DONE:
        break;
    }        
}
            