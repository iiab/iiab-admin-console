#!/usr/bin/python3

"""

   Multi-threaded Polling Command server

   Author: Tim Moody <tim(at)timmoody(dot)com>
   Contributions: Guillaume Aubert (gaubert) <guillaume(dot)aubert(at)gmail(dot)com>
                 Felipe Cruz <felipecruz@loogica.net>

   Accepts commands in the form COMMAND <optional json-encoded arguments>
   Returns json-encoded results

"""

import os, sys, syslog, signal
from glob import glob
import logging
from systemd import journal
import pwd, grp
import time
from datetime import date, datetime, timedelta
import threading, subprocess
import shlex
import shutil
import zmq
import sqlite3
import json
import xml.etree.ElementTree as ET
import yaml
import configparser
import re
import urllib.request, urllib.error, urllib.parse
import string
import imghdr
import crypt
import spwd
import cracklib
import socket
import iiab.adm_lib as adm


# import cgi # keep to escape html in future

# cmdsrv config file
# if run standalone is in current directory
# if run as service the directory is passed as an environment variable by systemd

if 'CMDSRV_DIR' in os.environ:
    cmdsrv_dir = os.environ['CMDSRV_DIR']
else:
    cmdsrv_dir = "."

cmdsrv_config_file = cmdsrv_dir + "/cmdsrv.conf"
cmdsrv_pid_file = "/run/iiab-cmdsrv.pid"
cmdsrv_ready_file = "/run/iiab-cmdsrv-ready"

# IIAB Config Files
iiab_config_file = None
iiab_ini_file = None
iiab_local_vars_file = None

# Variables that should be read from config file
# All of these variables will be read from config files and recomputed in init()
iiab_repo = None
iiab_base = None
cmdsrv_dbname = None

cmdsrv_no_workers = 5
cmdsrv_job_poll_sleep_interval = 1
cmdsrv_max_concurrent_jobs = 7

cmdsrv_lower_job_priority_flag = None
cmdsrv_lower_job_priority_str= None

# Derived Variables
cmdsrv_dbpath = None

# Constants
# for kiwix zims
kiwix_catalog_file = None
doc_root = None
content_base = None
zim_downloads_dir = None
zim_download_prefix = None
zim_working_dir = None
zim_dir = None
zim_content_dir = None
zim_index_dir = None
oer2go_catalog_file = None
oer2go_mods_url = None
rachel_downloads_dir = None
rachel_working_dir = None
rachel_version = None
maps_downloads_dir = None
maps_working_dir = None
maps_catalog_url = None
maps_catalog_file = None
# maps_catalog_url_v2 = future if we need to download
adm_maps_catalog_file = None # used exclusively by admin console
maps_tiles_base = None
maps_sat_base = None
maps_download_src = None
vector_map_path = None
vector_map_tiles_path = None
osm_version = None
modules_dir = None
small_device_size = 525000 # bigger than anticipated boot partition
js_menu_dir = None

# Global Variables
last_command_rowid = 0
last_job_rowid = 0

active_commands = {}
zims_wip = {}
#
# CLEAN UP
#
#zims_wip["DOWNLOAD"] = {}
#zims_wip["IMPORT"] = {}
#zims_wip["EXPORT"] = {}

zims_downloading = {} # not used
zims_copying = {} # not used
oer2go_wip = {}
#oer2go_downloading = {}
#oer2go_copying = {}
oer2go_installed = []
osm_vect_installed = []
maps_wip = {}
jobs_requested = {}
jobs_to_restart = {}
jobs_to_cancel = {}
prereq_jobs = {}
jobs_running = {}
running_job_count = 0

ANSIBLE_COMMANDS = ["RUN-ANSIBLE", "RESET-NETWORK", "RUN-ANSIBLE-ROLES"]
ansible_running_flag = False
iiab_roles_status = {}
daemon_mode = False
init_error = False

# Logging

journal_log = logging.getLogger('IIAB-CMDSRV')
journal_log.setLevel(5) # having two different severity scales is nuts
journal_log.propagate = False
jhandler = journal.JournalHandler(SYSLOG_IDENTIFIER='IIAB-CMDSRV')
journal_log.addHandler(jhandler)

# Locking
lock = threading.Lock() # for updating global variables
db_lock = threading.Lock() # for sqlite db concurrency

# vars read from ansible vars directory
# effective is composite where local takes precedence

adm_conf = {} # for use by front end
default_vars = {} # /opt/iiab/iiab/vars/default_vars.yml
local_vars = {} # /etc/iiab/local_vars.yml
effective_vars = {}
ansible_facts = {}
ansible_tags = {}
iiab_ini = {}
kiwix_catalog = {}
oer2go_catalog = {}
maps_catalog = {} # this has been flattened when read to include both maps and base
is_rpi = False

# vars set by admin-console
# config_vars = {} no longer distinct from local vars

# available commands are in cmd_handler

def main():
    """Server routine"""

    #global daemon_mode
    #daemon_mode = True # for testing

    global init_error

    # if not in daemon mode don't trap errors
    if daemon_mode == False:
        init()
    else:
        try:
            init()
        except:
            init_error = True
            log(syslog.LOG_INFO, 'Command Server Initialization Failed' )

    worker_data_url = "inproc://worker_data"
    worker_control_url = "inproc://worker_control"
    ipc_sock = "/run/cmdsrv_sock"
    client_url = "ipc://" + ipc_sock

    owner = pwd.getpwnam(apache_user)
    group = grp.getgrnam(apache_user)

    # Prepare our context and sockets
    context = zmq.Context.instance()

    # Socket to talk to clients
    clients = context.socket(zmq.ROUTER)
    clients.bind(client_url)
    os.chown(ipc_sock, owner.pw_uid, group.gr_gid)
    os.chmod(ipc_sock, 0o770)

    # Socket to talk to workers
    workers_data = context.socket(zmq.DEALER)
    workers_data.bind(worker_data_url)
    workers_control = context.socket(zmq.PUB)
    workers_control.bind(worker_control_url)

    # Launch thread to monitor jobs
    thread = threading.Thread(target=job_minder_thread, args=(client_url, worker_control_url,))
    thread.start()

    # Launch pool of worker threads
    for i in range(cmdsrv_no_workers):
        thread = threading.Thread(target=cmd_proc_thread, args=(worker_data_url, worker_control_url,))
        thread.start()


    poll = zmq.Poller()
    poll.register(clients, zmq.POLLIN)
    poll.register(workers_data, zmq.POLLIN)

    server_run = True
    set_ready_flag("ON")

    while server_run == True:
        sockets = dict(poll.poll())
        if clients in sockets:
            ident, msg = clients.recv_multipart()
            msg = msg.decode('utf8') # byte to str
            #tprint(f'sending message server received from client to worker %s id %s' % (msg, ident))
            tprint(f'sending message server received from client to worker {msg} id {ident}')
            if msg == 'STOP':
                # Tell the worker threads to shut down
                set_ready_flag("OFF")
                tprint('sending control message server received from client to worker %s id %s' % (msg, ident))
                workers_control.send(b'EXIT')
                clients.send_multipart([ident, b'{"Status": "Stopping"}'])
                log(syslog.LOG_INFO, 'Stopping Command Server')
                time.sleep(3)
                server_run = False
            else:
                # if in daemon mode report and init failed always return same error message
                if daemon_mode == True and init_error == True:
                    msg = '{"Error": "IIAB-CMDSRV failed to initialize","Alert": "True"}'
                    clients.send_multipart([ident, msg.encode('utf8')])
                else:
                    tprint('sending data message server received from client to worker %s id %s' % (msg, ident))
                    log(syslog.LOG_INFO, 'Received CMD Message %s.' % msg )
                    workers_data.send_multipart([ident, msg.encode('utf8')])
        if workers_data in sockets:
            ident, msg = workers_data.recv_multipart()
            tprint('Sending worker message to client %s id %s' % (msg[:60], ident))
            clients.send_multipart([ident, msg])

    # Clean up if server is stopped
    clients.close()
    workers_data.close()
    workers_control.close()
    context.term()

    # Delete any pid file to keep systemd happy
    try:
        os.remove(cmdsrv_pid_file)
    except OSError:
        pass

    sys.exit()

def job_minder_thread(client_url, worker_control_url, context=None):
    """Job Monitoring Worker Routine"""

    global jobs_requested # queue from command processor
    global jobs_to_restart # queue from incomplete jobs in init
    global jobs_to_cancel # queue of scheduled or running jobs to be cancellled from cancel command
    global prereq_jobs # status of predecessor job = depend_on_job_id; used to cascade job steps; we do not support multiple descendents
    global jobs_running # queue of jobs running, started from jobs requested
    global ansible_running_flag
    global running_job_count

    tprint ("in job_minder_thread")
    log(syslog.LOG_INFO, 'Job Minder Thread Started')

    # working lists
    jobs_requested_list = [] # just the job_id from jobs_requested
    jobs_requested_done = [] # list of processed job_id from jobs_requested
    prereq_jobs_to_clear = [] # prerequisite jobs whose descendent has been processed
    jobs_to_close = [] # list of running jobs that have completed or been cancelled
    prereq_info = {}

    # control signals from main thread
    context = context or zmq.Context.instance()
    control_socket = context.socket(zmq.SUB)
    control_socket.connect(worker_control_url)
    control_socket.setsockopt_string(zmq.SUBSCRIBE,"")

    # Socket to send job status back to main
    resp_socket = context.socket(zmq.DEALER)
    resp_socket.connect(client_url)

    poll = zmq.Poller()
    poll.register(control_socket, zmq.POLLIN)

    # Restart any incomplete jobs found during init
    for job_id in jobs_to_restart:
        job_info = jobs_to_restart[job_id]
        if job_info['has_dependent'] == "Y":
            prereq_info ['status'] = 'STARTED' # for both 'STARTED' and 'RESTARTED'
            prereq_jobs[job_id] = prereq_info
        else:
            add_wip(job_info)
        job_info = start_job(job_id, job_info, status='RESTARTED')
        jobs_running[job_id] = job_info

    jobs_to_restart = {}

    thread_run = True

    # Main loop of IIAB-CMDSRV

    while thread_run == True:
        lock.acquire() # will block if lock is already held
        try:
            jobs_requested_list = list(jobs_requested.keys()) # create copy of keys so we can update global dictionary in loop
        finally:
            lock.release() # release lock, no matter what

        # Go through each job in requested queue and conditionally start or cancel
        # These are marked Scheduled

        jobs_requested_done = [] # list of processed job_ids from jobs_requested to be cleared later
        jobs_requested_list.sort()

        for job_id in jobs_requested_list:
            job_info = jobs_requested[job_id]

            #print "starting cancel of requested"

            # Remove cancelled jobs
            if job_id in jobs_to_cancel:
                job_info = cancel_req_job(job_id, job_info)
                jobs_requested[job_id] = job_info
                jobs_requested_done.append(job_id)

                # we will pop from jobs_to_cancel later when clearing jobs_requested
                continue

            # don't create ansible job if one is running
            if job_info['cmd'] in ANSIBLE_COMMANDS and ansible_running_flag == True:
                continue

            # don't start job if at max allowed
            if running_job_count >= cmdsrv_max_concurrent_jobs:
                # print(f'Waiting for queue: running_job_count {running_job_count}, cmdsrv_max_concurrent_jobs {cmdsrv_max_concurrent_jobs}')
                continue

            #print "starting prereq check"
            # don't start job if it depends on another job that is not finished
            depend_on_job_id = job_info['depend_on_job_id']

            if depend_on_job_id in prereq_jobs:
                prereq_status = prereq_jobs[depend_on_job_id]['status']

                if prereq_status == 'SCHEDULED' or prereq_status == 'STARTED':
                    continue # successor step can't start yet
                else:
                    if prereq_status == 'SUCCEEDED':
                        job_info = start_job(job_id, job_info) # Create running job
                        jobs_running[job_id] = job_info
                        if job_id in prereq_jobs:
                            prereq_jobs[job_id]['status'] = 'STARTED'
                        jobs_requested_done.append(job_id)
                        prereq_jobs_to_clear.append(depend_on_job_id) # mark for deletion
                    else: # predecessor failed or was cancelled
                        job_info = cancel_req_job(job_id, job_info)
                        jobs_requested_done.append(job_id)
                        prereq_jobs_to_clear.append(depend_on_job_id) # mark for deletion

            else: # not a multi-step job or first step of multi
                # don't start if depends on uninstalled or inactive service
                service_required = job_info.get('service_required') # array that holds service and required state
                if service_required:
                    if not iiab_roles_status.get(service_required[0], {}).get(service_required[1]):
                        continue
                job_info = start_job(job_id, job_info) # Create running job
                jobs_running[job_id] = job_info
                jobs_requested_done.append(job_id)

        #print 'starting clear'

        # Clear started or cancelled jobs from requested queue and prereq dict
        for job_id in jobs_requested_done:
            jobs_requested.pop(job_id, None)
            if job_id in jobs_to_cancel:
                jobs_to_cancel.pop(job_id, None)
        jobs_requested_done = []

        # clear prerequisites for started or failed jobs from prereq_jobs
        for depend_on_job_id in prereq_jobs_to_clear:
            prereq_jobs.pop (depend_on_job_id, None)
        prereq_jobs_to_clear = []

        #print 'starting poll'
        # poll jobs_running for completed jobs
        for job_id in jobs_running:

            jobs_running[job_id]['subproc'].poll()
            returncode = jobs_running[job_id]['subproc'].returncode

            if returncode == None:
                tprint (str(job_id) + ' still running.')

                # Cancel job if requested
                if job_id in jobs_to_cancel:
                    tprint (str(job_id) + ' cancelled.')
                    p = jobs_running[job_id]['subproc']
                    p.send_signal(signal.SIGINT)
                    t = 0
                    while t < 5:
                        rc = p.poll()
                        if rc != None:
                            break
                        time.sleep(1)
                        t += 1
                    if rc == None:
                        p.kill()
                    job_info = end_job(job_id, jobs_running[job_id], 'CANCELLED')
                    jobs_to_close.append(job_id)
                    upd_job_cancelled(job_id)
            else:
                tprint (str(job_id) + ' terminated.')

                # job_info['status_datetime'] = str(datetime.now()) ?
                if returncode == 0:
                    status = 'SUCCEEDED'
                else:
                    status = 'FAILED'

                job_info = end_job(job_id, jobs_running[job_id], status)

                # flag job for removal
                jobs_to_close.append(job_id)

        # print 'starting close jobs'
        # now remove closed jobs from running list
        for key in jobs_to_close:
            if jobs_running[key]['has_dependent'] == "N": # delete from command list if last step of command
                active_commands.pop(jobs_running[key]['cmd_rowid'], None)
                remove_wip(jobs_running[key])
            jobs_running.pop(key, None)
            if key in jobs_to_cancel:
                jobs_to_cancel.pop(key, None)
        jobs_to_close = []

        #print 'starting socket poll'
        sockets = dict(poll.poll(1000))
        if control_socket in sockets:
            ctl_msg = control_socket.recv_string()
            tprint('got ctl msg %s in monitor' % ctl_msg)
            if ctl_msg == "EXIT":
                # stop loop in order to terminate thread
                log(syslog.LOG_INFO, 'Stopping Command Server Monitor Thread')
                thread_run = False

        #print 'starting sleep'
        time.sleep(cmdsrv_job_poll_sleep_interval)
        #print 'ready to loop'

    # Clean up if thread is stopped
    resp_socket.close()
    control_socket.close()
    #context.term()
    #sys.exit()

def add_wip(job_info):
    global zims_wip
    global oer2go_wip
    global maps_wip

    dest = "internal"
    source = "kiwix"
    action = ""

    cmd = job_info['cmd']

    if cmd in {"INST-ZIMS", "COPY-ZIMS"}:
        zim_id = job_info['cmd_args']['zim_id']
        if cmd == "INST-ZIMS":
            action = "DOWNLOAD"
            dest = "internal"
            source = "kiwix"
        else:
            dest = job_info['cmd_args']['dest']
            source = job_info['cmd_args']['source']
            if cmd == "COPY-ZIMS" and dest == "internal":
                action = "IMPORT"
            elif cmd == "COPY-ZIMS" and dest != "internal":
                action = "EXPORT"
        zims_wip[zim_id] = {"cmd":cmd, "action":action, "dest":dest, "source":source}

    elif cmd in {"INST-OER2GO-MOD", "COPY-OER2GO-MOD"}:
        moddir = job_info['cmd_args']['moddir']
        if cmd == "INST-OER2GO-MOD":
            action = "DOWNLOAD"
            source = "oer2go"
        else:
            dest = job_info['cmd_args']['dest']
            source = job_info['cmd_args']['source']
            if cmd == "COPY-OER2GO-MOD" and dest == "internal":
                action = "IMPORT"
            elif cmd == "COPY-OER2GO-MOD" and dest != "internal":
                action = "EXPORT"
        oer2go_wip[moddir] = {"cmd":cmd, "action":action, "dest":dest, "source":source}

    elif cmd in {"INST-OSM-VECT-SET"}:
        # handle V1?
        map_id = job_info['cmd_args']['osm_vect_id']
        download_url = job_info['extra_vars']['download_url']
        size = job_info['extra_vars']['size']
        maps_wip[map_id] = {"cmd":cmd, "action":action, "dest":dest, "source":source, "download_url":download_url, "size": size}

    elif cmd in {"INST-SAT-AREA"}:
        pass
        # radius = job_info['extra_vars']['radius'] not much housekeeping to do

