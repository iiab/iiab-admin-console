#!/bin/bash
df |grep /media
rc=$?
if [ $rc -lt 2 ]; then
  exit 0
else
  exit $rc
fi
