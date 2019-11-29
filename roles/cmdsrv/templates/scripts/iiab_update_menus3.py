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
    print('Updating kiwix menus')
    adm.put_kiwix_enabled_into_menu_json()
    print('Updating iiab installed services\' menus')
    adm.put_iiab_enabled_into_menu_json()

# Now start the application
if __name__ == "__main__":

    # Run the main routine
    main()
