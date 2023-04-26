# adm_lib.py
# common functions for Admin Console
# IIAB functions are in iiab_lib.py
# import iiab.adm_lib as adm

import os
import sys
from glob import glob
import json
import subprocess
import shlex
from datetime import date
import base64
import fnmatch
import re
import shutil
import requests
import yaml
import jinja2

import iiab.iiab_lib as iiab
import iiab.iiab_const as IIAB_CONST
import iiab.adm_const as CONST

headers = {}
git_committer_handle = ''
map_catalog = {}

# ZIM functions

def write_zim_versions_idx(zim_versions, kiwix_library_xml, zim_version_idx_dir, zim_menu_defs):
    zims_installed, path_to_id_map = iiab.read_library_xml(kiwix_library_xml)

    # drives off of zim_versions which is what is in file system

    for perma_ref in zim_versions:
        zim_versions[perma_ref]['menu_item'] = zim_menu_defs.get(perma_ref, {}).get('name')
        articlecount, mediacount, size, tags, lang, date = \
            get_substitution_data(perma_ref, zim_versions, zims_installed, path_to_id_map)
        zim_versions[perma_ref]['article_count'] = articlecount
        zim_versions[perma_ref]['media_count'] = mediacount
        size = iiab.human_readable(float(size) * 1024) # kiwix reports in K
        zim_versions[perma_ref]['size'] = size
        zim_versions[perma_ref]['tags'] = tags

        zim_versions[perma_ref]['language'] = lang
        zim_versions[perma_ref]['zim_date'] = date

    # Write Version Map
    if os.path.isdir(zim_version_idx_dir):
        with open(zim_version_idx_dir + CONST.zim_version_idx_file, 'w') as fp:
            fp.write(json.dumps(zim_versions, indent=2))
            fp.close()
    else:
        print(zim_version_idx_dir + " not found.")

def get_zim_menu_defs():
    zim_menu_defs = {}
    for filename in os.listdir(CONST.menu_def_dir):
        if fnmatch.fnmatch(filename, '*.json'):
            #print (filename)
            menu_def = {}
            try:
                with open(CONST.menu_def_dir + filename, 'r') as json_file:
                    readstr = json_file.read()
                menu_def = json.loads(readstr)
            except:
                print("failed to parse %s"%filename)
                #print(readstr)
                pass
            #print(menu_def)
            if menu_def.get('intended_use', '') != 'zim':
                continue
            perma_ref = menu_def.get('zim_name', '')
            if perma_ref != '':
                zim_menu_defs[perma_ref] = menu_def
    return zim_menu_defs

def get_all_menu_defs(filter=None):
    all_menu_defs = {}
    for filename in os.listdir(CONST.menu_def_dir):
        if fnmatch.fnmatch(filename, '*.json'):
            #print (filename)
            menu_def = {}
            try:
                menu_def = read_json(CONST.menu_def_dir + filename)
            except:
                print("failed to parse %s"%filename)
                continue
            #print(menu_def)
            if filter:
                if menu_def['intended_use'] != 'zim':
                    continue
            menu_item_name = filename[:-5] # strip .json
            all_menu_defs[menu_item_name] = menu_def
    return all_menu_defs

def get_substitution_data(perma_ref, zim_versions, zims_installed, path_to_id_map):
    #reconstruct the path in the id map
    path = 'content/' + zim_versions[perma_ref]['file_name'] + '.zim'
    try:
        zim_id = path_to_id_map[path]
        item = zims_installed[zim_id]
    except:
        print("Zim files and library.xml are out of sync. Please run iiab-make-kiwix-lib.")
        sys.exit(1)

    if len(item) != 0 or perma_ref == 'test':
        mediacount = item.get('mediaCount', '')
        articlecount = item.get('articleCount', '')
        size = item.get('size', '')
        tags = item.get('tags', '')
        zim_lang = item.get('language')
        menu_def_lang = iiab.kiwix_lang_to_iso2(zim_lang)
        date = item.get('date', '')
        return (articlecount, mediacount, size, tags, menu_def_lang, date)
    return ('0', '0', '0', '0', '0', '0')

# Menu Def functions

def get_menu_def_repo_data():
    repo_data = {}
    repo_data['defs'] = {}
    repo_data['html'] = {}
    repo_data ['icons']= {}

    response = requests.get(CONST.menu_def_base_url + 'contents/' + CONST.menu_def_path, headers=headers)
    file_list = json.loads(response._content)
    for item in file_list:
        if item['type'] == 'file':
            if item['name'].endswith('.json'):
                menu_item_def_name = item['name'].split('.json')[0] # trim .json
                repo_data['defs'][menu_item_def_name] = item
            elif item['name'].endswith('.html'):
                repo_data['html'][item['name']] = item

    response = requests.get(CONST.menu_def_base_url + 'contents/' + CONST.menu_def_icon_path, headers=headers)
    file_list = json.loads(response._content)
    for item in file_list:
        if item['type'] == 'file':
            repo_data['icons'][item['name']] = item

    return repo_data

def get_repo_menu_item_defs():
    menu_item_defs = {}
    response = requests.get(CONST.menu_def_base_url + 'contents/' + CONST.menu_def_path, headers=headers)
    menu_item_def_list = json.loads(response._content)
    for item in menu_item_def_list:
        if item['type'] == 'file':
            if '.json' in item['name']:
                menu_item_def_name = item['name'].split('.json')[0] # trim .json
                menu_item_defs[menu_item_def_name] = item
    return menu_item_defs

