#!/bin/bash

CSD_PATH=`find /sys/devices/platform/soc/*/mmc_host -name csd`
BASE_DIR=`dirname "$CSD_PATH"`

CSD=`cat $CSD_PATH`
NAME=`cat $BASE_DIR/name`
SERIAL=`cat  $BASE_DIR/serial`
CID=`cat $BASE_DIR/cid`

echo name: $NAME > /etc/iiab/sdcard-params
echo serial: $SERIAL >> /etc/iiab/sdcard-params
echo csd: $CSD >> /etc/iiab/sdcard-params
echo cid: $CID >> /etc/iiab/sdcard-params
