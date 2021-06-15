#!/usr/bin/python3
# Creates json files for presets

import os, sys, syslog
from datetime import date
import pwd, grp
import shutil
import argparse
import sqlite3
import iiab.iiab_lib as iiab
import iiab.adm_lib as adm

zim_path = iiab.CONST.zim_path + '/content'
module_path = iiab.CONST.doc_root + '/modules'
map_path = adm.CONST.map_doc_root + '/viewer/tiles'
presets_dir = adm.CONST.admin_install_base + '/cmdsrv/presets/'
role_stats = {}
content = {}
content["zims"] = []
content["modules"] = []
content["maps"] = []
content["kalite"] = {}

kalite_topics = []

def main():
    global role_stats
    parser = argparse.ArgumentParser(description="Generate directory and json files for a preset.")
    parser.add_argument("preset", help="The name of the preset. Is the directory in which the json files are store.")
    parser.add_argument("-m", "--menu", type=str, default='home', required=False, help="source menu (default home)")
    parser.add_argument("-n", "--noscan", help="do not scan file system for content, but rather use the menu", action="store_true")
    # from_menu T/F
    # menu_dir
    args =  parser.parse_args()

    if not os.path.exists(iiab.CONST.doc_root + '/' + args.menu + '/menu.json'):
        print('Menu directory ' + args.menu + ' not found.')
        exit(1)

    this_preset_dir = presets_dir + args.preset + '/'
    if not os.path.exists(this_preset_dir):
        os.makedirs(this_preset_dir)

    role_stats = adm.get_roles_status()

    do_preset(this_preset_dir)
    do_menu(this_preset_dir, args.menu)
    do_vars(this_preset_dir)
    do_content(this_preset_dir, args.noscan)

    sys.exit()

def do_preset(this_preset_dir):
    preset_file = this_preset_dir + 'preset.json'
    preset = {}
    preset["name"] = "Put a name or title here"
    preset["description"] = "Put a longer description here"
    preset["default_lang"] = "en or another code"
    preset["location"] = "Optional location this was installed"
    preset["size_in_gb"] = 115
    today = str(date.today())
    preset["last_modified"] = today
    if not os.path.exists(preset_file):
        adm.write_json_file(preset, preset_file)

def do_menu(this_preset_dir, menu_dir):
    menu_file = this_preset_dir + 'menu.json'
    shutil.copyfile(iiab.CONST.doc_root + '/' + menu_dir + '/menu.json', menu_file)

def do_vars(this_preset_dir):
    vars_file = this_preset_dir + 'vars.yml'
    with open(vars_file, 'w') as f:
        for role in role_stats:
            if role_stats[role]['active']:
                f.write(role + '_install: True\n')
                f.write(role + '_enabled: True\n')
    # or copy local_vars
    # or copy delta of local vars

def do_content(this_preset_dir, noscan):
    global content
    if role_stats['kalite']['active']:
        content["kalite"] = {'lang_code': 'en', 'topics': []} # defaults

    content_file = this_preset_dir + 'content.json'

    if os.path.exists(content_file):
        old_content = adm.read_json(content_file)
    else:
        old_content = {}

    if noscan:
        content_from_menu(this_preset_dir)
    else:
        content_from_files()

    # read list of maps
    if os.path.exists(map_path):
        excl_maps = ['']
        map_list = os.listdir(map_path)
        for fname in map_list:
            content["maps"].append(fname)

    # preserve any kalite for now
    content["kalite"] = old_content.get("kalite", {})
    if role_stats['kalite']['active']:
        lang = get_kalite_lang()
        content["kalite"]["lang_code"] = lang
        get_kalite_complete('khan/', lang)
        content["kalite"]["topics"] = kalite_topics

    adm.write_json_file(content, content_file)

def content_from_files():
    # read list of zims
    excl_zims = ['test.zim']
    zim_list = os.listdir(zim_path)

    for fname in zim_list:
        if fname in excl_zims:
            continue
        name = '_'.join(fname.split('.zim')[0].split('_')[:-1])
        content["zims"].append(name)

    # read list of modules
    excl_modules = ['']
    module_list = os.listdir(module_path)

    for fname in module_list:
        if fname in excl_zims:
            continue
        content["modules"].append(fname)

def content_from_menu(this_preset_dir):
    global content
    menu = adm.read_json(this_preset_dir + 'menu.json')
    all_menu_defs = adm.get_all_menu_defs()
    for menu_def in menu["menu_items_1"]:
        if menu_def in all_menu_defs:
            if all_menu_defs[menu_def]["intended_use"] == "html":
                 content["modules"].append(all_menu_defs[menu_def]["moddir"])
            elif all_menu_defs[menu_def]["intended_use"] == "zim":
                content["zims"].append(all_menu_defs[menu_def]["zim_name"])

def get_kalite_lang():
    # assumes normal, not PRESETS install
    # default language is in config_settings or blank = en
    # for now ignore any language in settings.py as IIAB does not set it
    kalite_db = '/library/ka-lite/database/data.sqlite'
    conn = sqlite3.connect(kalite_db)
    cur = conn.execute ('SELECT name, value from config_settings where name  = ?', ('default_language', ))
    settings_info = cur.fetchall()
    conn.close()
    if len(settings_info) == 0:
        lang = 'en'
    else:
        _, lang = settings_info[0]
    return lang

def get_kalite_complete(topic, lang):
    global kalite_topics
    kalite_db = '/library/ka-lite/database/content_khan_' + lang + '.sqlite'
    conn = sqlite3.connect(kalite_db)
    cur = conn.execute ('SELECT files_complete, total_files from item where kind = "Topic" and path = ?', (topic, ))
    topic_info = cur.fetchall()
    conn.close()
    complete, total = topic_info[0]
    if complete == total:
        # completely installed so include in list
        kalite_topics.append(topic)
        print(topic)
        return
    elif complete == 0:
        # non installed
        return
    else:
        # partially complete so look for complete child
        conn = sqlite3.connect(kalite_db)
        cur = conn.execute ("select path from item where kind = 'Topic' and parent_id = (select pk from item where path = ?) order by sort_order", (topic,))
        subtopic_info = cur.fetchall()
        conn.close()
        for item in subtopic_info:
            next_topic, = item
            get_kalite_complete(next_topic, lang)


# Now start the application
if __name__ == "__main__":
    main()
