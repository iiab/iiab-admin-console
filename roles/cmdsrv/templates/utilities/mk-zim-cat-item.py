#!/usr/bin/python3

"""

   Creates temp library.xml file for kiwix from contents of /zims/content and index
   Updated to handle incremental additions and deletions

   Author: Tim Moody <tim(at)timmoody(dot)com>
   Contributors: Jerry Vonau <jvonau3(at)gmail.com>

"""

import os, sys, syslog
import pwd, grp
import argparse
import iiab.iiab_lib as iiab
import iiab.adm_lib as adm

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

    # create temp library.xml and read back json
    kiwix_library_xml = "/tmp/library.xml"
    try:
        os.remove(kiwix_library_xml)
    except OSError:
        pass

    iiab.add_libr_xml(kiwix_library_xml, zim_path, zim_fname, '')
    zims_installed, _ = iiab.read_library_xml(kiwix_library_xml, kiwix_exclude_attr=[''])

    zim_id = list(zims_installed)[0]

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

    try:
        os.remove(kiwix_library_xml)
    except OSError:
        pass

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