def remove_wip(job_info):
    global zims_wip
    global oer2go_wip
    global maps_wip

    #print job_info
    #print "in remove_wip"

    if job_info['cmd'] in ["INST-ZIMS", "COPY-ZIMS"]:
        zims_wip.pop(job_info['cmd_args']['zim_id'], None)
    elif job_info['cmd'] in ["INST-OER2GO-MOD", "COPY-OER2GO-MOD"]:
        oer2go_wip.pop(job_info['cmd_args']['moddir'], None)
    elif job_info['cmd'] in {"INST-OSM-VECT-SET"}:
        maps_wip.pop(job_info['cmd_args']['osm_vect_id'], None)

def start_job(job_id, job_info, status='STARTED'):
    global running_job_count
    global ansible_running_flag
    global prereq_jobs
    global cmdsrv_lower_job_priority_flag
    global cmdsrv_lower_job_priority_str

    job_info['output_file'] = '/tmp/job-' + str(job_id)
    job_info['file'] = open(job_info['output_file'], 'w')
    if cmdsrv_lower_job_priority_flag:
        args = shlex.split(cmdsrv_lower_job_priority_str + job_info['job_command'])
    else:
        args = shlex.split(job_info['job_command'])
    job_info['subproc'] = subprocess.Popen(args, stdout=job_info['file'], stderr=subprocess.STDOUT)
    job_info['job_pid'] = job_info['subproc'].pid
    job_info['status'] = status
    job_info['status_datetime'] = str(datetime.now())
    job_info['job_output'] = ""
    #print (job_info)
    if job_id in prereq_jobs:
        prereq_jobs[job_id]['status'] = 'STARTED'

    if job_info['cmd'] in ANSIBLE_COMMANDS:
        ansible_running_flag = True

    if status == 'STARTED':
        log_msg = "Starting"
    else:
        log_msg = "Restarting"

    log(syslog.LOG_INFO, "%s Job: %s, job_id: %s, pid: %s" % (log_msg, job_info['cmd'], job_id, job_info['job_pid']))

    # update jobs table
    upd_job_started(job_id, job_info['job_pid'], status)
    running_job_count += 1

    return (job_info)

def end_job(job_id, job_info, status): # modify to use tail of job_output

    global prereq_jobs
    global jobs_running
    global ansible_running_flag
    global running_job_count

    jobs_running[job_id]['file'].close()

    # load output from tmp file
    output_file = jobs_running[job_id]['output_file']
    #file = open(output_file, 'r')
    #job_output = file.read()
    #file.close()

    command = "tail " + output_file
    args = shlex.split(command)
    job_output = subproc_check_output(args)

    #print(job_output)
    # make html safe
    #job_output = escape_html(job_output)

    # remove non-printing chars as an alternative

    job_output = job_output.encode('ascii', 'replace').decode()

    #print(job_id)
    tprint(job_output)
    jobs_running[job_id]['job_output'] = job_output


    # job_info['status_datetime'] = str(datetime.now()) ?
    jobs_running[job_id]['status'] = status

    if job_id in prereq_jobs:
        prereq_jobs[job_id]['status'] = status

    log(syslog.LOG_INFO, "Job: %s, job_id: %s, pid: %s, status:%s" % (jobs_running[job_id]['cmd'], job_id, jobs_running[job_id]['job_pid'], status))

    # update jobs table and remove tmp output file
    upd_job_finished(job_id, job_output, status)
    os.remove(output_file)


    if job_info['cmd'] in ANSIBLE_COMMANDS:
        #if 1 == 1:
        ansible_running_flag = False
        #if status == "SUCCEEDED":
        read_iiab_ini_file() # reread ini file after running ansible
        read_iiab_roles_stat() # refresh global iiab_roles_status

    running_job_count -= 1
    if running_job_count < 0:
        running_job_count = 0

    return (job_info)

def cancel_req_job(job_id, job_info):
    global active_commands

    job_info['output_file'] = None
    job_info['file'] = None
    job_info['subproc'] = None
    #job_info['job_pid'] = None
    job_info['status'] = 'CANCELLED'
    job_info['status_datetime'] = str(datetime.now())
    #job_info['job_output'] = ""

    if job_id in prereq_jobs:
        prereq_jobs[job_id]['status'] = job_info['status']

    log(syslog.LOG_INFO, "Cancelling Job: %s, job_id: %s" % (job_info['cmd'], job_id))

    # update jobs table
    upd_job_cancelled(job_id)

    # Remove Active Command and any WIP tracking
    if job_info['has_dependent'] == "N": # delete from command list if last step of command
        active_commands.pop(job_info['cmd_rowid'], None)
        remove_wip(job_info)
    return (job_info)

def cmd_proc_thread(worker_data_url, worker_control_url, context=None):
    """Command Processing Worker Routine"""
    context = context or zmq.Context.instance()
    # Socket to talk to dispatcher
    data_socket = context.socket(zmq.DEALER)
    data_socket.connect(worker_data_url)

    # control signals from main thread
    control_socket = context.socket(zmq.SUB)
    control_socket.connect(worker_control_url)
    control_socket.setsockopt_string(zmq.SUBSCRIBE,"")

    poll = zmq.Poller()
    poll.register(data_socket, zmq.POLLIN)
    poll.register(control_socket, zmq.POLLIN)

    thread_run = True

    while thread_run == True:

        sockets = dict(poll.poll())
        # process command
        if data_socket in sockets:
            ident, cmd_msg = data_socket.recv_multipart()
            cmd_msg = cmd_msg.decode("utf8")
            tprint('sending message server received from client to worker %s id %s' % (cmd_msg, ident))
            cmd_resp = cmd_handler(cmd_msg)
            #print cmd_resp
            # 8/23/2015 added .encode() to response as list_library was giving unicode errors
            data_socket.send_multipart([ident, cmd_resp.encode()])
        if control_socket in sockets:
            ctl_msg = control_socket.recv_string()
            tprint('got ctl msg %s in worker' % ctl_msg)
            if ctl_msg == "EXIT":
                # stop loop in order to terminate thread
                log(syslog.LOG_INFO, 'Stopping Command Server Worker Thread')
                thread_run = False

    # Clean up if thread is stopped
    data_socket.close()
    control_socket.close()
    #context.term()
    #sys.exit()

########################################
# cmdlist List of all Commands is Here #
########################################

def cmd_handler(cmd_msg):

    # List of recognized commands and corresponding routine
    # Don't do anything else

    avail_cmds = {
        "TEST": {"funct": do_test, "inet_req": False},
        "LIST-LIBR": {"funct": list_library, "inet_req": False},
        "WGET": {"funct": wget_file, "inet_req": True},
        "GET-ADM-CONF": {"funct": get_adm_conf, "inet_req": False},
        "GET-ANS": {"funct": get_ans_facts, "inet_req": False},
        "GET-ANS-TAGS": {"funct": get_ans_tags, "inet_req": False},
        "GET-VARS": {"funct": get_install_vars, "inet_req": False},
        "GET-IIAB-INI": {"funct": get_iiab_ini, "inet_req": False},
        "SET-CONF": {"funct": set_config_vars, "inet_req": False},
        "GET-MEM-INFO": {"funct": get_mem_info, "inet_req": False},
        "GET-SPACE-AVAIL": {"funct": get_space_avail, "inet_req": False},
        "GET-STORAGE-INFO": {"funct": get_storage_info_lite, "inet_req": False},
        "GET-EXTDEV-INFO": {"funct": get_external_device_info, "inet_req": False},
        "GET-REM-DEV-LIST": {"funct": get_rem_dev_list, "inet_req": False},
        "GET-SYSTEM-INFO": {"funct": get_system_info, "inet_req": False},
        "GET-NETWORK-INFO": {"funct": get_network_info, "inet_req": False},
        "CTL-WIFI": {"funct": ctl_wifi, "inet_req": False},
        "SET-WPA-CREDENTIALS": {"funct": set_wpa_credentials, "inet_req": False},
        "CTL-BLUETOOTH": {"funct": ctl_bluetooth, "inet_req": False},
        "CTL-VPN": {"funct": ctl_vpn, "inet_req": True},
        "REMOVE-USB": {"funct": umount_usb, "inet_req": False},
        "RUN-ANSIBLE": {"funct": run_ansible, "inet_req": False},
        "RUN-ANSIBLE-ROLES": {"funct": run_ansible_roles, "inet_req": False},
        "GET-ROLES-STAT": {"funct": get_roles_stat, "inet_req": False},
        "RESET-NETWORK": {"funct": run_ansible, "inet_req": False},
        "GET-JOB-STAT": {"funct": get_last_jobs_stat, "inet_req": False},
        "CANCEL-JOB": {"funct": cancel_job, "inet_req": False},
        "GET-WHLIST": {"funct": get_white_list, "inet_req": False},
        "SET-WHLIST": {"funct": set_white_list, "inet_req": False},
        "GET-INET-SPEED": {"funct": get_inet_speed, "inet_req": True},
        "GET-INET-SPEED2": {"funct": get_inet_speed2, "inet_req": True},
        "GET-KIWIX-CAT": {"funct": get_kiwix_catalog, "inet_req": True},
        "GET-ZIM-STAT": {"funct": get_zim_stat, "inet_req": False},
        "INST-PRESETS": {"funct": install_presets, "inet_req": True},
        "INST-ZIMS": {"funct": install_zims, "inet_req": True},
        "COPY-ZIMS": {"funct": copy_zims, "inet_req": False},
        "MAKE-KIWIX-LIB": {"funct": make_kiwix_lib, "inet_req": False}, # runs as job
        "RESTART-KIWIX": {"funct": restart_kiwix, "inet_req": False}, # runs immediately
        "GET-OER2GO-CAT": {"funct": get_oer2go_catalog, "inet_req": True},
        "INST-OER2GO-MOD": {"funct": install_oer2go_mod, "inet_req": True},
        "COPY-OER2GO-MOD": {"funct": copy_oer2go_mod, "inet_req": False},
        "GET-OER2GO-STAT": {"funct": get_oer2go_stat, "inet_req": False},
        "GET-RACHEL-STAT": {"funct": get_rachel_stat, "inet_req": False},
        "INST-RACHEL": {"funct": install_rachel, "inet_req": True},
        "GET-OSM-VECT-CAT": {"funct": get_osm_vect_catalog, "inet_req": True},
        "INST-OSM-VECT-SET": {"funct": install_osm_vect_set, "inet_req": True},
        "INST-SAT-AREA": {"funct": install_sat_area, "inet_req": True},
        "GET-OSM-VECT-STAT": {"funct": get_osm_vect_stat, "inet_req": False},
        "INST-KALITE": {"funct": install_kalite, "inet_req": True},
        "DEL-DOWNLOADS": {"funct": del_downloads, "inet_req": False},
        "DEL-MODULES": {"funct": del_modules, "inet_req": False},
        "GET-MENU-ITEM-DEF-LIST": {"funct": get_menu_item_def_list, "inet_req": False},
        "SAVE-MENU-DEF": {"funct": save_menu_def, "inet_req": False},
        "SAVE-MENU-ITEM-DEF": {"funct": save_menu_item_def, "inet_req": False},
        "SYNC-MENU-ITEM-DEFS": {"funct": sync_menu_item_defs, "inet_req": True},
        "MOVE-UPLOADED-FILE": {"funct": move_uploaded_file, "inet_req": False},
        "COPY-DEV-IMAGE": {"funct": copy_dev_image, "inet_req": False},
        "REBOOT": {"funct": reboot_server, "inet_req": False},
        "POWEROFF": {"funct": poweroff_server, "inet_req": False},
        #"REMOTE-ADMIN-CTL": {"funct": remote_admin_ctl, "inet_req": True}, #true/false
        #"GET-REMOTE-ADMIN-STATUS": {"funct": get_remote_admin_status, "inet_req": True}, #returns activated
        "CHGPW": {"funct": change_password, "inet_req": False}
        }

    # Check for Duplicate Command
    dup_cmd = next((job_id for job_id, active_cmd_msg in list(active_commands.items()) if active_cmd_msg == cmd_msg), None)
    if dup_cmd != None:
        strip_cmd_msg = cmd_msg.replace('\"','')
        log(syslog.LOG_ERR, "Error: %s duplicates an Active Command." % strip_cmd_msg)
        resp = '{"Error": "' + strip_cmd_msg + ' duplicates an Active Command"}'
        return (resp)

    # store the command in database
    cmd_rowid = insert_command(cmd_msg)

    # process the command
    parse_failed, cmd_info = parse_cmd_msg(cmd_msg)
    if parse_failed:
        return cmd_malformed(cmd_info['cmd'])

    cmd_info['cmd_rowid'] = cmd_rowid
    cmd_info['cmd_msg'] = cmd_msg
    cmd = cmd_info['cmd']

    #print (cmd_info)

    # commands that run scripts should check for malicious characters in cmd_arg_str and return error if found
    # bad_command = validate_command(cmd_arg_str)

    # if not in daemon mode don't trap errors
    if daemon_mode == False:
        resp = avail_cmds[cmd]["funct"](cmd_info)
    else:
        if cmd in avail_cmds:
            if avail_cmds[cmd]["inet_req"]:
                if not is_internet_avail():
                    resp = cmd_error(cmd, msg='Internet is Required for this Command, but Not Available.')
                    return resp
            try:
                resp = avail_cmds[cmd]["funct"](cmd_info)
            except:
                log(syslog.LOG_ERR, "Error: Unexpected error in Command %s." % cmd)
                resp = '{"Error": "Unexpected error in Command ' + cmd + '"}'
        else:
            log(syslog.LOG_ERR, "Error: Unknown Command %s." % cmd)
            resp = '{"Error": "Unknown Command"}'
    return (resp)

# Helper functions
def parse_cmd_msg(cmd_msg):
    # convert string from client to cmd and cmd_args
    cmd_dict = {}
    parse_failed = False
    parse = cmd_msg.split(' ')
    cmd_dict['cmd'] = parse[0]
    cmd_dict['cmd_args'] = {} # always have cmd_args
    if len(parse) > 1:
        try:
            cmd_args_str = cmd_msg.split(cmd_dict['cmd'] + ' ')[1]
            cmd_dict['cmd_args'] = json.loads(cmd_args_str)
        except:
            parse_failed = True
    return parse_failed, cmd_dict

def is_internet_avail():
    #return is_url_avail("www.google.com")
    return is_url_avail("neverssl.com") # in case captive portal traps www.google.com

def is_url_avail(url):
    try:
        # connect to the host -- tells us if the host is actually
        # reachable
        socket.create_connection((url, 80))
        return True
    except: # any exception means no connection
        pass
    return False

#
# Functions to process Commands
#

def do_test(cmd_info):

    #resp = cmd_success("TEST")
    #return (resp)
    outp = subproc_check_output(["scripts/test.sh"])
    json_outp = json_array("TEST",outp)
    return (json_outp)

def list_library(cmd_info):
    libr_list = {}
    file_list = []
    target_dir = "/library/"

    try:
        target_dir += cmd_info['cmd_args']['sub_dir']
    except:
        return cmd_malformed(cmd_info['cmd'])

    libr_list['path'] = target_dir

    cmdstr = "/usr/bin/du -ah " + target_dir

    if not os.path.exists(target_dir):
        resp = cmd_error(cmd='LIST-LIBR', msg='Path not Found.')
        return (resp)

    try:
        outp = subproc_cmd(cmdstr)
        file_arr = outp.split('\n')

        for file in file_arr:
            if file == "":
                continue

            tmp_arr = file.split("\t")
            if tmp_arr[1] == target_dir:
                continue

            size = tmp_arr[0]
            filename = tmp_arr[1].split("/")[-1]
            file_attr = {}
            file_attr['size'] = size
            file_attr['filename'] = filename
            file_list.append(file_attr)

        libr_list['file_list'] = file_list
        #str_json = json.dumps(library_list)

        #json_resp = '{ "' + target_dir + '":' + str_json + '}'

        json_resp = json.dumps(libr_list)

        #print json_resp

    except:
        return cmd_malformed(cmd_info['cmd'])

    return (json_resp)

def del_downloads(cmd_info):
    if cmd_info['cmd_args']['sub_dir'] == "zims":
        target_dir = zim_downloads_dir
    elif cmd_info['cmd_args']['sub_dir'] == "rachel":
        target_dir = rachel_downloads_dir
    else:
        return cmd_malformed(cmd_info['cmd'])

    error_flag = False
    try:
        file_list = cmd_info['cmd_args']['file_list']
    except:
        return cmd_malformed(cmd_info['cmd'])

    cmdstr = "rm " + target_dir

    for file in file_list:
        try:
            outp = subproc_cmd(cmdstr + file)
        except:
            # ignore for now but report
            error_flag = True
            pass

    if error_flag:
        resp = cmd_success_msg(cmd_info['cmd'], "- Some errors occurred")
    else:
        resp = cmd_success(cmd_info['cmd'])

    return (resp)

def del_modules(cmd_info): # includes zims
    device = cmd_info['cmd_args']['device']
    mod_type = cmd_info['cmd_args']['mod_type']
    if mod_type not in ["zims", "modules"]:
        return cmd_malformed(cmd_info['cmd'])

    mod_list = cmd_info['cmd_args']['mod_list']
    error_flag = False

    if mod_type == "zims":
        target_dir = zim_dir
    else:
        target_dir = modules_dir

    if device != "internal":
        target_dir = '/media/usb' + device[-1] + target_dir # prevent injection of other device

    for mod in mod_list:
        try:
            if mod_type == "zims":
                filelist=glob(target_dir + "content/" + mod + "*")
                for file in filelist:
                    os.remove(file)

                shutil.rmtree(target_dir + "index/" + mod + ".idx", ignore_errors=True)
            else: # modules
                shutil.rmtree(target_dir + mod)
        except:
            # ignore for now but report
            error_flag = True
            pass

    if mod_type == "zims" and device == "internal":
        make_kiwix_lib(cmd_info) # create job to reindex kiwix
        #rc = subprocess.call(["/usr/bin/iiab-make-kiwix-lib"])

    if error_flag:
        resp = cmd_success_msg(cmd_info['cmd'], "- Some errors occurred")
    else:
        resp = cmd_success(cmd_info['cmd'])

    return (resp)

