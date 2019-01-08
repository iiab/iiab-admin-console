#!/usr/bin/python

"""
   Author: George Hunt <georgejhunt <at> gmail.com>
"""
# reminders:
# zim_name in menu-def is search item in common/assets/zim_versions_idx.json
# file_name in zim_versions_idx referenced by zim_name is href:<target url>
# To avoid collisions with rachel, or embedded '.', menu-def filename may differ
# To find search items (size, articleCount, etc) menu_item_name in menu-def
#      must match zim_versions_idx['menu_item']

import os, sys, syslog
import json
import subprocess
import shlex

SCRIPT_DIR = '/opt/admin/cmdsrv/scripts'
if not SCRIPT_DIR in sys.path:
    sys.path.append(SCRIPT_DIR)
import iiab_make_kiwix_lib as kiwix

IIAB_PATH='/etc/iiab'
if not IIAB_PATH in sys.path:
    sys.path.append(IIAB_PATH)
from iiab_env import get_iiab_env
KIWIX_CAT = IIAB_PATH + '/kiwix_catalog.json'

# Config Files
# iiab_ini_file should be in {{ iiab_env_file }} (/etc/iiab/iiab.env) ?
#iiab_ini_file = "{{ iiab_ini_file }}" # nominally /etc/iiab/iiab.ini
iiab_ini_file = "/etc/iiab/iiab.ini" # comment out after testing

IIAB_INI = get_iiab_env('IIAB_INI') # future
if IIAB_INI:
    iiab_ini_file = IIAB_INI

iiab_base_path = "/opt/iiab"
doc_root = get_iiab_env('WWWROOT')
zim_version_idx_dir = doc_root + "/common/assets/"
zim_version_idx_file = "zim_version_idx.json"
zim_path = "/library/zims"
menuDefs = doc_root + "/js-menu/menu-files/menu-defs/"
menuImages = doc_root + "/js-menu/menu-files/images/"
menuJsonPath = doc_root + "/home/menu.json"
rachelPath = doc_root + 'modules'
default_logos = {
   "wiktionary":"wiktionary.png",
}
iiab_menu_items={
     "calibre":"en-calibre",\
     "calibre_web": "en-calibre-web",\
     "cups":"en-cups",\
     "elgg":"en-elgg",\
     "kalite":"en-kalite",\
     "kiwix":"en-test_zim",\
     "kolibri":"en-kolibri",\
     "lokole":"en-lokole",\
     "mediawiki":"en-mediawiki",\
     "moodle":"en-moodle",\
     "nextcloud":"en-nextcloud",\
     "sugarizer":"en-sugarizer",\
     #"teamviewer":"en-teamviewer",\
     "wordpress":"en-wordpress"
}
def main():
   print('Updating kiwix menus')
   put_kiwix_enabled_into_menu_json()
   print('Updating oer2go menus')
   put_oer2go_enabled_into_menu_json()
   print('Updating iiab installed services\' menus')
   put_iiab_enabled_into_menu_json()


def put_iiab_enabled_into_menu_json():
   cmd = "cat " + iiab_ini_file + " | grep True | grep _enabled | cut -d_ -f1"
   args = shlex.split(cmd)
   try:
      outp = subprocess.check_output(cmd,shell=True)
   except subprocess.CalledProcessError as e:
      print(str(e))
      sys.exit(1)
   for iiab_option in outp.split('\n'):
      if iiab_option in iiab_menu_items:
         update_menu_json(iiab_menu_items[iiab_option])
         
def update_menu_json(new_item):
   with open(menuJsonPath,"r") as menu_fp:
      reads = menu_fp.read()
      #print("menu.json:%s"%reads)
      data = json.loads(reads)
      if data.get('autoupdate_menu','') == 'false' or\
         data.get('autoupdate_menu','') == 'False':
         return

      for item in data['menu_items_1']:
         if item == new_item:
            return
      # new_item does not exist in list
      last_item = data['menu_items_1'].pop()
      # always keep credits last
      if last_item.find('credits') == -1:
         data['menu_items_1'].append(last_item)
         data['menu_items_1'].append(new_item)
      else:
         data['menu_items_1'].append(new_item)
         data['menu_items_1'].append(last_item)
   with open(menuJsonPath,"w") as menu_fp:
      menu_fp.write(json.dumps(data, indent=2))

def put_kiwix_enabled_into_menu_json():
   # steps:
   #   1. Make sure all downloaded zims are in zim_verion_idx
   #   2. Look for a back link to perma_ref in menuDefs
   #   3. If back link exist update, otherwise create new menuDef

   # check for un-indexed zims in zims/content/,write to zim_versions_idx.json
   kiwix.init()
   kiwix.get_zim_list(zim_path)
   kiwix.write_zim_versions_idx()
   # use that data
   zim_idx = zim_version_idx_dir + zim_version_idx_file
   if os.path.isfile(zim_idx):
      with open(zim_idx,"r") as zim_fp:
         zim_versions_info = json.loads(zim_fp.read())
         for perma_ref in zim_versions_info:
            # create the canonical menu_item name
            lang = zim_versions_info[perma_ref].get('language','en')
            default_name = lang + '-' + perma_ref + '.json'
            # check if menuDef exists for this perma_ref
            menu_item = kiwix.find_menuitem_from_zimname(perma_ref)
            #if menu_item == '':
            if True:
               # no menuDef points to this perma_ref
               menu_item = create_menu_def(perma_ref, default_name)
               if menu_item == '': continue
            update_menu_json(menu_item)
     
            # make the menu_item reflect any name changes due to collision
            zim_versions_info[perma_ref]['menu_item'] = menu_item
      # write the updated menu_item links
      with open(zim_idx,"w") as zim_fp:
         zim_fp.write(json.dumps(zim_versions_info,indent=2))

