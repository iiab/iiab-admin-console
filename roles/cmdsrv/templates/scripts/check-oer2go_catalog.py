#!/usr/bin/python3

# Get new oer2go (rachel) catalog
# for now we will assume that old modules are still in the current catalog
# exclude known modules that we get by another means, such as zims
# for modules with no menu defs create that and an extra html file under js-menu/local/unedited/
# there is an optional switch to suppress menu processing

import xml.etree.ElementTree as ET
import json
import csv
import operator
import base64
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
import fnmatch
from datetime import date

import iiab.iiab_lib as iiab
import iiab.adm_lib as adm

verbose = False
download_flag = True

oer2go_duplicates = {'en': [5, 6, 17, 19, 20, 23, 44, 50, 60, 65, 68, 86, 88, 93, 122, 139, 205],
  'es': [26, 49, 51, 53, 58, 59, 61, 63, 66, 69, 72, 75, 94],
  'fr': [],
  'misc': [98,114]}

dup_list = []
for lang in oer2go_duplicates:
    dup_list += oer2go_duplicates[lang]
dup_list = [str(i) for i in dup_list]

iiab_oer2go_catalog = {}

php_parser = re.compile('\<\?php echo .+? \?>')

def main ():
    global verbose
    global download_flag

    oer2go_catalog = {}
    err_num = 0
    err_str = "SUCCESS"

    local_oer2go_catalog = adm.read_json(adm.CONST.oer2go_catalog_file)
    local_oer2go_catalog = local_oer2go_catalog['modules']

    err_num, err_str, oer2go_catalog_v2 = get_oer2go_cat_v2()

    for item in oer2go_catalog_v2:
        if item in local_oer2go_catalog:
            continue
        id = oer2go_catalog_v2[item]['module_id']
        moddir = oer2go_catalog_v2[item]['moddir']
        if id in dup_list:
            continue
        print (id, moddir)


def get_oer2go_cat_v2():
    err_num = 0
    err_str = "SUCCESS"
    oer2go_catalog = None
    oer2go_catalog_json = None

    oer2go_cat_url_v2 = 'https://rachel.worldpossible.org/cgi/json_api_v2.pl'
    try:
        url_handle = urllib.request.urlopen(oer2go_cat_url_v2)
        oer2go_catalog_json = url_handle.read()
        url_handle.close()

    except (urllib.error.URLError) as exc:
        err_str = "GET-OER2GO-CAT ERROR - " + str(exc.reason) +'\n'
        err_num = 1
        oer2go_catalog_json = None
    except (Exception) as exc:
        err_str = "GET-OER2GO-CAT ERROR - Unable to download catalog\n"
        err_num = 1


    # now try to parse
    if oer2go_catalog_json:
        try:
            oer2go_catalog = json.loads(oer2go_catalog_json)
        except:
            err_str = "GET-OER2GO-CAT ERROR - " + str(sys.exc_info()[0]) + "," +  str(sys.exc_info()[1])  + '\n'
            err_num = 3

    return err_num, err_str, oer2go_catalog

def parse_args():
    parser = argparse.ArgumentParser(description="Get Rachel/OER2Go catalog. Create menu defs if not found.")
    parser.add_argument("--no_download", help="Don't download catalog just check which modules are installed", action="store_true")
    parser.add_argument("--menu", help="When downloading generate files for IIAB menu and put them in iiab-menu/local/unedited", action="store_true")
    parser.add_argument("-v", "--verbose", help="Print messages.", action="store_true")
    return parser.parse_args()

if __name__ == "__main__":
    # Now run the main routine
    main()