def run_command(command):
    args = shlex.split(command)
    try:
        outp = subproc_check_output(args)
    except: #skip things that don't work
        outp = ''
    outp = [_f for _f in outp.split('\n') if _f]
    if len(outp) == 0:
        outp = ['']
    return outp

# wrappers for adm_lib
def subproc_cmd(cmdstr):
    return (adm.subproc_cmd(cmdstr))

def subproc_check_output(args, shell=False):
    try:
        outp = adm.subproc_check_output(args, shell)
    except:
        raise
    return outp

def get_ansible_version():
    outp = subproc_check_output(ansible_program + " --version | head -n1 | cut -f2 -d' '",shell=True)
    return outp

def wget_file(cmd_info):
    resp = cmd_info['cmd'] + " done."

    return (resp)

def get_adm_conf(cmd_info):
    resp = json.dumps(adm_conf)
    return (resp)

def get_ans_facts(cmd_info):
    resp = json.dumps(ansible_facts)
    return (resp)

def get_ans_tags(cmd_info):
    get_ansible_tags()
    resp = json.dumps(ansible_tags)
    return (resp)

def get_install_vars(cmd_info):
    # assumes default vars already read
    read_iiab_local_vars() # any errors are raised and caught above
    resp = json.dumps(effective_vars)
    return (resp)

def OBSOL_get_install_vars_init():
    # assumes default vars already read
    read_iiab_local_vars() # any errors are raised

def get_iiab_ini(cmd_info):
    read_iiab_ini_file()
    resp = json.dumps(iiab_ini)
    return (resp)

def get_mem_info(cmd_info):
    outp = subproc_check_output(["/usr/bin/free", "-h"])
    json_outp = json_array("system_memory", outp)
    return (json_outp)

def get_space_avail(cmd_info):
    space_avail = {}
    space_avail['library_on_root'] = True
    libr_attr = {}
    #cmd = df_program + " -m" get size info in K not M
    cmd = df_program
    cmd_args = shlex.split(cmd)
    outp = subproc_check_output(cmd_args)
    dev_arr = outp.split('\n')
    for dev_str in dev_arr[1:-1]:
       dev_attr = dev_str.split()
       if dev_attr[5] == '/':
           space_avail['root'] = parse_df_str(dev_str, "in k")
       if dev_attr[5] == '/library':
           space_avail['library'] = parse_df_str(dev_str, "in k")
           space_avail['library_on_root'] = False
    if ('root' in space_avail):
        resp = json.dumps(space_avail)
    else:
        resp = cmd_error(cmd_info['cmd'], "No root partition found")
    return (resp)

def get_storage_info_lite(cmd_info):
    outp = subproc_check_output([df_program, "-lh"])
    json_outp = json_array("system_fs", outp)
    return (json_outp)

def get_external_device_info(cmd_info):
    extdev_info = {}
    outp = subproc_check_output("scripts/get_ext_devs.sh")
    dev_arr = outp.split('\n')

    # dev_arr gets a dummy element due to final \n
    for dev in dev_arr:
        if len(dev) == 0:
            continue
        dev_info = dev.split()
        #print dev
        #print dev_info
        if float(dev_info[1]) < small_device_size: # don't include small partitions that might be boot
            continue
        dev_name = dev_info[5]
        extdev_info[dev_name] = {}
        extdev_info[dev_name]['device'] = dev_info[0]
        extdev_info[dev_name]['dev_size_k'] = dev_info[1]
        extdev_info[dev_name]['dev_used_k'] = dev_info[2]
        extdev_info[dev_name]['dev_sp_avail_k'] = dev_info[3]
        extdev_info[dev_name]['oer2go_modules'] = []
        extdev_info[dev_name]['zim_modules'] = {}
        lib_dir = dev_name + content_base

        # in future we may lookup fs type and other properties with blkid

        if os.path.exists(lib_dir):
            extdev_info[dev_name]['oer2go_modules'] = get_oer2go_installed_list(dev_name)
            if iiab_ini.get('kiwix'): # if kiwix installed catalog zims
                extdev_info[dev_name]['zim_modules'] = get_ext_zim_catalog(dev_name)

            # put local_content here

    resp = json.dumps(extdev_info)
    return (resp)

def get_rem_dev_list(cmd_info):
    dev_list = {}
    cmdstr = "lsblk -a -n -r -b -o 'PATH,TYPE,RM,SIZE,MOUNTPOINT'"
    # ToDo check for iiab on partition of removable devices
    outp = adm.subproc_cmd(cmdstr)
    dev_arr = outp.split('\n')
    for dev in dev_arr[:-1]:
        dev_parts = dev.split()
        # if disk and removable
        if dev_parts[1] == 'disk':
            if dev_parts[2] == '1':
                if len(dev_parts) > 3: # some devices seem not to return size so skip them
                    dev_list[dev_parts[0]] = dev_parts[3]
    resp = json.dumps(dev_list)
    return (resp)

def get_system_info(cmd_info):
    sys_stat = calc_network_info()
    sys_stat['pi_passwd_known'] = check_password_match('pi', 'raspberry')
    sys_stat['admin_passwd_known'] = check_password_match(effective_vars['iiab_admin_user'], effective_vars['iiab_admin_published_pwd'])
    resp = json.dumps(sys_stat)
    return (resp)

def get_network_info(cmd_info):
    net_stat = calc_network_info()
    resp = json.dumps(net_stat)
    return (resp)

def calc_network_info():
    net_stat={}

    # ip -br addr
    # ip route | grep default
    # bridge -d link
    # systemctl is-active hostapd
    # systemctl is-active openvpn
    # /etc/iiab/uuid
    # /etc/iiab/openvpn_handle
    # /bin/ping -qc 1 1.1.1.1

    outp = run_command("/sbin/ip -br addr")

    for line in outp:
        dev_props = line.split()
        if dev_props[0] == 'lo':
            continue
        dev = {}
        dev['state'] = dev_props[1]
        if len(dev_props) >= 3:
            dev['addr'] = dev_props[2].split('/')[0]
        else:
            dev['addr'] = None
        net_stat[dev_props[0]] = dev

    outp = run_command("ip route")
    for line in outp:
        route_props = line.split()
        if route_props[0] == 'default': # ? not for bluetooth bnep0
            net_stat["gateway_addr"] = route_props[2]
            net_stat["gateway_dev"] = route_props[4]

    outp = run_command("/bin/ping -qc 1 1.1.1.1")
    if len(outp) >= 3 and '0% packet loss' in outp[2]:
        net_stat["internet_access"] = True
    else:
        net_stat["internet_access"] = False

    outp = run_command("/sbin/bridge -d link")
    bridge_devs = []

    for line in outp:
        if 'forwarding' in line:
            bridge_devs.append(line.split(':')[1].strip())

    net_stat["bridge_devs"] = bridge_devs

    net_stat["hostapd_status"] = check_systemd_service_active('hostapd')
    net_stat["openvpn_status"] = check_systemd_service_active('openvpn')
    net_stat["bt_pan_status"] = check_systemd_service_active('bt-pan')
    net_stat["iiab_uuid"] = run_command("/bin/cat /etc/iiab/uuid")[0]
    net_stat["openvpn_handle"] = run_command("/bin/cat /etc/iiab/openvpn_handle")[0]

    return (net_stat)

def check_systemd_service_active(service):
    rc = systemctl_wrapper('status', service)
    if rc == 0:
        return 'ON'
    elif rc == 3:
        return 'OFF'
    else:
        return 'UNAVAILABLE'

def systemctl_wrapper(verb, service):
    rc = 0
    FNULL = open(os.devnull, 'w')
    rc = subprocess.call(['/bin/systemctl', verb, service], stdout=FNULL, stderr=subprocess.STDOUT)
    return rc

def ctl_wifi(cmd_info):
    if not is_rpi:
        resp = cmd_error(cmd=cmd_info['cmd'], msg='Only supported on Raspberry Pi.')
        return (resp)

    if 'cmd_args' in cmd_info:
        hotspot_on_off = cmd_info['cmd_args']['hotspot_on_off']
    else:
        return cmd_malformed(cmd_info['cmd'])

    if hotspot_on_off == 'on':
        outp = run_command("/usr/bin/iiab-hotspot-on")[0]
        resp = cmd_success(cmd_info['cmd'])

    else:
        # hotspot off
        #sed -i -e "s/^denyinterfaces/#denyinterfaces/" /etc/dhcpcd.conf
        #systemctl disable hostapd
        #systemctl stop hostapd
        #systemctl disable dnsmasq
        #systemctl stop dnsmasq
        #systemctl daemon-reload
        #systemctl restart dhcpcd
        # #systemctl restart networking

        # Temporary promiscuous-mode workaround for RPi's WiFi "10SEC disease"
        # Set wlan0 to promiscuous when AP's OFF (for possible WiFi gateway)
        # SEE ALSO iiab-hotspot-on + /usr/libexec/iiab-startup.sh
        # https://github.com/iiab/iiab/issues/638#issuecomment-355455454
        #if grep -qi raspbian /etc/*release; then
        #    ip link set dev wlan0 promisc on
        #fi

        #sed -i -e "s/^HOSTAPD_ENABLED.*/HOSTAPD_ENABLED=False/" /etc/iiab/iiab.env

        # this should be more nuanced and not set wifi gateway if there is wired gateway
        outp = run_command("/usr/bin/iiab-hotspot-off")[0]
        resp = cmd_success(cmd_info['cmd'])
    return resp

def set_wpa_credentials (cmd_info):
    if not is_rpi:
        resp = cmd_error(cmd=cmd_info['cmd'], msg='Only supported on Raspberry Pi.')
        return (resp)

    #print(cmd_info)
    if 'cmd_args' in cmd_info:
        connect_wifi_ssid = cmd_info['cmd_args']['connect_wifi_ssid']
        connect_wifi_password = cmd_info['cmd_args']['connect_wifi_password']
    else:
        return cmd_malformed(cmd_info['cmd'])

    # this works for raspbian but maybe not for ubuntu
    # may need to add file /etc/netplan/99-iiab-admin-access-points.yaml
    # to make life easier when removing these access points from images

    if ansible_facts['ansible_local']['local_facts']['os'] == 'raspbian':
        write_wpa_supplicant_file(connect_wifi_ssid, connect_wifi_password)
    if ansible_facts['ansible_local']['local_facts']['os'] == 'ubuntu':
        write_netplan_wpa_file(connect_wifi_ssid, connect_wifi_password)

    resp = cmd_success(cmd_info['cmd'])
    return resp

def write_wpa_supplicant_file(connect_wifi_ssid, connect_wifi_password):
    wpa_sup_file = '/etc/wpa_supplicant/wpa_supplicant.conf'
    try:
        with open(wpa_sup_file, 'r') as f: wpa_txt = f.read()
    except IOError: # for now patch missing file
        wpa_txt = 'ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev\nupdate_config=1\ncountry=US\n'

    # if ssid in wpa remove it
    # if password != '' call wpa_passphrase
    # else set to static array
    # write lines
    # no attempt to fix extra spaces or messed up network keyword from previous versions

    # Outtakes
    # stripped = ''.join(wpa_txt.split(' ')) - NO. can be space in ssid
    # re.finditer(r'network.+?}.+?\n', wpa_txt, re.DOTALL):
    # re.search(r'network\s*=\s*{\s*ssid\s*=\s*"Pluto-UniFl_RE"', wpa_txt)

    # print(wpa_txt)

    search_ssid = '"' + connect_wifi_ssid + '"'
    output = wpa_txt

    # check for ssid def in file stripped of whitespace
    # stripped = ''.join(wpa_txt.split(' ')) - NO. can be space in ssid

    if search_ssid in wpa_txt: # remove if found
        for net in re.finditer('network.+?}\n', wpa_txt, re.DOTALL):
            if search_ssid in net.group(0):
                output = wpa_txt[:net.start()] + wpa_txt[net.end():]
                break

    wpa_lines = output.split('\n')

    if connect_wifi_password != '':
        network_lines = run_command("/usr/bin/wpa_passphrase '" + connect_wifi_ssid + "' " + connect_wifi_password)
    else:
        network_lines = ['network={', '\tssid="' + connect_wifi_ssid + '"', '\tkey_mgmt=NONE', '}']
    # print(wpa_lines)
    # print(network_lines)

    wpa_lines.extend(network_lines)
    with open(wpa_sup_file, 'w') as f:
        for l in wpa_lines:
            if l != '':
                f.write(l + '\n')

def write_netplan_wpa_file(connect_wifi_ssid, connect_wifi_password):
    # This will get changed a lot, so just hard code here
    netplan_wpa_yaml_file = '/etc/netplan/02-iiab-config.yaml'

    netplan_wpa_yaml = {
        'network':
        {'version': '2',
        'wifis':
            {'wlan0':
                {'dhcp4': True,
                'access-points':
                    {}
                }
            }
        }
    }

    netplan_config = adm.read_yaml(netplan_wpa_yaml_file)

    if 'wifis' not in netplan_config['network']:
        netplan_config['network']['wifis'] = netplan_wpa_yaml['network']['wifis']
    elif 'wlan0' not in netplan_config['network']['wifis']:
        netplan_config['network']['wifis']['wlan0'] = netplan_wpa_yaml['network']['wifis']['wlan0']
    elif 'access-points' not in netplan_config['network']['wifis']['wlan0']:
        netplan_config['network']['wifis']['wlan0']['access-points'] = netplan_wpa_yaml['network']['wifis']['wlan0']['access-points']

    netplan_config['network']['wifis']['wlan0']['access-points'][connect_wifi_ssid] = {}
    netplan_config['network']['wifis']['wlan0']['access-points'][connect_wifi_ssid]['password'] = connect_wifi_password

    with open(netplan_wpa_yaml_file, 'w') as f:
        documents = yaml.dump(netplan_config, f)

def ctl_bluetooth(cmd_info):
    if not is_rpi:
        resp = cmd_error(cmd=cmd_info['cmd'], msg='Only supported on Raspberry Pi.')
        return (resp)

    if 'cmd_args' in cmd_info:
        bluetooth_on_off = cmd_info['cmd_args']['bluetooth_on_off']
    else:
        return cmd_malformed(cmd_info['cmd'])

    if bluetooth_on_off == 'on':
        outp = run_command("/usr/bin/iiab-bt-pan-on")[0]
    else:
        outp = run_command("/usr/bin/iiab-bt-pan-off")[0]

    resp = cmd_success(cmd_info['cmd'])
    return resp

def ctl_vpn(cmd_info):
    # question of updating local vars
    # or is this temporary

    if 'cmd_args' in cmd_info:
        vpn_on_off = cmd_info['cmd_args']['vpn_on_off']
        vpn_handle = cmd_info['cmd_args']['vpn_handle']
        make_permanent = cmd_info['cmd_args']['make_permanent']
    else:
        return cmd_malformed(cmd_info['cmd'])

    # vpn handle
    try:
        stream = open('/etc/iiab/openvpn_handle', 'w')
        stream.write(vpn_handle)
    except IOError:
        resp = cmd_error
    finally:
        stream.close()

    # vpn state
    rc = 0
    if vpn_on_off == 'on':
        rc += systemctl_wrapper('start', 'openvpn')
        if make_permanent == 'True':
            rc += systemctl_wrapper('enable', 'openvpn')
    else:
        rc += systemctl_wrapper('stop', 'openvpn')
        if make_permanent == 'True':
            rc += systemctl_wrapper('disable', 'openvpn')

    if rc == 0:
        resp = cmd_success(cmd_info['cmd'])
    else:
        resp = cmd_error(cmd=cmd_info['cmd'], msg='Some errors occurred.')
    return resp

def get_ext_zim_catalog(dev_name):
    iiab_zim_path = dev_name + zim_dir
    kiwix_library_xml_tmp = iiab_zim_path + "/library.xml"
    command = "/usr/bin/iiab-make-kiwix-lib.py --no_tmp --device " + dev_name
    args = shlex.split(command)
    try:
        outp = subproc_check_output(args)
    except: #skip things that don't work
        pass
    usb_catalog = read_library_xml(kiwix_library_xml_tmp)
    return (usb_catalog)

def get_ext_zim_catalog2(dev_name): # keeping for the moment, but not used
    kiwix_manage = iiab_base + "/kiwix/bin/kiwix-manage"
    kiwix_library_xml_tmp = "/tmp/library.xml"
    kiwix_exclude_attr = ["favicon"]
    iiab_zim_path = dev_name + zim_dir
    content = iiab_zim_path + "/content/"
    index = iiab_zim_path + "/index/"
    usb_catalog = {}

    files_processed = {}
    flist = os.listdir(content)
    flist.sort()
    for filename in flist:
        zimpos = filename.find(".zim")
        if zimpos != -1:
            filename = filename[:zimpos]
            if filename not in files_processed:
                files_processed[filename] = True
                zimname = content + filename + ".zim"
                zimidx = index + filename + ".zim.idx"
                command = kiwix_manage + " " + kiwix_library_xml_tmp + " add " + zimname
                if os.path.isdir (zimidx): # only declare index if exists (could be embedded)
                    command += " -i " + zimidx
                #print command
                args = shlex.split(command)
                try:
                    outp = subproc_check_output(args)
                except: #skip things that don't work
                    #print 'skipping ' + filename
                    pass

    usb_catalog = read_library_xml(kiwix_library_xml_tmp, kiwix_exclude_attr)
    try:
        os.remove(kiwix_library_xml_tmp)
    except OSError:
        pass
    return (usb_catalog)

