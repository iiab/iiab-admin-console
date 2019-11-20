#!/usr/bin/python3
# install_menu_defs.py
# after pull/clone of js-menu-files repo, fix up commit_sha and any other fields in local files

import os, sys, syslog
from glob import glob
import requests
import json
import subprocess
import shlex
from datetime import date
import base64
import iiab.adm_lib as adm

try:
    adm.pcgvtd9()
except:
    print("Unable to contact Server")
    sys.exit(1)

local_menu_item_defs = adm.get_local_menu_item_defs() # returns dict
repo_menu_item_defs = adm.get_repo_menu_item_defs() # returns dict

# update commit_sha for cloned or pulled menu item defs
for menu_item_def_name in local_menu_item_defs:
    print (menu_item_def_name)
    menu_item_def = local_menu_item_defs[menu_item_def_name]

    if menu_item_def_name in repo_menu_item_defs:
        menu_item_def['commit_sha'] = repo_menu_item_defs[menu_item_def_name]['sha']
        menu_item_def['edit_status'] = 'repo'
        menu_item_def = adm.format_menu_item_def(menu_item_def_name, menu_item_def)
        adm.write_menu_item_def(menu_item_def_name, menu_item_def)

    else: # This should not happen but any pre-existing menu defs will be uploaded by the next sync_menu_defs.py run
        print(menu_item_def_name + ' not found in repo')
