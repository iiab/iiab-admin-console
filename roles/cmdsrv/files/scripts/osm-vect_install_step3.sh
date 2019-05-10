#!/bin/bash

# Params:
# $1 - full path to unzipped map directory
# $2 - full path to vector_map_path
# $3 - full path to downloaded zip file

echo "Moving downloaded $1 to production"
mv $1 $2

echo "Updating home page menues"
/usr/bin/iiab-update-map.py

echo "Removing download"
rm $3

exit 0