def get_local_menu_item_defs():
    menu_item_defs = {}
    menu_item_list = glob(CONST.js_menu_dir + 'menu-files/menu-defs/*.json')
    for item in menu_item_list:
        #print item
        try:
            with open(item, "r") as f:
                menu_item_def = json.load(f)
            menu_item_def_name = item.split('/')[-1].split('.')[0] # trim full path and .json
            menu_item_defs[menu_item_def_name] = menu_item_def
        except:
            print("Skipping corrupt " + item)
            pass
    return menu_item_defs

def get_menu_item_def_from_repo_by_name(menu_item_name):
    file_bytes, sha = get_github_file_by_name(CONST.menu_def_base_url, CONST.menu_def_path + menu_item_name + '.json')
    # of course we already had the sha
    menu_item_def = json.loads(file_bytes)
    menu_item_def['edit_status'] = 'repo'
    menu_item_def['commit_sha'] = sha
    return menu_item_def

def write_menu_item_def(menu_item_def_name, menu_item_def, change_ref='copy from repo', upload_flag=False, download_flag=True):
    # write menu def to file system
    # for generated menu defs upload is false and download true
    #print("Downloading Menu Item Definition - " + menu_item_def_name)

    target_file = CONST.js_menu_dir + 'menu-files/menu-defs/' + menu_item_def_name + '.json'
    menu_item_def['change_ref'] = change_ref
    menu_item_def['change_date'] = str(date.today())
    menu_item_def['upload_flag'] = upload_flag
    menu_item_def['download_flag'] = download_flag

    write_json_file(menu_item_def, target_file)

def format_menu_item_def(menu_item_def_name, menu_item_def):
    # list to reorder fields in future
    menu_def_field_order = [
        'lang',
        'intended_use',
        'zim_name',
        'moddir',
        'map_name',
        'kolibri_channel_id',
        'start_url',
        'title',
        'logo_url',
        'description',
        'extra_description',
        'extra_html',
        'footnote',
        'edit_status',
        'commit_sha',
        'previous_commit_sha',
        'change_ref',
        'change_date'
        ]
    formatted_menu_item_def = {}
    #formatted_menu_item_def = menu_item_def # future copy fields in above order
    formatted_menu_item_def['name'] = menu_item_def_name
    for field in menu_def_field_order:
        if field in menu_item_def:
            formatted_menu_item_def[field] = menu_item_def[field]
    return formatted_menu_item_def

def write_other_menu_item_def_files(menu_item_def):
    # download any extra_html and icon to file system
    # icon file (logo)
    if 'logo_url' in menu_item_def and menu_item_def['logo_url'] != '':
        icon_file = menu_item_def['logo_url']
        response_dict = get_github_file_data_by_name(CONST.menu_def_base_url, CONST.menu_def_icon_path + icon_file)
        if not response_dict:
            print("Icon File - " + icon_file + " not in repo")
        else:
            wget_menu_item_def_file_from_repo(response_dict['download_url'], CONST.js_menu_dir + 'menu-files/images/' + icon_file)
    # submenu file (extra_html)
    if 'extra_html' in menu_item_def and menu_item_def['extra_html'] != '':
        extra_html_file = menu_item_def['extra_html']
        response_dict = get_github_file_data_by_name(CONST.menu_def_base_url, CONST.menu_def_path + extra_html_file)
        if not response_dict:
            print("Extra Html File - " + extra_html_file + " not in repo")
        else:
            wget_menu_item_def_file_from_repo(response_dict['download_url'], CONST.js_menu_dir + 'menu-files/menu-defs/' + extra_html_file)

def wget_menu_item_def_file_from_repo(src_url, dest):
    # such as logo and extra html
    cmd = "/usr/bin/wget -c " + src_url + " -O " + dest
    print(cmd)
    outp = subprocess.check_output(cmd, shell=True)

def put_menu_item_def(menu_item_def_name, menu_item_def, sha=None):
    if 'commit_sha' in menu_item_def:
        menu_item_def['previous_commit_sha'] = menu_item_def['commit_sha']
    menu_item_def['commit_sha'] = None

    # this will order fields and remove ones not wanted in repo
    menu_item_def = format_menu_item_def(menu_item_def_name, menu_item_def)
    json_str = json.dumps(menu_item_def, ensure_ascii=False, indent=2)
    json_byte = json_str.encode('utf-8')
    path = CONST.menu_def_path + menu_item_def_name + '.json'
    response = put_github_file(CONST.menu_def_base_url, path, json_byte, sha)
    return response

def put_icon_file(icon_file, sha=None):
    with open(CONST.js_menu_dir + 'menu-files/images/' + icon_file, "rb") as f:
        byte_blob = f.read()
    path = CONST.menu_def_icon_path + icon_file
    response = put_github_file(CONST.menu_def_base_url, path, byte_blob, sha=sha)
    return response

def put_extra_html_file(extra_html_file, sha=None):
    with open(CONST.js_menu_dir + 'menu-files/menu-defs/' + extra_html_file, "rb") as f:
        byte_blob = f.read()
    path = CONST.menu_def_path + extra_html_file
    response = put_github_file(CONST.menu_def_base_url, path, byte_blob, sha=sha)
    return response


def get_github_file_by_name(menu_def_base_url, path):
    response_dict = get_github_file_data_by_name(menu_def_base_url, path)
    if response_dict:
        byte_content = str.encode(response_dict['content'])
        file_bytes = base64.b64decode(byte_content)
        #file_str = base64.decodestring(response_dict['content'])
        return file_bytes, response_dict['sha']
    else:
        return (None, None)

