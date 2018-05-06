#!/bin/bash -e
# parameter 1 is name of module

. scripts/constants.sh

# Module directory

echo "Moving downloaded $1 to production"
mv $OER2GO_WORKING$1 $MODULES_DIR

# this is no longer needed due to get_oer2go_stat(cmd_info) and clobbers date
#echo "Updating catalog"
#iiab-get-oer2go-cat -v --no_download

exit 0
