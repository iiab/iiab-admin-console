#!/usr/bin/python3

"""

   Creates a catalog JSON item directly from a ZIM's metadata
   (no temporary kiwix library file)

   Author: Tim Moody <tim(at)timmoody(dot)com>
   Contributors: Jerry Vonau <jvonau3(at)gmail.com>

"""

import argparse
import os
import sys

import iiab.adm_lib as adm
import iiab.iiab_lib as iiab
import iiab.iiab_zim_catalog as zim_catalog

download_source = 'http://med.iiab.me/downloads/zims/'
zim_path = iiab.CONST.zim_path + '/content'

def main():
    global download_source
    global zim_path

    args = parse_args()
    zim_fname = args.zim_file

    if args.path: # allow override of path
        zim_path = args.path

    if args.source: # allow override of download source
        download_source = args.source

    zim_full_path = zim_path + '/' + zim_fname

    if not os.path.isfile(zim_full_path):
        print('Zim file '+ zim_full_path +' not found.')
        sys.exit(1)

    # Read metadata directly from the ZIM (no temporary library file).
    try:
        rel_path = 'content/' + zim_fname
        meta = zim_catalog.read_zim_metadata(zim_full_path, rel_path)
    except Exception as error:
        print('Cannot read ' + zim_full_path + ': ' + str(error))
        sys.exit(1)

    attrs = zim_catalog.metadata_to_book_attrs(meta, exclude_favicon=False)
    zim_id = attrs.pop('id')    # the dict is keyed by id, as before
    zims_installed = {zim_id: attrs}

    name_parts = zim_fname.split('_')
    name = '_'
    if name_parts[-2] in ['mini','nopic', 'maxi']:
        flavour = '_' + name_parts[-2]
        name = name.join(name_parts[:-2])
    else:
        flavour = ''
        name = name.join(name_parts[:-1])

    url = download_source + zim_fname
    zims_installed[zim_id]['url'] = url

    zims_installed[zim_id]['name'] = name
    zims_installed[zim_id]['flavour'] = flavour

    zim_json = zim_fname.replace('.zim', '.json')
    adm.write_json_file(zims_installed, zim_json)

    sys.exit()

def parse_args():
    parser = argparse.ArgumentParser(description="Generate catalog json for a zim file.")
    parser.add_argument("zim_file", help="The full path to a zim file.")
    parser.add_argument("--path", help="Full path to zim, default is " + zim_path)
    parser.add_argument("--source", help="Url prefix for download source, default is " + download_source)
    return parser.parse_args()

# Now start the application
if __name__ == "__main__":

    # Run the main routine
    main()
