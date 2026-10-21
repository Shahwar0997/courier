#include <courier.h>
#include "sensors.h"

const int WINDOW=5;

int readings[WINDOW];
int count=0;
int oldest=0;
long sum=0;
int average=400;

int readDistance(){
    int cm=courier::distanceCm();
    if (cm<0){
        return average;
    }
    if (count==WINDOW){
        sum-=readings[oldest];
    }else {
        count++;
    }
    readings[oldest]=cm;
    sum+=cm;
    oldest=(oldest+1)%WINDOW;
    average=sum/count;
    return average;
}
void emptyWindow(){
    count=0;
    sum=0;
    oldest=0;
    average=400;
}