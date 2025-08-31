#!/usr/bin/python3

import os, sys, syslog
import pwd, grp
import time
from datetime import date, datetime
import json
import yaml
import re
import subprocess
import shlex
import configparser
import xml.etree.ElementTree as ET
import argparse
import fnmatch
import argparse
import concurrent.futures
import iiab.iiab_lib as iiab
import iiab.adm_lib as adm

KIWIX_CAT = iiab.CONST.kiwix_cat_path
lib_xml_file = '/library/zims/library.xml'
doc_root = iiab.CONST.doc_root
zim_version_idx_dir = doc_root + "/common/assets/"
zim_version_idx_file = "zim_version_idx.json"
zim_content_path = iiab.CONST.zim_path + '/content/'
MAX_THREADS = 4
num_threads = MAX_THREADS

version_idx = {}
zims_cat = {}
cat_perm_ref_id_map = {}
cat_perm_ref_url_map = {}
zims_installed = {}
path_to_id_map = {}

def main():
    global version_idx
    global zims_cat
    global cat_perm_ref_id_map
    global cat_perm_ref_url_map
    global zims_installed
    global path_to_id_map

    num_threads = MAX_THREADS

    args = parse_args()

    version_idx = read_zim_version_idx(zim_version_idx_dir + zim_version_idx_file)
    zims_cat = read_kiwix_catalog(KIWIX_CAT)
    cat_perm_ref_id_map, cat_perm_ref_url_map = calc_cat_perm_ref_idx(zims_cat)
    zims_installed, path_to_id_map = read_library_xml(lib_xml_file)

    when_to_remove_old = 'after' # default
    if args.delete:
        when_to_remove_old = 'before'
    if args.keep:
        when_to_remove_old = 'never'

    if args.threads:
        if args.threads > 0 and args.threads <= MAX_THREADS:
            num_threads = args.threads
        else:
            print("Invalid number of threads, using default of " + str(MAX_THREADS))

    if args.list:
        list_upgradable_zims()
        return

    if args.zim:
        # strip version and extension if present
        zim_to_upgrade = args.zim
        if zim_to_upgrade.endswith('.zim'):
            zim_to_upgrade = zim_to_upgrade[:-4]
        if re.match(r'.*_[0-9]{4}-[0-9]{2}$', zim_to_upgrade):
            zim_to_upgrade = '_'.join(zim_to_upgrade.split('_')[:-1])
        if zim_to_upgrade not in version_idx:
            print("ZIM " + zim_to_upgrade + " not installed")
            return
        upgrade_zim(zim_to_upgrade, when_to_remove_old)
    else:

        with concurrent.futures.ThreadPoolExecutor(num_threads) as executor:
            for installed_perma_ref in version_idx:
                executor.submit(upgrade_zim, installed_perma_ref, when_to_remove_old)

def list_upgradable_zims():
    for installed_perma_ref in version_idx:
        upgrade_params = calc_zim_upgrade(installed_perma_ref)
        if upgrade_params is None:
            continue
        # print("Found upgrade for " + installed_perma_ref)
        # print(upgrade_params)
        upgrade = installed_perma_ref + " version " + upgrade_params['old_zim_version']
        upgrade += " to " + upgrade_params['new_zim_version']
        upgrade += ", Current Size " + iiab.human_readable(float(upgrade_params['old_zim_size_k']) * 1024)
        upgrade += " Net Change " + upgrade_params['size_diff_human']
        print(upgrade)

def calc_zim_upgrade(installed_perma_ref):
    upgrade_params = {}
    normalized_perma_ref = rewrite_perma_ref(installed_perma_ref)
    if normalized_perma_ref in cat_perm_ref_id_map: # current kiwix catalog has perma_ref to upgrade
        old_zim_id = path_to_id_map["content/" + version_idx[installed_perma_ref]["file_name"] + ".zim"]
        new_zim_id = cat_perm_ref_id_map[normalized_perma_ref]
        if new_zim_id != old_zim_id: # only download if not already downloaded
            upgrade_params['installed_perma_ref'] = installed_perma_ref
            upgrade_params['installed_zim_title'] = zims_installed[old_zim_id]['title']
            upgrade_params['old_zim_id'] = old_zim_id
            upgrade_params['old_zim'] = zims_installed[old_zim_id]['path'].split('content/')[1]
            upgrade_params['old_zim_version'] = calc_zim_version(upgrade_params['old_zim'])
            upgrade_params['old_zim_size_k'] = zims_installed[old_zim_id]['size']
            upgrade_params['new_zim_id'] = new_zim_id
            upgrade_params['new_zim'] = zims_cat[new_zim_id]['file_ref']
            upgrade_params['new_zim_version'] = calc_zim_version(upgrade_params['new_zim'])
            upgrade_params['new_zim_url'] = zims_cat[new_zim_id]['download_url']
            upgrade_params['new_zim_size_k'] = zims_cat[new_zim_id]['size']
            size_diff_k = int(upgrade_params['new_zim_size_k']) - int(upgrade_params['old_zim_size_k'])
            upgrade_params['size_diff_k'] = str(size_diff_k)
            size_diff_human = iiab.human_readable(abs(float(size_diff_k * 1024)))
            if size_diff_k < 0:
                upgrade_params['size_diff_human'] = '-' + size_diff_human
            else:
                upgrade_params['size_diff_human'] = '+' + size_diff_human
            return upgrade_params
    return None

def calc_zim_version(zim_file):
    # Extract the version from the zim file name
    # e.g. wikipedia_en_medicine_maxi_2023-09.zim -> 2023-09
    version = None
    no_file_extension = zim_file.split('.zim')[0]
    version = no_file_extension.split('_')[-1] # assume last _xxxx-xx is version
    return version

