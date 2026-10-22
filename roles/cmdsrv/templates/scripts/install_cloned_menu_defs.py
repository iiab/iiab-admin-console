#!/usr/bin/python3
# install_cloned_menu_defs.py
# after pull/clone of js-menu-files repo, fix up commit_sha and any other fields in local files

import os, sys, syslog
from glob import glob
import requests
import json
import subprocess
import shlex
from datetime import date
import base64
from git import Repo
import iiab.adm_lib as adm

# repo_menu_item_defs = adm.get_cloned_repo_menu_item_defs() # returns dict
obsolete_menu_item_defs = adm.read_json(adm.CONST.obsolete_menu_defs)
menu_item_def_list = glob(adm.CONST.js_menu_clone + 'menu-defs/*.json')
repo = Repo(adm.CONST.js_menu_clone)

# update commit_sha for cloned or pulled menu item defs and copy to destination
for menu_item_def_path in menu_item_def_list:
    'menu-defs/ = menu_item_def_path.split('/menu-defs/')[1].split('.json')[0]
    if menu_item_def_name in obsolete_menu_item_defs:
        print('Skipping ' + menu_item_def_name)
        continue
       
    menu_item_def = adm.read_json(menu_item_def_path)
    menu_def_tuple = ('menu-defs/' + menu_item_def_name + '.json', 0)    
    blob_sha = repo.index.entries[menu_def_tuple].hexsha
         
    print('Copying ' + menu_item_def_name)
    menu_item_def['commit_sha'] = blob_sha
    menu_item_def['edit_status'] = 'repo'
    menu_item_def = adm.format_menu_item_def(menu_item_def_name, menu_item_def)
    adm.write_menu_item_def(menu_item_def_name, menu_item_def)
       