def umount_usb(cmd_info):
    if 'device' in cmd_info['cmd_args']:
        device = cmd_info['cmd_args']['device']
    else:
        return cmd_malformed(cmd_info['cmd'])

    device = '/media/usb' + device[-1] # prevent injection of other device

    # df device |grep device
    # first field is block dev
    # can then umount /dev/sdx* to get boot partition of sdcard

    # see if device involved in a running command
    for job_id in jobs_running:
        job_info = jobs_running[job_id]
        if job_info['cmd'] in ["COPY-ZIMS","COPY-OER2GO-MOD"]:
            if job_info['cmd_args']['source'] == device or job_info['cmd_args']['dest'] == device:
                resp = cmd_error(cmd="REMOVE-USB", msg="Device " + device + " in use by another command.")
                return resp

    check_use = "lsof -t " + device
    umount = "umount " + device
    rc = subprocess.call(check_use, shell=True) # 1 means nothing open
    if rc != 1:
        resp = cmd_error(cmd="REMOVE-USB", msg="Device " + device + " has open files.")
        return resp

    try:
        os.remove(device + '/usb' + device[-1]) # remove bogus symlink
    except OSError:
        pass
    rc = subprocess.call(umount, shell=True) # 32 means not mounted
    if rc == 32:
        resp = cmd_error(cmd="REMOVE-USB", msg="Device " + device + " is not mounted.")
        return resp

    # remove mount points for local content
    try:
        os.remove(doc_root + '/local_content/USB' + device[-1])
    except OSError:
        pass

    resp = cmd_success(cmd_info['cmd'])
    return resp

# the following does not work on lvm or raid or iso usb drives
# we wil fix later

def get_storage_info(cmd_info):
    system_storage = []
    cmd = "lsblk -aP -o NAME,FSTYPE,TYPE,SIZE,MOUNTPOINT,LABEL,UUID,PARTLABEL,PARTUUID,MODEL"
    cmd_args = shlex.split(cmd)
    outp = subproc_check_output(cmd_args)
    dev_arr = outp.split('\n')
    system_storage_idx = -1
    for item in dev_arr:
        if len(item) == 0: # last element is blank
            continue

        item_attr = get_storage_info_str2dict(item)
        if item_attr['TYPE'] == "disk":
            cur_dev = '/dev/'+ item_attr['NAME']
            dev_info = get_storage_info_parted(cur_dev)
            dev_info['lsblk'] = item_attr
            system_storage.append(dev_info)
            system_storage_idx += 1
        elif item_attr['TYPE'] == "part":
            part_dev = '/dev/'+ item_attr['NAME']
            # lsblk includes extended partition that holds other partition(s)
            if item_attr['FSTYPE'] != "" and \
                  part_dev in system_storage[system_storage_idx]['index']:
                blkidx = system_storage[system_storage_idx]['index'][part_dev]
                system_storage[system_storage_idx]['blocks'][blkidx]['lsblk'] = item_attr
                part_prop = get_storage_info_df(part_dev)
                system_storage[system_storage_idx]['blocks'][blkidx]['part_prop'] = part_prop
                #print dev_info

    resp = json.dumps(system_storage)
    return (resp)

def get_storage_info_str2dict(str):
    s2 = str.replace("=",'":')
    s3 = s2.replace('" ', '","')
    s4 = '{"' + s3 + '}'
    sd = json.loads(s4)
    return (sd)

def get_storage_info_parted(dev):
    dev_info = {'device':dev, 'desc':'', 'log_sect_size':'', 'part_tbl':'', 'phys_sect_size':'', 'size':'', 'type':'', 'blocks':[]}
    try:
        parts = subproc_check_output(["parted", dev, "-ms", "print", "free"])
    except subprocess.CalledProcessError as e:
        #skip devices that cause problems
        pass
    else:
        blkstr = parts.split("BYT;\n")[1]
        #print "blkstr is " +  blkstr
        dev_info = {}
        dev_blk = blkstr.split(';\n') # dev_blk[0] is the device itself, some can be free space
        dev_char = dev_blk[0]
        dev_attr = dev_char.split(':')
        dev_info['device'] = dev_attr[0]
        dev_info['size'] = dev_attr[1]
        dev_info['type'] = dev_attr[2]
        dev_info['log_sect_size'] = dev_attr[3]
        dev_info['phys_sect_size'] = dev_attr[4]
        dev_info['part_tbl'] = dev_attr[5]
        dev_info['desc'] = dev_attr[6]
        dev_info['blocks'] = []
        dev_blk = dev_blk[1:]
        dev_blk = [a for a in dev_blk if a not in ['\n']]
        blk_idx = {}
        blk_idx_num = 0
        for blk in dev_blk: # blocks can be free or partitioned
            #print "blk is " + blk
            if blk == '':
                continue
            blk_info = {}
            blk_attr = blk.split(':')
            blk_info['part_no'] = blk_attr[0] # is 1 for free
            blk_info['start'] = blk_attr[1]
            blk_info['end'] = blk_attr[2]
            blk_info['size'] = blk_attr[3]
            blk_info['type'] = blk_attr[4]
            if blk_info['type'] == 'free':
                blk_info['part_dev'] = 'unallocated'
            elif blk_info['type'] == '': # this is an extension partition, so ignore
                continue
            else:
                # this is a kluge
                if "mmc" in dev_info['device']:
                    blk_info['part_dev'] = dev_info['device'] + 'p' + blk_info['part_no']
                else:
                    blk_info['part_dev'] = dev_info['device'] + blk_info['part_no']
                #print blk_info['part_dev']

            if len(blk_attr) == 7:
                blk_info['flag'] = blk_attr[6]
            else:
                blk_info['flag'] = ""
            dev_info['blocks'].append(blk_info)
            if blk_info['part_dev'] != 'unallocated': # create an index to actual partitions in blocks array
                blk_idx[blk_info['part_dev']] = blk_idx_num
            blk_idx_num += 1
        dev_info['index'] = blk_idx
    return (dev_info)

def get_storage_info_df(part_dev):
    part_prop = {}
    outp = subproc_check_output([df_program, part_dev, "-m"])
    str_array = outp.split('\n')
    part_prop = parse_df_str(str_array[1])
    #print part_prop
    return (part_prop)

def parse_df_str(df_str, size_unit="megs"):
    dev_attr = {}
    dev_attr_array = df_str.split()
    dev_attr_array = [a for a in dev_attr_array if a not in ['']]
    dev_attr['dev'] = dev_attr_array[0]
    if size_unit == "megs":
        dev_attr['size_in_megs'] = dev_attr_array[1]
        dev_attr['avail_in_megs'] = dev_attr_array[3]
    else:
        dev_attr['size_in_k'] = dev_attr_array[1]
        dev_attr['avail_in_k'] = dev_attr_array[3]

    dev_attr['mount_point'] = dev_attr_array[5]
    return (dev_attr)

def get_inet_speed(cmd_info):
    outp = subproc_check_output(["scripts/get_inet_speed"])
    json_outp = json_array("internet_speed", outp)
    return (json_outp)

def get_inet_speed2(cmd_info):
    outp = subproc_check_output(["/usr/bin/speedtest-cli","--simple"])
    json_outp = json_array("internet_speed", outp)
    return (json_outp)

def get_white_list(cmd_info):
    whlist = []
    try:
        stream = open(squid_whitelist, 'r')
        whlist = stream.read()
        stream.close()
    except IOError:
        whlist = "[]"

    resp = json_array("iiab_whitelist", whlist)
    return (resp)

def set_white_list(cmd_info):
    whlist = cmd_info['cmd_args']['iiab_whitelist']
    whlist = [_f for _f in whlist if _f] # remove blank lines
    resp = cmd_success(cmd_info['cmd'])
    try:
        stream =  open(squid_whitelist, 'w')
        for item in whlist:
            stream.write(item + '\n')
    except IOError:
        resp = cmd_error
    finally:
        stream.close()
    return (resp)

def get_kiwix_catalog(cmd_info):
    outp = subproc_check_output(["scripts/get_kiwix_catalog"])
    if outp == "SUCCESS":
        read_kiwix_catalog()
        resp = cmd_success("GET-KIWIX-CAT")
        return (resp)
    else:
        return ('{"Error": "' + outp + '."}')

def get_zim_stat(cmd_info):
    all_zims = {}
    all_zims['WIP'] = zims_wip

    all_zims['INSTALLED'] = {}

    lib_xml_file = zim_dir + "/library.xml"
    all_zims['INSTALLED'] = read_library_xml(lib_xml_file)

    resp = json.dumps(all_zims)
    return (resp)

def read_library_xml(lib_xml_file, kiwix_exclude_attr=[""]):
    kiwix_exclude_attr.append("id") # don't include id
    kiwix_exclude_attr.append("favicon") # don't include large favicon
    zims_installed = {}
    try:
        tree = ET.parse(lib_xml_file)
        root = tree.getroot()

        for child in root:
            attributes = {}
            if 'id' in child.attrib:
                id = child.attrib['id']
                for attr in child.attrib:
                    if attr not in kiwix_exclude_attr:
                        attributes[attr] = child.attrib[attr] # copy if not id or in exclusion list
                zims_installed[id] = attributes
    except IOError:
        zims_installed = {}
    return zims_installed

def get_oer2go_catalog(cmd_info):
    err_msg = {
    "1":"Aw Jeez! The OER2GO catalog is offline again. Keeping the previous catalog.",
    "2":"Now where did our catalog go? Was here a minute ago.",
    "3":"Dang! Can't parse the OER2GO catalog because of junk characters. Keeping the previous catalog.",
    "99":"Syntax Error"
    }
    try:
        compl_proc = adm.subproc_run("scripts/get_oer2go_catalog")
        if compl_proc.returncode !=0:
            resp = cmd_error(cmd='GET-OER2GO-CAT', msg=err_msg[str(compl_proc.returncode)])
            return resp
    except subprocess.CalledProcessError as e:
        resp = cmd_error(cmd='GET-OER2GO-CAT', msg='Failed to read OER2go Catalog.')
        return resp

    # No Error
    read_oer2go_catalog()
    resp = cmd_success("GET-OER2GO-CAT")
    return (resp)

def set_config_vars(cmd_info):
    config_vars = cmd_info['cmd_args']['config_vars']
    adm.write_iiab_local_vars(config_vars)
    #print config_vars
    resp = cmd_success(cmd_info['cmd'])
    return (resp)

def run_ansible(cmd_info): # create multiple jobs to run in succession

    global ansible_running_flag
    global jobs_requested

    if ansible_running_flag:
        return (cmd_error(msg="Ansible Command already Running."))
        #return ('{"Error": "Ansible Command already Running."}')

    if cmd_info['cmd'] == "RUN-ANSIBLE":

        job_command = ansible_playbook_program + " -i " + iiab_repo + "/ansible_hosts " + iiab_repo + "/iiab-from-console.yml --connection=local"

        if 'cmd_args' in cmd_info:
            tags = cmd_info['cmd_args']['tags']
            if tags != "ALL-TAGS":
                job_command += ' --tags="' +  tags +'"'
        else:
            return cmd_malformed(cmd_info['cmd'])

    else: # cmd is "RESET-NETWORK"

        job_command = iiab_repo + "/iiab-network"

    resp = request_job(cmd_info, job_command)
    return resp

def run_ansible_roles(cmd_info):
    # calculate list of roles to run which have changes to enabled flag or install flag (only false to true)
    # assemble /opt/iiab/iiab/run-roles-tmp.yml
    # run it with ansible_playbook_program
    # ToDo allow delta local vars as optional parameter

    global ansible_running_flag
    global jobs_requested

    if ansible_running_flag:
        return (cmd_error(msg="Ansible Command already Running."))

    # refresh effective_vars
    # assume default_vars is current
    read_iiab_local_vars() # read local vars and compute effective vars
    read_iiab_roles_stat() # into global iiab_roles_status

    internet_avail = is_internet_avail()
    changed_local_vars = {}

     # get playbook preamble
    with open('assets/run-roles-base.yml') as f:
        lines = f.readlines()

    role_cnt = 0
    for role in iiab_roles_status:
        if not local_vars.get(role + '_install'):
            continue # for now skip unknown roles
        install = effective_vars[role + '_install']
        installed = iiab_roles_status[role]['installed']
        enable = effective_vars[role + '_enabled']
        # enabled = iiab_roles_status[role]['enabled'] # some services show enabled-runtime
        enabled = iiab_roles_status[role]['active']
        if install == installed and enable == enabled:
            continue
        if role in adm.CONST.iiab_roles_renamed:
            run_role = adm.CONST.iiab_roles_renamed[role]
        else:
            run_role = role
        if install != installed:
            if install == True: # desired, not installed
                if not internet_avail:
                    resp = cmd_error(msg='Internet is Required to install a Service, but is Not Available.')
                    return resp
                else:
                    lines.append('    - { role: ' + run_role + ' }\n')
                    role_cnt += 1
            else: # installed, but not desired. we can't uninstall
                if enabled == True: # just disable it
                    changed_local_vars[role + '_enabled'] = False
                    lines.append('    - { role: ' + run_role + ' }\n')
                    role_cnt += 1
        else: # enabled status has changed
            lines.append('    - { role: ' + run_role + ' }\n')
            role_cnt += 1

    if role_cnt == 0:
        resp = cmd_error(msg='All Roles are already As Requested.')
        return resp

    # patch local vars
    if len(changed_local_vars) > 0:
        adm.write_iiab_local_vars(changed_local_vars)

    # assemble playbook
    with open(iiab_repo + '/adm-run-roles-tmp.yml', 'w') as f:
        f.writelines(lines)

    job_command = ansible_playbook_program + " -i " + iiab_repo + "/ansible_hosts " + iiab_repo + "/adm-run-roles-tmp.yml --connection=local"
    resp = request_job(cmd_info, job_command)
    return resp

def get_roles_stat(cmd_info):
    read_iiab_roles_stat() # into global iiab_roles_status
    resp = json.dumps(iiab_roles_status)
    return (resp)

def read_iiab_roles_stat():
    global iiab_roles_status
    iiab_roles_status = adm.get_roles_status()

def get_rachel_stat(cmd_info):
    # see if rachel installed from iiab_ini
    # see if rachel content installed from iiab_ini.rachel_content_path
    # get list of modules and modules.out

    global iiab_ini
    rachel_stat = {}

    rachel_stat['status'] = 'NOT-INSTALLED'
    rachel_stat['content_installed'] = False

    if 'rachel' in iiab_ini:
        rachel_stat['status'] = 'INSTALLED'

        #print iiab_ini['rachel']['enabled']
        if iiab_ini['rachel']['enabled'] == "True": # For some reason True/False from ini is string not boolean
            rachel_stat['status'] = 'ENABLED'

        rachel_index = iiab_ini['rachel']['rachel_content_path'] + "index.php"
        if os.path.isfile(rachel_index):
            rachel_stat['content_installed'] = True
            mods_enabled = get_rachel_modules(iiab_ini['rachel']['rachel_content_path'] + "modules", True)
            mods_disabled = get_rachel_modules(iiab_ini['rachel']['rachel_content_path'] + "modules.out", False)

            rachel_stat['enabled'] = {}
            rachel_stat['enabled'].update (mods_enabled)
            rachel_stat['enabled'].update (mods_disabled)

    resp = json.dumps(rachel_stat)
    return (resp)

def get_rachel_modules(module_dir, state):

    modules = {}
    dir_list = [os.path.join(module_dir,o) for o in os.listdir(module_dir) if os.path.isdir(os.path.join(module_dir,o))]

    for dir in dir_list:
        f = open(dir + '/index.htmlf')
        html = f.read()
        nophp = re.sub(r'<\?(.*)\?>', r'', html)

        # assume these html fragments remain constant - based on 3.1.5
        start = nophp.find('<h2>') + len('<h2>')
        end = nophp[start:].find('</h2>')
        h2 = nophp[start:start+end]
        title =  re.sub(r'<(.*?)>', r'', h2)

        module = {}
        module['path'] = dir
        module['enabled'] = state
        modules[title] = module

    return (modules)

