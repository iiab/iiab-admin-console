#!/usr/bin/python3
import argparse
import os
import sys
import shutil
import json
import uuid
import iiab.adm_lib as adm
import iiab.adm_const as CONST

def main ():
    args = parse_args()

    oer2go_mod_name = args.module

    dated_oer2go_cat = adm.read_json_file(CONST.oer2go_catalog_file)

    oer2go_mod = dated_oer2go_cat['modules'][oer2go_mod_name]
    mv_src = CONST.rachel_working_dir + oer2go_mod_name
    mv_dest = CONST.iiab_modules_dir + oer2go_mod_name

    if not os.path.isdir(mv_src):
        print('Module working directory not found. Exiting.')
        sys.exit(1)

    if not os.path.isdir(mv_dest): # only mv is target not exist
        shutil.move(mv_src, mv_dest)

    is_downloaded, has_menu_def = adm.get_module_status (oer2go_mod)
    if not has_menu_def:
        print('Generating Menu Definition')
        working_dir = adm.CONST.rachel_working_dir + str(uuid.uuid4()) + "/"
        menu_item_name = adm.create_module_menu_def(oer2go_mod, working_dir, incl_extra_html = False)
        shutil.rmtree(working_dir)

    print('Adding to Home Page Menu')
    adm.update_menu_json(oer2go_mod_name, no_lang=False)

def parse_args():
    parser = argparse.ArgumentParser(description="Add module to home menu.")
    parser.add_argument("module", help="The name of the module.")
    return parser.parse_args()

if __name__ == "__main__":
    # Now run the main routine
    main()
