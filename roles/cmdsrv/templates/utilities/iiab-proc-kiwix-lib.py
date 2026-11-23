#!/usr/bin/python3

"""Write zim_version_idx.json from library.xml"""

import sys
import argparse
import iiab.iiab_lib as iiab
import iiab.adm_lib as adm

def main():
    args = parse_args()
    kiwix_library_xml = args.library_xml

    zim_files, zim_versions = iiab.get_zim_list(iiab.CONST.zim_path)

    print("Writing zim_versions_idx")
    iiab.read_lang_codes()
    zim_menu_defs = adm.get_zim_menu_defs()
    try:
        adm.write_zim_versions_idx(zim_versions, kiwix_library_xml, adm.CONST.zim_version_idx_dir, zim_menu_defs)
    except:
        print("Failed to write zim_version_idx.json")
        sys.exit(1)
    sys.exit()

def parse_args():
    parser = argparse.ArgumentParser(description="Write zim_version_idx.json from library.xml.")
    parser.add_argument("library_xml", nargs="?", default=iiab.CONST.kiwix_library_xml,
                        help="default " + iiab.CONST.kiwix_library_xml)
    return parser.parse_args()

if __name__ == "__main__":
    main()
