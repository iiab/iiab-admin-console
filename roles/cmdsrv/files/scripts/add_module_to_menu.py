#!/usr/bin/python3
import argparse
import iiab.adm_lib as adm

def main ():
    args = parse_args()
    adm.update_menu_json(args.module, no_lang=False)

def parse_args():
    parser = argparse.ArgumentParser(description="Add module to home menu.")
    parser.add_argument("module", help="The name of the module.")
    return parser.parse_args()

if __name__ == "__main__":
    # Now run the main routine
    main()
