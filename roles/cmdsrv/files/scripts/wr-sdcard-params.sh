#!/bin/bash
NAME=`cat /sys/devices/platform/soc/*.emmc2/mmc_host/mmc0/mmc0*/name`
SERIAL=`cat /sys/devices/platform/soc/*.emmc2/mmc_host/mmc0/mmc0*/serial`
CSD=`cat /sys/devices/platform/soc/*.emmc2/mmc_host/mmc0/mmc0*/csd`
CID=`cat /sys/devices/platform/soc/*.emmc2/mmc_host/mmc0/mmc0*/cid`

echo name: $NAME > /etc/iiab/sdcard-params
echo serial: $SERIAL >> /etc/iiab/sdcard-params
echo csd: $CSD >> /etc/iiab/sdcard-params
echo cid: $CID >> /etc/iiab/sdcard-params
