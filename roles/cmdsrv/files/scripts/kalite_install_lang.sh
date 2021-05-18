#!/bin/bash

LIST="en es fr hi pt-BR pt-PT"

if [ -z "$1" ]; then
  echo "Usage: $0 <language code to install, e.g. $LIST>."
  exit 1
fi

LANG=$1
#[[ $LIST =~ (^|[[:space:]])$LANG($|[[:space:]]) ]] && echo '' || echo Languages allowed are only $LIST; exit 1
[[ $LIST =~ (^|[[:space:]])$LANG($|[[:space:]]) ]] && TF='T' || TF='F'
if [ "$TF" != "T" ]; then
  echo Languages allowed are only $LIST
  exit 1
fi

KALITEDIR=/library/ka-lite
ENDB=content_khan_en.sqlite
REMURL=http://s3.us-east-2.wasabisys.com/ka-lite-0.17-resized-videos

FLAGDIR=/etc/iiab/install-flags
mkdir -p $FLAGDIR

if [[ ! -d $KALITEDIR ]]; then
  echo "KA Lite is not installed. Exiting"
  exit 1
fi

if [ ! -f $FLAGDIR/kalite-zone-complete ]; then
    echo -e "Now running 'kalite manage generate_zone' ...\n"
    kalite manage generate_zone
    touch $FLAGDIR/kalite-zone-complete
    echo -e "$FLAGDIR/kalite-zone-complete\n"
fi

ENDBSIZE=$(stat -c%s "$KALITEDIR/database/content_khan_en.sqlite")
if [[ "$ENDBSIZE" -lt "100000" ]]; then
  echo "Downloading English Language Pack."
  wget -O /tmp/en.zip $REMURL/lang-packs/en.zip
  if [ $? -eq 1 ]; then
   echo "Error downloading. Exiting"
   exit 1
  fi
  echo "Installing KA Lite's mandatory English Pack... (en.zip)\n"
  cd /tmp
  kalite manage retrievecontentpack local en en.zip
  touch $FLAGDIR/kalite-en.zip-complete
fi

if [ "$LANG" != "en" ]; then # get secondary lang pack
  echo "Downloading $LANG Language Pack."
  wget -O /tmp/$LANG.zip $REMURL/lang-packs/$LANG.zip
  if [ $? -eq 1 ]; then
   echo "Error downloading. Exiting"
   exit 1
  fi
  echo "Installing $LANG Pack"
  cd /tmp
  kalite manage retrievecontentpack local $LANG $LANG.zip

  # mostly this needs an insert not update
  # sqlite3 $KALITEDIR/database/data.sqlite "update config_settings set value = '$LANG' where name = 'default_language';"
  ISLANGSET=`grep LANGUAGE_CODE "$KALITEDIR/settings.py"`
  if [ -z "$ISLANGSET" ]; then
    echo  LANGUAGE_CODE = "'$LANG'" >> "$KALITEDIR/settings.py"
    systemctl restart kalite-serve
  fi
fi

exit 0