def install_presets(cmd_info):
    # first pass we will just call various command handlers and evaluate resp
    # INST-PRESETS '{"cmd_args":{"preset_id":"test"}}'
    # test with iiab-cmdsrv-ctl 'INST-PRESETS {"preset_id":"test"}'

    #print(cmd_info)
    presets_dir = 'presets/'
    if 'cmd_args' not in cmd_info:
        return cmd_malformed(cmd_info['cmd'])
    else:
        preset_id = cmd_info['cmd_args']['preset_id']
        if not os.path.isdir(presets_dir + preset_id): # currently a preset is a directory in presets dir
            return cmd_error(cmd='INST-PRESETS', msg='Preset ' + preset_id + ' not found.')

    # get preset definition
    src_dir = presets_dir + preset_id + '/'
    try:
        preset = adm.read_json(src_dir + 'preset.json')
        menu = adm.read_json(src_dir + 'menu.json') # actually only need to cp the file
        content = adm.read_json(src_dir + 'content.json')
        vars = adm.read_yaml(src_dir + 'vars.yml')
    except:
        return cmd_error(cmd='INST-PRESETS', msg='Preset ' + preset_id + ' has errors in the json.')

    # check for sufficient storage

    # add roles needed by content but not requested

    planned_vars = {**effective_vars, **vars}
    zim_list = content['zims']
    module_list = content['modules'] # service is web server which is always installed
    map_list = content['maps']
    kalite_vars = content['kalite']
    needed_services = []

    if len(zim_list) > 0:
        if planned_vars['kiwix_install'] != True or planned_vars['kiwix_enabled'] != True:
            needed_services.append('Kixix')
            vars['kiwix_install'] = True
            vars['kiwix_enabled'] = True
    if len(map_list) > 0:
        if planned_vars['osm_vector_maps_install'] != True or planned_vars['osm_vector_maps_enabled'] != True:
            needed_services.append('OSM Vector Maps')
            vars['osm_vector_maps_install'] = True
            vars['osm_vector_maps_enabled'] = True
    if len(kalite_vars) > 0:
        if planned_vars['kalite_install'] != True or planned_vars['kalite_enabled'] != True:
            needed_services.append('KA Lite')
            vars['kalite_install'] = True
            vars['kalite_enabled'] = True

    services_needed_error = ', '.join(needed_services)

    # add vars to local_vars and run roles
    adm.write_iiab_local_vars(vars)
    ansible_cmd_info = cmd_info
    ansible_cmd_info['cmd'] ='RUN-ANSIBLE-ROLES'
    ansible_cmd_info['cmd_args'] = {}

    ansible_cmd_info = pseudo_cmd_handler(ansible_cmd_info, check_dup=False)
    resp = run_ansible_roles(ansible_cmd_info)

    # All roles installed also returns error "All Roles are already As Requested"
    if 'Error' in resp:
        resp_dict = json.loads(resp)
        err_msg = resp_dict['Error']
        if not 'All Roles are already As Requested' in err_msg: # pretty klugey
            return cmd_error(cmd='INST-PRESETS', msg='Ansible install step failed. ' + err_msg)

    # now do content areas
    # will block if required service is not yet active

    # don't start any jobs if ansible is running, lines 350ff
    # but ansible failure will release remaining jobs
    # ? add global ansible job no

    # ? check to see if content already installed

    # ZIMs
    # create list of ids using most recent url
    # check if zim already installed

    lib_xml_file = zim_dir + "/library.xml"
    zims_installed = read_library_xml(lib_xml_file)

    zim_list = content['zims']
    perma_ref_idx = {}
    for zim_id in kiwix_catalog:
        if kiwix_catalog[zim_id]['perma_ref'] in zim_list:
            perma_ref = kiwix_catalog[zim_id]['perma_ref']
            url = kiwix_catalog[zim_id]['url'].split('.meta')[0]
            #print (zim_id, perma_ref, url)
            if perma_ref not in perma_ref_idx: # find most recent zim
                perma_ref_idx[perma_ref] = {'id': zim_id, 'url': url}
            else:
                if url > perma_ref_idx[perma_ref]['url']:
                    perma_ref_idx[perma_ref] = {'id': zim_id, 'url': url}

    zim_cmd_info = cmd_info
    for ref in perma_ref_idx:
        if perma_ref_idx[ref]['id'] in zims_installed:
            print('Skipping already installed ' + ref)
            continue # skip already installed zims
        zim_cmd_info['cmd'] ='INST-ZIM'
        zim_cmd_info['cmd_args'] = {'zim_id': perma_ref_idx[ref]['id']}
        zim_cmd_info = pseudo_cmd_handler(zim_cmd_info)
        if zim_cmd_info:
            resp = install_zims(zim_cmd_info)

    # modules

    module_cmd_info = cmd_info
    module_list = content['modules']
    for module in module_list:
        module_cmd_info['cmd'] = 'INST-OER2GO-MOD'
        module_cmd_info['cmd_args'] = {'moddir': module}
        module_cmd_info = pseudo_cmd_handler(module_cmd_info)
        if module_cmd_info:
            resp = install_oer2go_mod(module_cmd_info)

    # maps

    map_cmd_info = cmd_info
    map_list = content['maps']
    for map in map_list:
        map_cmd_info['cmd'] = 'INST-OSM-VECT-SET'
        map_cmd_info['cmd_args'] = {'osm_vect_id': map}
        map_cmd_info = pseudo_cmd_handler(map_cmd_info)
        if map_cmd_info:
            resp = install_osm_vect_set_v2(map_cmd_info)

    # kalite

    if len(kalite_vars) > 0:
        kalite_cmd_info = cmd_info
        kalite_cmd_info['cmd'] = 'INST-KALITE'
        kalite_cmd_info['cmd_args'] = content['kalite']
        kalite_cmd_info = pseudo_cmd_handler(kalite_cmd_info)
        if kalite_cmd_info:
            resp = install_kalite(kalite_cmd_info)

    # copy menu.json
    shutil.copyfile(src_dir + 'menu.json', doc_root + '/home/menu.json')

    if len(services_needed_error) > 0:
        resp = cmd_warning(cmd='INST-PRESETS', msg='WARNING: The following services were added - ' + services_needed_error)
    else:
        resp = cmd_success_msg('INST-PRESETS', "All jobs scheduled")
    return resp

def pseudo_cmd_handler(cmd_info, check_dup=True):
    # do some of what cmd_handler does so can call cmd function directly
    # create cmd_msg
    # insert into db
    # check if duplicate

    cmd_args = cmd_info.get('cmd_args')
    if cmd_args and len(cmd_args) > 0:
        cmd_msg = cmd_info['cmd'] + ' ' + json.dumps(cmd_args)
    else:
        cmd_msg = cmd_info['cmd']

    if check_dup: # ansible does it's own check
        dup_cmd = next((job_id for job_id, active_cmd_msg in list(active_commands.items()) if active_cmd_msg == cmd_msg), None)
        if dup_cmd != None:
            print('Skipping already running command.')
            return None

    cmd_rowid = insert_command(cmd_msg)

    cmd_info['cmd_rowid'] = cmd_rowid
    cmd_info['cmd_msg'] = cmd_msg

    return cmd_info

def install_zims(cmd_info):
    global ansible_running_flag
    global jobs_requested
    global kiwix_catalog

    if 'cmd_args' in cmd_info:
        zimId = cmd_info['cmd_args']['zim_id']
        if zimId in kiwix_catalog:
            zimFileRef = kiwix_catalog[zimId]['file_ref']
        else:
            resp = cmd_error(cmd='INST-ZIMS', msg='Zim ID not found in Command')
            return resp

        if 'service_required' in cmd_info['cmd_args']: # allow caller to supply
            cmd_info['service_required'] = cmd_info['cmd_args']['service_required']
        else:
            cmd_info['service_required'] = ['kiwix', 'active']


        downloadSrcFile = kiwix_catalog[zimId]['download_url']
        #print(downloadSrcFile)
        try:
            rc = urllib.request.urlopen(downloadSrcFile)
            rc.close()
        except (urllib.error.URLError) as exc:
            errmsg = str("Zim File " + zimFileRef + " not found in Cmd")
            resp = cmd_error(cmd='INST-ZIMS', msg=errmsg)
            return resp

        targetDir = zim_working_dir + zimFileRef
        if kiwix_catalog[zimId]['source'] == 'portable': # create working dir, but only for zips
            if not os.path.exists(targetDir):
                try:
                    os.makedirs(targetDir)
                except OSError:
                    resp = cmd_error(cmd='INST-ZIMS', msg='Error creating directory in Command')
                    return resp
    else:
        return cmd_malformed(cmd_info['cmd'])

    # at this point we can create all the jobs

    downloadSrcFile = kiwix_catalog[zimId]['download_url']

    # we are either downloading from zims or portable directory
    if kiwix_catalog[zimId]['source'] == 'portable':
        downloadFile = zim_downloads_dir + zim_download_prefix + zimFileRef + ".zip"
        # download zip file
        job_command = "/usr/bin/wget -c --progress=dot:giga " + downloadSrcFile + " -O " + downloadFile
        job_id = request_one_job(cmd_info, job_command, 1, -1, "Y")
        #print job_command

        # unzip
        job_command = "/usr/bin/unzip -uo " + downloadFile + " -d " + targetDir
        job_id = request_one_job(cmd_info, job_command, 2, job_id, "Y")
        #print job_command

        # move to location and clean up
        job_command = "scripts/zim_install_step3.sh " + zimFileRef
        #print job_command
        resp = request_job(cmd_info=cmd_info, job_command=job_command, cmd_step_no=3, depend_on_job_id=job_id, has_dependent="N")
        #resp = cmd_error(cmd='INST-ZIMS', msg='Just testing')
    else: # zims
        downloadFile = zim_working_dir + zimFileRef + ".zim"
        # download zim file
        job_command = "/usr/bin/wget -c --progress=dot:giga " + downloadSrcFile + " -O " + downloadFile
        #print job_command
        job_id = request_one_job(cmd_info, job_command, 1, -1, "Y")

        # move to location
        job_command = "scripts/zim_install_move.sh " + zimFileRef + ".zim"
        #job_command = "mv " + downloadFile + " " + zim_content_dir
        #print job_command
        resp = request_job(cmd_info=cmd_info, job_command=job_command, cmd_step_no=2, depend_on_job_id=job_id, has_dependent="N")
        #resp = cmd_error(cmd='INST-ZIMS', msg='Just testing')

    return resp

def copy_zims(cmd_info):

    if 'cmd_args' in cmd_info:
        source = cmd_info['cmd_args']['source']
        dest = cmd_info['cmd_args']['dest']
        zim_id = cmd_info['cmd_args']['zim_id']
        file_ref = cmd_info['cmd_args']['file_ref']
    else:
        return cmd_malformed(cmd_info['cmd'])

    if 'internal' not in [source, dest]:
        return (cmd_error(msg="Invalid Source or Destination."))

    if 'usb' not in source and 'usb' not in dest:
        return (cmd_error(msg="Invalid Source or Destination."))

    if source == 'internal':
        source = ''
        dest = '/media/usb' + dest[-1] # protect against injection
    else:
        source = '/media/usb' + source[-1]
        dest = ''
        # will add to zims_copying when job created

    # rsync zim files; if copying to internal, copy to working and then move
    if dest != '': # copy directly to usb
        # create /library etc
        zim_content_dest = dest + zim_content_dir
        zim_index_dest = dest + zim_index_dir
        if not os.path.isdir(zim_content_dest):
            os.makedirs(zim_content_dest)
        job_command = "scripts/copy_zim.sh " + source + zim_content_dir + file_ref + ".zim* " + zim_content_dest
        #job_command = "/usr/bin/rsync -Pav --size-only " + source + zim_content_dir + file_ref + ".zim* " + zim_content_dest

        zimidx = source + zim_index_dir + file_ref + ".zim.idx"
        if os.path.isdir (zimidx): # only copy index if exists (could be embedded)
            if not os.path.isdir(zim_index_dest):
                os.makedirs(zim_index_dest)
            job_id = request_one_job(cmd_info, job_command, 1, -1, "Y")
            # copy index
            #job_command = "/usr/bin/rsync -Pav --size-only " + zimidx + " " + zim_index_dest
            job_command = "scripts/copy_zim.sh " + zimidx + " " + zim_index_dest
            resp = request_job(cmd_info=cmd_info, job_command=job_command, cmd_step_no=2, depend_on_job_id=job_id, has_dependent="N")

        else:
            resp = request_job(cmd_info, job_command) # only one command for zim
    else: # copy to working and move to internal
        targetDir = zim_working_dir + file_ref + "/data"
        if not os.path.exists(targetDir):
            try:
                os.makedirs(targetDir + "/content")
            except OSError:
                resp = cmd_error(msg='Error creating directory ' + targetDir)
                return resp

        job_command = "scripts/copy_zim.sh " + source + zim_content_dir + file_ref + ".zim* " + dest + targetDir + "/content"
        job_id = request_one_job(cmd_info, job_command, 1, -1, "Y")
        #print job_command

        last_step = 2
        zimidx = source + zim_index_dir + file_ref + ".zim.idx"
        if os.path.isdir (zimidx): # only copy index if exists (could be embedded)
            job_command = "/usr/bin/rsync -Pav --size-only " + zimidx + " " + dest + targetDir + "/index"
            job_id = request_one_job(cmd_info, job_command, 2, -1, "Y")
            last_step = 3
            #print job_command
        #job_command = "scripts/zim_install_move.sh " + zimFileRef + ".zim"
        job_command = "scripts/zim_install_step3.sh " + file_ref
        resp = request_job(cmd_info=cmd_info, job_command=job_command, cmd_step_no=last_step, depend_on_job_id=job_id, has_dependent="N")
        #print job_command
    return resp

def make_kiwix_lib(cmd_info):
    job_command = "/usr/bin/iiab-make-kiwix-lib"
    resp = request_job(cmd_info=cmd_info, job_command=job_command)
    return resp

def install_oer2go_mod(cmd_info):

    global ansible_running_flag
    global jobs_requested
    global oer2go_catalog

    if 'cmd_args' in cmd_info:
        moddir = cmd_info['cmd_args']['moddir']
        if moddir in oer2go_catalog:
            refresh_oer2go_installed() # check to make sure it didn't get installed manually
            if moddir in oer2go_installed:
                resp = cmd_error(cmd='INST-OER2GO-MOD', msg='Module already installed in Command')
                return resp
        else:
            resp = cmd_error(cmd='INST-OER2GO-MOD', msg='Module not in catalog in Command')
            return resp
    else:
        return cmd_malformed(cmd_info['cmd'])

    # at this point we can create all the jobs

    # there are two sources:
    #   wasabi - contains rclone attribute
    #   oer2go_download_src - everything else

    targetDir = rachel_working_dir # /library/working/rachel/

    if 'rclone' in oer2go_catalog[moddir]:
        job_command = "/usr/bin/rclone -v sync " + oer2go_catalog[moddir]['rclone'] + " " + targetDir + moddir
    else:
        oer2go_download_src = oer2go_catalog[moddir]['rsync_url']
        job_command = "/usr/bin/rsync -Pavz --size-only " + oer2go_download_src + " " + targetDir

    job_id = request_one_job(cmd_info, job_command, 1, -1, "Y")
    #print job_command

    # move to location and clean up
    #job_command = "mv " + targetDir + moddir + " " + modules_dir
    job_command = "scripts/oer2go_install_move.sh " + moddir
    #print job_command
    resp = request_job(cmd_info=cmd_info, job_command=job_command, cmd_step_no=2, depend_on_job_id=job_id, has_dependent="N")

    # oer2go_downloading added at job creation to track wip for front end

    return resp

def copy_oer2go_mod(cmd_info):
    if 'cmd_args' in cmd_info:
        source = cmd_info['cmd_args']['source']
        dest = cmd_info['cmd_args']['dest']
        file_ref = cmd_info['cmd_args']['file_ref']
    else:
        return cmd_malformed(cmd_info['cmd'])

    if 'internal' not in [source, dest]:
        return (cmd_error(msg="Invalid Source or Destination."))

    if 'usb' not in source and 'usb' not in dest:
        return (cmd_error(msg="Invalid Source or Destination."))

    if source == 'internal':
        source = ''
        dest = '/media/usb' + dest[-1] # protect against injection
    else:
        source = '/media/usb' + source[-1]
        dest = ''
        # oer2go_copying set in job creation to track wip for front end

    content_source = source + modules_dir
    content_dest = dest + modules_dir

    if dest != '': # copy directly to usb
        # create /library etc
        if not os.path.isdir(content_dest):
            os.makedirs(content_dest)
        job_command = "/usr/bin/rsync -rPt --size-only " + content_source + file_ref + " " + content_dest
        resp = request_job(cmd_info, job_command)
    else: # copy to working and mv
        working_dest = dest + rachel_working_dir
        job_command = "/usr/bin/rsync -rPt --size-only " + content_source + file_ref + " " + working_dest
        job_id = request_one_job(cmd_info, job_command, 1, -1, "Y")
        job_command = "scripts/oer2go_install_move.sh " + file_ref
        resp = request_job(cmd_info=cmd_info, job_command=job_command, cmd_step_no=2, depend_on_job_id=job_id, has_dependent="N")
    return resp

def get_oer2go_stat(cmd_info):
    # resp = json.dumps(oer2go_catalog) # FE gets this this by reading the json directly

    refresh_oer2go_installed() # we will no longer use the module downloaded attribute in oer2go_catalog

    all_oer2go = {}

    all_oer2go['WIP'] = oer2go_wip

    all_oer2go['INSTALLED'] = oer2go_installed

    resp = json.dumps(all_oer2go)
    return (resp)

def refresh_oer2go_installed():
    global oer2go_installed
    oer2go_installed = get_oer2go_installed_list() # could go further and get rid of oer2go_installed

def get_oer2go_installed_list(device=""):
    oer2go_installed_list = []
    dirlist = glob(device + modules_dir + "/*/")
    for modpath in dirlist:
        moddir = modpath.split('/')[-2] # can include non-oer2go items so remove them
        if moddir in oer2go_catalog:
            oer2go_installed_list.append(moddir)
    return oer2go_installed_list