def get_github_file_data_by_name(menu_def_base_url, path):
    response = requests.get(menu_def_base_url + 'contents/' + path, headers=headers)
    if response.status_code != 200: # returns 404 if not found
        print(response.status_code)
        return None
    response_dict = json.loads(response._content)
    return response_dict

def put_github_file(menu_def_base_url, path, byte_blob, sha=None):
    file_content = base64.b64encode(byte_blob)
    file_content_str = file_content.decode("utf-8")
    commit_msg = path + " uploaded automatically from " + git_committer_handle
    payload = {
        "message": commit_msg,
        "committer": {
            "name": CONST.iiab_users_name,
            "email": CONST.iiab_users_email
        },
        "content": file_content_str
        }
    if sha:
        payload['sha'] = sha
    payload_json = json.dumps(payload)
    response = requests.put(menu_def_base_url + 'contents/' + path, data=payload_json, headers=headers)
    return response

def del_github_file(url, sha):
    commit_msg = url + " automatically deleted from " + git_committer_handle
    payload = {
        "message": commit_msg,
        "committer": {
            "name": CONST.iiab_users_name,
            "email": CONST.iiab_users_email
        },
        "sha": sha
        }
    payload_json = json.dumps(payload)
    response = requests.delete(url, data=payload_json, headers=headers)
    return response

def get_github_file_commits(path, repo_base_url=CONST.menu_def_base_url):
    response = requests.get(repo_base_url + 'commits?path=' + path + '&page=1&per_page=1', headers=headers)
    if response.status_code != 200: # returns 404 if not found
        print(response.status_code)
        return None
    response_dict = json.loads(response._content)
    return response_dict[0]

def get_github_all_commits(repo_base_url=CONST.menu_def_base_url):
    response = requests.get(repo_base_url + 'commits', headers=headers)
    if response.status_code != 200: # returns 404 if not found
        print(response.status_code)
        return None
    response_dict = json.loads(response._content)
    return response_dict

# OER3Go functions

# find missing menu defs
# what about newer modules?
# download icon, html, etc to working_dir
# parse html, cp files to js_menu_dir /downloads for manual processing
# put in live?
# create oer2go_catalog.json, mark downloaded with flag, mark blacklisted duplicates
# need to track which version of content was downloaded - new version attribute added 6/9/2017

def get_module_list(module_dir):
    exclude = ['en-test_mod']
    modules = []
    dir_list = [o for o in os.listdir(module_dir) if os.path.isdir(os.path.join(module_dir,o))]
    for dir in dir_list:
        if dir not in exclude:
            modules.append(dir)
    return modules

def get_module_status(module, verbose=False):
    # if the module is downloaded and there is no menu def return true else false
    is_downloaded = False
    has_menu_def = False

    moddir = module['moddir']
    module_id = module['module_id']

    # check if module downloaded
    if os.path.exists(CONST.iiab_modules_dir + moddir):
        msg = "Found download. Checking menudef for"
        is_downloaded = True
    else:
        msg = "No download for"

    if verbose:
        print("%s %s %s" % (msg, module_id, moddir))

    # check if menu def exists
    if os.path.exists(CONST.doc_root_menu_defs + moddir + '.json'):
        msg = "Found menudef for"
        has_menu_def = True
    else:
        msg = "No Menu Def for"
    if verbose:
        print("%s %s %s" % (msg, module_id, moddir))

    return(is_downloaded, has_menu_def)

def create_module_menu_def(module, working_dir, incl_extra_html=False):
    menu_item_name = module.get('moddir')
    menu_def = generate_module_menu_def(module)

    menu_def['logo_url'] = download_module_logo(module, working_dir)
    if incl_extra_html:
        htmlfile = generate_module_extra_html(module, working_dir)
        menu_def['extra_htm'] = htmlfile

    menu_def["edit_status"] = "generated"
    menu_def = format_menu_item_def(menu_item_name, menu_def)
    write_menu_item_def(menu_item_name, menu_def, change_ref='generated')
    return menu_item_name

def generate_module_menu_def(module):
    menu_def = {}
    menu_def['intended_use'] = 'html'
    moddir = module['moddir']
    menu_def["lang"] = module['lang']
    menu_def["title"] = module['title']
    menu_def["start_url"] = ''
    menu_def['moddir'] = moddir
    menu_def['description'] = module.get('description', '')
    menu_def['extra_description'] = ''

    size = float(module.get('ksize', '0')) * 1024.0
    size = iiab.human_readable(size)

    files = module.get('file_count', 'undefined')
    if files == None:
        files = ''
    age = module.get('age_range', 'undefined')
    if age == None:
        age = ''

    menu_def['footnote'] = "Size: " + size + ', Files: ' + str(files) + ', Age: ' + age

    return menu_def

