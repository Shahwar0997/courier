#include <courier.h>
#include "motors.h"
#include "encoders.h"
void drive(int left, int right){
    setDirections(left, right);
    courier::motors(left, right);
}

void stopMotors(){
    drive(0,0);
}