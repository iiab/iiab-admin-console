#!/usr/bin/python3
# -*- coding: UTF-8 -*-

import argparse
import sys, os
import json
import glob
import shutil
import json

import iiab.iiab_lib as iiab
import iiab.adm_lib as adm


# GLOBALS
viewer_path = adm.CONST.map_doc_root + '/viewer'
vector_map_idx_dir = adm.CONST.vector_map_idx_dir

catalog_path = iiab.CONST.iiab_etc_path + '/adm-map-catalog.json'
map_catalog = {}
base_catalog = {}

if len(sys.argv) != 2:
   print("Argument 1=map_id")
   sys.exit(1)

def main():
    global map_catalog
    global base_catalog

    args = parse_args()
    map_id = args.map_id

    catalog = adm.read_json(catalog_path)
    map_catalog = catalog['maps']
    base_catalog = catalog['base']
    #for k in catalog.keys():
      #print(k)

    is_map = map_id in map_catalog
    is_base = map_id in base_catalog

    if not is_base and not is_map:
        print('Download URL not found in Map Catalog: %s'%args.map_id)
        sys.exit(1)

    # create init.json which sets initial coords and zoom
    if is_map:
        init = {}
        map = map_catalog[map_id]
        init['region'] = map['region']
        init['zoom'] = map['zoom']
        init['center_lon'] = map['center_lon']
        init['center_lat'] = map['center_lat']
        init_fn = viewer_path + '/init.json'
        adm.write_json_file(init, init_fn)

    installed_maps = get_installed_tiles()
    print('installed_maps')
    print(repr(installed_maps))
    write_vector_map_idx_v2(installed_maps)

def get_installed_tiles():
    installed_maps = []
    tile_list = glob.glob(viewer_path + '/tiles/*')
    for index in range(len(tile_list)):
        #if tile_list[index].startswith('sat'): continue
        #if tile_list[index].startswith('osm-planet_z0'): continue
        installed_maps.append(os.path.basename(tile_list[index]))
    return installed_maps

def write_vector_map_idx_v2(installed_maps):
    # modified from adm_lib for new maps
    catalog = map_catalog
    catalog.update(base_catalog)
    map_dict = {}
    idx_dict = {}
    for fname in installed_maps:
        map_dict = catalog.get(fname, None)
        if not map_dict : continue

        # Create the idx file in format required by js-menu system
        item = map_dict['perma_ref']
        idx_dict[item] = {}
        idx_dict[item]['file_name'] = os.path.basename(map_dict['detail_url'])
        idx_dict[item]['menu_item'] = map_dict['perma_ref']
        idx_dict[item]['size'] = map_dict['size']
        idx_dict[item]['date'] = map_dict['date']
        idx_dict[item]['region'] = map_dict['region']
        #idx_dict[item]['language'] = map_dict['perma_ref'][:2]
        idx_dict[item]['language'] = 'en'

    adm.write_json_file(idx_dict, vector_map_idx_dir + '/vector-map-idx.json')

def parse_args():
    parser = argparse.ArgumentParser(description="Create init.json for a tile URL.")
    parser.add_argument("map_id", help="The key field in the Map Catalog.")
    return parser.parse_args()


if __name__ == '__main__':
   main()