def download_module_logo(module, working_dir):
    moddir = module['moddir']
    our_logo_file_name_base = moddir +'_logo.'
    # get logo if there is one
    moddir = module['moddir']
    logo_file_name = None
    got_logo = False
    if 'logo_url' in module and module['logo_url'] != None:
        logo_download_url = module['logo_url']
        #logo = module['logo_url']
        logo_ext = logo_download_url.split('/')[-1].split('.')[-1]
        our_logo_file_name = our_logo_file_name_base + logo_ext
        #logo = module['moddir'] + '.' + logo_ext
        if not os.path.isfile(CONST.iiab_menu_files + "images/" + our_logo_file_name):
            cmdstr = "wget -O " + CONST.iiab_menu_files + "images/" + our_logo_file_name + " " + logo_download_url
            try:
                rc = subproc_run(cmdstr)
                logo_file_name = our_logo_file_name
                got_logo = True
            except:
                pass

    if not got_logo and os.path.isdir(CONST.iiab_modules_dir + moddir): # if downloaded
        # look for logo in root of module
        #module['logo_url'] = None
        os.chdir(CONST.iiab_modules_dir + moddir)
        for filename in os.listdir('.'):
            if fnmatch.fnmatch(filename, '*.png')  or\
                fnmatch.fnmatch(filename, '*.gif')  or\
                fnmatch.fnmatch(filename, '*.jpg')  or\
                fnmatch.fnmatch(filename, '*.jpeg'):
                logo_ext = filename.split('/')[-1].split('.')[-1]
                our_logo_file_name = our_logo_file_name_base + logo_ext
                if not os.path.isfile(CONST.iiab_menu_files + "images/" + our_logo_file_name):
                    shutil.copyfile(CONST.iiab_modules_dir + moddir + '/' + filename,
                                    CONST.iiab_menu_files + "images/" + our_logo_file_name)
                logo_file_name = our_logo_file_name
                got_logo = True
    if not got_logo:
        # try to download it
        cmdstr = "rsync -Pavz " + module['rsync_url'] + "/logo.* " + working_dir
        try:
            rc = subproc_run(cmdstr)
            os.chdir(working_dir)
            for filename in os.listdir('.'):
                if fnmatch.fnmatch(filename, '*.png')  or\
                    fnmatch.fnmatch(filename, '*.gif')  or\
                    fnmatch.fnmatch(filename, '*.jpg')  or\
                    fnmatch.fnmatch(filename, '*.jpeg'):
                    logo_ext = filename.split('/')[-1].split('.')[-1]
                    our_logo_file_name = our_logo_file_name_base + logo_ext
                    if not os.path.isfile(CONST.iiab_menu_files + "images/" + our_logo_file_name):
                        shutil.copyfile(working_dir + filename,
                                        CONST.iiab_menu_files + "images/" + our_logo_file_name)
                        logo_file_name = our_logo_file_name
        except:
            pass

    return logo_file_name

def generate_module_extra_html(module, working_dir):
    # This is not really used any more and may not work
    # get rachel index for parsing for 'extra-html'
    # print "Downloading rachel-index.php"
    cmdstr = "rsync -Pavz " + module['rsync_url'] + "/rachel-index.php " + working_dir
    php_parser = re.compile('\<\?php echo .+? \?>')
    args = shlex.split(cmdstr)
    try:
        outp = subprocess.check_output(args)

        # look for ul list as submenu and create extra html file if exists
        with open(working_dir + "rachel-index.php", 'r') as fp:
            php = fp.read()

        # print php
        ulpos = php.find('<ul')
        divpos = php.find('</div>', ulpos)
        if ulpos != -1:
            htmlfile = module['moddir'] + '.html'
            php_frag = php[ulpos:divpos]
            #print php_frag
            html = re.sub(php_parser, "##HREF-BASE##", php_frag)
            with open(CONST.iiab_menu_download_dir + htmlfile, 'w') as fp:
                fp.write(html)
        os.remove(working_dir + "rachel-index.php")
    except:
        pass

    return htmlfile

# Menu Update Functions

def put_iiab_enabled_into_menu_json():
    cmd = "cat " + iiab.CONST.iiab_ini_file + " | grep True | grep _enabled | cut -d_ -f1"
    try:
        outp = subproc_check_output(cmd, shell=True)
    except subprocess.CalledProcessError as e:
        print(str(e))
        sys.exit(1)

    for iiab_option in outp.split('\n'):
        if iiab_option == 'kiwix': continue
        if iiab_option in CONST.iiab_menu_items:
            update_menu_json(CONST.iiab_menu_items[iiab_option], no_lang=True) # accept same item in a different language

def update_menu_json(new_item, no_lang=False):
    home_menu = read_json_file(CONST.menu_json_file, verbose=True, fix_json=True)
    # autoupdate_menu = home_menu.get('autoupdate_menu', False)
    # if not autoupdate_menu: # only update if allowed - the caller must handle this
    #    return

    # see what menu defs we have
    all_menu_defs = get_all_menu_defs()

    # remove any non-existent menu defs as a repair
    item_list = home_menu['menu_items_1']
    for item in item_list:
        if item not in all_menu_defs:
            home_menu['menu_items_1'].remove(item)
    write_json_file(home_menu, CONST.menu_json_path)

    # try to add new item
    if new_item not in all_menu_defs:
        return
    for item in home_menu['menu_items_1']:
        if item == new_item: # already there
            return
        if no_lang:
            if new_item[3:] in item:
                return # accept same item in a different language

    # new_item does not exist in list
    print("Adding %s to Menu"%new_item)
    last_item = home_menu['menu_items_1'].pop()
    # always keep credits last
    if last_item.find('credits') == -1:
        home_menu['menu_items_1'].append(last_item)
        home_menu['menu_items_1'].append(new_item)
    else:
        home_menu['menu_items_1'].append(new_item)
        home_menu['menu_items_1'].append(last_item)

    write_json_file(home_menu, CONST.menu_json_path)

