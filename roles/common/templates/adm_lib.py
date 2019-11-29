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
import re

import iiab.iiab_lib as iiab
import iiab.adm_const as CONST

headers = {}
map_catalog = {}

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
        with open(zim_version_idx_dir + CONST.zim_version_idx_file, 'w') as fp:
            fp.write(json.dumps(zim_versions,indent=2 ))
            fp.close()
    else:
        print (zim_version_idx_dir + " not found.")

def get_zim_menu_defs():
    zim_menu_defs = {}
    for filename in os.listdir(CONST.menu_def_dir):
        if fnmatch.fnmatch(filename, '*.json'):
            #print (filename)
            menu_def = {}
            try:
                with open(CONST.menu_def_dir + filename,'r') as json_file:
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
    response = requests.get(CONST.menu_def_base_url + 'contents/' + CONST.menu_def_path, headers=headers)
    menu_item_def_list = json.loads(response._content)
    for item in menu_item_def_list:
        if item['type'] == 'file':
            if '.json' in item['name']:
                menu_item_def_name =  item['name'].split('.json')[0] # trim .json
                menu_item_defs[menu_item_def_name] = item
    return (menu_item_defs)

def get_local_menu_item_defs():
    menu_item_defs = {}
    menu_item_list = glob(CONST.js_menu_dir + 'menu-files/menu-defs/*.json')
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
    file_bytes, sha = get_github_file_by_name(CONST.menu_def_base_url, CONST.menu_def_path + menu_item_name + '.json')
    # of course we already had the sha
    menu_item_def = json.loads(file_bytes)
    menu_item_def['edit_status'] = 'repo'
    menu_item_def['commit_sha'] = sha
    return (menu_item_def)

def write_menu_item_def(menu_item_def_name, menu_item_def):
    # write menu def to file system
    #print("Downloading Menu Item Definition - " + menu_item_def_name)

    target_file = CONST.js_menu_dir + 'menu-files/menu-defs/' + menu_item_def_name + '.json'
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
    path = CONST.menu_def_path + menu_item_def_name + '.json'
    response = put_github_file(CONST.menu_def_base_url, path, json_byte, sha)
    return response

def put_icon_file(icon_file):
    with open(CONST.js_menu_dir + 'menu-files/images/' + icon_file, "rb") as f:
        byte_blob = f.read()
    path = CONST.menu_def_icon_path + icon_file
    response = put_github_file(CONST.menu_def_base_url, path, byte_blob)
    return response

def put_extra_html_file(extra_html_file):
    with open(CONST.js_menu_dir + 'menu-files/menu-defs/' + extra_html_file, "rb") as f:
        byte_blob = f.read()
    path = CONST.menu_def_path + extra_html_file
    response = put_github_file(CONST.menu_def_base_url, path, byte_blob)
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

# OER3Go functions

# find missing menu defs
# what about newer modules?
# download icon, html, etc to working_dir
# parse html, cp files to js_menu_dir /downloads for manual processing
# put in live?
# create oer2go_catalog.json, mark downloaded with flag, mark blacklisted duplicates
# need to track which version of content was downloaded - new version attribute added 6/9/2017

def get_status (item, verbose = False):
    msg = ''
    id = item['module_id']
    item['module_downloaded'] = False
    item['has_live_menudef'] = False
    item['has_wip_menudef'] = False
    item['has_redundant_menudef'] = False

    moddir = item['moddir']

    # check if module downloaded
    if os.path.exists(CONST.iiab_modules_dir + moddir):
        item['module_downloaded'] = True
        msg = "Found download. Checking menudef for"
        gen_new_menudef = True
    else:
        msg = "No download for"
        gen_new_menudef = False

    if verbose:
        print("%s %s %s" % (msg, id, moddir))

    # check if menu def exists
    if os.path.exists(CONST.doc_root_menu_defs + moddir + '.json'):
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

# Menu Update Functions

