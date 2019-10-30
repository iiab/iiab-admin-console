#!/usr/bin/python3
# sync_menu_defs.py
# try to put js-menu-files repo and local files in sync

import os, sys, syslog
from glob import glob
import requests
import json
import subprocess
import shlex
from datetime import date
import base64
from iiab.adm_lib import *

local_menu_item_defs = get_local_menu_item_defs() # returns dict
repo_menu_item_defs = get_repo_menu_item_defs() # returns dict
changes_made = False

# download menu item defs from repo that are not present
for menu_item_def_name in repo_menu_item_defs:
    if menu_item_def_name not in local_menu_item_defs:
        menu_item_def = get_menu_item_def_from_repo_by_name(menu_item_def_name)
        write_other_menu_item_def_files(menu_item_def)
        write_menu_item_def(menu_item_def_name, menu_item_def)
        print ('Downloading new remote menu item definition ' + menu_item_def_name)
        changes_made = True
# upload new and changed local menu item defs to repo
for menu_item_def_name in local_menu_item_defs:
    menu_item_def = local_menu_item_defs[menu_item_def_name]
    if menu_item_def_name not in repo_menu_item_defs: # new
        put_menu_item_def(menu_item_def_name, menu_item_def)
        print ('Uploading new local menu item definition ' + menu_item_def_name)
        changes_made = True
    else: # existing - try to determine whether local or repo should prevail
        # edit_status == 'repo' and local sha == repo - should be unchanged, do nothing
        # edit_status == 'repo' and local sha != repo - repo is newer, pull it
        # edit_status == 'local_change' and local sha == repo - push local
        # edit_status == 'local_change' and local sha != repo - requires merge, but no merge in batch only report

        try:
            repo_sha = repo_menu_item_defs[menu_item_def_name]['sha']
            if 'edit_status' in menu_item_def:
                edit_status = menu_item_def['edit_status']
            else:
                edit_status = 'local_change' # patch until sync implemented in menu edit

            if 'commit_sha' in menu_item_def:
                local_sha = menu_item_def['commit_sha']
            else:
                local_sha = repo_sha # will cause all edits to get synced until sync implemented in menu edit

            if edit_status == 'repo' and local_sha == repo_sha:
                #print ('No change to ' + menu_item_def_name)
                continue # nothing to do
            elif edit_status == 'repo' and local_sha != repo_sha: # repo is newer, pull it
                print ('Downloading newer version  of ' + menu_item_def_name)
                changes_made = True
                menu_item_def = get_menu_item_def_from_repo_by_name(menu_item_def_name)
                write_other_menu_item_def_files(menu_item_def)
                write_menu_item_def(menu_item_def_name, menu_item_def)
            elif edit_status == 'local_change' and local_sha == repo_sha:
                print ('Uploading changed version  of ' + menu_item_def_name)
                changes_made = True
                put_menu_item_def(menu_item_def_name, menu_item_def, repo_sha) # push local
                menu_item_def = get_menu_item_def_from_repo_by_name(menu_item_def_name) # get the actual stored values including commit
                write_menu_item_def(menu_item_def_name, menu_item_def) # write it to local files so we have the new commit sha
            elif edit_status == 'local_change' and local_sha != repo_sha:
                print('Conflict between local and repo versions of ' + menu_item_def_name)
                changes_made = True
                continue # can not resolve
        except:
            print('Skipping malformed Menu Item Definition ' + menu_item_def_name)
            pass
if not changes_made:
    print ('No changes found.')