def install_rachel(cmd_info):

    global ansible_running_flag
    global jobs_requested
    global iiab_ini

    # make sure rachel is installed

    if 'rachel' not in iiab_ini:
        resp = cmd_error(cmd='INST-RACHEL', msg='RACHEL is not installed')
        return resp

    downloadSrcFile = iiab_ini['rachel']['rachel_src_url']
    rachel_version = iiab_ini['rachel']['rachel_version']

    try:
        rc = urllib.request.urlopen(downloadSrcFile)
        rc.close()
    except (urllib.error.URLError) as exc:
        errmsg = str("Can't access " + downloadSrcFile + " Cmd")
        resp = cmd_error(cmd='INST-RACHEL', msg=errmsg)
        return resp

    rachelName = rachel_version
    targetDir = rachel_working_dir + rachelName

    if not os.path.exists(targetDir):
        try:
            os.makedirs(targetDir)
        except OSError:
            resp = cmd_error(cmd='INST-RACHEL', msg='Error creating directory in Command')
            return resp

    # at this point we can create all the jobs

    downloadFile = rachel_downloads_dir + rachelName + '.zip'

    # download zip file
    job_command = "/usr/bin/wget -c --progress=dot:giga " + downloadSrcFile + " -O " + downloadFile
    job_id = request_one_job(cmd_info, job_command, 1, -1, "Y")
    #print job_command

    # unzip
    #job_command = "/usr/bin/unzip -uo " + downloadFile + " -d " + targetDir
    job_command = "scripts/rachel_install_step2.sh " + rachelName
    job_id = request_one_job(cmd_info, job_command, 2, job_id, "Y")
    #print job_command

    # move to location and clean up
    job_command = "scripts/rachel_install_step3.sh " + rachelName
    #print job_command
    resp = request_job(cmd_info=cmd_info, job_command=job_command, cmd_step_no=3, depend_on_job_id=job_id, has_dependent="N")
    #resp = cmd_error(cmd='INST-ZIMS', msg='Just testing')
    return resp

def get_osm_vect_catalog(cmd_info):
    return cmd_malformed("DUMMY")

def install_osm_vect_set(cmd_info):
    if osm_version == 'V1':
        return install_osm_vect_set_v1(cmd_info)
    elif osm_version == 'V2':
        return install_osm_vect_set_v2(cmd_info)
    else:
        resp = cmd_error(cmd='INST-OSM-VECT-SET', msg='OSM Vectors not installed or unknown version')
        return resp


def install_osm_vect_set_v1(cmd_info):
    global ansible_running_flag
    global jobs_requested
    if 'cmd_args' in cmd_info:
        map_id = cmd_info['cmd_args']['osm_vect_id']
        if map_id not in maps_catalog['regions']:
            resp = cmd_error(cmd='INST-OSM-VECT-SET', msg='Region is not in catalog in Command')
            return resp
    else:
        return cmd_malformed(cmd_info['cmd'])

    download_url = maps_catalog['regions'][map_id]['url'] # https://archive.org/download/en-osm-omt_north_america_2017-07-03_v0.1/en-osm-omt_north_america_2017-07-03_v0.1.zip
    zip_name = download_url.split('/')[-1] # en-osm-omt_north_america_2017-07-03_v0.1.zip
    download_file = maps_downloads_dir + zip_name
    unzipped_dir = maps_working_dir + zip_name.split('.zip')[0]

    # download zip file
    job_command = "/usr/bin/wget -c --progress=dot:giga " + download_url + " -O " + download_file
    job_id = request_one_job(cmd_info, job_command, 1, -1, "Y")
    #print job_command

    # unzip
    job_command = "/usr/bin/unzip -uo " + download_file + " -d " + maps_working_dir
    job_id = request_one_job(cmd_info, job_command, 2, job_id, "Y")
    #print job_command

    # move to location and clean up
    job_command = "scripts/osm-vect_install_step3.sh"
    job_command +=  " " + unzipped_dir
    job_command +=  " " + vector_map_path
    job_command +=  " " + download_file

    #print job_command
    resp = request_job(cmd_info=cmd_info, job_command=job_command, cmd_step_no=3, depend_on_job_id=job_id, has_dependent="N")

    return resp

def install_osm_vect_set_v2(cmd_info):
    global ansible_running_flag
    global jobs_requested
    if 'cmd_args' in cmd_info:
        map_id = cmd_info['cmd_args']['osm_vect_id']
        if map_id not in maps_catalog:
            resp = cmd_error(cmd='INST-OSM-VECT-SET', msg='Map Tile Set is not in catalog in Command')
            return resp
    else:
        return cmd_malformed(cmd_info['cmd'])

    if 'service_required' in cmd_info['cmd_args']: # allow caller to supply
        cmd_info['service_required'] = cmd_info['cmd_args']['service_required']
    else:
        cmd_info['service_required'] = ['osm_vector_maps', 'active']

    #download_url = maps_catalog[map_id]['detail_url']
    # hard coding for now as the control vars don't make much sense
    if maps_download_src == 'iiab.me':
        download_url = 'http://timmoody.com/iiab-files/maps/' + map_id
    elif maps_download_src == 'archive':
        download_url = 'https://archive.org/download/' + map_id + '/' + map_id
    elif maps_download_src == 'bittorrent':
        download_url = maps_catalog[map_id]['bittorrent_url']
        resp = cmd_error(cmd='INST-OSM-VECT-SET', msg='Not able to do bittorrent yet in Command')
        return resp

    download_file = maps_working_dir + map_id
    tiles_path = vector_map_tiles_path + map_id

    # see if already installed
    if os.path.isfile(tiles_path) and os.path.getsize(tiles_path) == maps_catalog[map_id]['size']:
        resp = cmd_error(cmd='INST-OSM-VECT-SET', msg=map_id + ' is already downloaded')
        return resp

    # save some values for later
    cmd_info['extra_vars'] = {}
    cmd_info['extra_vars']['download_url'] = download_url
    cmd_info['extra_vars']['size'] = maps_catalog[map_id]['size']

    # download mbtiles file
    # unless already done
    next_step = 1
    job_id = -1

    if not os.path.isfile(download_file) or os.path.getsize(download_file) != maps_catalog[map_id]['size']:
        job_command = "/usr/bin/wget -c --progress=dot:giga " + download_url + " -O " + download_file
        job_id = request_one_job(cmd_info, job_command, 1, -1, "Y")
        next_step = 2
        #print job_command

    # move to location and clean up
    job_command = "scripts/osm-vect_v2_install_step2.sh"
    job_command +=  " " + map_id
    job_id = request_one_job(cmd_info, job_command, next_step, job_id, "Y")

    next_step += 1

    # create maps idx
    job_command = "scripts/osm-vect_v2_finish_install.py " + map_id
    resp = request_job(cmd_info=cmd_info, job_command=job_command, cmd_step_no=next_step, depend_on_job_id=job_id, has_dependent="N")

    return resp

def install_sat_area(cmd_info):
    global ansible_running_flag
    global jobs_requested
    if 'cmd_args' in cmd_info:
        longitude = str(cmd_info['cmd_args']['longitude'])
        latitude = str(cmd_info['cmd_args']['latitude'])
        radius = str(cmd_info['cmd_args']['radius'])
    else:
        return cmd_malformed(cmd_info['cmd'])

    job_command = "/usr/bin/iiab-extend-sat.py --lon " + longitude + " --lat " + latitude + " --radius " + radius
    resp = request_job(cmd_info, job_command)
    return resp

def get_osm_vect_stat(cmd_info):
    global osm_vect_installed

    all_maps = {}
    all_maps['WIP'] = maps_wip

    all_maps['INSTALLED'] = {}
    all_maps['tile_base_installed'] = False
    all_maps['sat_base_installed'] = False
    all_maps['maps_active'] = iiab_roles_status['osm_vector_maps']['active']

    if os.path.exists(vector_map_tiles_path + maps_tiles_base):
        all_maps['tile_base_installed'] = True

    if os.path.exists(vector_map_tiles_path + maps_sat_base):
        all_maps['sat_base_installed'] = True

    # see what is installed
    # in /library/www/osm-vector-maps/viewer/tiles
    if os.path.exists(vector_map_tiles_path):
        osm_vect_installed = os.listdir(vector_map_tiles_path)
        for map in osm_vect_installed:
            all_maps['INSTALLED'][map] = True

    resp = json.dumps(all_maps)
    return (resp)

# def get_osm_vect_installed_list(device=""):
#    osm_vect_installed = os.listdir(vector_map_tiles_path)

def install_kalite(cmd_info):
    global ansible_running_flag
    global jobs_requested
    if 'cmd_args' in cmd_info:
        lang_code = cmd_info['cmd_args']['lang_code']
        topics = cmd_info['cmd_args']['topics']
    else:
        return cmd_malformed(cmd_info['cmd'])

    if 'service_required' in cmd_info['cmd_args']: # allow caller to supply
        cmd_info['service_required'] = cmd_info['cmd_args']['service_required']
    else:
        cmd_info['service_required'] = ['kalite', 'active']

    # validate topics (? or do in script)

    # run kalite_install_lang.sh
    next_step = 1
    job_id = -1
    job_command = "scripts/kalite_install_lang.sh " + lang_code
    job_id = request_one_job(cmd_info, job_command, next_step, job_id, "Y")

    next_step += 1

    # run kalite_install_videos.py
    job_command = "scripts/kalite_install_videos.py " + lang_code + " " + " ".join(topics)
    resp = request_job(cmd_info=cmd_info, job_command=job_command, cmd_step_no=next_step, depend_on_job_id=job_id, has_dependent="N")

    return resp

# Content Menu Commands

def get_menu_item_def_list(cmd_info):
    menu_item_defs = []
    menu_item_list = glob(js_menu_dir + 'menu-files/menu-defs/*.json')
    for item in menu_item_list:
        menu_item_def =  item.split('/')[-1].split('.')[0] # trim full path and .json
        menu_item_defs.append(menu_item_def)

    resp = json.dumps(sorted(menu_item_defs))
    return (resp)

def save_menu_def(cmd_info):
    menu_url = cmd_info['cmd_args']['menu_url']
    menu_def = cmd_info['cmd_args']['menu_def']

    resp = validate_command(menu_url) # check for special characters in directory string
    if resp != None:
        return resp
    if '..' in menu_url:
        return cmd_malformed(cmd_info['cmd'])

    menu_path = doc_root + '/' + menu_url + '/menu.json';

    try:
        with open(menu_path, 'w') as outfile:
            outfile.write(json.dumps(menu_def, indent=2))
    except OSError as e:
        resp = cmd_error(cmd_info['cmd'], msg='Error writing to Menu Definition File.')
        return (resp)

    resp = cmd_success(cmd_info['cmd'])
    return (resp)
    #else:
    #    return ('{"Error": "' + outp + '."}')

def save_menu_item_def(cmd_info):
    menu_item_def_name = cmd_info['cmd_args']['menu_item_name']
    target_file = js_menu_dir + 'menu-files/menu-defs/' + menu_item_def_name + '.json'
    menu_item_def = cmd_info['cmd_args']['menu_item_def']
    menu_item_def['change_ref'] = 'admin_console - ' + cmd_info['cmd_args']['mode']
    menu_item_def['edit_status'] = 'local_change'

    # save values that format removes
    upload_flag = menu_item_def['upload_flag']
    download_flag = menu_item_def['download_flag']

    menu_item_def = adm.format_menu_item_def(menu_item_def_name, menu_item_def)

    menu_item_def['upload_flag'] = upload_flag
    menu_item_def['download_flag'] = download_flag

    try:
        adm.write_json_file(menu_item_def, target_file)
    except :
        resp = cmd_error(cmd_info['cmd'], msg='Error writing to Menu Item Definition File.')
        return (resp)

    # this is a stub
    if upload_flag:
        try:
            # get sha of file
            # curl https://api.github.com/repos/iiab-share/js-menu-files-test/commits?path=menu-defs/es-kolibri_khan_es.json gets proper commitsha
            # response = requests.get(menu_def_base_url + 'commits?path=' + path, headers=headers)
            sha = '?'
            # adm.put_menu_item_def(menu_item_def_name, menu_item_def, sha=sha)
            # do we really want to send icon and extra html?
        except :
            resp = cmd_error(cmd_info['cmd'], msg='Error Uploading Menu Item Definition.')
            return (resp)

    # what if download_flag, retrieve; should the frontend load the new values?

    resp = cmd_success(cmd_info['cmd'])
    return (resp)

def sync_menu_item_defs(cmd_info):
    outp = subproc_check_output(["scripts/sync_menu_defs.py"])
    json_outp = json_array("sync_menu_item_defs", outp)
    return (json_outp)

def move_uploaded_file(cmd_info):
    src_path = content_base + '/working/uploads/'
    dest_paths = {'icon' : content_base + '/www/html/js-menu/menu-files/images/'}
    file_name = cmd_info['cmd_args']['file_name']
    file_use = cmd_info['cmd_args']['file_use']
    filter_array = cmd_info['cmd_args']['filter_array']
    if file_use not in dest_paths:
        return cmd_malformed(cmd_info['cmd'])
    src = src_path + file_name
    dst = dest_paths[file_use] + file_name
    #print(src)
    #print(dst)
    if len(filter_array) > 0:
        if imghdr.what(src) not in filter_array:
            os.remove(src)
            return cmd_error(cmd_info['cmd'], msg="File cannot be used as " + file_use + ".")
    try:
        shutil.copy(src, dst)
        os.chmod(dst, 420) # stat.S_IRUSR | stat.S_IWUSR | stat.S_IRGRP | stat.S_IROTH
        shutil.chown(dst, 'www-data','www-data')
        os.remove(src)
    except:
        return cmd_error(cmd_info['cmd'], msg="File can not be moved.")
    return cmd_success(cmd_info['cmd'])

def remove_uploaded_files():
    files = glob(content_base + '/working/uploads/*')
    for f in files:
        os.remove(f)

def copy_dev_image(cmd_info):
    if not is_rpi:
        resp = cmd_error(cmd_info['cmd'], msg='Image copy only supported on Raspberry Pi at this time.')
        return (resp)

    dest_dev = cmd_info['cmd_args']['dest_dev']
    comp_proc = adm.subproc_run('ls ' + dest_dev)
    if comp_proc.returncode != 0:
        resp = cmd_error(cmd_info['cmd'], msg='Device ' + dest_dev + ' not found.')
        return (resp)

    job_command = "/usr/sbin/piclone_cmd " + dest_dev
    resp = request_job(cmd_info, job_command)
    return (resp)

# Control Commands

def restart_kiwix(cmd_info):
    rc = subprocess.call(["/usr/bin/iiab-make-kiwix-lib"])
    #print rc
    if rc == 0:
        resp = cmd_success(cmd_info['cmd'])
    else:
        resp = cmd_error(cmd_info['cmd'])
    return (resp)

def reboot_server(cmd_info):
    resp = cmd_success_msg(cmd_info['cmd'], 'Reboot Initiated')
    outp = subprocess.Popen(["scripts/reboot.sh"])
    return (resp)

def poweroff_server(cmd_info):
    resp = cmd_success_msg(cmd_info['cmd'], 'Power Off Initiated')
    outp = subprocess.Popen(["scripts/poweroff.sh"])
    return (resp)

def remote_admin_ctl(cmd_info):
    try:
        bool_activate = cmd_info['cmd_args']['activate']
        outp = subprocess.Popen(["scripts/remote_admin_ctl.sh",bool_activate])
        resp = get_remote_admin_status(cmd_info)
        return (resp)
    except:
        return cmd_malformed(cmd_info['cmd'])

def get_remote_admin_status(cmd_info):
    outp = subproc_check_output(["scripts/get_remote_admin_status.sh"])
    #resp = json_array("remote",outp)
    return (outp.strip())

def change_password(cmd_info):
    #print cmd_info['cmd_args']
    try:
        user = cmd_info['cmd_args']['user']
        oldpasswd = cmd_info['cmd_args']['oldpasswd']
        newpasswd = cmd_info['cmd_args']['newpasswd']
    except:
        return cmd_malformed(cmd_info['cmd'])

    # Prevent shell injection on arguments - will disallow some legal characters from password
    # Assume this is not needed as shell is false on call to chpasswd
    #for key in cmd_info['cmd_args']:
    #    match = re.search('[ ;,|<>()`=&\r\n]', cmd_info['cmd_args'][key])
    #    if match != None:
    #        return cmd_malformed(cmd_info['cmd'])

    # May not set root password
    if user == "root":
        resp = cmd_error(cmd=cmd_info['cmd'], msg='May not change root password.')
        return resp

    # see if user exists
    try:
        spwddb = spwd.getspnam(user)
    except:
        resp = cmd_error(cmd=cmd_info['cmd'], msg='User not found or system error.')
        return resp

    # check old password - N.B. allows password guessing
    readpasswd = spwddb[1]
    pwparts = readpasswd.split('$')
    salt = '$' + pwparts[1] + '$' +  pwparts[2] +'$'
    calcpasswd = crypt.crypt(oldpasswd, salt)

    if calcpasswd != readpasswd:
        resp = cmd_error(cmd=cmd_info['cmd'], msg='Old Password Incorrect.')
        return resp

    # check password for valid characters and min length of 8 - need better regex as all characters are legal
    #match = re.search('^[A-Za-z0-9#$+*]{8,}$', newpasswd)
    #if match != None:
    #    resp = cmd_error(cmd=cmd_info['cmd'], msg='Illegal Characters in Password.')
    #    return resp

    # check password strength
    is_valid, message = isStrongPassword(newpasswd)
    if not is_valid:
        resp = cmd_error(cmd=cmd_info['cmd'], msg='Password Strength: ' + message + '.')
        return resp

    # create new password hash
    newhash = crypt.crypt(newpasswd, salt)
    pwinput = user + ':' + newhash + '\n'
    pwinput = pwinput.encode() # convert to byte

    # finally change password
    p = subprocess.Popen(['chpasswd', '-e'], stdout=subprocess.PIPE, stdin=subprocess.PIPE, stderr=subprocess.STDOUT)
    out = p.communicate(input=pwinput)[0]
    rc =  p.returncode

    if rc != 0:
        resp = cmd_error(cmd=cmd_info['cmd'], msg='System Error: Failure to change password')
    else:
        resp = cmd_success_msg(cmd=cmd_info['cmd'], msg='Password Changed')
    return resp

