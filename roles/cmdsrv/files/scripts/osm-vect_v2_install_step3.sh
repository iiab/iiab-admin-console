#!/bin/bash

# Python func install_osm_vect_set_v2 calls this, in roles/cmdsrv/files/iiab-cmdsrv3.py

# Params:
# $1 - mbtiles file

# these should be soft coded

PREVIEW_SAT=satellite_z0-z6_v3.mbtiles
PREVIEW_OSM=planet_z0-z6_2019.mbtiles

download_dir='/library/working/maps'
tiles_dir='/library/www/osm-vector-maps/viewer/tiles'

echo "Moving downloaded $1 to production"
mv $download_dir/$1 $tiles_dir
if [ $? -ne 0 ]; then
echo "Moving downloaded $1 to production FAILED"
exit 1
fi

# if the PREVIEW tiles are in place, delete them
if [ -e "/library/www/osm-vector-maps/viewer/tiles/$PREVIEW_OSM" ]; then
   unlink "/library/www/osm-vector-maps/viewer/tiles/$PREVIEW_OSM"
fi
if [ -e "/library/www/osm-vector-maps/viewer/tiles/$PREVIEW_SAT" ]; then
   rm -f "/library/www/osm-vector-maps/viewer/tiles/$PREVIEW_SAT"
fi

exit 0