def put_iiab_enabled_into_menu_json():
    cmd = "cat " + iiab.CONST.iiab_ini_file + " | grep True | grep _enabled | cut -d_ -f1"
    try:
        outp = subproc_check_output(cmd, shell=True)
    except subprocess.CalledProcessError as e:
        print((str(e)))
        sys.exit(1)
    for iiab_option in outp.split('\n'):
        if iiab_option == 'kiwix': continue
        if iiab_option in CONST.iiab_menu_items:
            update_menu_json(CONST.iiab_menu_items[iiab_option])

def update_menu_json(new_item):
    with open(CONST.menu_json_path,"r") as menu_fp:
        reads = menu_fp.read()
        #print("menu.json:%s"%reads)
        data = json.loads(reads)
        autoupdate_menu = data.get('autoupdate_menu', False)
        if not autoupdate_menu: # only update if allowed
            return

        for item in data['menu_items_1']:
            if item == new_item:
                return
        # new_item does not exist in list
        last_item = data['menu_items_1'].pop()
        # always keep credits last
        if last_item.find('credits') == -1:
            data['menu_items_1'].append(last_item)
            data['menu_items_1'].append(new_item)
        else:
            data['menu_items_1'].append(new_item)
            data['menu_items_1'].append(last_item)
    with open(CONST.menu_json_path,"w") as menu_fp:
        menu_fp.write(json.dumps(data, indent=2))

def put_kiwix_enabled_into_menu_json():
    # steps:
    #   1. Make sure all downloaded zims are in zim_verion_idx
    #   2. Look for a back link to perma_ref in menu_defs_dir
    #   3. If back link exist update, otherwise create new menuDef

    # check for un-indexed zims in zims/content/,write to zim_versions_idx.json
    iiab.read_lang_codes()
    zim_files, zim_versions = iiab.get_zim_list(iiab.CONST.zim_path)
    write_zim_versions_idx(zim_versions, iiab.CONST.kiwix_library_xml, CONST.zim_version_idx_dir)
    # use that data
    zim_idx = zim_version_idx_dir + CONST.zim_version_idx_file
    if os.path.isfile(zim_idx):
        with open(zim_idx,"r") as zim_fp:
            zim_versions_info = json.loads(zim_fp.read())
            for perma_ref in zim_versions_info:
                # if other zims exist, do not add test zim
                if len(zim_versions_info) > 1 and perma_ref == 'tes':
                    continue
                # create the canonical menu_item name
                lang = zim_versions_info[perma_ref].get('language','en')
                default_name = lang + '-' + perma_ref + '.json'
                print(default_name, zim_versions_info[perma_ref])

                # check if menuDef exists for this perma_ref
                menu_item = iiab.find_menuitem_from_zimname(perma_ref)
                if menu_item == '':
                    # no menuDef points to this perma_ref
                    menu_item = create_zim_menu_def(perma_ref, default_name)
                    if menu_item == '': continue
                update_menu_json(menu_item)

                # make the menu_item reflect any name changes due to collision
                zim_versions_info[perma_ref]['menu_item'] = menu_item
        # write the updated menu_item links
        with open(zim_idx,"w") as zim_fp:
            zim_fp.write(json.dumps(zim_versions_info,indent=2))

