#include <courier.h>
#include "motors.h"
void drive(int left, int right){
    courier::motors(left, right);
}

void stopMotors(){
    drive(0,0);
}