#!/bin/bash

# Params:
# $1 - full path to unzipped map directory
# $2 - full path to vector_map_path
# $3 - full path to downloaded zip file

# 2019-07-23: Temporary patch for IIAB 7.0 release, to reduce browser crashes
# on low-memory client devices: https://github.com/iiab/iiab/issues/1728
cd $1
if [ $(wc -c < main.js) -eq 3300000 ]; then    # Check for current/problematic main.js which is exactly 3,300,000 bytes
    echo "Swapping 3MB $1/main.js for a newer one, to help with low-memory client devices"
    mv main.js main.js.old
    wget https://raw.githubusercontent.com/iiab/maps/master/osm-source/regional-base/build/main.js    # This newer main.js is 3,300,039 bytes as of 2019-07-23
fi

echo "Moving downloaded $1 to production"
mv $1 $2

echo "Updating home page menus"
/usr/bin/iiab-update-map
# /usr/bin/iiab-update-map.py has syntax errors

echo "Removing download"
rm $3

exit 0
