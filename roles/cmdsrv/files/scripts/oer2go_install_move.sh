#!/bin/bash -e
# parameter 1 is name of module

. scripts/constants.sh

# Module directory

echo "Moving downloaded $1 to production"
mv $OER2GO_WORKING$1 $MODULES_DIR

scripts/add_module_to_menu.py $1

exit 0
