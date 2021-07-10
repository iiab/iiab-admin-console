#!/usr/bin/python3

"""
   Author: George Hunt <georgejhunt <at> gmail.com>
"""
# reminders:
# zim_name in menu-def is search item in common/assets/zim_versions_idx.json
# file_name in zim_versions_idx referenced by zim_name is href:<target url>
# To avoid collisions with rachel, or embedded '.', menu-def filename may differ
# To find search items (size, articleCount, etc) menu_item_name in menu-def
#      must match zim_versions_idx['menu_item']

import iiab.iiab_lib as iiab
import iiab.adm_lib as adm

def main():
    print('Updating Home Page Menu')
    print('Updating kiwix menu items')
    adm.put_kiwix_enabled_into_menu_json()
    print('Updating iiab installed services\' menu items')
    adm.put_iiab_enabled_into_menu_json()
    print('Updating installed OER2Go menu items')
    mod_list = adm.get_module_list(adm.CONST.iiab_modules_dir)
    for module in mod_list:
        adm.update_menu_json(module, no_lang=False)

# Now start the application
if __name__ == "__main__":

    # Run the main routine
    main()
