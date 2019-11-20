# adm_lib.py
# common functions for Admin Console
# IIAB functions are in iiab_lib.py

import os, sys, syslog
from glob import glob
import requests
import json
import subprocess
import shlex
from datetime import date
import base64
import fnmatch
import iiab.adm_const as cons
import iiab.iiab_lib as iiab

headers = {}

# ZIM functions

def write_zim_versions_idx(zim_versions, kiwix_library_xml, zim_version_idx_dir):
    zims_installed, path_to_id_map = iiab.read_library_xml(kiwix_library_xml)
    zim_menu_defs = get_zim_menu_defs()

    # drives off of zim_versions which is what is in file system

    for perma_ref in zim_versions:
        zim_versions[perma_ref]['menu_item'] = zim_menu_defs.get(perma_ref, {}).get('name')
        articlecount,mediacount,size,tags,lang,date = \
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
        with open(zim_version_idx_dir + cons.zim_version_idx_file, 'w') as fp:
            fp.write(json.dumps(zim_versions,indent=2 ))
            fp.close()
    else:
        print (zim_version_idx_dir + " not found.")

def get_zim_menu_defs():
    zim_menu_defs = {}
    for filename in os.listdir(cons.menu_def_dir):
        if fnmatch.fnmatch(filename, '*.json'):
            #print (filename)
            menu_def = {}
            try:
                with open(cons.menu_def_dir + filename,'r') as json_file:
                    readstr = json_file.read()
                menu_def = json.loads(readstr)
            except:
                print("failed to parse %s"%filename)
                print(readstr)
                pass
            #print(menu_def)
            if menu_def.get('intended_use','') != 'zim':
                continue
            perma_ref = menu_def.get('zim_name','')
            if perma_ref != '':
                zim_menu_defs[perma_ref] = menu_def
    return zim_menu_defs

def get_substitution_data(perma_ref, zim_versions, zims_installed, path_to_id_map):
    #reconstruct the path in the id map
    path = 'content/' + zim_versions[perma_ref]['file_name'] + '.zim'
    id = path_to_id_map[path]
    item = zims_installed[id]

    if len(item) != 0 or perma_ref == 'test':
        mediacount = item.get('mediaCount','')
        articlecount = item.get('articleCount','')
        size = item.get('size','')
        tags = item.get('tags','')
        zim_lang = item.get('language')
        menu_def_lang = iiab.kiwix_lang_to_iso2(zim_lang)
        date =  item.get('date','')
        return (articlecount,mediacount,size,tags,menu_def_lang,date)
    return ('0','0','0','0','0','0')

# Menu Def functions

def get_repo_menu_item_defs():
    menu_item_defs = {}
    response = requests.get(cons.menu_def_base_url + 'contents/' + cons.menu_def_path, headers=headers)
    menu_item_def_list = json.loads(response._content)
    for item in menu_item_def_list:
        if item['type'] == 'file':
            if '.json' in item['name']:
                menu_item_def_name =  item['name'].split('.json')[0] # trim .json
                menu_item_defs[menu_item_def_name] = item
    return (menu_item_defs)

def get_local_menu_item_defs():
    menu_item_defs = {}
    menu_item_list = glob(cons.js_menu_dir + 'menu-files/menu-defs/*.json')
    for item in menu_item_list:
        #print item
        try:
            with open(item,"r") as f:
                menu_item_def = json.load(f)
            menu_item_def_name =  item.split('/')[-1].split('.')[0] # trim full path and .json
            menu_item_defs[menu_item_def_name] = menu_item_def
        except:
            print("Skipping corrupt " + item)
            pass
    return (menu_item_defs)

def get_menu_item_def_from_repo_by_name(menu_item_name):
    file_bytes, sha = get_github_file_by_name(cons.menu_def_base_url, cons.menu_def_path + menu_item_name + '.json')
    # of course we already had the sha
    menu_item_def = json.loads(file_bytes)
    menu_item_def['edit_status'] = 'repo'
    menu_item_def['commit_sha'] = sha
    return (menu_item_def)

def write_menu_item_def(menu_item_def_name, menu_item_def):
    # write menu def to file system
    #print("Downloading Menu Item Definition - " + menu_item_def_name)

    target_file = cons.js_menu_dir + 'menu-files/menu-defs/' + menu_item_def_name + '.json'
    menu_item_def['change_ref'] = 'copy from repo'
    menu_item_def['change_date'] = str(date.today())
    write_json_file(menu_item_def, target_file)

