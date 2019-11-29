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

oer2go_duplicates = {'en': [5, 6, 17, 19, 20, 23, 44, 50, 60, 65, 68, 86, 88, 93, 139],
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
    oer2go_catalog = {}

    args = parse_args()
    if args.verbose:
        verbose = True

    # make sure we have menu js_menu_dir if args.menu true
    if args.menu:
        '''
        if args.no_download:
            sys.stdout.write("GET-OER2GO-CAT ERROR - --no_download and --menu options are incompatible\n")
            sys.stdout.flush()
            sys.exit(99)
        '''
        if not os.path.isdir(js_menu_dir):
            sys.stdout.write("GET-OER2GO-CAT ERROR - iiab-menu not installed and --menu option given\n")
            sys.stdout.flush()
            sys.exit(99)

    # for now we will assume that old modules are still in the current catalog
    # get new oer2go catalog unless told not to

    if not args.no_download:
        try:
            url_handle = urllib.request.urlopen(adm.CONST.oer2go_cat_url)
            oer2go_catalog_json = url_handle.read()
            url_handle.close()
        except (urllib.error.URLError) as exc:
            sys.stdout.write("GET-OER2GO-CAT ERROR - " + str(exc.reason) +'\n')
            sys.stdout.flush()
            sys.exit(1)
        try:
            url_handle = urllib.request.urlopen(adm.CONST.iiab_cat_url)
            iiab_catalog_json = url_handle.read()
            url_handle.close()
        except (urllib.error.URLError) as exc:
            sys.stdout.write("GET-OER2GO-CAT ERROR - " + str(exc.reason) +'\n')
            sys.stdout.flush()
            sys.exit(2)

        # now try to parse
        try:
            oer2go_catalog = json.loads(oer2go_catalog_json)
            iiab_catalog = json.loads(iiab_catalog_json)
        except:
            sys.stdout.write("GET-OER2GO-CAT ERROR - " + str(sys.exc_info()[0]) + "," +  str(sys.exc_info()[1])  + '\n')
            sys.stdout.flush()
            sys.exit(3)

        # merge iiab_catalog.json if was downloaded otherwise assume was previously merged
        for item in iiab_catalog:
            moddir = item['moddir']
            id = item['module_id']
            module = item
            iiab_oer2go_catalog[moddir] = module

    else:
        local_oer2go_catalog = read_json(adm.CONST.oer2go_catalog_file)
        oer2go_catalog = local_oer2go_catalog['modules']

    working_dir = adm.CONST.rachel_working_dir + str(uuid.uuid4()) + "/"
    os.mkdir(working_dir)
    #os.mkdir(iiab_menu_download_dir)

    for item in oer2go_catalog: # structure of local and remote catalogs is different
        if args.no_download: # local
            moddir = item
            module = oer2go_catalog[moddir]
            id = module['module_id']
        else: # remote
            moddir = item['moddir']
            id = item['module_id']
            module = item

        if moddir is None: # skip items with no moddir
            break

        if id not in dup_list:
            module, gen_new_menudef = adm.get_status (module, verbose)
            if gen_new_menudef and args.menu:
                adm.proc_module(module) # process menu item
                msg = "Generating menu files"
                if verbose:
                    print(("%s %s %s" % (msg, id, moddir)))
            if module['has_live_menudef'] and module['module_downloaded']:
                print(('Updating /home/menu.json with %s'%moddir))
                adm.update_menu_json(moddir)
        else:
            msg = "Skipping module not needed by Internet in a Box"
            if verbose:
                print(("%s %s %s" % (msg, id, moddir)))
            continue

        iiab_oer2go_catalog[moddir] = module

    dated_oer2go_cat = {}
    dated_oer2go_cat['download_date'] = time.strftime("%Y-%m-%d.%H:%M:%S")
    dated_oer2go_cat['modules'] = iiab_oer2go_catalog

    with open(adm.CONST.oer2go_catalog_file, 'w') as outfile:
        json.dump(dated_oer2go_cat, outfile, indent=2)

    shutil.rmtree(working_dir)

    sys.stdout.write("SUCCESS")
    sys.stdout.flush()
    sys.exit(0)

def parse_args():
    parser = argparse.ArgumentParser(description="Get Rachel/OER2Go catalog. Create menu defs if not found.")
    parser.add_argument("--no_download", help="Don't download catalog just check which modules are installed", action="store_true")
    parser.add_argument("--menu", help="When downloading generate files for IIAB menu and put them in iiab-menu/local/unedited", action="store_true")
    parser.add_argument("-v", "--verbose", help="Print messages.", action="store_true")
    return parser.parse_args()

if __name__ == "__main__":
    # Now run the main routine
    main()
