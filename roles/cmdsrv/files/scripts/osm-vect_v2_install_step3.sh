#!/bin/bash

# Python func install_osm_vect_set_v2 calls this, in roles/cmdsrv/files/iiab-cmdsrv3.py

# Params:
# $1 - mbtiles file

# these should be soft coded

download_dir='/library/working/maps'
tiles_dir='/library/www/osm-vector-maps/viewer/tiles'

echo "Moving downloaded $1 to production"
mv $download_dir/$1 $tiles_dir
if [ $? -ne 0 ]; then
echo "Moving downloaded $1 to production FAILED"
exit 1
fi

exit 0