def put_kiwix_enabled_into_menu_json():
    '''
    Put menu defs for all installed zims into Home Page menu
    Caller checks for autoupdate_menu == False
    Rules:
        Don't add test.zim unless it is the only zim installed
        If an installed zim's menu def is in the menu do nothing
        If not use a menu def of the form <zim language>-<zim permaref> if it exists
        If it does not exist create it
        There are some edge cases of non-canonical zim names that must be monitored
        Uses parameters of install zims in library.xml and zim_version_idx.json
        And paramters of install menu defs
        Creates additional working indices to aid lookups
    '''
    # make sure all zims in zims/content/ are in zim_versions_idx.json
    iiab.read_lang_codes() # initialize
    zim_menu_defs = get_all_menu_defs(filter='zim') # read zim menu defs

    zim_files, zim_versions = iiab.get_zim_list(iiab.CONST.zim_path)
    write_zim_versions_idx(zim_versions, iiab.CONST.kiwix_library_xml, CONST.zim_version_idx_dir, zim_menu_defs)
    zims_installed, path_to_id_map = iiab.read_library_xml(iiab.CONST.kiwix_library_xml)
    home_menu = read_json_file(CONST.menu_json_file, verbose=True, fix_json=True)

    # convenience lists of zim menudefs and permarefs already in menu
    zim_menudefs_in_menu = set()
    perma_refs_in_menu = set()
    for item in home_menu['menu_items_1']:
        if item in zim_menu_defs:
            zim_menudefs_in_menu.add(item)
            perma_refs_in_menu.add(zim_menu_defs[item]['zim_name'])

    # lists of zim menu defs by perma ref
    defs_per_perma_ref = {}
    for menu_def in zim_menu_defs:
        perma_ref = zim_menu_defs[menu_def]['zim_name']
        if perma_ref not in defs_per_perma_ref:
            defs_per_perma_ref[perma_ref] = []
        defs_per_perma_ref[perma_ref].append(menu_def)

    # list of zim languages converted to iso2 by perma ref
    zim_perma_ref_iso2 = {}
    for zim in zims_installed:
        perma_ref = iiab.calc_perma_ref(zims_installed[zim]['path']) # N.B. 4/25/2023 first use of this function
        zim_lang_code = zims_installed[zim]['language']
        zim_iso2_code = iiab.kiwix_lang_to_iso2(zim_lang_code)
        zim_perma_ref_iso2[perma_ref] = zim_iso2_code

    # use that data
    zim_idx = CONST.zim_version_idx_dir + CONST.zim_version_idx_file
    zim_versions_info = read_json_file(zim_idx)
    for perma_ref in zim_versions_info: # all installed zims OR use zims_installed
        # if other zims exist, do not add test zim
        if len(zim_versions_info) > 1 and perma_ref == 'tes':
            continue
        if perma_ref in perma_refs_in_menu: # already in menu
            continue

        # check if menu def exists for this perma_ref
        #num_defs =  len(defs_per_perma_ref[perma_ref])
        expected_name =  zim_perma_ref_iso2[perma_ref] + '-' + perma_ref.replace('.','_')

        if expected_name not in defs_per_perma_ref.get(perma_ref, []):
            # create canonical menu def name
            # we may later prefer to use an existing name that is not ideal but exists
            # as we did before
            new_def_name = expected_name
            path = zim_versions[perma_ref].get('file_name') + '.zim'
            zim_id = path_to_id_map['content/' + path]
            zim_info = zims_installed[zim_id]
            new_menu_def = generate_zim_menu_def(perma_ref, new_def_name, zim_info)
            new_menu_def = format_menu_item_def(new_def_name, new_menu_def)
            print("Creating %s"%new_def_name)
            write_menu_item_def(new_def_name, new_menu_def, change_ref='generated')
            menu_item_name = new_def_name
        update_menu_json(expected_name) # add to menu

def put_kiwix_enabled_into_menu_json_SAVE():
    # steps:
    #   1. Make sure all downloaded zims are in zim_verion_idx
    #   2. Look for a back link to perma_ref in menu_defs_dir
    #   3. If back link exist update, otherwise create new menuDef

    # check for un-indexed zims in zims/content/,write to zim_versions_idx.json
    iiab.read_lang_codes() # initialize
    zim_menu_defs = get_zim_menu_defs() # read all menu defs
    zim_files, zim_versions = iiab.get_zim_list(iiab.CONST.zim_path)
    write_zim_versions_idx(zim_versions, iiab.CONST.kiwix_library_xml, CONST.zim_version_idx_dir, zim_menu_defs)
    zims_installed, path_to_id_map = iiab.read_library_xml(iiab.CONST.kiwix_library_xml)

    # use that data
    zim_idx = CONST.zim_version_idx_dir + CONST.zim_version_idx_file
    if os.path.isfile(zim_idx):
        with open(zim_idx, "r") as zim_fp:
            zim_versions_info = json.loads(zim_fp.read())
            for perma_ref in zim_versions_info:
                #print(perma_ref)
                # if other zims exist, do not add test zim
                if len(zim_versions_info) > 1 and perma_ref == 'tes':
                    continue
                # check if menu def exists for this perma_ref
                menu_item_name = zim_menu_defs.get(perma_ref, {}).get('name')
                if menu_item_name == None: # no menu def points to this perma_ref
                    # create the canonical menu_item name
                    lang = zim_versions_info[perma_ref].get('language', 'en')
                    new_def_name = lang + '-' + perma_ref
                    new_def_name = new_def_name.replace('.', '_') # handle embedded '.'
                    if new_def_name in zim_menu_defs: # name already taken
                        new_def_name += '1' # OK this could exist too, but really

                    path = zim_versions[perma_ref].get('file_name') + '.zim'
                    zim_id = path_to_id_map['content/' + path]
                    zim_info = zims_installed[zim_id]
                    new_menu_def = generate_zim_menu_def(perma_ref, new_def_name, zim_info)
                    new_menu_def = format_menu_item_def(new_def_name, new_menu_def)
                    print("Creating %s"%new_def_name)
                    write_menu_item_def(new_def_name, new_menu_def, change_ref='generated')
                    menu_item_name = new_def_name
                update_menu_json(menu_item_name) # add to menu


