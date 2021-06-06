#!/bin/bash

SLEEP=`which sleep`
SHUTDOWN=`which shutdown`

$SLEEP 3
$SHUTDOWN -P now

exit 0
