#!/bin/bash -e
# parameter 1 is name of module

SOURCE constants.sh

# Module directory

echo "Moving downloaded $1 to production"
mv $OER2GO_WORKING$1 $MODULES_DIR

echo "Updating catalog"
iiab-get-oer2go-cat -v --no_download

exit 0