def generate_zim_menu_def(perma_ref, menu_def_name, zim_info):
    # this looks only to be used by zims
    # do not generate a menuDef for the test zim
    if perma_ref == 'tes': return ""

    zim_lang = zim_info['language']
    menu_def_lang = iiab.kiwix_lang_to_iso2(zim_lang)
    #filename = menu_def_lang + '-' + perma_ref + '.json'
    # create a stub for this zim
    menu_def = {}
    default_logo = get_default_logo(perma_ref, menu_def_lang)
    menu_def["intended_use"] = "zim"
    menu_def["lang"] = menu_def_lang
    menu_def["logo_url"] = default_logo
    #menuitem = menu_def_lang + '-' + perma_ref
    menu_def["menu_item_name"] = menu_def_name
    menu_def["title"] = zim_info.get('title', '')
    menu_def["zim_name"] = perma_ref
    menu_def["start_url"] = ''
    menu_def["description"] = zim_info.get('description', '')
    menu_def["extra_description"] = ""
    menu_def["extra_html"] = ""
    menu_def["footnote"] = 'Size: ##SIZE##, Articles: ##ARTICLE_COUNT##, Media: ##MEDIA_COUNT##, Date: ##zim_date##'

    menu_def["edit_status"] = "generated"

    #if not os.path.isfile(menu_defs_dir + default_name): # logic to here can still overwrite existing menu def
    #    print(("creating %s"%menu_defs_dir + default_name))
    #    with open(menu_defs_dir + default_name,'w') as menufile:
    #        menufile.write(json.dumps(menuDef,indent=2))

    return menu_def

def get_default_logo(logo_selector, lang):
    # Note we could also get the logo for a zim out of the catalog
    #  Select the first part of the selector
    short_selector = logo_selector[:logo_selector.find('_')]
    # give preference to language if present
    rtn = check_everything(short_selector)
    if rtn == '':
        # try for a match without language prefix
        nolang_selector = short_selector[3:]
        rtn = check_everything(nolang_selector)
        if rtn == '':
            # Maybe logo is present in en-- check for en-<selector>
            en_default = "en-" + short_selector
            rtn = check_everything(en_default)
            if rtn == '':
                # add more checks here
                return ''
            else:
                return rtn
        else:
            return rtn
    else:
        return rtn

def check_everything(selector):
    rtn = check_default_logos(selector)
    if rtn == '':
        return check_jpg_png(selector)
    else:
        return rtn

def check_default_logos(selector):
    default_logos = {
        "wiktionary":"en-wiktionary.png",
        "wikivoyage":"en-wikivoyage.png",
        "wikinews":"wikinews-logo.png",
        "wiktionary":"en-wiktionary.png",
        "wikipedia":"en-wikipedia.png",
        "phet_en":"phet-logo-48x48.png",
        "wikem":"WikEM-Logo-m.png"
    }
    for logo in default_logos:
        #print("logo: %s  selector: %s"%(logo, selector))
        if logo.startswith(selector):
            return default_logos[logo]
    if selector.find('stackexchange') > -1:
        return "stackexchange.png"
    return 'content.jpg'
    #return 'spiffygif_60x60.gif'

def check_jpg_png(selector):
    # check for a png or jpg with same selector
    menu_images_dir = CONST.menu_images_dir
    if os.path.isfile(menu_images_dir + selector + '.jpg'):
        return selector + '.jpg'
    if os.path.isfile(menu_images_dir + selector.lower() + '.jpg'):
        return selector.lower() + '.jpg'
    if os.path.isfile(menu_images_dir + selector + '.png'):
        return selector + '.png'
    if os.path.isfile(menu_images_dir + selector.lower() + '.png'):
        return selector.lower()+ '.png'
    return ''

# Update Map Functions

def read_maps_catalog():
    catalog = read_json_file(CONST.adm_maps_catalog_path)
    return catalog

def get_map_regions():
    regions = {}
    catalog = read_json_file(CONST.adm_maps_catalog_path)
    for tile_set in catalog['maps']:
        region = tile_set['region']
        regions[region] = tile_set['title']

    return regions

#def get_map_catalog(): - not used
#    global map_catalog
#    input_json = CONST.map_doc_root + '/maplist/assets/regions.json'
#    with open(input_json, 'r') as regions:
#        reg_str = regions.read()
#        map_catalog = json.loads(reg_str)
#    print(json.dumps(map_catalog, indent=2))

def get_map_menu_defs(intended_use='map'):
    menu_def_list = []
    os.chdir(CONST.menu_def_dir)
    for filename in os.listdir('.'):
        if fnmatch.fnmatch(filename, '*.json'):
            try:
                with open(filename, 'r') as json_file:
                    readstr = json_file.read()
                    data = json.loads(readstr)
            except:
                print("Failed to parse %s"%filename)
                print(readstr)
            if data.get('intended_use', '') != intended_use:
                continue
            map_name = data.get('map_name', '')
            if map_name != '':
                menu_def_list.append(map_name)
    return menu_def_list

def get_installed_regions():
    installed = []
    os.chdir(CONST.map_doc_root)
    for filename in os.listdir('.'):
        if fnmatch.fnmatch(filename, '??-osm-omt*'):
            region = re.sub(r'^..-osm-..._(.*)', r'\1', filename)
            installed.append(region)
    # add the splash page if no other maps are present
    if len(installed) == 0:
        installed.append('maplist')
    return installed