def isStrongPassword(password):
    message = ""
    is_valid = True

    try:
        cracklib.VeryFascistCheck(password)
    except ValueError as e:
        is_valid = False
        message = str(e)

    return is_valid, message

def check_password_match(user, password):
    # return True if password matches current hash or False if user not found or no match
    # see if user exists
    try:
        spwddb = spwd.getspnam(user)
    except:
        return False

    # check old password - N.B. allows password guessing
    passwd_hash = spwddb[1]
    pwparts = passwd_hash.split('$')
    if len (pwparts) > 1:
        salt = '$' + pwparts[1] + '$' +  pwparts[2] +'$'
    else:
        return False # no salt so must not match

    calc_passwd_hash = crypt.crypt(password, salt)
    if calc_passwd_hash != passwd_hash:
        return False
    else:
        return True

def request_job(cmd_info, job_command, cmd_step_no=1, depend_on_job_id=-1, has_dependent="N"):
    global jobs_requested

    active_commands[cmd_info['cmd_rowid']] = cmd_info['cmd_msg']
    job_id = request_one_job(cmd_info, job_command, cmd_step_no, depend_on_job_id, has_dependent)

    return ('{"Success": "Job  ' + str(job_id) + ' Scheduled."}')

def request_one_job(cmd_info, job_command, cmd_step_no, depend_on_job_id, has_dependent):
    global jobs_requested
    global prereq_jobs

    prereq_info = {}
    job_id = get_job_id()

    job_info = {}
    job_info['cmd_rowid'] = cmd_info['cmd_rowid']
    job_info['cmd'] = cmd_info['cmd']
    job_info['cmd_args'] = cmd_info['cmd_args']
    job_info['extra_vars'] = cmd_info.get('extra_vars', None) # optional
    job_info['service_required'] = cmd_info.get('service_required', None) # only some commands

    job_info['cmd_step_no'] = cmd_step_no
    job_info['depend_on_job_id'] = depend_on_job_id
    job_info['has_dependent'] = has_dependent
    job_info['job_command'] = job_command
    job_info['status'] = 'SCHEDULED'
    job_info['status_datetime'] = str(datetime.now())

    opt_args = {}
    if 'extra_vars' in job_info:
        opt_args ['extra_vars'] = job_info['extra_vars']
    if 'service_required' in job_info:
        opt_args ['service_required'] = job_info['service_required']

    opt_args_json = json.dumps(opt_args)

    jobs_requested[job_id] = job_info
    insert_job(job_id, cmd_info['cmd_rowid'], job_command, opt_args_json, cmd_step_no, depend_on_job_id, has_dependent)

    if has_dependent == "Y":
        prereq_info ['status'] = job_info['status']
        prereq_jobs[job_id] = prereq_info

    if cmd_step_no == 1:
        add_wip(job_info)

    return job_id

def cancel_job(cmd_info):
    global jobs_to_cancel
    global jobs_requested

    try:
        job_id = int(cmd_info['cmd_args']['job_id'])
    except ValueError:
        return cmd_malformed(cmd_info['cmd'])

    if job_id in jobs_requested:
        jobs_to_cancel[job_id] = True
        return ('{"Success": "Scheduled Job  ' + str(job_id) + ' Cancelled."}')
    elif job_id in jobs_running :
        jobs_to_cancel[job_id] = True
        return ('{"Success": "Running Job  ' + str(job_id) + ' Cancelled."}')
    else:
        return ('{"Error": "Job  ' + str(job_id) + ' Not Running or Scheduled."}')

def get_last_jobs_stat(cmd_info):
    # make changes to cut down on volumn of data
    db_lock.acquire() # will block if lock is already held
    try:
        conn = sqlite3.connect(cmdsrv_dbpath)
        cur = conn.execute ("SELECT jobs.rowid, job_command, job_output, job_status, strftime('%m-%d %H:%M', jobs.create_datetime), strftime('%s', jobs.create_datetime), strftime('%s',last_update_datetime), strftime('%s','now', 'localtime'), cmd_msg FROM jobs, commands where cmd_rowid = commands.rowid ORDER BY jobs.rowid DESC LIMIT 30")
        status_jobs = cur.fetchall()
        conn.close()
    except sqlite3.Error as e:
        tprint ("Error %s:" % e.args[0])
        log(syslog.LOG_ERR, "Sql Lite3 Error %s:" % e.args[0])
    finally:
        if conn:
            conn.close()
        db_lock.release()

    #print "job running"
    #print jobs_running
    # get status output for recent jobs
    status_jobs_return = []
    for job in status_jobs:
        status_job = {}
        job_id = job[0]
        status_job['job_id'] = job_id
        status_job['job_command'] = job[1]
        status_job['job_output'] = job[2]
        status_job['job_status'] = job[3]
        status_job['create_datetime'] = job[4]
        create_datetime_sec = job[5]
        last_update_datetime_sec = job[6]
        cur_time_sec = job[7]
        # elapsed time is from creation, not start
        status_job['elapsed_sec'] = int(last_update_datetime_sec) - int(create_datetime_sec) # not valid for running jobs
        status_job['cmd_msg'] = job[8]

        if job_id in jobs_running:
            if jobs_running[job_id]['status'] == "STARTED" or jobs_running[job_id]['status'] == "RESTARTED":
                status_job['elapsed_sec'] = int(cur_time_sec) - int(create_datetime_sec) # last_update_datetime not update while running
                # load output from tmp file
                output_file = jobs_running[job_id]['output_file']
                #print output_file

                command = "tail " + output_file
                args = shlex.split(command)
                job_output = subproc_check_output(args)
                status_job['job_output'] = job_output

                #print "job output" + job_output

        status_jobs_return.append(status_job)

    resp = json.dumps(status_jobs_return)
    return resp

def get_jobs_running(cmd_info): # Not used
    global jobs_running
    today = str(date.today())
    job_stat = {}
    cur_jobs = {}
    for job, job_info in jobs_running.items():
        if today in job_info['status_datetime'] or jobinfo['status'] in ['SCHEDULED','STARTED']:
            job_stat['status'] = job_info['status']
            job_stat['job_command'] = job_info['job_command']
            job_stat['status_datetime'] = job_info['status_datetime']
            job_stat['status_datetime'] = job_info['status_datetime']
            job_stat['job_output'] = job_info['job_output']
            cur_jobs[job] = job_stat

    resp = json.dumps(cur_jobs)
    return resp

def json_array(name, str):
    try:
        str_array = str.split('\n')
        str_json = json.dumps(str_array)
        json_resp = '{ "' + name + '":' + str_json + '}'
    except Exception:
        json_resp = cmd_error()
    return (json_resp)

def validate_command(cmd_arg_str):
    match = re.search('[;,|<>()=&\r\n]', cmd_arg_str, flags=0)
    if match != None:
        log(syslog.LOG_ERR, "Error: Malformed Command")
        return ('{"Error": "Malformed Command."}')
    else:
        return None

def get_cmd_info_key(cmd_info, key):
   if key in cmd_info:
       return (cmd_info[key])
   else:
       return None

def tprint(msg):
    """like print, but won't get newlines confused with multiple threads DELETE AFTER TESTING"""
    if daemon_mode == False:
        sys.stdout.write(msg + '\n')
        sys.stdout.flush()

def log(level, msg):
   # translate syslog levels to logger levels
   levels = [50,50,50,40,30,20,10,0]

   #print level, msg
   #print journal_log.getEffectiveLevel()
   journal_log.log(levels[level], "IIAB-CMDSRV : " + msg)

def cmd_success(cmd):
   return (cmd_success_msg(cmd, ""))

def cmd_success_msg(cmd, msg):
   return ('{"Success": "' + cmd + " " + msg + '."}')

def cmd_warning(cmd="", msg="WARNING: Success, but Some Exceptions may have occured."):
    log(syslog.LOG_ERR, "Warning: %s %s." % (msg, cmd))
    return ('{"Warning": "' + msg + ' ' + cmd + '."}')

def cmd_error(cmd="", msg="Internal Server Error processing Command"):
    log(syslog.LOG_ERR, "Error: %s %s." % (msg, cmd))
    return ('{"Error": "' + msg + ' ' + cmd + '."}')

def cmd_malformed(cmd=None):
    log(syslog.LOG_ERR, "Error: Malformed Command %s." % cmd)
    return ('{"Error": "Malformed Command ' + cmd + '."}')

def insert_command(cmd_msg):
    global last_command_rowid

    lock.acquire() # will block if lock is already held
    try:
        cmd_id = last_command_rowid + 1
        last_command_rowid = cmd_id
    finally:
        lock.release() # release lock, no matter what

    now = datetime.now()

    db_lock.acquire()
    try:
        conn = sqlite3.connect(cmdsrv_dbpath)
        conn.execute ("INSERT INTO commands (rowid, cmd_msg, create_datetime) VALUES (?,?,?)", (cmd_id, cmd_msg, now))
        conn.commit()
        conn.close()
    except sqlite3.Error as e:
        tprint ("Error %s:" % e.args[0])
        log(syslog.LOG_ERR, "Sql Lite3 Error %s:" % e.args[0])
    finally:
        if conn:
            conn.close()
        db_lock.release()

    return (cmd_id)

