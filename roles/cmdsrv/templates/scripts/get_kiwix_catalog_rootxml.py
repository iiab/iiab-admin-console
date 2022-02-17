#!/usr/bin/python3

import json
import csv
import operator
import base64
import os.path
import sys
import requests
import urllib.request, urllib.error, urllib.parse
from bs4 import BeautifulSoup
import time

# requires
# pip3 install beautifulsoup4
# apt install python3-lxml

verbose = False
if len(sys.argv) > 1:
    if sys.argv[1] in ('-v'):
        verbose = True

WWROOT = "{{ doc_root }}"
jsonPath = "{{ iiab_config_dir }}"
iiab_zim_cat_url = "{{ iiab_zim_cat_url }}"

kiwix_include_zimit = False # check for tag _sw:yes

# for testing
#WWROOT = "/library/www/html"
#jsonPath = "/etc/iiab"
#iiab_zim_cat_url = 'https://raw.githubusercontent.com/iiab-share/iiab-content/main/catalogs/iiab-zim-cat.json'

# As of Jan 1, 2022
# no zims were observed not to have _videos tag, so magic date logic no longer needed
# some zims were observed not to have date attribute

# timeframe inclusion of videos
magicDate = "2017-07"

zimCat = {}
zims = {}

# input file

kiwix_catalog_url = 'https://library.kiwix.org/catalog/root.xml'

# output files

kiwix_catalog = jsonPath + "/kiwix_catalog.json"

if verbose:
    print("Starting xml download from Kiwix")

cat_error = False
try:
    r = requests.get(kiwix_catalog_url)
    r.raise_for_status()
except requests.exceptions.HTTPError as errh:
    print ("Http Error:",errh)
    cat_error = True
except requests.exceptions.ConnectionError as errc:
    print ("Error Connecting:",errc)
    cat_error = True
except requests.exceptions.Timeout as errt:
    print ("Timeout Error:",errt)
    cat_error = True
except requests.exceptions.RequestException as err:
    print ("OOps: Something Else",err)
    cat_error = True

if cat_error:
    sys.stdout.write("GET-KIWIX-CAT ERROR - Failed to get Catalog")
    sys.stdout.flush()
    sys.exit(1)

# read our zim catalog
# no try catch as mask our bugs

if verbose:
    print("Reading Our Catalog")

url_handle = urllib.request.urlopen(iiab_zim_cat_url)
iiab_zim_cat_json = url_handle.read()
url_handle.close()
iiab_zim_cat = json.loads(iiab_zim_cat_json)

if verbose:
    print("Parsing xml downloads from Kiwix")

# now parse Kiwix catalog
bs_content = BeautifulSoup(r.text, "lxml")
zims = bs_content.find_all('entry')

zimCount = 0

def main():
    global portable_list, zimCount
    zimCount = 0

    if verbose:
        print("Starting of processing xml download from Kiwix to " + kiwix_catalog)

    # go through zims in zim directory and change url to portable if no ftindex
    zim_dict = {}
    for zim in zims:
        id = zim.find('id').text.split(':')[2]
        zim_attr = parse_root_attr(zim)
        if zim_attr['uses_socket_workers'] and not kiwix_include_zimit: # skip service workers for now
            continue

        zimCount += 1
        zim_dict[id] = zim_attr

    # now merge our own zim catalog
    if verbose:
        print("Starting of processing our zim catalog into " + kiwix_catalog)
    for zim_id in iiab_zim_cat:
        zim_attr = parse_attr(iiab_zim_cat[zim_id])
        # fix up any fields
        zim_attr['category'] = zim_attr['creator'] # need to match zim_functions.js
        zim_attr['source'] = 'IIAB' # steal field no longer used for portable
        zim_dict[zim_id] = zim_attr

    zimCat['download_date'] = time.strftime("%Y-%m-%d.%H:%M:%S")
    zimCat['zims'] = zim_dict

    if verbose:
        print("Ready to write " + kiwix_catalog)

    with open(kiwix_catalog, 'w') as fp:
        json.dump(zimCat, fp)

    if verbose:
        print("Finished writing to " + kiwix_catalog)

    sys.stdout.write("SUCCESS")
    sys.stdout.flush()
    sys.exit(0)