def read_vector_map_idx():
    global previous_idx
    try: # will fail first time
        previous_idx = read_json(CONST.vector_map_idx_dir + '/vector-map-idx.json')
        return previous_idx
    except:
        pass
        return {}

def write_vector_map_idx(installed_maps):
    map_dict = {}
    idx_dict = {}
    for fname in installed_maps:
        region = extract_region_from_filename(fname)
        if region == 'maplist': continue # not a real region
        map_dict = map_catalog['regions'].get(region, '')
        if map_dict == '': continue

        # Create the idx file in format required bo js-menu system
        item = map_dict['perma_ref']
        idx_dict[item] = {}
        idx_dict[item]['file_name'] = os.path.basename(map_dict['url'][:-4])
        idx_dict[item]['menu_item_name'] = map_dict['perma_ref']
        idx_dict[item]['size'] = map_dict['size']
        idx_dict[item]['date'] = map_dict['date']
        idx_dict[item]['region'] = region
        idx_dict[item]['language'] = map_dict['perma_ref'][:2]

    with open(CONST.vector_map_idx_dir + '/vector-map-idx.json', 'w') as idx:
        idx.write(json.dumps(idx_dict, indent=2))

def create_map_menu_def(region, menu_item_name, map_item, intended_use='map'):
    print('in create_map_menu_def')
    print(region, menu_item_name, map_item)
    if len(map_item.get('language', '')) > 2:
        lang = map_item['language'][:2]
    else: # default to english
        lang = 'en'
    filename = menu_item_name + '.json'

    # create a stub for this map
    menu_def = {}
    default_logo = 'osm.jpg'
    menu_def["intended_use"] = "map"
    menu_def["lang"] = lang
    menu_def["logo_url"] = default_logo
    #menuitem = lang + '-' + item['perma_ref']
    print(menu_def)
    #menu_def["menu_item_name"] = default_name

    if map_item.get('title', 'ERROR') == "World":
        fancy_title = "Planet Earth"
    elif map_item.get('title', 'ERROR') == "Central America":
        fancy_title = "Central America-Caribbean"
    else:
        fancy_title = map_item.get('title', 'ERROR')

    if fancy_title == "Planet Earth":
        menu_def["title"] = "OpenStreetMap: " + fancy_title
    else:
        menu_def["title"] = "OpenStreetMap: " + fancy_title + " & Earth"

    menu_def["map_name"] = map_item['perma_ref']
    # the following is in the idx json
    #menuDef["file_name"] = lang + '-osm-omt_' + region + '_' + os.path.basename(item['url'])[:-4]
    menu_def["description"] = '19 levels of zoom (~1 m details) for ' + fancy_title + ', illustrating human geography.<p>10 levels of zoom (~1 km details) for satellite photos, covering the whole world.'
    menu_def["extra_description"] = 'Search for cities/towns with more than 1000 people.  There are about 127,654 worldwide.'
    menu_def["extra_html"] = ""
    menu_def["edit_status"] = "generated"

    menu_def = format_menu_item_def(menu_item_name, menu_def)
    write_menu_item_def(menu_item_name, menu_def, change_ref='generated')

def extract_region_from_filename(fname):
    # find the index of the date
    nibble = re.search(r"\d{4}-\d{2}-\d{2}", fname)
    if nibble:
        fname = fname[:nibble.start()-1]
        return fname
    else:
        return "maplist"

# Misc

def get_roles_status():
    roles_status = {}
    state = read_yaml(IIAB_CONST.iiab_state_file)
    for role in CONST.iiab_roles:
        roles_status[role] = {}
        roles_status[role]['installed'] = state.get(role + '_installed', False)
        stat_src = CONST.iiab_roles[role].get('stat_src')
        if stat_src == 'service':
            roles_status[role]['enabled'] = is_role_service_enabled(role)
            roles_status[role]['active'] = is_role_service_active(role)
        elif stat_src == 'nginx':
            roles_status[role]['enabled'] = is_role_nginx_enabled(role)
            roles_status[role]['active'] = roles_status[role]['enabled'] # assumes nginx is running
        elif stat_src == 'install':
            roles_status[role]['enabled'] = roles_status[role]['installed']
            roles_status[role]['active'] = roles_status[role]['enabled']
        elif stat_src == 'apache':
            roles_status[role]['enabled'] = False # for now we don't install apache
            roles_status[role]['active'] = False
    return roles_status

def is_role_service_enabled(role):
    rc = subproc_run('systemctl is-enabled ' + CONST.iiab_roles[role]['stat_arg'])
    if rc.returncode:
        return False
    else:
        return True

def is_role_service_active(role):
    rc = subproc_run('systemctl is-active ' + CONST.iiab_roles[role]['stat_arg'])
    if rc.returncode:
        return False
    else:
        return True

def is_role_nginx_enabled(role):
    if os.path.exists('/etc/nginx/conf.d/' + CONST.iiab_roles[role]['stat_arg']):
        return True
    else:
        return False

def pcgvtd9():
    global headers
    global git_committer_handle
    response = requests.get(CONST.iiab_pat_url)
    data = json.loads(response._content)
    headers = {'Content-Type':'application/json',
               'Authorization': 'token ' + data['pat']}
    git_committer_handle = data['iiab_user_ip']

def fetch_menu_json_value(key):
    menu_json = read_json_file(CONST.menu_json_file, fix_json=True)
    return menu_json.get(key, '')

def read_json(file_path): # alias that takes default
    return read_json_file(file_path)

