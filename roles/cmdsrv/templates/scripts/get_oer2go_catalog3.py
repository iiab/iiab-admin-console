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

oer2go_duplicates = {'en': [5, 6, 17, 19, 20, 23, 44, 50, 60, 65, 68, 86, 88, 93, 122, 139],
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

    args = parse_args()
    if args.verbose:
        verbose = True
    if args.no_download:
        download_flag = False

    # make sure we have menu js_menu_dir if args.menu true
    if args.menu:
        if not os.path.isdir(adm.CONST.js_menu_dir):
            sys.stdout.write("GET-OER2GO-CAT ERROR - iiab-menu not installed and --menu option given\n")
            sys.stdout.flush()
            sys.exit(99)

    # always get our catalog
    # failure is fatal
    try:
        url_handle = urllib.request.urlopen(adm.CONST.iiab_module_cat_url)
        iiab_catalog_json = url_handle.read()
        url_handle.close()
        iiab_catalog = json.loads(iiab_catalog_json)
    except (urllib.error.URLError) as exc:
        sys.stdout.write("GET-OER2GO-CAT ERROR - " + str(exc.reason) +'\n')
        sys.stdout.flush()
        sys.exit(2)

    # for now we will assume that old modules are still in the current catalog
    # get new oer2go catalog unless told not to

    if download_flag:
        err_num, err_str, oer2go_catalog = get_oer2go_cat()
        if err_num != 0:
            download_flag = False
    if not download_flag: # get local copy
        local_oer2go_catalog = adm.read_json(adm.CONST.oer2go_catalog_file)
        oer2go_catalog = local_oer2go_catalog['modules']

    # merge iiab_catalog.json
    for item in iiab_catalog:
        moddir = item['moddir']
        id = item['module_id']
        module = item
        iiab_oer2go_catalog[moddir] = module

    working_dir = adm.CONST.rachel_working_dir + str(uuid.uuid4()) + "/"
    os.mkdir(working_dir)
    #os.mkdir(iiab_menu_download_dir)

    for item in oer2go_catalog: # structure of local and remote catalogs is different
        if not download_flag: # local
            moddir = item
            module = oer2go_catalog[moddir]
            module_id = module['module_id']
        else: # remote
            moddir = item['moddir']
            module_id = item['module_id']
            module = item

        if moddir is None: # skip items with no moddir
            continue

        menu_item_name = moddir
        if module_id not in dup_list:
            is_downloaded, has_menu_def = adm.get_module_status (module)
            if args.menu and is_downloaded:
                if not has_menu_def:
                    menu_item_name = adm.create_module_menu_def(module, working_dir, incl_extra_html = False)
                    msg = "Generating menu files"
                    if verbose:
                        print("%s %s %s" % (msg, module_id, moddir))
                adm.update_menu_json(menu_item_name) # only adds if not already in menu
        else:
            msg = "Skipping module not needed by Internet in a Box"
            if verbose:
                print("%s %s %s" % (msg, module_id, moddir))
            continue
        iiab_oer2go_catalog[moddir] = module

    # write catalog even if not downloaded as our could have changed
    dated_oer2go_cat = {}
    dated_oer2go_cat['download_date'] = time.strftime("%Y-%m-%d.%H:%M:%S")
    dated_oer2go_cat['modules'] = iiab_oer2go_catalog

    adm.write_json_file(dated_oer2go_cat, adm.CONST.oer2go_catalog_file)

    shutil.rmtree(working_dir)

    sys.stdout.write(err_str)
    sys.stdout.flush()
    sys.exit(err_num)

def get_oer2go_cat():
    err_num = 0
    err_str = None
    oer2go_catalog = None
    try:
        url_handle = urllib.request.urlopen(adm.CONST.oer2go_cat_url)
        oer2go_catalog_json = url_handle.read()
        url_handle.close()
    except (urllib.error.URLError) as exc:
        err_str = "GET-OER2GO-CAT ERROR - " + str(exc.reason) +'\n'
        err_num = 1

    # now try to parse
    if oer2go_catalog:
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