def parse_root_attr(entity):

    # zim catalog keys
    # dict_keys(['path', 'title', 'description', 'language', 'creator', 'publisher', 'name', 'tags', 'date', 'url', 'articleCount', 'mediaCount', 'size', 'download_url', 'file_ref', 'perma_ref', 'category', 'sequence', 'has_embedded_index', 'has_details', 'has_pictures', 'has_videos', 'uses_socket_workers', 'source'])


    zim = entity
    zim_attr = {}
    has_embedded_index = False
    has_details = False
    has_pictures = False
    has_videos = False
    uses_socket_workers = False
    source = "zims"

    zim_attr['title'] = zim.find('title').text.strip()
    zim_attr['description'] = zim.find('summary').text.strip()
    # zim_attr['language'] = zim.find('language').text.strip()

    for attr in ['language', 'name', 'publisher', 'flavour']:
        zim_attr[attr] = zim.find(attr).text.strip()

    zim_attr['date'] = zim.find('updated').text.strip().split('T')[0]

    tags = zim.find('tags').text.split(';')
    tag_dict = {}
    for tag in tags:
        pair = tag.split(':')
        tag_dict[pair[0]] = pair[1] if len(pair) == 2 else None

    # messy to have tags and tag_dict, but makes parsing easier

    if '_ftindex:yes' in tags:
        has_embedded_index = True
    else:
        has_embedded_index = False

    if '_pictures:yes' in tags:
        has_pictures = True
    else:
        has_pictures = False

    if '_videos:yes' in tags:
        has_videos = True
    else:
        has_videos = False

    if '_details:yes' in tags:
        has_details = True
    else:
        has_details = False

    if '_sw:yes' in tags:
        uses_socket_workers = True
    else:
        uses_socket_workers = False


    url = zim.find('link', type = "application/x-zim")['href']

    urlSlash = url.split('/')
    urlEnd = urlSlash[-1] # last element
    fileRef = urlEnd.split('.zim')[0] # true for both internal and external index
    permaRefParts = urlEnd.split('_')
    permaRefParts = permaRefParts[0:len(permaRefParts) - 1]
    permaRef = permaRefParts[0]
    for part in permaRefParts[1:]:
       if not part.isdigit():
          permaRef += "_" + part

    size = zim.find('link', type = "application/x-zim")['length']

    # not sure what is the best source for category - explicit element or tags

    category = zim.find('category').text.strip()
    category = tag_dict.get('_category')
    if not category:
        category = urlSlash[4].replace('_',' ')
    if category:
        category = category.title()

    zim_attr['creator'] = zim.find('author').text.strip()
    # category = attributes['creator'] not a good choice now

    sequence = 8 - (4 * has_videos + 2 * has_pictures + 1 * has_details)
    downloadUrl = url.replace(".zim.meta4", ".zim")

    # print zimCount, attributes['language'], attributes['title'], attributes['description']

    if 'description' in zim_attr:
        zim_attr['description'] = zim_attr['description'].replace('"', '&quot;') # replace quotes that break parsing

    zim_attr['articleCount'] = zim.find('articlecount').text.strip()
    zim_attr['mediaCount'] = zim.find('mediacount').text.strip()


    zim_attr['download_url'] = downloadUrl
    zim_attr['size'] = size
    zim_attr['file_ref'] = fileRef
    zim_attr['perma_ref'] = permaRef
    zim_attr['category'] = category
    zim_attr['sequence'] = sequence
    zim_attr['has_embedded_index'] = has_embedded_index
    zim_attr['has_details'] = has_details
    zim_attr['has_pictures'] = has_pictures
    zim_attr['has_videos'] = has_videos
    zim_attr['uses_socket_workers'] = uses_socket_workers
    zim_attr['source'] = source
    return(zim_attr)

def parse_attr(attributes):

    zimAttr = {}
    has_embedded_index = False
    has_details = True
    has_pictures = True
    has_videos = True
    source = "zims"

    lang = attributes['language']
    category = attributes['creator']

    tags = attributes['tags'].split(';') if 'tags' in attributes else []
    if '_ftindex:yes' in tags:
        has_embedded_index = True

    if 'nodet' in tags:
        has_details = False
        has_pictures = False
        has_videos = False

    if 'nopic' in tags:
        has_pictures = False
        has_videos = False

    if 'novid' in tags:
        has_videos = False
    if attributes['date'] < magicDate:
        has_videos = False

    url = attributes['url']
    urlSlash = url.split('/')
    urlEnd = urlSlash[-1] # last element
    fileRef = urlEnd.split('.zim')[0] # true for both internal and external index
    permaRefParts = urlEnd.split('_')
    permaRefParts = permaRefParts[0:len(permaRefParts) - 1]
    permaRef = permaRefParts[0]
    for part in permaRefParts[1:]:
       if not part.isdigit():
          permaRef += "_" + part
    category = urlSlash[4].replace('_',' ').title()
    sequence = 8 - (4 * has_videos + 2 * has_pictures + 1 * has_details)

    downloadUrl = url.replace(".zim.meta4", ".zim")

    # print zimCount, attributes['language'], attributes['title'], attributes['description']
    for key in attributes:
        if key not in ['id','favicon','faviconMimeType']:
            zimAttr[key] = attributes[key]
    if 'description' in zimAttr:
        zimAttr['description'] = zimAttr['description'].replace('"', '&quot;') # replace quotes that break parsing
    zimAttr['download_url'] = downloadUrl
    zimAttr['file_ref'] = fileRef
    zimAttr['perma_ref'] = permaRef
    zimAttr['category'] = category
    zimAttr['sequence'] = sequence
    zimAttr['has_embedded_index'] = has_embedded_index
    zimAttr['has_details'] = has_details
    zimAttr['has_pictures'] = has_pictures
    zimAttr['has_videos'] = has_videos
    zimAttr['source'] = source
    return(zimAttr)

if __name__ == "__main__":
    main()
