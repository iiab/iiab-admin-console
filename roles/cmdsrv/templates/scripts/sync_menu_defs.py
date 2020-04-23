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
import iiab.iiab_lib as iiab
import iiab.adm_lib as adm

try:
    adm.pcgvtd9()
except:
    print("Unable to contact Server")
    sys.exit(1)

# load lang codes
iiab.read_lang_codes()

local_menu_item_defs = adm.get_local_menu_item_defs() # returns dict
menu_def_repo_data = adm.get_menu_def_repo_data() # returns dict
repo_menu_item_defs = menu_def_repo_data['defs']
obsolete_menu_item_defs = adm.read_json(adm.CONST.obsolete_menu_defs)
changes_made = False

# download menu item defs from repo that are not present
for menu_item_def_name in repo_menu_item_defs:
    if menu_item_def_name not in local_menu_item_defs:
        if menu_item_def_name in obsolete_menu_item_defs:
            print('Skipping obsolete menu definition ' + menu_item_def_name)
            continue # don't download obsolete
        menu_item_def = adm.get_menu_item_def_from_repo_by_name(menu_item_def_name)
        adm.write_other_menu_item_def_files(menu_item_def)
        adm.write_menu_item_def(menu_item_def_name, menu_item_def)
        print ('Downloading new remote menu item definition ' + menu_item_def_name)
        changes_made = True
# upload new and changed local menu item defs to repo if upload_flag set
for menu_item_def_name in local_menu_item_defs:
    if menu_item_def_name in obsolete_menu_item_defs:
        print('Skipping obsolete menu definition ' + menu_item_def_name)
        continue # don't upload obsolete
    menu_item_def = local_menu_item_defs[menu_item_def_name]

    # skip non-canonical names
    if menu_item_def_name.split('-')[0] not in iiab.lang_iso2_codes:
        print('Skipping non-standard menu definition ' + menu_item_def_name)
        continue

    # only upload if user explicitly want to share
    # download unless user explicitly prohibits
    # as of Jan 3, 2020 these can only be set manually
    # for generated menu defs upload is false and download true

    upload_flag = False
    if 'upload_flag' in menu_item_def:
        upload_flag = menu_item_def['upload_flag']
    download_flag = True
    if 'download_flag' in menu_item_def:
        download_flag = menu_item_def['download_flag']

    if menu_item_def_name not in repo_menu_item_defs: # new and upload allowed
        if upload_flag:
            adm.put_menu_item_def(menu_item_def_name, menu_item_def)
            menu_item_def = adm.get_menu_item_def_from_repo_by_name(menu_item_def_name) # get the actual stored values including commit
            # write it to local files so we have the new commit sha and preserve flags
            adm.write_menu_item_def(menu_item_def_name, menu_item_def, upload_flag=upload_flag, download_flag=download_flag)
            print ('Uploading new local menu item definition ' + menu_item_def_name)
            changes_made = True
    else: # existing - try to determine whether local or repo should prevail
        # edit_status == 'repo' and local sha == repo - should be unchanged, do nothing
        # edit_status == 'repo' and local sha != repo - repo is newer, pull it if download_flag
        # edit_status == 'local_change' and local sha == repo - push local if upload_flag
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
            elif edit_status == 'repo' and local_sha != repo_sha: # repo is newer and not locally changed, pull it
                if download_flag:
                    print ('Downloading newer version  of ' + menu_item_def_name)
                    changes_made = True
                    menu_item_def = adm.get_menu_item_def_from_repo_by_name(menu_item_def_name)
                    adm.write_other_menu_item_def_files(menu_item_def)
                    adm.write_menu_item_def(menu_item_def_name, menu_item_def, upload_flag=upload_flag, download_flag=download_flag)
            elif edit_status == 'local_change' and local_sha == repo_sha:
                if upload_flag:
                    print ('Uploading changed version of ' + menu_item_def_name)
                    changes_made = True

                    # Upload any icon
                    if 'logo_url' in menu_item_def and menu_item_def['logo_url'] != '':
                        logo_url_file = menu_item_def['logo_url']
                        logo_sha = menu_def_repo_data['icons'][logo_url_file].get('sha', None)
                        adm.put_icon_file(logo_url_file, sha=logo_sha)

                    # Upload any extra_html
                    if 'extra_html' in menu_item_def and menu_item_def['extra_html'] != '':
                        extra_html_file = menu_item_def['extra_html']
                        extra_html_sha = menu_def_repo_data['html'][extra_html_file].get('sha', None)
                        adm.put_extra_html_file(extra_html_file, sha=extra_html_sha)

                    # Now do menu item def
                    adm.put_menu_item_def(menu_item_def_name, menu_item_def, repo_sha) # push local
                    menu_item_def = adm.get_menu_item_def_from_repo_by_name(menu_item_def_name) # get the actual stored values including commit
                    # write it to local files so we have the new commit sha and preserve flags
                    adm.write_menu_item_def(menu_item_def_name, menu_item_def, upload_flag=upload_flag, download_flag=download_flag)
            elif edit_status == 'local_change' and local_sha != repo_sha:
                print('Conflict between local and repo versions of ' + menu_item_def_name)
                changes_made = True
                continue # can not resolve
        except Exception as e:
            print(str(e))
            print('Skipping malformed Menu Item Definition ' + menu_item_def_name)
            #raise
            pass
if not changes_made:
    print ('No changes found.')
