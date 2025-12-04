#!/usr/bin/python3
# Download module from Contabo
# Usage: get_contabo_module.py <module_name>
# Assumes the Contabo storage endpoint:
# https://usc1.contabostorage.com/0985d391e0364353ab3c2577fcf25f99:iiab-modules/
# and that the module name corresponds to a directory on Contabo storage
# and that an index file <module_name>.index.json exists listing files.

import os
import sys
from datetime import datetime, timezone
import argparse
import requests
import iiab.adm_lib as adm

# module = 'gon-healthphone'
contabo_modules_url = 'https://usc1.contabostorage.com/0985d391e0364353ab3c2577fcf25f99:iiab-modules/'

def main():
    try:
        args = parse_args()
    except:
        sys.exit(1)

    module = args.module

    # print(args)
    mod_index_url = contabo_modules_url + module + '.index.json'

    try:
        r = requests.get(mod_index_url)
        r.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"Error fetching module index: {e}")
        sys.exit(1)

    mod_index = r.json()
    for item in mod_index:
        if item['IsDir']:
            continue # skip directories
        if not download_file(module, item):
            print(f"Failed to download {item.get('Path')} from module {module}")
            print("Exiting.")
            sys.exit(1)
    sys.exit(0)

def download_file(module, item):
    """
    Downloads a file from a given URL and saves it to a local path.

    Args:
        module (str): The name of the Module.
        item (dict): Metadata for one file in the module.
    """
    url = contabo_modules_url + module + '/' + item.get('Path')
    local_filename = adm.CONST.rachel_working_dir + module + '/' + item.get('Path')  # Save with the original filename

    # Ensure the directory exists
    local_dir = os.path.dirname(local_filename)
    try:
        if not os.path.exists(local_dir):
            os.makedirs(local_dir)
    except OSError as e:
        print(f"Error creating directory {local_dir}: {e}")
        return False

    # Check existing file size and modification time
    if os.path.exists(local_filename):
        local_size = os.path.getsize(local_filename)
        remote_size = item.get('Size')
        size_ok = (remote_size is None) or (int(remote_size) == int(local_size))

        # Try to parse remote modification time from common keys
        remote_mtime_str = item.get('ModTime')
        mtime_ok = False
        if remote_mtime_str:
            remote_dt = None
            for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d"):
                try:
                    # Handle Z timezone
                    s = remote_mtime_str
                    if s.endswith("Z") and fmt.endswith("Z"):
                        remote_dt = datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
                    else:
                        remote_dt = datetime.fromisoformat(s)
                    break
                except Exception:
                    remote_dt = None
            if remote_dt:
                # local mtime in UTC
                local_dt = datetime.fromtimestamp(os.path.getmtime(local_filename), tz=timezone.utc)
                # consider up-to-date if local is newer or equal
                mtime_ok = local_dt >= remote_dt

        if size_ok and (remote_mtime_str is None or mtime_ok):
            print(f"Skipping download for '{local_filename}' (up-to-date).")
            return True
        else:
            print(f"Updating '{local_filename}': size_ok={size_ok}, mtime_ok={mtime_ok}")

    # Download file
    try:
        with requests.get(url, stream=True) as r:
            r.raise_for_status()  # Raise an HTTPError for bad responses (4xx or 5xx)
            with open(local_filename, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
        # Optionally set local file mtime if remote time provided
        remote_mtime_str = item.get('ModTime') or item.get('MTime') or item.get('ModDate') or item.get('LastModified')
        if remote_mtime_str:
            try:
                remote_dt = None
                for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d"):
                    try:
                        s = remote_mtime_str
                        if s.endswith("Z") and fmt.endswith("Z"):
                            remote_dt = datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
                        else:
                            remote_dt = datetime.fromisoformat(s)
                        break
                    except Exception:
                        remote_dt = None
                if remote_dt:
                    # set mtime (os.utime expects epoch seconds)
                    epoch = remote_dt.timestamp()
                    os.utime(local_filename, (epoch, epoch))
            except Exception:
                pass

        print(f"File '{local_filename}' downloaded successfully.")
    except requests.exceptions.RequestException as e:
        print(f"Error downloading file: {e}")
        return False
    return True

def parse_args():
    parser = argparse.ArgumentParser(description="Download module from Contabo.")
    parser.add_argument("module", help="The name of the Module.")
    return parser.parse_args()

if __name__ == "__main__":
   # Now run the main routine
    main()