def create_zim_menu_def(perma_ref,default_name,intended_use='zim'):
    # this looks only to be used by zims
    # do not generate a menuDef for the test zim
    if perma_ref == 'tes': return ""
    # check for collision
    collision = False
    if os.path.isfile(menu_defs_dir + default_name):
        with open(menu_defs_dir + default_name,"r") as menu_fp:
            try:
                menu_dict = json.loads(menu_fp.read())
                if menu_dict['intended_use'] != intended_use:
                    collision = True
            except Exception as e:
                print((str(e)))
    if collision == True:
        default_name = default_name[:-5] + '-' + intended_use + '.json'
    # the following fixes menu_defs_dir with embeddded '.' in file name
    if default_name.find('.') > -1:
        default_name = default_name[:-5].replace('.','_') + '.json'
    item = iiab.get_kiwix_catalog_item(perma_ref)
    zim_lang = item['language']
    menu_def_lang = iiab.kiwix_lang_to_iso2(zim_lang)
    filename = menu_def_lang + '-' + perma_ref + '.json'
    # create a stub for this zim
    menuDef = {}
    default_logo = get_default_logo(perma_ref,menu_def_lang)
    menuDef["intended_use"] = "zim"
    menuDef["lang"] = menu_def_lang
    menuDef["logo_url"] = default_logo
    menuitem = menu_def_lang + '-' + perma_ref
    menuDef["menu_item_name"] = default_name[:-5]
    menuDef["title"] = item.get('title','')
    menuDef["zim_name"] = perma_ref
    menuDef["start_url"] = ''
    menuDef["description"] = item.get('description','')
    menuDef["extra_description"] = ""
    menuDef["extra_html"] = ""
    menuDef["footnote"] = 'Size: ##SIZE##, Articles: ##ARTICLE_COUNT##, Media: ##MEDIA_COUNT##, Date: ##zim_date##'

    menuDef["change_ref"] = "generated"
    menuDef['change_date'] = str(date.today())

    if not os.path.isfile(menu_defs_dir + default_name): # logic to here can still overwrite existing menu def
        print(("creating %s"%menu_defs_dir + default_name))
        with open(menu_defs_dir + default_name,'w') as menufile:
            menufile.write(json.dumps(menuDef,indent=2))
    return default_name[:-5]

# def generate_zim_menu_def(perma_ref,default_name,intended_use='zim'): # at some point separate menu def generation

def update_href_in_menu_def(menu_def,perma_ref):
    with open(menu_defs_dir + menu_def + '.json','r') as md_file:
        menu_def_dict = json.reads(md_file.read())
        menu_def_dict['file_name'] = file_name
    with open(menu_defs_dir + menu_def + '.json','w') as md_file:
        md_file.write(json.dumps(menu_def_dict))

def get_default_logo(logo_selector,lang):
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
        #print("logo: %s  selector: %s"%(logo,selector))
        if logo.startswith(selector):
            return default_logos[logo]
    if selector.find('stackexchange') > -1:
        return "stackexchange.png"
    return ''

def check_jpg_png(selector):
    # check for a png or jpg with same selector
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

def get_map_catalog():
    global map_catalog
    input_json = CONST.map_doc_root + '/maplist/assets/regions.json'
    with open(input_json,'r') as regions:
        reg_str = regions.read()
        map_catalog = json.loads(reg_str)
    #print(json.dumps(map_catalog,indent=2))

def get_map_menu_defs(intended_use='map'):
    menu_def_list =[]
    os.chdir(CONST.menu_def_dir)
    for filename in os.listdir('.'):
        if fnmatch.fnmatch(filename, '*.json'):
            try:
                with open(filename,'r') as json_file:
                    readstr = json_file.read()
                    data = json.loads(readstr)
            except:
                print(("failed to parse %s"%filename))
                print(readstr)
            if data.get('intended_use','') != intended_use:
                continue
            map_name = data.get('map_name','')
            if map_name != '':
                menu_def_list.append(map_name)
    return menu_def_list

def get_installed_regions():
    installed = []
    os.chdir(CONST.map_doc_root)
    for filename in os.listdir('.'):
        if fnmatch.fnmatch(filename, '??-osm-omt*'):
            region = re.sub(r'^..-osm-..._(.*)',r'\1',filename)
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
    map_dict ={}
    idx_dict = {}
    for fname in installed_maps:
        region = extract_region_from_filename(fname)
        if map == 'maplist': continue # not a real region
        map_dict = map_catalog['regions'].get(region,'')
        if map_dict == '': continue

        # Create the idx file in format required bo js-menu system
        item = map_dict['perma_ref']
        idx_dict[item] = {}
        idx_dict[item]['file_name'] = os.path.basename(map_dict['url'][:-4])
        idx_dict[item]['menu_item'] = map_dict['perma_ref']
        idx_dict[item]['size'] = map_dict['size']
        idx_dict[item]['date'] = map_dict['date']
        idx_dict[item]['region'] = region
        idx_dict[item]['language'] = map_dict['perma_ref'][:2]

    with open(CONST.vector_map_idx_dir + '/vector-map-idx.json','w') as idx:
        idx.write(json.dumps(idx_dict,indent=2))