def create_menu_def(perma_ref,default_name,intended_use='zim'):
   # do not generate a menuDef for the test zim
   if perma_ref == 'tes': return ""
   # check for collision
   collision = False
   if os.path.isfile(menuDefs + default_name):
      with open(menuDefs + default_name,"r") as menu_fp:
         try:
            menu_dict = json.loads(menu_fp.read())
            if menu_dict['intended_use'] != intended_use:
               collision = True
         except Exception as e:
            print(str(e))
   if collision == True:
      default_name = default_name[:-5] + '-' + intended_use + '.json'
   # the following fixes menudefs with embeddded '.' in file name
   if default_name.find('.') > -1:
       default_name = default_name[:-5].replace('.','_') + '.json'
   item = kiwix.get_kiwix_catalog_item(perma_ref)
   if len(item.get('language','')) > 2:
     lang = item['language'][:2]
   else: # default to english
     lang = 'en'
   filename = lang + '-' + perma_ref + '.json'
   # create a stub for this zim
   menuDef = {}
   default_logo = get_default_logo(perma_ref,lang)
   menuDef["intended_use"] = "zim"
   menuDef["language"] = lang
   menuDef["logo_url"] = default_logo
   menuitem = lang + '-' + perma_ref
   menuDef["menu_item_name"] = default_name[:-5]
   menuDef["title"] = item.get('title','')
   menuDef["zim_name"] = perma_ref
   menuDef["start_url"] = ''
   menuDef["description"] = 'Size: ##SIZE##, Articles: ##ARTICLE_COUNT##, Media: ##MEDIA_COUNT##, Tags; [##tags##], Language: ##language##'
   menuDef["extra_html"] = ""
   menuDef["automatically_generated"] = "true"
   print("creating %s"%menuDefs + default_name)
   with open(menuDefs + default_name,'w') as menufile:
      menufile.write(json.dumps(menuDef,indent=2))
   return default_name[:-5]

def update_href_in_menu_def(menu_def,perma_ref):
    with open(menuDefs + menu_def + '.json','r') as md_file:
        menu_def_dict = json.reads(md_file.read())
        menu_def_dict['file_name'] = file_name
    with open(menuDefs + menu_def + '.json','w') as md_file:
        md_file.write(json.dumps(menu_def_dict))
   
def put_oer2go_enabled_into_menu_json():
   cmd = SCRIPT_DIR + '/get_oer2go_catalog --no_download -v'
   args = shlex.split(cmd)
   try:
      outp = subprocess.check_output(args,shell=True)
   except subprocess.CalledProcessError as e:
      print(str(e))
      sys.exit(1)

def get_default_logo(logo_selector,lang):
   #  Select the first part of the selector
   short_selector = logo_selector[:logo_selector.find('_')]
   # give preference to language if present
   rtn = check_everything(short_selector)
   if rtn == '':
      # try for a match without language prefix
      nolang_selector = short_selector[3:]
      rtn = check_everything(nolang_selector)
      if rtn == '':
          # Maybe logo is present in en-- check for en-<selector>
          en_default = "en-" + short_selector
          rtn = check_everything(en_default)
          if rtn == '':
             # add more checks here
             return ''
          else:
             return rtn
      else:
         return rtn
   else:
       return rtn

def check_everything(selector):
   rtn = check_default_logos(selector)
   if rtn == '':
      return check_jpg_png(selector)
   else:
      return rtn

def check_default_logos(selector):
   default_logos = {
      "wiktionary":"en-wiktionary.png",
      "wikivoyage":"en-wikivoyage.png",
      "wikinews":"wikinews-logo.png",
      "wiktionary":"en-wiktionary.png",
      "wikipedia":"en-wikipedia.png",
      "phet_en":"phet-logo-48x48.phg",
      "wikem":"WikEM-Logo-m.png"
   }
   for logo in default_logos:
      #print("logo: %s  selector: %s"%(logo,selector))
      if logo.startswith(selector):
         return default_logos[logo]
   if selector.find('stackexchange') > -1:
      return "stackexchange.png"
   return ''

def check_jpg_png(selector):
   # check for a png or jpg with same selector
   if os.path.isfile(menuImages + selector + '.jpg'):
      return selector + '.jpg'
   if os.path.isfile(menuImages + selector.lower() + '.jpg'):
      return selector.lower() + '.jpg'
   if os.path.isfile(menuImages + selector + '.png'):
      return selector + '.png'
   if os.path.isfile(menuImages + selector.lower() + '.png'):
      return selector.lower()+ '.png'
   return ''

def human_readable(num):
    # return 3 significant digits and unit specifier
    num = float(num)
    units = [ '','K','M','G']
    for i in range(4):
        if num<10.0:
            return "%.2f%s"%(num,units[i])
        if num<100.0:
            return "%.1f%s"%(num,units[i])
        if num < 1000.0:
            return "%.0f%s"%(num,units[i])
        num /= 1000.0


# Now start the application
if __name__ == "__main__":

    # Run the main routine
    main()
