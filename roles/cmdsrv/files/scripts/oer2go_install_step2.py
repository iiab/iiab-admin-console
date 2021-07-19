#!/usr/bin/python3
import argparse
import shutil
from sys import modules
import iiab.adm_lib as adm
import iiab.adm_const as CONST

def main ():
    args = parse_args()

    module = args.module

    shutil.move(CONST.rachel_working_dir + module, CONST.iiab_modules_dir)

    is_downloaded, has_menu_def = adm.get_module_status (module)
    if not has_menu_def:
        print('Generating Menu Definition')
        working_dir = adm.CONST.rachel_working_dir + str(uuid.uuid4()) + "/"
        menu_item_name = adm.create_module_menu_def(module, working_dir, incl_extra_html = False)
        shutil.rmtree(working_dir)

    print('Adding to Home Page Menu')
    adm.update_menu_json(module, no_lang=False)

def parse_args():
    parser = argparse.ArgumentParser(description="Add module to home menu.")
    parser.add_argument("module", help="The name of the module.")
    return parser.parse_args()

if __name__ == "__main__":
    # Now run the main routine
    main()
