#!/bin/bash

. /etc/iiab/iiab.env

if [ "$OS" = "Debian" ] || [ "$OS" = "raspbian" ]; then
	/bin/sleep 3
	/sbin/reboot
else
	/usr/bin/sleep 3
	/usr/sbin/reboot
fi
exit 0