def read_json_file(file_path, verbose=False, fix_json=False):
    '''
    As of 4/16/2023 a small percentage of users (< 1%)
    have experienced a corrupt menu.json file.
    See https://github.com/iiab/iiab/issues/3487
    This function now optionally patches the json before converting.
    Note that this function does not update the json file.
    That will be done in update_menu_json if autoupdate_menu is true (default)
    '''
    try:
        with open(file_path, 'r') as json_file:
            readstr = json_file.read()
            json_dict = json.loads(readstr)
        return json_dict
    except OSError as e:
        if verbose:
            print('Unable to read json file', e)
        raise e
    except json.JSONDecodeError as e:
        if verbose:
            print('Unable to parse json file', e)
        if fix_json:
            fixed_str = e.doc[:e.pos-1]
            try:
                json_dict = json.loads(fixed_str)
                if verbose:
                    print('WARNING: ' + file_path + ' Patched in memory but not updatged.')
                return json_dict
            except json.JSONDecodeError as e2:
                if verbose:
                    print('Unable to repair json file', e)
                raise e
        else:
            raise e

def write_iiab_local_vars(delta_vars, strip_comments=False, strip_defaults=False):
    output_lines = merge_local_vars(IIAB_CONST.iiab_local_vars_file, delta_vars, strip_comments=strip_comments, strip_defaults=strip_defaults)
    with open(IIAB_CONST.iiab_local_vars_file, 'w') as f:
        for line in output_lines:
            f.write(line)

def merge_local_vars(target_vars_file, delta_vars, strip_comments=False, strip_defaults=False):
    default_vars_file = IIAB_CONST.iiab_repo_dir + '/vars/default_vars.yml'
    local_vars_lines = []
    output_lines = []
    local_vars = {}
    default_vars = {}
    defined = {}
    undefined = {}
    remove_defaults = []
    separator_found = False

    local_vars = read_yaml(target_vars_file)
    with open(target_vars_file) as f:
        local_vars_lines = f.readlines()

    default_vars = read_yaml(default_vars_file)
    if strip_defaults:
        for key in local_vars:
            if local_vars[key] == default_vars.get(key, None):
                remove_defaults.append(key)

    for key in delta_vars:
        if strip_defaults: # remove any keys that have default value
            if delta_vars[key] == default_vars.get(key, None):
                continue
        if key in local_vars:
           defined[key] = delta_vars[key]
        else:
           undefined[key] = delta_vars[key]

    for line in local_vars_lines:
        hash_pos = line.find('#')
        if hash_pos == 0:
            if not strip_comments:
                output_lines.append(line)
            if line.startswith("# IIAB -- following variables"):
                separator_found = True
            continue

        for key in defined:
            key_pos = line.find(key)
            if key_pos < 0:
                continue
            else:
                if hash_pos != -1 and hash_pos < key_pos: # key is commented
                    continue
                else: # substitute delta value
                    line = line.replace(str(local_vars[key]), str(defined[key]))
        # at this point substitutions are done

        copy_line = True
        if strip_comments and line == '\n':
            copy_line = False
        if strip_comments and hash_pos > 0 and line[:hash_pos].isspace(): # indented comment line
            copy_line = False
        if copy_line: # still not rid of this line?
            for key in remove_defaults: # skip keys marked for removal
                key_pos = line.find(key)
                if key_pos < 0:
                    continue
                else:
                    copy_line = False
                    break

        if copy_line:
            output_lines.append(line)

    if not separator_found:
        output_lines.append("\n\n############################################################################\n")
        output_lines.append("# IIAB -- following variables are first set by browser via the Admin Console\n")
        output_lines.append("#  They may be changed via text editor, or by the Admin Console.\n\n")

    for key in undefined:
        line = str(key) + ': ' + str(undefined[key])
        line += '\n'
        output_lines.append(line)

    return output_lines

# duplicates cmdsrv - but now revised

def write_json_file(src_dict, target_file, sort_keys=False):
    try:
        with open(target_file, 'w', encoding='utf8') as json_file:
            json.dump(src_dict, json_file, ensure_ascii=False, indent=2, sort_keys=sort_keys)
            json_file.write("\n")  # Add newline cause Py JSON does not
    except OSError as e:
        raise

def read_yaml(file_name, loader=yaml.SafeLoader):
    try:
        with open(file_name, 'r') as f:
            y = yaml.load(f, Loader=loader)
            if y == None: # file is empty
                y = {}
            return y
    except:
        raise

def jinja2_subst(src_dict, dflt_dict=None):
    # assumes all substitution variables are in src_dict or dflt
    # if not substitution will be a zero length string
    dest_dict = {}
    if not dflt_dict:
        lookup_dict = src_dict
    else:
        lookup_dict = {**dflt_dict,**src_dict}

    for k, v in src_dict.items():
        try:
            t = jinja2.Template(v)
            dest_dict[k] = t.render(lookup_dict)
        except:
            dest_dict[k] = v
    return dest_dict

def subproc_run(cmdstr, shell=False, check=False):
    args = shlex.split(cmdstr)
    try:
        compl_proc = subprocess.run(args, shell=shell, check=check,
                                    universal_newlines=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except:
        raise
    return compl_proc

def subproc_cmd(cmdstr, shell=False):
    args = shlex.split(cmdstr)
    outp = subproc_check_output(args, shell=shell)
    return (outp)

def subproc_check_output(args, shell=False):
    try:
        outp = subprocess.check_output(args, shell=shell, universal_newlines=True, encoding='utf8')
    except:
        raise
    return outp
