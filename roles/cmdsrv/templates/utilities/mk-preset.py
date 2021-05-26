#!/usr/bin/python3
# Creates json files for presets

import os, sys, syslog
import pwd, grp
import argparse
import iiab.iiab_lib as iiab
import iiab.adm_lib as adm

zim_path = iiab.CONST.zim_path + '/content'
module_path = iiab.CONST.doc_root + '/modules'
map_path = adm.CONST.map_doc_root + '/viewer/tiles'
presets_dir = adm.CONST.admin_install_base + '/cmdsrv/presets/'

content = {}
content["zims"] = []
content["modules"] = []
content["maps"] = []
content["kalite"] = {}

parser = argparse.ArgumentParser(description="Generate directory and json files for a preset.")
parser.add_argument("preset", help="The name of the preset. Is the directory in which the json files are store.")
args =  parser.parse_args()

this_preset_dir = presets_dir + args.preset + '/'
if not os.path.exists(this_preset_dir):
    os.makedirs(this_preset_dir)

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

adm.write_json_file(content, this_preset_dir + 'content.json')

sys.exit()