def upgrade_zim(installed_perma_ref, when_to_remove_old):
    print("Checking for upgrade to " + installed_perma_ref)
    upgrade_params = calc_zim_upgrade(installed_perma_ref)
    if upgrade_params is None:
        print("No upgrade found for " + installed_perma_ref)
        return
    print("Upgrading " + installed_perma_ref + " version " + upgrade_params['old_zim_version'] + " to " + upgrade_params['new_zim_version'])
    installed_perma_ref_path = "content/" + version_idx[installed_perma_ref]["file_name"] + ".zim"
    full_installed_perma_ref_path = iiab.CONST.zim_path + "/" + installed_perma_ref_path
    download_zim(upgrade_params['new_zim_url'], full_installed_perma_ref_path, when_to_remove_old)
    return

def read_kiwix_catalog(KIWIX_CAT):
    # Read the kiwix catalog
    with open(KIWIX_CAT, 'r') as f:
        json_data = f.read()
    download = json.loads(json_data)
    zims_catalog = download['zims']
    return zims_catalog

def read_library_xml(lib_xml_file, kiwix_exclude_attr=[""]): # duplicated from iiab-cmdsrv
    kiwix_exclude_attr.append("id") # don't include id
    kiwix_exclude_attr.append("favicon") # don't include large favicon
    zims_installed = {}
    path_to_id_map = {}
    try:
        tree = ET.parse(lib_xml_file)
        root = tree.getroot()
        xml_item_no = 0
        for child in root:
            #xml_item_no += 1 # hopefully this is the array number
            attributes = {}
            if 'id' not in child.attrib: # is this necessary? implies there are records with no book id which would break index for removal
                  print ("xml record missing Book Id")
            id = child.attrib['id']
            for attr in child.attrib:
                if attr not in kiwix_exclude_attr:
                    attributes[attr] = child.attrib[attr] # copy if not id or in exclusion list
            zims_installed[id] = attributes
            path_to_id_map[child.attrib['path']] = id
    except IOError:
        zims_installed = {}
    return zims_installed, path_to_id_map

def read_zim_version_idx(zim_version_idx_file):
    # Read the zim_version_idx_file
    with open(zim_version_idx_file, 'r') as f:
        json_data = f.read()
    zim_version_idx = json.loads(json_data)
    return zim_version_idx

def calc_cat_perm_ref_idx(zims_catalog):
    cat_perm_ref_id_map = {}
    cat_perm_ref_url_map = {}
    for zim_id in zims_catalog:
        perma_ref = zims_catalog[zim_id]['perma_ref']
        url = zims_catalog[zim_id]['url'].split('.meta')[0]
        if perma_ref in cat_perm_ref_id_map:
            print ('duplicate', perma_ref)
            if url > cat_perm_ref_url_map[perma_ref]:
                cat_perm_ref_id_map[perma_ref] = zim_id
                cat_perm_ref_url_map[perma_ref] = url
        else:
            cat_perm_ref_id_map[perma_ref] = zim_id
            cat_perm_ref_url_map[perma_ref] = url
    return cat_perm_ref_id_map, cat_perm_ref_url_map

def download_zim(new_url, installed_perma_ref_path, when_to_remove_old):
    # make sure not already downloaded
    # cmdstr = "/usr/bin/wget -c --progress=dot:giga --directory-prefix=" + zim_content_path + " " + new_url
    cmdstr = "/usr/bin/aria2c -c --follow-metalink=mem --summary-interval=0 --dir=" + zim_content_path + " " + new_url
    if when_to_remove_old == 'before':
        remove_old_zim(installed_perma_ref_path)
    try:
        adm.subproc_run(cmdstr, timeout=None)
    except:
        print("Download failed for " + new_url)
        return
    if when_to_remove_old == 'after':
        remove_old_zim(installed_perma_ref_path)

def remove_old_zim(installed_perma_ref_path):
    try:
        print("Removing " + installed_perma_ref_path)
        os.remove(installed_perma_ref_path)
    except:
        print("Failed to remove " + installed_perma_ref_path)
        pass

# Handle any Kiwix renaming issues
def rewrite_perma_ref(installed_perma_ref):
    perma_ref = installed_perma_ref
    if '_maxi' not in installed_perma_ref and '_nopic' not in installed_perma_ref and '_mini' not in installed_perma_ref:
        if '_novid' in installed_perma_ref:
            perma_ref = installed_perma_ref.replace('_novid', '_maxi')
        elif '_all' in installed_perma_ref:
            perma_ref = installed_perma_ref.replace('_all', '_all_maxi')
        elif '_medicine' in installed_perma_ref:
            perma_ref = installed_perma_ref.replace('_medicine', '_medicine_maxi')

    return perma_ref

def parse_args():
    parser = argparse.ArgumentParser(
        description="""Upgrade ZIMs:
        No parameters means upgrade All installed ZIMs with maximum threads, removing old after new is downloaded.
        To save storage use -d so old ZIM is removed before the dowload.
        Use -t to reduce the number of threads if necessary.
        Use -l to see the impact without doing any downloads.
        Run iiab-make-kiwix-lib after upgrades are complete.
        """,
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("-l", "--list", help="only list all ZIMs that can be upgraded", action="store_true")
    parser.add_argument("-z", "--zim", type=str, help="single ZIM to upgrade (e.g. wikipedia_en_medicine_maxi)")
    parser.add_argument("-d", "--delete", help="remove old ZIM before downloading new, instead of after", action="store_true")
    parser.add_argument("-k", "--keep", help="don't remove old ZIM", action="store_true")
    parser.add_argument("-t", "--threads", type=int, help="number of threads (1 - " + str(MAX_THREADS) + ")")
    return parser.parse_args()

# Now start the application
if __name__ == "__main__":

    # Run the main routine
    main()