def format_menu_item_def(menu_item_def_name, menu_item_def):
    # list to reorder fields in future
    menu_def_field_order = [
        'lang',
        'intended_use',
        'zim_name',
        'moddir',
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
        response_dict = get_github_file_data_by_name(cons.menu_def_base_url, cons.menu_def_icon_path + icon_file)
        if not response_dict:
            print("Icon File - " + icon_file + " not in repo")
        else:
            wget_menu_item_def_file_from_repo(response_dict['download_url'], cons.js_menu_dir + 'menu-files/images/' + icon_file)
    # submenu file (extra_html)
    if 'extra_html' in menu_item_def and menu_item_def['extra_html'] != '':
        extra_html_file = menu_item_def['extra_html']
        response_dict = get_github_file_data_by_name(cons.menu_def_base_url, cons.menu_def_path + extra_html_file)
        if not response_dict:
            print("Extra Html File - " + extra_html_file + " not in repo")
        else:
            wget_menu_item_def_file_from_repo(response_dict['download_url'], cons.js_menu_dir + 'menu-files/menu-defs/' + extra_html_file)

def wget_menu_item_def_file_from_repo(src_url, dest):
    cmd = "/usr/bin/wget -c " + src_url + " -O " + dest
    print(cmd)
    args = shlex.split(cmd)
    outp = subprocess.check_output(cmd,shell=True)
    # still need logo and extra html

def put_menu_item_def(menu_item_def_name, menu_item_def, sha=None):
    # Upload any icon
    if 'logo_url' in menu_item_def and menu_item_def['logo_url'] != '':
        put_icon_file(menu_item_def['logo_url'])

    # Upload any extra_html
    if 'extra_html' in menu_item_def and menu_item_def['extra_html'] != '':
        put_extra_html_file(menu_item_def['extra_html'])

    # Now do menu item def
    if 'commit_sha' in menu_item_def:
        menu_item_def['previous_commit_sha'] = menu_item_def['commit_sha']
    menu_item_def['commit_sha'] = None
    menu_item_def = format_menu_item_def(menu_item_def_name, menu_item_def)
    json_str = json.dumps(menu_item_def, ensure_ascii=False, indent=2)
    json_byte = json_str.encode('utf-8')
    path = cons.menu_def_path + menu_item_def_name + '.json'
    response = put_github_file(cons.menu_def_base_url, path, json_byte, sha)
    return response

def put_icon_file(icon_file):
    with open(cons.js_menu_dir + 'menu-files/images/' + icon_file, "rb") as f:
        byte_blob = f.read()
    path = cons.menu_def_icon_path + icon_file
    response = put_github_file(cons.menu_def_base_url, path, byte_blob)
    return response

def put_extra_html_file(extra_html_file):
    with open(cons.js_menu_dir + 'menu-files/menu-defs/' + extra_html_file, "rb") as f:
        byte_blob = f.read()
    path = cons.menu_def_path + extra_html_file
    response = put_github_file(cons.menu_def_base_url, path, byte_blob)
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
        return (None)
    response_dict = json.loads(response._content)
    return response_dict

def put_github_file(menu_def_base_url, path, byte_blob, sha=None):
    file_content = base64.b64encode(byte_blob)
    file_content_str = file_content.decode("utf-8")
    commit_msg = path + " uploaded automatically"
    payload = {
        "message": commit_msg,
        "committer": {
            "name": cons.iiab_users_name,
            "email": cons.iiab_users_email
        },
        "content": file_content_str
        }
    if sha:
        payload['sha'] = sha
    payload_json = json.dumps(payload)
    response = requests.put(menu_def_base_url + 'contents/' + path, data=payload_json, headers=headers)
    return response

# OER3Go functions

# find missing menu defs
# what about newer modules?
# download icon, html, etc to working_dir
# parse html, cp files to js_menu_dir /downloads for manual processing
# put in live?
# create oer2go_catalog.json, mark downloaded with flag, mark blacklisted duplicates
# need to track which version of content was downloaded - new version attribute added 6/9/2017

def get_status (item):
    msg = ''
    id = item['module_id']
    item['module_downloaded'] = False
    item['has_live_menudef'] = False
    item['has_wip_menudef'] = False
    item['has_redundant_menudef'] = False

    moddir = item['moddir']

    # check if module downloaded
    if os.path.exists(iiab_modules_dir + moddir):
        item['module_downloaded'] = True
        msg = "Found download. Checking menudef for"
        gen_new_menudef = True
    else:
        msg = "No download for"
        gen_new_menudef = False

    if verbose:
        print("%s %s %s" % (msg, id, moddir))

    # check if menu def exists
    if os.path.exists(doc_root_menu_defs + moddir + '.json'):
        msg = "Found menudef for"
        item['has_live_menudef'] = True
        gen_new_menudef = False
    else:
        msg = "No menudef for"

    # we don't need this complexity; should be a utility in iiab-factory
    #elif os.path.exists(iiab_menu_repo_dir +  'incompatible/wip/' + moddir + '.json'):
    #    msg = "WIP menudef for"
    #    item['has_wip_menudef'] = True
    #    gen_new_menudef = False
    #elif os.path.exists(iiab_menu_repo_dir +  'incompatible/rachel-duplicates/' + moddir + '.json'):
    #    msg = "Redundant menudef for"
    #    item['has_redundant_menudef'] = True
    #    gen_new_menudef = False

    if verbose:
        print("%s %s %s" % (msg, id, moddir))

    return(item, gen_new_menudef)

def proc_module (module):
    # create menu item files:
    # download icon
    # download htmlf
    # create menudef json file
    # create menudef extra html file

    menu_item = module
    menu_item['intended_use'] = 'html'
    moddir = module['moddir']
    menu_item['menu_item_name'] = moddir
    size = float(module.get('ksize','0')) * 1000.0
    size = tools.human_readable(size)
    menu_item['size'] = size
    files = module.get('file_count','undefined')
    if files == None:
        files = ''
    age = module.get('age_range','undefined')
    if age == None:
        age = ''
    menu_item['description'] = module.get('description','')
    menu_item['extra_description'] = ''
    menu_item['footnote'] = "Size: " + size + ', Files: ' + files + ', Age: ' + age

    # get logo if there is one
    if 'logo_url' in module and module['logo_url'] != None:
        logo_download_url = module['logo_url']
        logo = module['logo_url']
        logo_ext = logo.split('/')[-1].split('.')[-1]
        logo = module['moddir'] + '.' + logo_ext
        menu_item['logo_url'] = logo
        if not os.path.isfile(iiab_menu_files + "images/" + logo):
            cmdstr = "wget -O " + iiab_menu_files + "images/" + logo + " " + logo_download_url
            args = shlex.split(cmdstr)
            outp = subprocess.check_output(args)
    else:
        # look for logo in root of module
        module['logo_url'] = None
        os.chdir(iiab_modules_dir + moddir)
        for filename in os.listdir('.'):
            if fnmatch.fnmatch(filename, '*.png')  or\
               fnmatch.fnmatch(filename, '*.gif')  or\
               fnmatch.fnmatch(filename, '*.jpg')  or\
               fnmatch.fnmatch(filename, '*.jpeg'):
                if not os.path.isfile(iiab_menu_files + "images/" + moddir + filename):
                    shutil.copyfile(iiab_modules_dir + moddir + '/' + filename,\
                                    iiab_menu_files + "images/" + moddir +'_'+ filename)
                module['logo_url'] = moddir + '_' + filename

    # get rachel index for parsing for 'extra-html'
    #print "Downloading rachel-index.php"
    cmdstr = "rsync -Pavz " + menu_item['rsync_url'] + "/rachel-index.php " + working_dir
    args = shlex.split(cmdstr)
    try:
        outp = subprocess.check_output(args)

        # look for ul list as submenu and create extra html file if exists
        with open(working_dir + "rachel-index.php", 'r') as fp:
            php = fp.read()

        # print php
        ulpos = php.find('<ul')
        divpos = php.find('</div>',ulpos)
        if ulpos != -1:
            htmlfile = moddir + '.html'
            php_frag = php[ulpos:divpos]
            #print php_frag
            html = re.sub(php_parser,"##HREF-BASE##", php_frag)
            with open(iiab_menu_download_dir + htmlfile, 'w') as fp:
                fp.write(html)
            menu_item['extra_html'] = htmlfile
        os.remove(working_dir + "rachel-index.php")
    except:
        pass
    with open(iiab_menu_download_dir + moddir + '.json', 'w') as fp:
        json.dump(menu_item, fp, indent=2)

    if not os.path.exists(doc_root_menu_defs + moddir + '.json'):
        # as per discussion, put menu-def (minus html) into menu-defs
        menu_item['extra_html'] = ''
        menu_item["change_ref"] = "generated"
        menu_item["change_date"] = str(date.today())
        print(("writing to %s"%doc_root_menu_defs + moddir + '.json'))
        with open(doc_root_menu_defs + moddir + '.json', 'w') as fp:
            json.dump(menu_item, fp, indent=2)
        menu_item['has_live_menudef'] = True

    return menu_item

# Misc

def pcgvtd9():
    global headers
    response = requests.get(cons.iiab_pat_url)
    dict = json.loads(response._content)
    headers={'Content-Type':'application/json',
             'Authorization': 'token ' + dict['pat']}

# duplicates cmdsrv - but now revised

def write_json_file(dict, target_file, sort_keys=False):
    try:
        with open(target_file, 'w', encoding='utf8') as json_file:
            json.dump(dict, json_file, ensure_ascii=False, indent=2, sort_keys=sort_keys)
            json_file.write("\n")  # Add newline cause Py JSON does not
    except OSError as e:
        raise
