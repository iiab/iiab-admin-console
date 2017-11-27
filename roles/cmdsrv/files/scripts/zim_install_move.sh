#!/bin/bash

WORKINGDIR=/library/working/zims/
DESTDIR=/library/zims/content
SRC=$WORKINGDIR/$1

# ZIM File

echo "Moving downloaded $1 to production"
mv $SRC $DESTDIR

echo "Re-indexing Kiwix Library"
/usr/bin/iiab-make-kiwix-lib

exit 0