def create_map_menu_def(region,default_name,intended_use='map'):
    item = map_catalog['regions'][region]
    if len(item.get('language','')) > 2:
        lang = item['language'][:2]
    else: # default to english
        lang = 'en'
    filename = lang + '-' + item['perma_ref'] + '.json'
    # create a stub for this zim
    menuDef = {}
    default_logo = 'osm.jpg'
    menuDef["intended_use"] = "map"
    menuDef["lang"] = lang
    menuDef["logo_url"] = default_logo
    menuitem = lang + '-' + item['perma_ref']
    menuDef["menu_item_name"] = default_name

    if item.get('title','ERROR') == "World":
        fancyTitle = "Planet Earth"
    elif item.get('title','ERROR') == "Central America":
        fancyTitle = "Central America-Caribbean"
    else:
        fancyTitle = item.get('title','ERROR')

    if fancyTitle == "Planet Earth":
        menuDef["title"] = "OpenStreetMap: " + fancyTitle
    else:
        menuDef["title"] = "OpenStreetMap: " + fancyTitle + " & Earth"

    menuDef["map_name"] = item['perma_ref']
    # the following is in the idx json
    #menuDef["file_name"] = lang + '-osm-omt_' + region + '_' + os.path.basename(item['url'])[:-4]
    menuDef["description"] = '19 levels of zoom (~1 m details) for ' + fancyTitle + ', illustrating human geography.<p>10 levels of zoom (~1 km details) for satellite photos, covering the whole world.'
    menuDef["extra_description"] = 'Search for cities/towns with more than 1000 people.  There are about 127,654 worldwide.'
    menuDef["extra_html"] = ""
    #menuDef["automatically_generated"] = "true"
    menuDef["change_ref"] = "generated"
    menuDef["change_date"] = str(date.today())
    if not os.path.isfile(menu_defs_dir + default_name): # logic to here can still overwrite existing menu def
        print(("creating %s"%menu_defs_dir + default_name))
        with open(menu_defs_dir + default_name,'w') as menufile:
            menufile.write(json.dumps(menuDef,indent=4))
    return default_name[:-5]

def extract_region_from_filename(fname):
    # find the index of the date
    nibble = re.search(r"\d{4}-\d{2}-\d{2}",fname)
    if nibble:
        fname = fname[:nibble.start()-1]
        return fname
    else:
        return("maplist")

# Misc

def pcgvtd9():
    global headers
    response = requests.get(CONST.iiab_pat_url)
    dict = json.loads(response._content)
    headers={'Content-Type':'application/json',
             'Authorization': 'token ' + dict['pat']}

def fetch_menu_json_value(key):
    menu_json = read_json(CONST.menu_json_file)
    return menu_json.get(key,'')

def read_json(file_path):
    try:
        with open(file_path,'r') as json_file:
            readstr = json_file.read()
            json_dict = json.loads(readstr)
        return json_dict
    except OSError as e:
        raise

# duplicates cmdsrv - but now revised

def write_json_file(dict, target_file, sort_keys=False):
    try:
        with open(target_file, 'w', encoding='utf8') as json_file:
            json.dump(dict, json_file, ensure_ascii=False, indent=2, sort_keys=sort_keys)
            json_file.write("\n")  # Add newline cause Py JSON does not
    except OSError as e:
        raise

# duplicates cmdsrv
def subproc_check_output(args, shell=False):
    try:
        outp = subprocess.check_output(args, shell=shell, universal_newlines=True, encoding='utf8')
    except:
        raise
    return outp
