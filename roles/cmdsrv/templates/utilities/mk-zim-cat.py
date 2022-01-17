#!/usr/bin/python3

import os
import iiab.adm_lib as adm

zim_json_path = '/opt/iiab/iiab-admin-console/assets'

zim_cat_parts_dir = zim_json_path + '/iiab-zim-cat/'

flist = os.listdir(zim_cat_parts_dir)

iiab_zim_cat = {}

for f in flist:
    cat_part = adm.read_json(zim_cat_parts_dir + f)
    zim_id = list(cat_part)[0]
    iiab_zim_cat[zim_id] = cat_part[zim_id]

adm.write_json_file(iiab_zim_cat, zim_json_path + '/iiab-zim-cat.json')