def insert_job(job_id, cmd_rowid, job_command, opt_args_json, cmd_step_no, depend_on_job_id, has_dependent):
    #print "in insert job"
    now = datetime.now()
    job_pid=0
    job_output=""
    job_status="SCHEDULED"

    db_lock.acquire()
    try:
        conn = sqlite3.connect(cmdsrv_dbpath)
        conn.execute ("INSERT INTO jobs (rowid, cmd_rowid, cmd_step_no, depend_on_job_id, has_dependent, job_command, opt_args_json, job_pid, job_output, job_status, create_datetime, last_update_datetime) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                      (job_id, cmd_rowid, cmd_step_no, depend_on_job_id, has_dependent, job_command, opt_args_json, job_pid, job_output, job_status, now, now))

        conn.commit()
        conn.close()
    except sqlite3.Error as e:
        tprint ("Error %s:" % e.args[0])
        log(syslog.LOG_ERR, "Sql Lite3 Error %s:" % e.args[0])
    finally:
        if conn:
            conn.close()
        db_lock.release()

def upd_job_started(job_id, job_pid, job_status="STARTED"):

    now = datetime.now()
    db_lock.acquire()
    try:
        conn = sqlite3.connect(cmdsrv_dbpath)
        conn.execute ("UPDATE jobs SET job_pid = ?, job_status = ?, last_update_datetime = ? WHERE rowid = ?", (job_pid, job_status, now, job_id))
        conn.commit()
        conn.close()
    except sqlite3.Error as e:
        tprint ("Error %s:" % e.args[0])
        log(syslog.LOG_ERR, "Sql Lite3 Error %s:" % e.args[0])
    finally:
        if conn:
            conn.close()
        db_lock.release()

def upd_job_finished(job_id, job_output, job_status="FINISHED"):

    now = datetime.now()
    db_lock.acquire()
    try:
        conn = sqlite3.connect(cmdsrv_dbpath)
        conn.execute ("UPDATE jobs SET job_status = ?, job_output = ?, last_update_datetime = ? WHERE rowid = ?", (job_status, job_output, now, job_id))
        conn.commit()
        conn.close()
    except sqlite3.Error as e:
        tprint ("Error %s:" % e.args[0])
        log(syslog.LOG_ERR, "Sql Lite3 Error %s:" % e.args[0])
    finally:
        if conn:
            conn.close()
        db_lock.release()

def upd_job_cancelled(job_id, job_status="CANCELLED"):

    now = datetime.now()
    db_lock.acquire()
    try:
        conn = sqlite3.connect(cmdsrv_dbpath)
        conn.execute ("UPDATE jobs SET job_status = ?, last_update_datetime = ? WHERE rowid = ?", (job_status, now, job_id))
        conn.commit()
        conn.close()
    except sqlite3.Error as e:
        tprint ("Error %s:" % e.args[0])
        log(syslog.LOG_ERR, "Sql Lite3 Error %s:" % e.args[0])
    finally:
        if conn:
            conn.close()
        db_lock.release()

def get_job_id():
    global last_job_rowid

    lock.acquire() # will block if lock is already held
    try:
        job_id = last_job_rowid + 1
        last_job_rowid = job_id
    finally:
        lock.release() # release lock, no matter what

    return(job_id)

def escape_html(text):
    """escape strings for display in HTML"""
    return cgi.escape(text, quote=True).\
           replace('\n', '<br />').\
           replace('\t', '&emsp;').\
           replace('  ', ' &nbsp;')

def init():
    global last_command_rowid
    global last_job_rowid
    global is_rpi

    # Read application variables from config files
    app_config()

    # Read vars from ansible file into global vars
    read_iiab_default_vars()
    read_iiab_local_vars()
    # REMOVE OBSOLETE
    # read_iiab_vars()
    # get_install_vars_init()
    read_iiab_ini_file()
    read_iiab_roles_stat() # into global iiab_roles_status

    # Get ansible facts for localhost
    get_ansible_facts()

     # Compute variables derived from all of the above
    compute_vars()

    #get_ansible_tags()
    read_kiwix_catalog()
    read_oer2go_catalog()
    read_maps_catalog()

    # Clean up any failed uploads
    remove_uploaded_files()

    if ansible_facts['ansible_local']['local_facts']['rpi_model'] != 'none':
        is_rpi = True # convenience
        cmdsrv_max_concurrent_jobs = adm_conf['cmdsrv_max_rpi_jobs'] # lower max concurrent jobs if rpi
    else:
        is_rpi = False

    # record sdcard params for rpi
    # take it out until we need it and have a better algorithm
    # or maybe later add a config switch
    #    write_sdcard_params()

    # See if queue.db exists and create if not
    # Opening a connection creates if not exist
    # No DB locking done in init as is single threaded

    statinfo = os.stat(cmdsrv_dbpath)
    if statinfo.st_size == 0:
        conn = sqlite3.connect(cmdsrv_dbpath)
        conn.execute ("CREATE TABLE commands (cmd_msg text, create_datetime text)")
        conn.commit()
        conn.execute ("CREATE TABLE jobs (cmd_rowid integer, cmd_step_no integer, depend_on_job_id integer, has_dependent text, job_command text, opt_args_json text, job_pid integer, job_output text, job_status text, create_datetime text, last_update_datetime text)")
        conn.commit()
        conn.close()
    else:
        conn = sqlite3.connect(cmdsrv_dbpath)
        cur = conn.execute("SELECT max (rowid) from commands")
        row = cur.fetchone()
        if row[0] is not None:
            last_command_rowid = row[0]

        cur = conn.execute("SELECT max (rowid) from jobs")
        row = cur.fetchone()
        if row[0] is not None:
            last_job_rowid = row[0]

        cur.close()
        conn.close()

        get_incomplete_jobs()

def write_sdcard_params():
    cmd = 'scripts/wr-sdcard-params.sh'
    adm.subproc_cmd(cmd)

def read_iiab_ini_file():
    global iiab_ini
    iiab_ini_tmp = {}

    config = configparser.ConfigParser()
    config.read(iiab_ini_file)
    for section in config.sections():
        iiab_ini_sec = {}
        opts = config.options(section)
        for opt in opts:
            attr = config.get(section, opt)
            iiab_ini_sec[opt] = attr
        iiab_ini_tmp[section] = iiab_ini_sec

    iiab_ini = iiab_ini_tmp

def read_iiab_local_vars():
    global local_vars
    try:
        vars_dict = adm.read_yaml(iiab_local_vars_file)
        local_vars = adm.jinja2_subst(vars_dict, dflt_dict=default_vars)
        merge_effective_vars()
    except Exception as e:
        local_vars_error = "Error in " + iiab_local_vars_file
        if hasattr(e, 'problem_mark'):
            mark = e.problem_mark
            local_vars_error = "Error " + mark
        log(syslog.LOG_INFO, local_vars_error)
        raise

def merge_effective_vars():
    # assumes default_vars was read in init()
    # assumes adm.jinja2_subst() has done substitutions on both
    # combine vars with local taking precedence
    # OK. a little simpler than before
    global effective_vars

    effective_vars = {**default_vars , **local_vars}

def read_iiab_default_vars():
    global default_vars
    vars_dict = adm.read_yaml(iiab_repo + "/vars/default_vars.yml")
    default_vars = adm.jinja2_subst(vars_dict)

def OBSOL_read_iiab_vars():
    # retain for alternate ansible variable logic
    # assumes default_vars was read in init()
    # and role status
    global default_vars
    global local_vars
    global effective_vars

    default_vars = adm.read_yaml(iiab_repo + "/vars/default_vars.yml")
    local_vars = adm.read_yaml(iiab_local_vars_file)

    if local_vars == None:
        local_vars = {}

    # combine vars with local taking precedence
    # exclude derived vars marked by {

    for key in default_vars:
        if isinstance(default_vars[key], str):
            findpos = default_vars[key].find("{")
            if findpos == -1:
                effective_vars[key] = default_vars[key]
        else:
            effective_vars[key] = default_vars[key]

    for key in local_vars:
        if isinstance(local_vars[key], str):
            findpos = local_vars[key].find("{")
            if findpos == -1:
                effective_vars[key] = local_vars[key]
        else:
            effective_vars[key] = local_vars[key]

def get_ansible_facts():
    global ansible_facts

    command = ansible_program + " localhost -i " + iiab_repo + "/ansible_hosts  -m setup -o  --connection=local"
    args = shlex.split(command)
    outp = subproc_check_output(args)
    if (get_ansible_version() < '2'):
        splitter = 'success >> '
    else:
        splitter = 'SUCCESS => '
    ans_str = outp.split(splitter)
    ans = json.loads(ans_str[1])
    ansible_facts = ans['ansible_facts']

def get_ansible_tags():
    global ansible_tags

    if (get_ansible_version() < '2'):
        command = ansible_playbook_program + " -i " + iiab_repo + "/ansible_hosts " + iiab_repo + "/iiab-from-console.yml --connection=local --tags=???"
        splitter = 'values: '
    else:
        command = ansible_playbook_program + " -i " + iiab_repo + "/ansible_hosts " + iiab_repo + "/iiab-from-console.yml --connection=local --list-tags"
        splitter = 'TASK TAGS: '

    args = shlex.split(command)
    try:
        outp = subproc_check_output(args)
    except subprocess.CalledProcessError as e:
        outp = e.output

    # get just the tag list and remove final newline
    split = outp.split(splitter)
    ans_tags_str = split[1].split('\n')[0]
    ansible_tags['ansible_tags'] = ans_tags_str

def read_kiwix_catalog():
    global kiwix_catalog
    global init_error
    try:
        stream = open (kiwix_catalog_file,"r")
        kiwix_catalog_with_date = json.load(stream)
        kiwix_catalog = kiwix_catalog_with_date['zims']
        stream.close()
    except:
        init_error = True
        log(syslog.LOG_ERR, 'Kiwix Catalog json file not found' )
        pass

def read_oer2go_catalog():
    global oer2go_catalog
    global init_error

    try:
        stream = open (oer2go_catalog_file,"r")
        oer2go_catalog_with_date = json.load(stream)
        oer2go_catalog = oer2go_catalog_with_date['modules']
        stream.close()
    except:
        init_error = True
        log(syslog.LOG_ERR, 'OER2GO Catalog json file not found' )
        pass

def read_maps_catalog():
    global maps_catalog
    global init_error

    if osm_version == 'V2':
        fname = adm_maps_catalog_file
    else:
        fname = maps_catalog_file
    try:
        stream = open (fname,"r")
        catalog = json.load(stream)
        if osm_version == 'V1':
            maps_catalog = catalog

        # for v2 flatten the catalog to put maps and base in same
        # uses adm-maps-catalog.json
        if osm_version == 'V2':
            maps_catalog = catalog['maps']
            maps_catalog.update(catalog['base'])

        stream.close()
    except:
        init_error = True
        log(syslog.LOG_ERR, 'Maps Catalog json file not found' )
        pass
    #print maps_catalog

# moved to iiab.adm_lib.py
#def write_json_file(dict, target_file):
#    str_json = json.dumps(dict, indent=2) # puts unicode in format \uxxxx
#    str_uni = str_json.decode('unicode-escape') # removes that
#    str_utf8 = str_uni.encode('utf-8') # converts to utf-8
#    try:
#        with open(target_file, 'wb') as outfile:
#            outfile.write(str_utf8)
#    except OSError as e:
#        raise

def get_incomplete_jobs():
    global jobs_requested
    global jobs_to_restart

    jobs_to_cancel = {}
    prereq_info = {}

    # calculate boot time so we can tell if pid is ours
    with open('/proc/uptime', 'r') as f:
        uptime_str = f.readline()
    now = datetime.now()
    seconds_since_boot = float(uptime_str.split()[0])

    boot_delta = timedelta(seconds=seconds_since_boot)
    boot_time = now - boot_delta

    # get jobs from database that didn't finish, group by command in desc order so we only done the last one
    conn = sqlite3.connect(cmdsrv_dbpath)
    sql = "SELECT jobs.rowid, cmd_rowid, cmd_step_no, depend_on_job_id, has_dependent, job_command, opt_args_json, job_pid, job_output, job_status, jobs.create_datetime, cmd_msg from commands, jobs "
    sql += "WHERE commands.rowid = jobs.cmd_rowid and job_status IN ('STARTED', 'RESTARTED', 'SCHEDULED') ORDER BY job_command, jobs.rowid DESC"
    cur = conn.execute(sql)

    last_command = ""

    for row in cur.fetchall():
        job_id, cmd_rowid, cmd_step_no, depend_on_job_id, has_dependent, job_command, opt_args_json, job_pid, job_output, job_status, create_datetime, cmd_msg = row

        job_created_time = datetime.strptime(create_datetime, "%Y-%m-%d %H:%M:%S.%f") # create_datetime to datetime type

        # Kill any jobs hanging around. In future we might try to monitor them since we have the job_output.
        # But make sure they are since last reboot or might not be ours
        if job_created_time > boot_time:
            if job_pid > 0:
                try:
                    tprint ("Removing pid %s if still running" % job_pid)
                    log(syslog.LOG_INFO, "Removing pid %s if still running" % job_pid)
                    os.kill(job_pid, signal.SIGKILL)
                except OSError:
                    pass
            # rm job_output file
            try:
                output_file = '/tmp/job-' + str(job_id)
                os.remove(output_file)
            except OSError:
                pass

        parse_failed, job_info = parse_cmd_msg(cmd_msg)
        if parse_failed:
            log(syslog.LOG_ERR, "Error: Unexpected error in when restarting Command %s." % job_info['cmd'])

        job_info['cmd_rowid'] = cmd_rowid
        job_info['job_command'] = job_command
        job_info['cmd_step_no'] = cmd_step_no
        job_info['depend_on_job_id'] = depend_on_job_id
        job_info['has_dependent'] = has_dependent
        job_info['job_command'] = job_command
        job_info['status'] = job_status
        job_info['create_datetime'] = create_datetime
        job_info['status_datetime'] = str(datetime.now())

        opt_args = json.loads(opt_args_json)

        # break out special attributes
        if 'extra_vars' in opt_args:
            job_info['extra_vars'] = opt_args['extra_vars']
        if 'service_required' in opt_args:
            job_info['service_required'] = opt_args['service_required']

        # only restart if we haven't already seen this command
        # we assume that we can always use the highest numbered job for a given command
        if job_command != last_command:
            if job_status == 'SCHEDULED':
                jobs_requested[job_id] = job_info
                if has_dependent == "Y":
                    prereq_info ['status'] = 'SCHEDULED'
                    prereq_jobs[job_id] = prereq_info
            else:
                jobs_to_restart[job_id] = job_info
            # Add to active_commands
            active_commands[cmd_rowid] = cmd_msg
            if job_info['cmd'] == "INST-ZIMS":
                id = job_info['cmd_args']['zim_id']
                if id not in kiwix_catalog:
                    log(syslog.LOG_ERR, "Error: Unknown kiwix zim - %s." % id)
                    #print "unknown kiwix zim - ", id
                # add to wip in start_job

        else: # cancel duplicate
            jobs_to_cancel[job_id] = job_info

        last_command = job_command
    cur.close()
    conn.close()

    for job_id in jobs_to_cancel:
        upd_job_cancelled(job_id)
        if jobs_to_cancel[job_id]['has_dependent'] == "Y":
            prereq_info ['status'] = 'CANCELLED'
            prereq_jobs[job_id] = prereq_info

    # fix up prereq_jobs with status of completed prereq jobs, not selected in the previous query
    conn = sqlite3.connect(cmdsrv_dbpath)
    sql = "SELECT rowid, job_status from jobs WHERE rowid IN (SELECT depend_on_job_id FROM jobs where job_status IN ('STARTED', 'RESTARTED', 'SCHEDULED'))"
    cur = conn.execute(sql)
    for row in cur.fetchall():
        job_id, job_status = row
        if not job_id in prereq_jobs:
            prereq_info ['status'] = job_status
            prereq_jobs[job_id] = prereq_info
    cur.close()
    conn.close()

def app_config():
    global adm_conf
    global iiab_base
    global iiab_repo
    global iiab_config_dir
    global iiab_config_file
    global iiab_ini_file
    global iiab_local_vars_file
    global config_vars_file
    global cmdsrv_dbpath
    global cmdsrv_dbname
    global cmdsrv_no_workers
    global cmdsrv_job_poll_sleep_interval
    global cmdsrv_max_concurrent_jobs
    global cmdsrv_lower_job_priority_flag
    global cmdsrv_lower_job_priority_str
    global cmdsrv_pid_file
    global cmdsrv_ready_file
    global kiwix_catalog_file
    global doc_root
    global content_base
    global zim_downloads_dir
    global zim_working_dir
    global zim_dir
    global zim_download_prefix
    global zim_content_dir
    global zim_index_dir
    global oer2go_catalog_file
    global oer2go_mods_url
    global rachel_downloads_dir
    global rachel_working_dir
    global rachel_version
    global maps_downloads_dir
    global maps_working_dir
    global maps_catalog_url
    global maps_catalog_file
    global maps_catalog_url_v2
    global adm_maps_catalog_file
    global vector_map_path
    global maps_tiles_base
    global vector_map_tiles_path
    global maps_sat_base
    global maps_download_src
    global modules_dir
    global js_menu_dir
    global ansible_playbook_program
    global ansible_program
    global apache_user
    global squid_service
    global df_program
    global squid_whitelist


    stream = open (cmdsrv_config_file,"r")
    inp = json.load(stream)
    stream.close()

    conf = inp['cmdsrv_conf']
    adm_conf = conf

    iiab_base = conf['iiab_base']
    iiab_repo = conf['iiab_repo']
    iiab_config_dir = conf['iiab_config_dir']
    iiab_config_file = conf['iiab_config_file']
    iiab_ini_file = conf['iiab_ini_file']
    iiab_local_vars_file = conf['iiab_local_vars_file']
    config_vars_file = iiab_config_dir + "/config_vars.yml"

    cmdsrv_dbname = conf['cmdsrv_dbname']
    cmdsrv_dbpath = cmdsrv_dir + "/" + cmdsrv_dbname
    cmdsrv_no_workers = conf['cmdsrv_no_workers']
    cmdsrv_job_poll_sleep_interval = conf['cmdsrv_job_poll_sleep_interval']
    cmdsrv_max_concurrent_jobs = conf['cmdsrv_max_concurrent_jobs'] # subsequently set to conf['cmdsrv_max_rpi_jobs'] if is_rpi
    cmdsrv_lower_job_priority_flag = conf['cmdsrv_lower_job_priority_flag']
    cmdsrv_lower_job_priority_str = conf['cmdsrv_lower_job_priority_str']
    cmdsrv_pid_file = conf['cmdsrv_pid_file']
    cmdsrv_ready_file = conf['cmdsrv_ready_file']
    kiwix_catalog_file = conf['kiwix_catalog_file']
    doc_root = conf['doc_root']
    content_base = conf['content_base']
    zim_dir = conf['zim_dir']
    zim_content_dir = zim_dir + "content/"
    zim_index_dir = zim_dir + "index/"
    zim_downloads_dir = conf['zim_downloads_dir']
    zim_working_dir = conf['zim_working_dir']
    zim_download_prefix = conf['zim_download_prefix']
    oer2go_catalog_file = conf['oer2go_catalog_file']
    oer2go_mods_url = conf['oer2go_mods_url'] # this is not used; we use the url for each catalog item
    rachel_downloads_dir = conf['rachel_downloads_dir']
    rachel_working_dir = conf['rachel_working_dir']
    modules_dir = conf['modules_dir']
    maps_downloads_dir = conf['maps_downloads_dir']
    maps_working_dir = conf['maps_working_dir']
    maps_catalog_url  = conf['maps_catalog_url']
    maps_catalog_file  = conf['maps_catalog_file']
    #maps_catalog_url_v2  = conf['maps_catalog_url_v2']
    adm_maps_catalog_file  = conf['adm_maps_catalog_file']
    vector_map_path  = conf['vector_map_path']
    vector_map_tiles_path  = conf['vector_map_tiles_path']
    maps_tiles_base  = conf['maps_tiles_base']
    maps_sat_base  = conf['maps_sat_base']
    maps_download_src  = conf['maps_download_src']
    js_menu_dir = conf['js_menu_dir']
    squid_service = conf['squid_service']
    squid_whitelist = "/etc/%s/sites.whitelist.txt" % squid_service
    ansible_playbook_program = conf['ansible_playbook_program']
    ansible_program = conf['ansible_program']
    apache_user = conf['apache_user']
    df_program = conf['df_program']


def compute_vars():
    global adm_conf
    global osm_version
    # only support the older version of vector maps if is in local_vars
    # calculate osm version
    if 'osm_version' in local_vars:
        adm_conf['osm_version'] = local_vars['osm_version']
    #elif os.path.exists(vector_map_path + '/installer'):
    #    adm_conf['osm_version'] = 'V2'
    #elif os.path.exists(vector_map_path):
    #    adm_conf['osm_version'] = 'V1'
    else:
        adm_conf['osm_version'] = 'V2'
    osm_version = adm_conf['osm_version']
    return

def set_ready_flag(on_off):
    if on_off == "ON":
        try:
            ready_file = open( cmdsrv_ready_file, "w" )
            ready_file.write( "ready" )
            ready_file.write( "\n" )
            ready_file.close()
        except OSError as e:
            syslog.openlog( 'iiab_cmdsrv', 0, syslog.LOG_USER )
            syslog.syslog( syslog.LOG_ALERT, "Writing Ready file: %s [%d]" % (e.strerror, e.errno) )
            syslog.closelog()
            raise
    else:
        try:
            os.remove(cmdsrv_ready_file)
        except OSError as e:
            syslog.openlog( 'iiab_cmdsrv', 0, syslog.LOG_USER )
            syslog.syslog( syslog.LOG_ALERT, "Removing Ready file: %s [%d]" % (e.strerror, e.errno) )
            syslog.closelog()
            pass # log and keep going; we're just trying to shut down

def createDaemon(pidfilename):
    """Detach a process from the controlling terminal and run it in the
    background as a daemon.
    """
    pid = os.fork()
    if (pid == 0):   # The first child.
        pid = os.fork()
        if (pid == 0):   # The second child.
            # Since the current working directory may be a mounted filesystem,
            # we avoid the issue of not being able to unmount the filesystem at
            # shutdown time by changing it to the /opt directory where the cmdsrv is installed.
            os.chdir(cmdsrv_dir)
            #os.umask(config.UMASK)
        else:
            #  write out pid of child
            try:
                pidfile = open( pidfilename, "w" );
                pidfile.write( str( pid ) );
                pidfile.write( "\n" );
                pidfile.close();
            except OSError as e:
                syslog.openlog( 'iiab_cmdsrv', 0, syslog.LOG_USER )
                syslog.syslog( syslog.LOG_ALERT, "Writing PID file: %s [%d]" % (e.strerror, e.errno) )
                syslog.closelog()
                raise
            os._exit(0)  # Exit parent (the first child) of the second child.
    else:
        os._exit(0)# Exit parent of the first child.

    # Close all open file descriptors.
    # Use the getrlimit method to retrieve the maximum file descriptor
    # number that can be opened by this process.  If there is not limit
    # on the resource, use the default value.
    #
    import resource     # Resource usage information.
    maxfd = resource.getrlimit(resource.RLIMIT_NOFILE)[1]

    # This is a bug, but no idea what the value of MAXFD should be
    if (maxfd == resource.RLIM_INFINITY):
        maxfd = MAXFD

    # Iterate through and close all file descriptors.
    for fd in range(0, maxfd):
        try:
            os.close(fd)
        except OSError: # ERROR, fd wasn't open to begin with (ignored)
            pass

    # Redirect the standard I/O file descriptors to the specified file.  Since
    # the daemon has no controlling terminal, most daemons redirect stdin,
    # stdout, and stderr to /dev/null.  This is done to prevent side-effects
    # from reads and writes to the standard I/O file descriptors.

    # This call to open is guaranteed to return the lowest file descriptor,
    # which will be 0 (stdin), since it was closed above.
    os.open(os.devnull, os.O_RDWR)    # standard input (0)

    # Duplicate standard input to standard output and standard error.
    os.dup2(0, 1)# standard output (1)
    os.dup2(0, 2)# standard error (2)
    return(0)

# Now start the application

if __name__ == "__main__":

    # do the UNIX double-fork magic if --daemon passed as argument
    if len(sys.argv) > 1:
        if sys.argv[1] in ('--daemon'):
           retCode = createDaemon( cmdsrv_pid_file )
           #retCode = createDaemon( sys.argv[1] ) # pass pid file
           daemon_mode = True

    if len(sys.argv) == 1: # create pseudo pid file so php client can test for it
        try:
            pidfile = open( cmdsrv_pid_file, "w" );
            pidfile.write( str( 0 ) );
            pidfile.write( "\n" );
            pidfile.close();
        except OSError as e:
            syslog.openlog( 'iiab_cmdsrv', 0, syslog.LOG_USER )
            syslog.syslog( syslog.LOG_ALERT, "Writing PID file: %s [%d]" % (e.strerror, e.errno) )
            syslog.closelog()
            raise

    #syslog.openlog( 'iiab_cmdsrv', 0, syslog.LOG_USER )
    #log = syslog.syslog
    log(syslog.LOG_INFO, 'Starting Command Server')

    # Now run the main routine
    main()
