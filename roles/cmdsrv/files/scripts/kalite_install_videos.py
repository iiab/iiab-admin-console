#!/usr/bin/python3
# Get one or more categories of kalite videos for a given language

import os.path
import sys
import shutil
import urllib.request, urllib.error, urllib.parse
import json
import time
import subprocess
import shlex
import uuid
import re
import argparse
import sqlite3
from datetime import date

#import iiab.iiab_lib as iiab
import iiab.adm_lib as adm

KALITEDIR = '/library/ka-lite'
# ENDB = 'content_khan_en.sqlite'
REMOTE_URL = 'http://s3.us-east-2.wasabisys.com/ka-lite-0.17-resized-videos/'
LANG_LIST = ['en', 'es', 'fr', 'hi', 'pt-BR', 'pt-PT']

# assuming these are the case
VIDEO_EXT = '.mp4'
IMAGE_EXT = '.png'

not_downloaded = []

def main ():
    global REMOTE_URL

    args = parse_args()
    lang_code = args.lang_code.lower()
    REMOTE_URL += lang_code + '/'
    sqlite_file = KALITEDIR + "/database/content_khan_" + lang_code + ".sqlite"
    topics = args.topics

    if lang_code not in LANG_LIST:
        sys.stdout.write("Language must be one of ".join(LANG_LIST) + "n") # is this necessary?
        sys.stdout.flush()
        sys.exit(1)

    if not os.path.isfile(sqlite_file):
        print("Database " + sqlite_file + " not found. Exiting.")
        sys.exit(1)

    conn = sqlite3.connect(sqlite_file)
    c = conn.cursor()

    # validate topics

    for topic in topics:
        c.execute("select path from item where kind = 'Topic' and path = ?", (topic,))
        if len(c.fetchall()) == 0:
            print("Topic " + topic + " not found in database. Exiting.")
            sys.exit(1)

    # now get videos for all topics and sub topics

    for topic in topics:
        try:
            c.execute('SELECT youtube_id, path FROM item WHERE kind = "Video" and youtube_id is not null and path like ?', (topic + '%',))
            video_list = c.fetchall()
            get_topic_videos(video_list)
        except:
            print('Error getting downloads. Exiting.')
            sys.exit(1)

    if len(not_downloaded) > 0:
        print ('The following were not downloaded:')
        print (not_downloaded)

    # do video scan with kalite manage

    print ('Starting videoscan')
    cmd = 'kalite manage videoscan -l' + lang_code
    adm.subproc_cmd(cmd)
    print ('Videoscan complete')

    # exit 0 when complete

    sys.stdout.write("SUCCESS")
    sys.stdout.flush()
    sys.exit(0)

def get_topic_videos(video_list):
    for video_id in video_list:
        vid = video_id[0] + VIDEO_EXT
        image = video_id[0] + IMAGE_EXT
        for f in [vid, image]:
            if not os.path.isfile(KALITEDIR + "/content/" + f):
                download_file(f)

def download_file(file):
    global not_downloaded
    cmd = 'wget -O /tmp/' + file + ' ' + REMOTE_URL + file
    try:
        adm.subproc_cmd(cmd)
        shutil.move('/tmp/' + file, KALITEDIR + '/content/')
    except Exception as e:
        print('Error downloading ' + file)
        print('Skipping ' + file)
        not_downloaded.append(file)
        #raise

def parse_args():
    parser = argparse.ArgumentParser(description="Install KA Lite Videos by Category.")
    parser.add_argument("lang_code", help="Two character languare code")
    parser.add_argument("topics", help="List of KA Lite Topics to Download", type=str, nargs='+')
    #parser.add_argument("-v", "--verbose", help="Print messages.", action="store_true")
    return parser.parse_args()

if __name__ == "__main__":
    # Now run the main routine
    main()
