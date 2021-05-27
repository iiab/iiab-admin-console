#!/usr/bin/python3
# Creates json files for presets

import os, sys, syslog
import pwd, grp
import shutil
import argparse
import iiab.iiab_lib as iiab
import iiab.adm_lib as adm

zim_path = iiab.CONST.zim_path + '/content'
module_path = iiab.CONST.doc_root + '/modules'
map_path = adm.CONST.map_doc_root + '/viewer/tiles'
presets_dir = adm.CONST.admin_install_base + '/cmdsrv/presets/'

def main():
    parser = argparse.ArgumentParser(description="Generate directory and json files for a preset.")
    parser.add_argument("preset", help="The name of the preset. Is the directory in which the json files are store.")
    args =  parser.parse_args()

    this_preset_dir = presets_dir + args.preset + '/'
    if not os.path.exists(this_preset_dir):
        os.makedirs(this_preset_dir)

    do_preset(this_preset_dir)
    do_menu(this_preset_dir)
    do_vars(this_preset_dir)
    do_content(this_preset_dir)

    sys.exit()

    preset = adm.read_json(src_dir + 'preset.json')
    menu = adm.read_json(src_dir + 'menu.json') # actually only need to cp the file
    content = adm.read_json(src_dir + 'content.json')
    vars = adm.read_yaml(src_dir + 'vars.yml')

def do_preset(this_preset_dir):
    preset_file = this_preset_dir + 'preset.json'
    preset = {}
    preset["name"] = "Put a name or title here"
    preset["description"] = "Put a longer description here"
    preset["default_lang"] = "en or another code"
    preset["location"] = "Optional location this was installed"
    preset["size_in_gb"] = 115
    preset["last_modified"] = "2021-05-01"
    if not os.path.exists(preset_file):
        adm.write_json_file(preset, preset_file)

def do_menu(this_preset_dir):
    menu_file = this_preset_dir + 'menu.json'
    shutil.copyfile(iiab.CONST.doc_root + '/home/menu.json', menu_file)

def do_vars(this_preset_dir):
    vars_file = this_preset_dir + 'vars.json'
    role_stat = adm.get_roles_status()

    with open(vars_file, 'w') as f:
        for role in role_stat:
            if role_stat[role]['active']:
                f.write(role + '_install: True\n')
                f.write(role + '_enabled: True\n')

def do_content(this_preset_dir):
    content = {}
    content["zims"] = []
    content["modules"] = []
    content["maps"] = []
    content["kalite"] = {}
    content_file = this_preset_dir + 'content.json'

    if os.path.exists(content_file):
        old_content = adm.read_json(content_file)
    else:
        old_content = {}

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

    # read list of maps
    if os.path.exists(map_path):
        excl_maps = ['']
        map_list = os.listdir(map_path)
        for fname in map_list:
            content["maps"].append(fname)

    # preserve any kalite for now
    content["kalite"] = old_content.get("kalite", {})

    adm.write_json_file(content, content_file)

# Now start the application
if __name__ == "__main__":
    main()
