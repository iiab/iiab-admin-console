// admin_console.js
// copyright 2021 Tim Moody

var today = new Date();
var dayInMs = 1000*60*60*24;

var iiabContrDir = "/etc/iiab/";
var consoleJsonDir = "/common/assets/";
var iiabCmdService = "/iiab-cmd-service/cmd";
var iiabAuthService = "/iiab-cmd-service/auth";
var adminConfig = {}; // cmdsrv config values
var ansibleFacts = {};
var ansibleTagsStr = "";
var ansibleRolesStatus = {};
var effective_vars = {};
var config_vars = {}; // working variable, no long separate from local vars
var iiab_ini = {};
var allJobsStatus = {};
var jobStatusLastRowid = 1 // trigger refresh
var langCodes = {}; // iso code, local name and English name for all languages we support, read from file
var langCodesXRef = {}; // lookup langCodes key by iso2
var zimCatalog = {}; // working composite catalog of kiwix, installed, and wip zims
var zimLangs = {}; // working list of iso codes in zimCatalog
var zimGroups = {}; // zim ids grouped by language and category
var zimCategories = {}; // zim categories grouped by language and priority to allow ordering
var kiwixCatalog = {}; // catalog of kiwix zims, read from file downloaded from kiwix.org
var kiwixCatalogDate = new Date; // date of download, stored in json file
var installedZimCatalog = {}; // catalog of installed, and wip zims
var externalZimCatalog = {}; // catalog of zims on an external device
var oer2goCatalog = {}; // catalog of rachel/oer2go modules, read from file downloaded from rachel
var oer2goCatalogDate = new Date; // date of download, stored in json file
var oer2goCatalogFilter = ["html"] // only manage these types as OER2GO; catalog can contain zims and kalite that we do elsewhere
var mapCatalog = {}; // catalog by map id
var mapRegionIdx = {}; // index of catalog by region
var rachelStat = {}; // installed, enabled and whether content is installed and which is enabled

var zimsInstalled = []; // list of zims already installed
var zimsDownloading = []; // list of zims being downloaded
var zimsCopying = []; // list of zims being copied
var zimsExternal = []; // list of zims on external device
var oer2goInstalled = []; // list of Oer2go items already installed
var oer2goWip = {}; // list of copying, downloading, exporting
var oer2goDownloading = []; // list of Oer2go items being downloaded
var oer2goCopying = []; // list of Oer2go items being copied
var oer2goExternal = []; // list of Oer2go items on external device
var downloadedFiles = {};
var mapStat = {}; // source of most of the lists below
var vectorMapIdx = {} // save this and other stat though there is overlap
var mapDownloading = []; // list of Map items being downloaded
var mapWip = []; // list of copying, downloading, exporting
var mapInstalled = []; // list of map regions already installed
var externalDeviceContents = {}; // zims and other content on external devices, only one active at a time

var langNames = []; // iso code, local name and English name for languages for which we have zims sorted by English name for language
var topNames = ["ara","eng","spa","fra","hin","por"]; // languages for top language menu
var defaultLang = "eng";
var langGroups = {"en":"eng","fr":"fra","es":"spa"}; // language codes to treat as a single code
var selectedLangs = []; // languages selected by gui for display of content
var selectedZims = [];
var selectedOer2goItems = [];
var selectedMapItems = [];
var manContSelections = {};
var selectedUsb = null;
var removableDevices = {};

var sysStorage = {};
sysStorage.root = {};
sysStorage.library = {};
sysStorage.library.partition = false; // no separate library partition

// because jquery does not percolate .fail conditions in async chains
// and because an error returned from the server is not an ajax error
// flag must be set to false before use

// defaults for ip addr of server and other info returned from server-info.php
var serverInfo = {"iiab_server_ip":"","iiab_client_ip":"","iiab_server_found":"TRUE","iiab_cmdsrv_running":"FALSE"};
var authData = {};
authData['keepLogin'] = true; // don't allow closing of login form
var is_rpi = false;
var undef = undefined; // convenience variable
var initStat = {};
var cmdsrvWorkingModalCount = 0;

// MAIN ()

function main() {

// Set jquery ajax calls not to cache in browser
  $.ajaxSetup({ cache: false });
  //$.ajaxSetup({
  // type: 'POST',
  // headers: { "cache-control": "no-cache" }
  //});

// declare generic ajax error handler called by all .fail events
 //$( document ).ajaxError(ajaxErrhandler); 2020-05-18 took this out. Maybe was never needed?

// get default help
  getHelp("Overview.rst");

  //navButtonsEvents(); - now done after successful init

  initStat["active"] = false;
  initStat["error"] = false;
  initStat["alerted"] = {};

// Get Ansible facts and other data
  init();
}

// Set up nav

function navButtonsEvents() {
  $("ul.nav a").click(function (e) {
    e.preventDefault();
    $(this).tab('show');
    console.log($(this));
    if ($(this).is('[call-after]')) {
      //if ($this).attr('call-after') !== undefined) {
      console.log($(this).attr('call-after'));
      if ($(this).is('[call-after-arg]'))
      {
        console.log($(this).attr('call-after-arg'));
        window[$(this).attr('call-after')]($(this).attr('call-after-arg'));
      }
      else
        window[$(this).attr('call-after')]();
    }
    else
      console.log(' no call-after');
  });
  // Special Cases
  if (is_rpi){
    if (!config_vars.wifi_up_down){ //wifi_up_down is false or undefined
      $("#controlWifiUpDown").hide();
      $("#controlWifiNotUpDown").show();
    }
    $("#controlWifiLink").show();
    $("#controlBluetoothLink").show();
    $("#controlVPNLink").show();
  }
  var platform = ansibleFacts.ansible_machine;
  if (platform == "armv7l" || platform == "aarch64"){ // not on W
    $("#instConCloneLink").show();
  }
}

// BUTTONS

// Control Buttons

function controlButtonsEvents() {
	$('#ADMIN-CONSOLE-LOGIN').click(function(){
    cmdServerLoginSubmit();
  });

  $('#iiabAdminLoginForm').keydown(function(e) {
    var key = e.which;
    if (key == 13) {
    // As ASCII code for ENTER key is "13"
    $('#ADMIN-CONSOLE-LOGIN').click();
    }
  });

  $("#WIFI-CTL").click(function(){
    controlWifi();
  });

	$("#WIFI-CREDENTIALS").click(function(){
    setWpaCredentials();
  });
  $("#WIFI-CREDENTIALS-UD").click(function(){
    setWpaCredentials();
  });

	$("#BLUETOOTH-CTL").click(function(){
    controlBluetooth();
  });
	$("#VPN-CTL").click(function(){
    controlVpn();
  });

  $("#LOGOUT").click(function(){
    logOutUser();
  });

  $("#REBOOT").click(function(){
    rebootServer();
  });

  $("#POWEROFF").click(function(){
    poweroffServer();
  });
  console.log(' REBOOT and POWEROFF set');
}

  // Configuration Buttons

function configButtonsEvents() {
  $("#Bad-CMD").click(function(){
    sendCmdSrvCmd("XXX", testCmdHandler);
  });

  $("#Test-CMD").click(function(){
    //sendCmdSrvCmd("TEST ;", testCmdHandler);
    getJobStat();
  });

  $("#List-CMD").click(function(){
  	// iiab-cmdsrv-ctl LIST-LIBR '{"sub_dir":"downloads/zims"}'
    sendCmdSrvCmd("LIST", listCmdHandler);
  });

  $("#SET-CONF-CMD").click(function(){
    make_button_disabled("#SET-CONF-CMD", true);
    setConfigVars();
    make_button_disabled("#SET-CONF-CMD",false);
  });

  $("#SAVE-WHITELIST").click(function(){
    make_button_disabled("#SAVE-WHITELIST", true);
    setWhitelist();
    make_button_disabled("#SAVE-WHITELIST", false);
  });

  $("#RUN-ANSIBLE").click(function(){
    make_button_disabled("#RUN-ANSIBLE", true);
    runAnsible("ALL-TAGS");
    //runAnsible("addons");
    make_button_disabled("#RUN-ANSIBLE", false);
  });

  $("#RESET-NETWORK").click(function(){
    make_button_disabled("#RESET-NETWORK", true);
    resetNetwork();
    //runAnsible("addons");
    make_button_disabled("#RESET-NETWORK", false);
  });

  $("#RUN-TAGS").click(function(){
    make_button_disabled("#RUN-TAGS", true);
    var tagList = "";
    $('#ansibleTags input').each( function(){
      if (this.type == "checkbox") {
        if (this.checked)
        tagList += this.name + ',';
      }
    });
    if (tagList.length > 0)
    tagList = tagList.substring(0, tagList.length - 1);
    runAnsible(tagList);
    //runAnsible("addons");
    make_button_disabled("#RUN-TAGS", false);
  });

  $("#STOP").click(function(){
    sendCmdSrvCmd("STOP", genericCmdHandler);
  });
}

  // Install Content Buttons

function instContentButtonsEvents() {
  $("#selectLangButton").click(function(){
    getSelectedLangs();
    procSelectedLangs();
    $('#selectLangCodes').modal('hide');
    $('#ContentLanguages2').hide();
    procContentLangs(); // make top menu reflect selections
  });

  $("#selectLangButton2").click(function(){
    getSelectedLangs();
    procSelectedLangs();
    $('#selectLangCodes').modal('hide');
    $('#ContentLanguages2').hide();
    procContentLangs(); // make top menu reflect selections
  });

  $("#moreLangButton").click(function(){
    $('#ContentLanguages2').show();
  });

  $("#INST-CONTENT-PRESET").click(function(){
    var presetId = $("#instConPresets input[type='radio']:checked").val()
    installPreset(presetId);
    alert ("Selected Preset Installation Started.\n\nPlease view Utilities->Display Job Status to see the results.");
  });

  $("#INST-ZIMS").click(function(){
    var zim_id;
    make_button_disabled("#INST-ZIMS", true);
    selectedZims = []; // items no longer selected as are being installed
    $('#ZimDownload input').each( function(){
      if (this.type == "checkbox")
      if (this.checked){
        zim_id = this.name;
        if (zim_id in installedZimCatalog['INSTALLED'] || zim_id in installedZimCatalog['WIP'])
          consoleLog("Skipping installed Zim " + zim_id);
        else
          instZim(zim_id);
      }
    });
    procZimGroups();
    alert ("Selected Zims scheduled to be installed.\n\nPlease view Utilities->Display Job Status to see the results.");
    make_button_disabled("#INST-ZIMS", false);
  });

  $("#INST-MODS").click(function(){
    var mod_id;
    make_button_disabled("#INST-MODS", true);
    selectedOer2goItems = []; // items no longer selected as are being installed
    $('#Oer2goDownload input').each( function(){
      if (this.type == "checkbox")
        if (this.checked){
          mod_id = this.name;
          if (oer2goInstalled.indexOf(mod_id) >= 0 || mod_id in oer2goWip)
            consoleLog("Skipping installed Module " + mod_id);
          else
            instOer2goItem(mod_id);
        }
    });
    getOer2goStat();
    alert ("Selected OER2Go Items scheduled to be installed.\n\nPlease view Utilities->Display Job Status to see the results.");
    make_button_disabled("#INST-MODS", false);
  });

  consoleLog("adminConfig.osm_version " + adminConfig.osm_version);

  // Only support V2 of maps
  $("#INST-MAP").click(function(){
    consoleLog("in inst map click");

    if(adminConfig.osm_version == 'V1')
      alert('Your version of maps is no longer supported in Admin Console\n\nPlease either upgrade maps or downgrade Admin Console.');
    else
      instMaps()
  });

  $("#INST-SAT").click(function(){
    consoleLog("in inst sat click");

    if(adminConfig.osm_version == 'V1')
      alert('Your version of maps is no longer supported in Admin Console\n\nPlease either upgrade maps or downgrade Admin Console.');
    else
    instSatArea()
  });

  $("#launchKaliteButton").click(function(){
    var url = "http://" + window.location.host + ":8008";
    //consoleLog(url);
    window.open(url);
  });

  $("#REFRESH-CONTENT-DISPLAY").click(function(){
    refreshAllContentPanels();
  });

//  $("#ZIM-STATUS-REFRESH").click(function(){
//    refreshZimStat();
//  });

//  $("#RESTART-KIWIX").click(function(){
//   restartKiwix();
  //});

  $("#MAKE-KIWIX-LIB").click(function(){
    reindexKiwix();
  });

  $("#KIWIX-LIB-REFRESH").click(function(){
    getKiwixCatalog();
  });

  $("#OER2GO-CAT-REFRESH").click(function(){
    getOer2goCatalog();
  });

  $("#DOWNLOAD-RACHEL").click(function(){
  	if (rachelStat.content_installed == true){
  	  var rc = confirm("RACHEL content is already in the library.  Are you sure you want to download again?");
  	  if (rc != true)
  	    return;
  	}
    sendCmdSrvCmd("INST-RACHEL", genericCmdHandler, "DOWNLOAD-RACHEL");
    alert ("RACHEL scheduled to be downloaded and installed.\n\nPlease view Utilities->Display Job Status to see the results.");
  });

  $("#instManContExternal").click(function(){
  	consoleLog ("in instManContExternal click");
  	selectedUsb = $('#instManContExternal input:radio:checked').val();
    renderExternalList();
  });

  $("#REMOVE-CONTENT").click(function(){
  	var r = confirm("Press OK to Remove Checked Content");
    if (r != true)
      return;
  	make_button_disabled("#REMOVE-CONTENT", true);
    rmContent();
    make_button_disabled("#REMOVE-CONTENT", false);
  });

    $("#FIND-USB").click(function(){
    refreshExternalList();
  });

  $("#COPY-CONTENT").click(function(){
  	// assume that we can only get here if there are both internal and external devices
  	make_button_disabled("#COPY-CONTENT", true);
  	copyContent();
  	// clean up - empty arrays, sum, and redraw input
    alert ("Selected Content scheduled to be copied.\n\nPlease view Utilities->Display Job Status to see the results.");
    make_button_disabled("#COPY-CONTENT", false);
  });

  $("#REMOVE-USB").click(function(){
  	if (selectedUsb != null)
      removeUsb();
    else
    	alert ("No USB is attached.");
  });

  $("#FIND-REM-DEV").click(function(){
  	getIiabCloneStats();
  });

  $("#COPY-DEV-IMAGE").click(function(){
    // clone iiab server
    make_button_disabled("#COPY-DEV-IMAGE", true);
  	copyDevImage();
    make_button_disabled("#COPY-DEV-IMAGE", false);
  });

}

  // Content Menu Buttons

function contentMenuButtonsEvents() {
  $("#LOAD-CONTENT-MENU").click(function(){
    var currentJsMenuToEditUrl = $("#content_menu_url").val();
    getContentMenuToEdit(currentJsMenuToEditUrl);
    // why was this here twice?
    // var currentJsMenuToEditUrl = $("#content_menu_url").val();
    // getContentMenuToEdit(currentJsMenuToEditUrl);
  });
  $("#SAVE-CONTENT-MENU").click(function(){
    saveContentMenuDef();
  });
  $("#REFRESH-MENU-LISTS").click(function(){
    getMenuItemDefList();
  });
  $("#SYNC-MENU-ITEM-DEFS").click(function(){
    syncMenuItemDefs();
  });
  $("#UPDATE-HOME-MENU").click(function(){
    updateHomeMenu();
  });
  $("#CREATE-MENU-ITEM-DEF").click(function(){
    saveContentMenuItemDef();
  });
  $("#UPDATE-MENU-ITEM-DEF").click(function(){
    saveContentMenuItemDef();
  });
  $("#SELECT-MENU-ITEM-ICON").one("click", function(){
    selectMenuItemIcon();
  });
  //  doesn't work with nginx
  $("#UPLOAD-MENU-ITEM-ICON-SUBMIT").on("click", function(){
    uploadMenuItemIcon();
  });
  attachMenuItemDefNameCalc(); // attach events to fields
}

  // Util Buttons

function utilButtonsEvents() {
  $("#CHGPW").click(function(){
  	changePassword();
  });

  $("#JOB-STATUS-REFRESH").click(function(){
  	make_button_disabled("#JOB-STATUS-REFRESH", true);
    jobStatusLastRowid = 1 // trigger refresh
    getJobStat();
    make_button_disabled("#JOB-STATUS-REFRESH", false);
  });

  $("#JOB-STATUS-MORE").click(function(){
  	make_button_disabled("#JOB-STATUS-MORE", true);
    getJobStat();
    // make_button_disabled("#JOB-STATUS-MORE", false); // will turn on or off depending on data
  });

  $("#CANCEL-JOBS").click(function(){
  	var cmdList = [];
    make_button_disabled("#CANCEL-JOBS", true);
    $('#jobStatTable input').each( function(){
      if (this.type == "checkbox")
        if (this.checked){
          var job_idArr = this.id.split('-');
          job_id = job_idArr[0];

          // cancelJobFunc returns the function to call not the result as needed by array.push()
          cmdList.push(cancelJobFunc(job_id));
          if (allJobsStatus[job_id]["cmd_verb"] == "INST-ZIMS"){
          	var zim_id = allJobsStatus[job_id]["cmd_args"]["zim_id"];
          	//consoleLog (zim_id);
          	if (zim_id in installedZimCatalog['WIP']){
              delete installedZimCatalog['WIP'][zim_id];
              updateZimDiskSpaceUtil(zim_id, false)
              procZimGroups();
              //$( "input[name*='" + zim_id + "']" ).checked = false;
            }
          }
          this.checked = false;
        }
    });
    //consoleLog(cmdList);
    $.when.apply($, cmdList).then(getJobStat, procZimCatalog);
    alert ("Jobs marked for Cancellation.\n\nPlease click Refresh to see the results.");
    make_button_disabled("#CANCEL-JOBS", false);
  });

  $("#GET-INET-SPEED").click(function(){
    getInetSpeed();
  });

  $("#GET-INET-SPEED2").click(function(){
    getInetSpeed2();
  });
}

function configFieldsEvents() {

  // Static Wan Fields

  $("#gui_static_wan").change(function(){
    gui_static_wanVal();
  });

  $("#gui_static_wan_ip").on('blur', function(){
    staticIpVal("#gui_static_wan_ip");
  });

  $("#gui_static_wan_netmask").on('blur', function(){
    staticIpVal("#gui_static_wan_netmask");
  });

  $("#gui_static_wan_gateway").on('blur', function(){
    staticIpVal("#gui_static_wan_gateway");
  });

  $("#gui_static_wan_nameserver").on('blur', function(){
    staticIpVal("#gui_static_wan_nameserver");
  });
}

function make_button_disabled(id, grey_out) {
	// true means grey out the button and disable, false means the opposite
  if (grey_out){
  	$(id).prop('disabled', true);
    $(id).css({opacity:".5"});
  }
  else {
  	$(id).css({opacity:"1"});
    $(id).prop('disabled', false);
  }
}

// Field Validations

function iiab_hostnameVal()
{
  //alert ("in iiab_hostnameVal");
  var iiab_hostname = $("#iiab_hostname").val();
  consoleLog(iiab_hostname);
  if (iiab_hostname == ""){
    alert ("Host Name can not be blank.");
    $("#iiab_hostname").val(config_vars['iiab_hostname'])
    setTimeout(function () {
      $("#iiab_hostname").focus(); // hack for IE
    }, 100);
    return false;
  }
  // regex must match to be valid
  //var hostRegex = new RegExp("^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*))$");
  var hostRegex = /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*))$/;
  if (! hostRegex.test(iiab_hostname)) {
    alert ("Host Name can only have letters, numbers, and dashes and may not start with a dash.");
    //$("#iiab_hostname").val(config_vars['iiab_domain'])
    setTimeout(function () {
      $("#iiab_hostname").focus(); // hack for IE
    }, 100);
    return false
  }

  return true;
}

function iiab_domainVal()
{
  //alert ("in iiab_domainVal");
  var iiab_domain = $("#iiab_domain").val();
  consoleLog(iiab_domain);
  if (iiab_domain == ""){
    alert ("Domain Name can not be blank.");
    $("#iiab_domain").val(config_vars['iiab_domain'])
    setTimeout(function () {
      $("#iiab_domain").focus(); // hack for IE
    }, 100);
    return false;
  }
  // any regex match is invalid
  var domainRegex = /^[\.\-]|[\.\-]$|[^\.a-zA-Z0-9-]/;
  if (domainRegex.test(iiab_domain)) {
    alert ("Domain Name can only have letters, numbers, dashes, and dots and may not have a dot or dash at beginning or end.");
    //$("#iiab_domain").val(config_vars['iiab_domain'])
    setTimeout(function () {
      $("#iiab_domain").focus(); // hack for IE
    }, 100);
    return false
  }

  return true;
}
function gui_static_wanVal()
{
  // we come here if the checkbox was clicked
  // if it is now checked then it is newly so and we assign defaults

  // alert ("in gui_static_wanVal");

  if ($("#gui_static_wan").prop('checked')){
    staticIpDefaults ();
  }
}

function staticIpDefaults () {
	if(typeof ansibleFacts.ansible_default_ipv4.address === 'undefined'){
		$("#gui_static_wan_ip").val("127.0.0.1");
    $("#gui_static_wan_netmask").val("255.255.255.0");
    $("#gui_static_wan_gateway").val("127.0.0.1");
    $("#gui_static_wan_nameserver").val("127.0.0.1");
  }
  else {
    $("#gui_static_wan_ip").val(ansibleFacts.ansible_default_ipv4.address);
    $("#gui_static_wan_netmask").val(ansibleFacts.ansible_default_ipv4.netmask);
    $("#gui_static_wan_gateway").val(ansibleFacts.ansible_default_ipv4.gateway);
    $("#gui_static_wan_nameserver").val(ansibleFacts.ansible_default_ipv4.gateway);
  }
}

function staticIpVal(fieldId) {
    //Check Format
    var fieldVal = $(fieldId).val();
    var ip = fieldVal.split(".");
    var valid = true;

    if (ip.length != 4) {
        valid = false;
    }

    //Check Numbers
    for (var c = 0; c < 4; c++) {
        //Perform Test
        if ( ip[c] <= -1 || ip[c] > 255 ||
             isNaN(parseFloat(ip[c])) ||
             !isFinite(ip[c])  ||
             ip[c].indexOf(" ") !== -1 ) {

             valid = false;
        }
    }
    if (valid == false){
    	alert ("Invalid: Field must be N.N.N.N where N is a number between 0 and 255");
      setTimeout(function () {
        $(fieldId).focus(); // hack for IE
      }, 100);
      return false;
    }
    else
      return true;
}


// Common Functions

function activateTooltip() {
    $('[data-toggle="tooltip"]').tooltip({
      animation: true,
      delay: {show: 500, hide: 100}
    });
}

function nop(){
}

//var testCmdHandler = function (data, textStatus, jqXHR) is not necessary
var testCmdHandler = function (data)
//function testCmdHandler (data)
{
  //alert ("in Cmdhandler");
  consoleLog(data);
  return true;
};

function listCmdHandler (data)
{
  //alert ("in listCmdHandler");
  consoleLog(data);
  //consoleLog(jqXHR);
  return true;
}

function genericCmdHandler (data)
{
  //alert ("in genericCmdHandler");
  consoleLog(data);
  //consoleLog(jqXHR);
  return true;
}

function getAdminConfig (data)
{
  //alert ("in getAnsibleFacts");
  consoleLog(data);
  adminConfig = data;
  return true;
}

function getAnsibleFacts (data)
{
  //alert ("in getAnsibleFacts");
  consoleLog(data);
  ansibleFacts = data;
  var jstr = JSON.stringify(ansibleFacts, undefined, 2);
  var html = jstr.replace(/\n/g, "<br>").replace(/[ ]/g, "&nbsp;");
  $( "#ansibleFacts" ).html(html);
  // set convenience variable
  if (ansibleFacts.ansible_local.local_facts.rpi_model != 'none')
    is_rpi = true;
  else
    is_rpi = false;

  //consoleLog(jqXHR);
  return true;
}

function getAnsibleTags (data)
{
  //alert ("in getAnsibleTags");
  consoleLog(data);
  ansibleTagsStr = data['ansible_tags'];
  ansibleTagsArr = ansibleTagsStr.split(',');
  var html = '<table width="80%"><tr>';
  var j = 0;
  for (var i in ansibleTagsArr){
    html += '<td width="20%"><label><input type="checkbox" name="' + ansibleTagsArr[i] + '">' + ansibleTagsArr[i] + '</label></td>';
    if (j++ == 4){
      html += '</tr><tr>';
      j = 0;
    }
  }
  html += "</tr></table>";
  //consoleLog(html);
  //jstr = JSON.stringify(ansibleFacts, undefined, 2);
  //html = jstr.replace(/\n/g, "<br>").replace(/[ ]/g, "&nbsp;");
  $( "#ansibleTags" ).html(html);
  //consoleLog(jqXHR);
  return true;
}

// Control Menu Functions

function getSystemInfo(){
  var command = "GET-SYSTEM-INFO";
  return sendCmdSrvCmd(command, procSystemInfo);
}

function getNetworkInfo(){
  var command = "GET-NETWORK-INFO";
  return sendCmdSrvCmd(command, procNetworkInfo);
}

function procNetworkInfo(data){
	procSystemInfo(data);
}

function procSystemInfo(data){
  // This will only be called if we have an rpi
  // So device names are for now hard coded
  // We will revisit after ap0 is merged and ubuntu 20.04 released

  var systemInfo = data;
  Object.keys(systemInfo).forEach(function(key) {
  	serverInfo[key] = systemInfo[key];
  });
  // hostapd
  $("#hotspotStateUD").html(serverInfo.hostapd_status);
  $("#hotspotState").html(serverInfo.hostapd_status);
  //$("#WIFI-CTL").html('Turn Hotspot Access ON');
  // make_button_disabled('#WIFI-CTL', true); // disable

  if (serverInfo.hostapd_status == 'ON'){
    $("#WIFI-CTL").html('Switch Wifi to Connect to Router');
    make_button_disabled('#WIFI-CTL', false); // enable
  }
  else if (serverInfo.hostapd_status == 'OFF'){
  	$("#WIFI-CTL").html('Switch Wifi to IIAB Hotspot');
    make_button_disabled('#WIFI-CTL', false); // enable
  }

  var html = "";
  html += '<div class="col-sm-4">';
  html += '<div>Bluetooth Status</div>';
  html += '<div>Support VPN Status</div>';
  html += '<div>Wired IP Address</div>';
  html += '<div>Wireless IP Address</div>';
  html += '<div>Internet Access</div>';
  html += '<div>Gateway Address</div>';
  html += '<div>Gateway Device</div>';
  html += '<div>User pi Password is Published</div>';
  html += '<div>User iiab-admin Password is Published</div>';
  html += '</div>';
  html += '<div class="col-sm-4">';
  html += '<div>' + serverInfo.bt_pan_status + '</div>';
  html += '<div>' + serverInfo.openvpn_status + '</div>';
  if (serverInfo.hasOwnProperty('eth0'))
    html += '<div>' + serverInfo.eth0.addr + '</div>';
  else
    html+= '<div>null </div>';
  html += '<div>' + serverInfo.wlan0.addr + '</div>';
  html += '<div>' + serverInfo.internet_access + '</div>';
  html += '<div>' + serverInfo.gateway_addr + '</div>';
  html += '<div>' + serverInfo.gateway_dev + '</div>';
  html += '<div>' + serverInfo.pi_passwd_known + '</div>';
  html += '<div>' + serverInfo.admin_passwd_known + '</div>';
  html += '</div>';

  $("#currentNetworkStateUD").html(html);
  $("#currentNetworkState").html(html);

  // bluetooth
  $("#bluetoothState").html(serverInfo.bt_pan_status);
  $("#BLUETOOTH-CTL").html('Turn Bluetooth Access ON');
  make_button_disabled('#BLUETOOTH-CTL', true); // disable

  if (serverInfo.bt_pan_status == 'ON'){
    $("#BLUETOOTH-CTL").html('Turn Bluetooth Access OFF');
    make_button_disabled('#BLUETOOTH-CTL', false); // enable
  }
  else if (serverInfo.bt_pan_status == 'OFF'){
  	$("#BLUETOOTH-CTL").html('Turn Bluetooth Access ON');
    make_button_disabled('#BLUETOOTH-CTL', false); // enable
  }

  // openvpn
  $("#supportVpnState").html(serverInfo.openvpn_status);
  gEBI('support_vpn_handle').value = serverInfo.openvpn_handle;
  $("#VPN-CTL").html('Turn Support VPN ON');
  make_button_disabled('#VPN-CTL', true); // disable
  $("#support_vpn_handle").prop('disabled', true);
  if (serverInfo.openvpn_status == 'ON'){
    $("#support_vpn_handle").prop('disabled', false)
    $("#VPN-CTL").html('Turn Support VPN OFF');
    make_button_disabled('#VPN-CTL', false); // enable
  }
  else if (serverInfo.openvpn_status == 'OFF'){
  	$("#support_vpn_handle").prop('disabled', false)
  	$("#VPN-CTL").html('Turn Support VPN ON');
    make_button_disabled('#VPN-CTL', false); // enable
  }
}

function controlWifi(){
  var cmd_args = {};

  if (serverInfo.hostapd_status == 'ON')
    cmd_args['hotspot_on_off'] = 'off';
  if (serverInfo.hostapd_status == 'OFF')
    cmd_args['hotspot_on_off'] = 'on';
  cmd_args['make_permanent'] = 'False';

  var command = "CTL-WIFI " + JSON.stringify(cmd_args);
  return sendCmdSrvCmd(command, getSystemInfo);
}

function setWpaCredentials(){
  var cmd_args = {};

  if (config_vars.wifi_up_down){
    cmd_args['connect_wifi_ssid'] = gEBI('connect_wifi_ssid_UD').value;
    cmd_args['connect_wifi_password'] = gEBI('connect_wifi_password_UD').value;
  } else {
    cmd_args['connect_wifi_ssid'] = gEBI('connect_wifi_ssid').value;
    cmd_args['connect_wifi_password'] = gEBI('connect_wifi_password').value;
  }
  var len = cmd_args['connect_wifi_password'].length

  if (len != 0 && (len < 8 || len > 63)){
  	alert ("Hotspot passphrase must be between 8 and 63 characters.");
  	return;
  }

  var command = "SET-WPA-CREDENTIALS " + JSON.stringify(cmd_args);
  return sendCmdSrvCmd(command, genericCmdHandler);
}

function controlBluetooth(){
  var cmd_args = {};

  if (serverInfo.bt_pan_status == 'ON')
    cmd_args['bluetooth_on_off'] = 'off';
  if (serverInfo.bt_pan_status == 'OFF')
    cmd_args['bluetooth_on_off'] = 'on';
  cmd_args['make_permanent'] = 'False';

  var command = "CTL-BLUETOOTH " + JSON.stringify(cmd_args);
  return sendCmdSrvCmd(command, getSystemInfo);
}

function controlVpn(){
  var cmd_args = {};

  if (serverInfo.openvpn_status == 'ON')
    cmd_args['vpn_on_off'] = 'off';
  if (serverInfo.openvpn_status == 'OFF')
    cmd_args['vpn_on_off'] = 'on';
  serverInfo.openvpn_handle = gEBI('support_vpn_handle').value;
  cmd_args['vpn_handle'] = serverInfo.openvpn_handle;
  cmd_args['make_permanent'] = 'False';

  var command = "CTL-VPN " + JSON.stringify(cmd_args);
  return sendCmdSrvCmd(command, getSystemInfo);
}

// Configure Menu Functions

function getInstallVars (data)
{
  //alert ("in getInstallVars");
  consoleLog(data);
  effective_vars = data;
  config_vars = effective_vars;
  //consoleLog(jqXHR);
  return true;
}
// NOT USED
// retain for rewrite of loading vars including iiab_state
function getConfigVars (data)
{
  //alert ("in getConfigVars");
  consoleLog(data);
  config_vars = data;
  return true;
}

function assignConfigVars (data)
{
  // If config_vars has a value use it
  // Otherwise if effective_vars has a value use it
  $('#Configure input').each( function(){
    if (config_vars.hasOwnProperty(this.name)){
      var prop_val = config_vars[this.name];
      //consoleLog(this.name + "using config_vars");
    }
    else if (effective_vars.hasOwnProperty(this.name)){
      prop_val = effective_vars[this.name];
      config_vars[this.name] = effective_vars[this.name];
      //consoleLog(this.name + "using effective_vars");
    }
    else{
      if (this.type == "checkbox")
      prop_val = false;
      if (this.type == "text")
      prop_val = "";
      if (this.type == "radio")
      prop_val = "";
    }
    if (this.type == "checkbox"){
      $(this).prop('checked', config_vars[this.name]);
      var service = this.name.split("_enabled")[0];
      var service_install = service + "_install";
      var service_id = "." + service + "_service";
      if (effective_vars.hasOwnProperty(service_install)){
      	if (effective_vars[service_install])
      	  $(service_id).show();
      	else
      	  $(service_id).hide();
      }
      else
      	  $(service_id).hide();
    }
    if (this.type == "text")
    this.value = config_vars[this.name];
    if (this.type == "radio"){
      // this will get called once for each button, but should only check one of the set
      setRadioButton(this.name, config_vars[this.name]);
    }
    //console.log($(this).val());
    //consoleLog(this.name);
  });

  //config_vars = data;
  //consoleLog(jqXHR);
  //initConfigVars()
  return true;
}

function setRadioButton(name, value){
  // id must follow the convention name-value
  var field_id = "#" + name + "-" + value;
  //consoleLog(field_id);
  $(field_id).prop('checked', true);
}

function initConfigVars()
{
  if ($.isEmptyObject(ansibleFacts)
      || $.isEmptyObject(iiab_ini)
      || $.isEmptyObject(effective_vars)
      // || $.isEmptyObject(config_vars) is empty the first time
      ){
      consoleLog("initConfigVars found empty data");
      consoleLog(ansibleFacts);
      consoleLog(iiab_ini);
      consoleLog(effective_vars);
      displayServerCommandStatus ("initConfigVars found empty data")
      return;
    }
  // handle exception where gui name distinct and no data
  // home page - / added when used in ansible
  if (! config_vars.hasOwnProperty('gui_desired_home_url')){
  	config_vars['gui_desired_home_url'] = "home";
  	//consoleLog("home url is " + config_vars['gui_desired_home_url']);
  }
  assignConfigVars();
  var html = "Gateway: ";
  if(typeof ansibleFacts.ansible_default_ipv4.address === 'undefined'){
    html += "Not Found<BR>";
    $("#gui_static_wan").prop('checked', false);
  }
  else {
    html += "Found<BR>";
    html += "WAN: " + ansibleFacts.ansible_default_ipv4.address + " on " + ansibleFacts.ansible_default_ipv4.alias + "<BR>";
  }
  //consoleLog(config_vars);
  // handle variable name change in iiab
  var gui_desired_network_role = "Gateway";

  if (iiab_ini.hasOwnProperty('computed_network')){
    gui_desired_network_role = iiab_ini.computed_network.iiab_network_mode;
    html += "LAN: on " + iiab_ini.computed_network.iiab_lan_iface + "<BR>";
    html += "Network Mode: " + iiab_ini.computed_network.iiab_network_mode + "<BR>";
  }
  else if (iiab_ini.hasOwnProperty('network')){
    gui_desired_network_role = iiab_ini.network.iiab_network_mode;
    html += "LAN: on " + iiab_ini.network.computed_lan  + "<BR>";
    html += "Network Mode: " + iiab_ini.network.iiab_network_mode + "<BR>";
  }
  $("#discoveredNetwork").html(html);
  if (typeof config_vars.gui_desired_network_role === "undefined")
    setRadioButton("gui_desired_network_role", gui_desired_network_role)
  initStaticWanVars();
}

function initStaticWanVars() {
	// if use static wan is checked they are assumed to be valid
	if ($("#gui_static_wan").prop('checked') == false){
    staticIpDefaults ();
  }
}

function setConfigVars () {
  //alert ("in setConfigVars");
  var cmd_args = {};
  var changed_vars = {} // now we only send deltas to back end
  var thisVar = '';
  $('#Configure input').each( function(){
    if ($('#'+ this.name).is(":visible")){ // install false and undefined are not visible
      if (this.type == "checkbox") {
        if (this.checked)
          thisVar = true; // must be true not True
        else
          thisVar = false;
      }

      if (this.type == "text")
        thisVar = $(this).val();

      if (this.type == "radio"){
          fieldName = this.name;
          fieldName = "input[name=" + this.name + "]:checked"
          //consoleLog(fieldName);
          thisVar = $(fieldName).val();
      }
      if (thisVar != config_vars[this.name]){
        config_vars[this.name] = thisVar;
        changed_vars[this.name] = thisVar;
      }
    }
  });
  cmd_args['config_vars'] = changed_vars;
  var cmd = "SET-CONF " + JSON.stringify(cmd_args);
  sendCmdSrvCmd(cmd, genericCmdHandler);
  alert ("Saving Configuration.");
  return true;
}

function getServerPublicKey(){
  $.get( iiabAuthService + '/get_pubkey', function( data ) {
    authData['serverPKey'] = nacl.util.decodeBase64(data);
    //consoleLog(data, typeof data);
  })
  .fail(getServerPublicKeyError);
  return true;
}

function getServerPublicKeyError (jqXHR, textStatus, errorThrown){
  jsonErrhandler (jqXHR, textStatus, errorThrown); //check for json errors
  authData['serverPKey'] = '';
  consoleLog("Connection to Uwsgi Server failed.");
  displayServerCommandStatus('Connection to Uwsgi Server <span style="color:red">FAILED</span>.');
  alert ("Connection to Uwsgi Server failed.\n Please make sure your network settings are correct,\n that the server is turned on,\n and that the web server is running.");
  init();
}

async function getServerNonceAsync(){
  try{
    let response = await fetch(iiabAuthService + '/get_nonce');
    return await response.text(); // should be base64
  }catch(err){
    console.error(err);
    // Handle errors here
  }
}

function launchcmdServerLoginForm(loginMsg){
  authData.keepLogin = true; // prevent closing of form until logged in
  $('#adminConsoleLoginModal').on('hide.bs.modal', onHideLoginModalEvent);
  $('#adminConsoleLoginError').html(loginMsg);
  $('#adminConsoleLoginModal').modal('show');
}

function onHideLoginModalEvent(e){
  //consoleLog(authData.keepLogin)
  if (authData.keepLogin == true) // uglier than I would prefer
    e.preventDefault();
}

function cmdServerLoginSubmit(){
  var credentials = $('#iiabAdminUserName').val() + ':' + $('#iiabAdminUserPassword').val();
  //$('#adminConsoleLoginModal').modal('hide');
  authData['credentials'] = credentials;
  cmdServerLogin(credentials);
}

async function cmdServerLogin(credentials){
  //credentials = "iiab-admin:g0adm1n";
  // ? kill token

  var nonce64 = await getServerNonceAsync();
  consoleLog(nonce64)
  var encryptedCredentials64 = naclEncryptText(credentials, nonce64);
  $.ajax({
    type: 'GET',
    cache: false,
    global: false, // don't trigger global error handler
    url: iiabAuthService + '/login',
    headers: {"X-IIAB-Credentials": encryptedCredentials64,
              "X-IIAB-Nonce": nonce64,
              "X-IIAB-ClientKey": authData.clientPubKey64}
    //dataType: 'json'
  })
  .done(function( data ) {
    consoleLog(data);
    authData['token'] = data;
    authData.keepLogin = false; // now allow form to close
    $('#adminConsoleLoginModal').modal('hide');
    make_button_disabled("#LOGOUT", false);
    if (!initStat.complete)
      initPostLogin();

  }).fail(function(data, textStatus, xhr) {
    $('#adminConsoleLoginError').html('Invalid Login');
    //This shows status code eg. 403
    console.log("error", data.status);
    //This shows status message eg. Forbidden
    console.log("STATUS: " + xhr);
  });
}

function naclEncryptText(text, nonce64){ // nacl
  //var clientKeyPair = nacl.box.keyPair();
  var message = nacl.util.decodeUTF8(text);
  var nonce = nacl.util.decodeBase64(nonce64);
  //var serverPKey = nacl.util.decodeUTF8(authData.serverPKey);
  var box = nacl.box(message, nonce, authData.serverPKey, authData.clientKeyPair.secretKey);
  var encrypted64 = nacl.util.encodeBase64(box);
  //var cmd_args = {}
  //cmd_args['encrypted64'] = encrypted64;
  //cmd_args['client_public_key64'] = nacl.util.encodeBase64(clientKeyPair.publicKey);
  //cmd_args['nonce64'] = nacl.util.encodeBase64(nonce);
  //consoleLog(cmd_args['client_public_key64'])
  //var cmd = "AUTH-AUTHORIZE " + JSON.stringify(cmd_args);
  return encrypted64;
}

function changePassword ()
{
	if ($("#iiab_admin_new_password").val() != $("#iiab_admin_new_password2").val()){
    	alert ("Invalid: New Password and Repeat New Password do NOT Match.");
      setTimeout(function () {
        $("#iiab_admin_new_password").focus(); // hack for IE
      }, 100);
      return false;
    }

  var cmd_args = {}
  cmd_args['user'] = $("#iiab_admin_user").val();
  cmd_args['oldpasswd'] = $("#iiab_admin_old_password").val();
  cmd_args['newpasswd'] = $("#iiab_admin_new_password").val();

  var cmd = "CHGPW " + JSON.stringify(cmd_args);
  sendCmdSrvCmd(cmd, changePasswordSuccess, "CHGPW", undef, undef, encryptFlag = true);
  //alert ("Changing Password.");
  return true;
}

function changePasswordSuccess ()
{
  $("#iiab_admin_new_password").val('');
  $("#iiab_admin_new_password2").val('');
  alert ("Password Changed. Please Sign in again.");
  logOutUser();
  return true;
}
  function getXsceIni ()
  {
    //alert ("in getXsceIni");
    sendCmdSrvCmd("GET-IIAB-INI", procXsceIni);
    return true;
  }

  function procXsceIni (data)
  {
    //alert ("in procXsceIni");
    consoleLog(data);
    iiab_ini = data;
    var jstr = JSON.stringify(iiab_ini, undefined, 2);
    var html = jstr.replace(/\n/g, "<br>").replace(/[ ]/g, "&nbsp;");
    $( "#iiabIni" ).html(html);
    //consoleLog(jqXHR);

    return true;
  }

function getRolesStat () {
    //alert ("in getRolesStat");
    sendCmdSrvCmd("GET-ROLES-STAT", procRolesStat);
    return true;
 }

function procRolesStat(data) {
  ansibleRolesStatus = data;
}

/* this works, but is limited in parameter passing
function getRolesStat(data) { // try php style function
  //alert ("in getRolesStat");
  if (typeof(data) === 'undefined') {
    sendCmdSrvCmd("GET-ROLES-STAT", getRolesStat);
  } else {
    ansibleRolesStatus = data;
  }
}
*/



  function getWhitelist (data)  {
    sendCmdSrvCmd("GET-WHLIST", procWhitelist);
  }

  function procWhitelist (data)  {
    //alert ("in getWhitelist");
    //consoleLog(data);
    var whlist_array = data['iiab_whitelist'];
    var whlist_str = whlist_array[0];
    for (var i = 1; i < whlist_array.length; i++) {
      whlist_str += '\n' + whlist_array[i];
    }
    //$('#iiab_whitelist').val(data['iiab_whitelist']);
    $('#iiab_whitelist').val(whlist_str);
    return true;
  }

  function setWhitelist ()
  {
    //consoleLog ("in setWhitelist");
    var whlist_ret = {}
    var whlist_array = $('#iiab_whitelist').val().split('\n');
    whlist_ret['iiab_whitelist'] = whlist_array;
    var cmd = "SET-WHLIST " + JSON.stringify(whlist_ret);
    //consoleLog(cmd);
    sendCmdSrvCmd(cmd, genericCmdHandler);
    alert ("Saving Permitted URLs List.");
    return true;
  }

  function runAnsible (tags)
  {
    var command = formCommand("RUN-ANSIBLE", "tags", tags);
    //alert ("in runAnsible");
    consoleLog(command);
    sendCmdSrvCmd(command, genericCmdHandler);
    alert ("Scheduling Ansible Run.");
    return true;
  }

  function resetNetwork ()
  {
    var command = "RESET-NETWORK";
    //alert ("in resetNetwork");
    consoleLog(command);
    sendCmdSrvCmd(command, genericCmdHandler);
    alert ("Scheduling Network Reset.");
    return true;
  }

// Utility Menu Functions

function getJobStat()
{
  var command = "GET-JOB-STAT"
  var cmd_args = {};

  cmd_args['last_rowid'] = jobStatusLastRowid;
  cmd = command + " " + JSON.stringify(cmd_args);
  sendCmdSrvCmd(cmd, procJobStat);
  return true;
}

function procJobStat(data)
{
  allJobsStatus = {};
  jobStatusLastRowid = 1

  var html = "";
  var html_break = '<br>';

  data.forEach(function(statusJob) {
    //console.log(statusJob);
    html += "<tr>";
    //var job_info = {};

    //job_info['job_no'] = entry[0];
    html += "<td>";
    html += '<input type="checkbox" id="' + statusJob.job_id + '">';
    html += '<span style="vertical-align: text-bottom;">&nbsp;&nbsp;' + statusJob.job_id + '</span>';
    html += "</td>";
    html += '<td style="overflow: hidden; text-overflow: ellipsis">' + statusJob.job_command + "</td>";

    var result = statusJob.job_output.replace(/(?:\r\n|\r|\n)/g, html_break); // change newline to BR
    // result = result.replace(html_break+html_break, html_break); // remove blank lines, but doesn't work
    var idx = result.indexOf(html_break);
    if (idx == 0) result = result.substring(html_break.length); // strip off first newline
    idx = result.lastIndexOf(html_break);
    if (idx >= 0) result = result.substring(0,idx); // strip off last newline
    //job_info['result'] = result;

    idx = result.lastIndexOf(html_break);  // find 2nd to last newline
    var result_end = "";
    if (idx >= 0) result_end = result.substring(0,idx + html_break.length);
    html += '<td> <div class = "statusJobResult">' + result + "</div></td>";

    html += "<td>" + statusJob.job_status + "</td>";

    var elapsedStr = secondsToDuration(statusJob.elapsed_sec);
    html += "<td>" + statusJob.create_datetime + '<BR>' + elapsedStr + "</td>";

    html += "</tr>";

    // To Do
    // insert cmd and cmd_args into commands when job created
    // changes schema

    // there should be one or two parts - ? still need this; for cancel
    // manual commands through iiab-cmdsrv-cti can introduce extra spaces and break this
    // breaks on install kalite

    //var cmd_parse = statusJob.cmd_msg.split(" ");
    //statusJob['cmd_verb'] = cmd_parse[0];
    //if(cmd_parse.length == 0 || typeof cmd_parse[1] === 'undefined')
    //  statusJob['cmd_args'] = ""
    //else
    //  statusJob['cmd_args'] = JSON.parse(cmd_parse[1]);

    consoleLog(statusJob);
    allJobsStatus[statusJob.job_id] = statusJob;
    jobStatusLastRowid = statusJob.job_id // save lowest rowid seen

  });
  $( "#jobStatTable tbody" ).html(html);
  $( "#jobStatTable div.statusJobResult" ).each(function( index ) {
    $(this).scrollTop(this.scrollHeight);
  });
  today = new Date();
  $( "#statusJobsRefreshTime" ).html("Last Refreshed: <b>" + today.toLocaleString() + "</b>");
  if (jobStatusLastRowid == 1)
    make_button_disabled("#JOB-STATUS-MORE", true);
  else
    make_button_disabled("#JOB-STATUS-MORE", false);

}

function cancelJob(job_id)
{
  var command = "CANCEL-JOB"
  var cmd_args = {}
  cmd_args['job_id'] = job_id;
  cmd = command + " " + JSON.stringify(cmd_args);
  $.when(sendCmdSrvCmd(cmd, genericCmdHandler)).then(getJobStat);
  return true;
}

function cancelJobFunc(job_id)
{
  var command = "CANCEL-JOB"
  var cmd_args = {}
  cmd_args['job_id'] = job_id;
  cmd = command + " " + JSON.stringify(cmd_args);
  return $.Deferred( function () {
  	var self = this;
  	sendCmdSrvCmd(cmd, genericCmdHandler);
  	});
}

function getSysMem()
{
  var command = "GET-MEM-INFO"
  sendCmdSrvCmd(command, procSysMem);
  return true;
}

function procSysMem(data)
{
  //alert ("in procSysMem");
  consoleLog(data);
  var sysMemory = data['system_memory'];
  var html = "";
  for (var i in sysMemory)
  html += sysMemory[i] + "<BR>"

  $( "#sysMemory" ).html(html);
  //consoleLog(jqXHR);
  return true;
}

function refreshDiskSpace(){

  //$.when(sendCmdSrvCmd("GET-STORAGE-INFO", procSysStorageDat),sendCmdSrvCmd("GET-ZIM-STAT", procZimStatInit)).then(procDiskSpace);
  $.when(getSpaceAvail(), getZimStat()).then(displaySpaceAvail);
}

function procDiskSpace(){
  //procSelectedLangs(); - don't call because resets check boxes
  //sumCheckedZimDiskSpace();
  displaySpaceAvail();
}

function getSysStorage()
{
  var command = "GET-STORAGE-INFO"
  sendCmdSrvCmd(command, procSysStorageLite);
  return true;
}

function procSysStorageLite(data)
{
  //alert ("in procSysStorage");

  consoleLog(data);
  var sysStorageRpt = data['system_fs'];
  var html = "";
  for (var i in sysStorageRpt)
    html += sysStorageRpt[i] + "<BR>"

  $( "#sysStorage" ).html(html);
  //consoleLog(jqXHR);
  return true;
}

// need to rewrite the function below for lvm, etc.
// 6/28/2018 is not being used
function procSysStorage()
{
  //alert ("in procSysStorage");

  consoleLog(data);
  sysStorage.raw = data;

  var html = "";
  for (var i in sysStorage.raw) {
    var dev = sysStorage.raw[i];
    html += "<b>" + dev.device + "</b>";
    html += " " + dev.desc;
    html += " " + dev.type;
    html += " " + dev.size;
    html += ":<BR><BR>";

    for (var j in sysStorage.raw[i].blocks){
      var block = dev.blocks[j];
      html += block.part_dev;
      if (block.part_dev == 'unallocated')
      html += " " + block.size;
      else {
        html += " " + block.type;
        html += " " + block.size;
        if (block.part_prop.TYPE != "\"swap\""){
          html += " (" + block.part_prop.avail_in_megs + "M avail)";
          html += " " + block.part_prop.mount_point;
          if (block.part_prop.mount_point == "/"){
            sysStorage.root.part_dev = block.part_dev;
            sysStorage.root.avail_in_megs = block.part_prop.avail_in_megs;
          }
          if (block.part_prop.mount_point == "/library"){
            sysStorage.library.part_dev = block.part_dev;
            sysStorage.library.avail_in_megs = block.part_prop.avail_in_megs;
            sysStorage.library.partition = true;
          }
        }
      }
      html += "<BR>";
    }
    html += "<BR>";
  }
  $( "#sysStorage" ).html(html);

  //consoleLog(jqXHR);
  return true;
}

function getSpaceAvail (){
  return sendCmdSrvCmd("GET-SPACE-AVAIL", procSpaceAvail);
}

function procSpaceAvail (data){
  sysStorage.library_on_root = data.library_on_root; // separate library partition (T/F)
  sysStorage.root = data.root;
  sysStorage.imageSizeInK = data.root.size_in_k - data.root.avail_in_k + 262144;
	if (! sysStorage.library_on_root){
    sysStorage.library = data.library;
    sysStorage.imageSizeInK += data.library.size_in_k - data.library.avail_in_k;
  }
  $("#cloneImageSize").html(readableSize(sysStorage.imageSizeInK));
}

function displaySpaceAvail(){
	// display space available on various panels
	// assumes all data has been retrieved and is in data structures

	var availableSpace = 0;
	var usedSpace = 0;
	var internalContentSelected = 0;
  var internalSpace = calcLibraryDiskSpace();
  var html = '';
	availableSpace = internalSpace.availableSpace;
	usedSpace = internalSpace.usedSpace;

	var allocatedSpace = calcAllocatedSpace();
	var warningStyle = '';

	if (allocatedSpace / availableSpace > .5)
	  warningStyle = 'style="color: darkorange;"';
	if (allocatedSpace / availableSpace > .85)
	  warningStyle = 'style="color: red;"';

  if (window.innerWidth > 1400) // make this responsive
    html = "Library Space Available : <b>";
  else
    html = "Space Available : <b>";
  html += readableSize(availableSpace) + "</b><BR>";

  $( "#dnldDiskSpace" ).html(html);

  if (window.innerWidth > 1400) // make this responsive
    html += "Estimated Space Required: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;";
  else
    html += "Space Required: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;";
  html += '<b><span ' + warningStyle + '>' + readableSize(allocatedSpace) + '</span</b>';

  $( "#zimDiskSpace" ).html(html);
  $( "#oer2goDiskSpace" ).html(html);
  $( "#mapDiskSpace" ).html(html);
  $( "#mapDiskSpace2" ).html(html);

  // calc internalContentSelected

  manContInternalStat(usedSpace, availableSpace, manContSelections.internal.sum);
  var html = "";

  if (calcExtUsb()){
  	$.each(Object.keys(externalDeviceContents).sort(), function(index, dev) {
  		html += manContUsbStat(dev)
      });
    }
    $("#instManContExternal").html(html);
}

function manContInternalStat(usedSpace, availableSpace, internalContentSelected){
	var html = "";
  html += '<tr>';
  html += "<td></td>";
  html += "<td>Internal</td>";
  html += '<td style="text-align:right">' + readableSize(usedSpace) + "</td>";
  html += '<td style="text-align:right">' + readableSize(availableSpace) + "</td>";
  html += '<td style="text-align:right">' + readableSize(internalContentSelected) + "</td>";
  html +=  '</tr>';
  $("#instManContInternal").html(html);
}

function manContUsbStat(dev){
	var html = "";
	var usedSpace = externalDeviceContents[dev].dev_size_k - externalDeviceContents[dev].dev_sp_avail_k;
	var checked = (dev == selectedUsb) ? "checked" : "";

  html += '<tr>';
  html += '<td><input type="radio" name="usbList" value="' + dev + '"' + checked + '></td>';
  html += "<td>" + dev + "</td>";
  html += '<td style="text-align:right">' + readableSize(usedSpace) + "</td>";
  html += '<td style="text-align:right">' + readableSize(externalDeviceContents[dev].dev_sp_avail_k) + "</td>";
  html += '<td style="text-align:right">' + readableSize(manContSelections[dev].sum) + "</td>";
  html +=  '</tr>';
  return(html);
}

function calcAllocatedSpace(){
	var totalSpace = 0;
	totalSpace += sumAllocationList(selectedZims, 'zim');
	//consoleLog(totalSpace);
	totalSpace += sumZimWip();
	totalSpace += sumAllocationList(selectedOer2goItems, 'oer2go');
	totalSpace += sumOer2goWip();
	totalSpace += sumAllocationList(selectedMapItems, 'map');
	// totalSpace += sumMapWip(); selectedMapItems also holds wip as they are still selected
	return totalSpace;
}

function sumAllocationList(list, type){
  var totalSpace = 0;

  for (var i in list){
    var id = list[i]
    if (type == "zim"){
      totalSpace += parseInt(zimCatalog[id].size);
      if (zimCatalog[id].source == "portable")
        totalSpace += parseInt(zimCatalog[id].size); // double it for portable
      }
    else if (type == "oer2go")
      totalSpace += parseInt(oer2goCatalog[id].ksize);
    else if (type == "map")
      totalSpace += parseInt(mapCatalog[id].size / 1024);

  }
  // sysStorage.oer2go_selected_size = totalSpace;
  return totalSpace;
}

function sumZimWip(){
  var totalSpace = 0;

  for (var zimId in installedZimCatalog["WIP"]){
  	var zim = lookupZim(zimId);
  	totalSpace += parseInt(zim.size);
  	if (zim.source == "portable")
  	  totalSpace += parseInt(zim.size); //add twice to account for zip download
  }
  return totalSpace;
}

function sumOer2goWip(){
  var totalSpace = 0;

  for (var moddir in oer2goWip){
  	totalSpace += parseInt(oer2goCatalog[moddir].ksize);
  }
  return totalSpace;
}

function sumMapWipV1(){ // save for now
  var totalSpace = 0;

  for (var idx in mapWip){
   var url =  mapWip[idx];
   var region = get_region_from_url(url);
  	totalSpace += parseInt(mapCatalog[region].osm_size) + parseInt(mapCatalog[region].sat_size);
  }
  return totalSpace/1024;
}

function sumMapWip(){
  var totalSpace = 0;

  mapWip.forEach(function (mapId, index) {
    totalSpace += parseInt(mapCatalog[mapId].size);
  });

  return totalSpace/1024;
}

function calcLibraryDiskSpace(){
  var availableSpace = 0;
  var usedSpace = 0;
  // library space is accurate whether separate partition or not
	if (sysStorage.library_on_root){
	  availableSpace = sysStorage.root.avail_in_k;
	  usedSpace = sysStorage.root.size_in_k - sysStorage.root.avail_in_k;
	}
	else{
    availableSpace = sysStorage.library.avail_in_k;
    usedSpace = sysStorage.library.size_in_k - sysStorage.library.avail_in_k;
  }
  return { availableSpace : availableSpace,
  	       usedSpace : usedSpace
  };
}

function updateZimDiskSpace(cb){
  var zim_id = cb.name
  updateZimDiskSpaceUtil(zim_id, cb.checked);
}

function updateZimDiskSpaceUtil(zim_id, checked){
  var zim = zimCatalog[zim_id]
  var size =  parseInt(zim.size);

  // make space estimate double the size if source is portable due to needing both the download and the deployed files
  if (zim.source == "portable")
    size *= 2;

  var zimIdx = selectedZims.indexOf(zim_id);

  if (checked){
    if (!(zim_id in installedZimCatalog['INSTALLED'])){ // only update if not already installed zims
      sysStorage.zims_selected_size += size;
      selectedZims.push(zim_id);
    }
  }
  else {
    if (zimIdx != -1){
      sysStorage.zims_selected_size -= size;
      selectedZims.splice(zimIdx, 1);
    }
  }
  displaySpaceAvail();
}

function updateIntZimsSpace(cb){
  var zim_id = cb.name
  updateManContSelectedSpace(zim_id, "zims", installedZimCatalog.INSTALLED, "internal", cb.checked);
}

function updateIntOer2goSpace(cb){
  var id = cb.name
  updateManContSelectedSpace(id, "modules", oer2goCatalog, "internal", cb.checked);
}

function updateExtZimsSpace(cb){
  var zim_id = cb.name
  updateManContSelectedSpace(zim_id, "zims", externalZimCatalog, selectedUsb, cb.checked);
}

function updateExtOer2goSpace(cb){
  var id = cb.name
  updateManContSelectedSpace(id, "modules", oer2goCatalog, selectedUsb, cb.checked);
}


function updateManContSelectedSpace(id, contType, catalog, dev, checked){
  var item = catalog[id]
  var sizeStr = "0";
  switch (contType) {
  	case "zims":
  	  sizeStr =  item.size;
  	  break;
  	case "modules":
  	  sizeStr =  item.ksize;
  	  break;
  	default:
        consoleLog("Unknown content type in updateManContSelectedSpace");
        return false;
  }

  var size =  parseInt(sizeStr);
  var idx = manContSelections[dev][contType].indexOf(id);

  if (checked){
    if (idx == -1){ // only update if not already selected
      manContSelections[dev].sum += size;
      manContSelections[dev][contType].push(id);
    }
    else
    	consoleLog("ID in array that should not be in updateManContSelectedSpace");
  }
  else {
    if (idx != -1){
      manContSelections[dev].sum -= size;
      manContSelections[dev][contType].splice(idx, 1);
    }
  }
  displaySpaceAvail();
}

function moveUploadedFile(fileName, fileUse, filterArray=[]) {

  var cmdArgs = {}
  cmdArgs['file_name'] = fileName;
  cmdArgs['file_use'] = fileUse;
  cmdArgs['filter_array'] = filterArray;

  var cmd = 'MOVE-UPLOADED-FILE ' + JSON.stringify(cmdArgs);
  return sendCmdSrvCmd(cmd, moveUploadedFileSucceeded, '', moveUploadedFileFailed);
}

function moveUploadedFileSucceeded(){
  alert ('Upload Succeeded');
}

function moveUploadedFileFailed(){
  alert ('Upload Failed');
}

function getInetSpeed(){
  var command = "GET-INET-SPEED";
  sendCmdSrvCmd(command, procInetSpeed, "GET-INET-SPEED");
  $( "#intSpeed1" ).html("Working ...");
  //$('#myModal').modal('show');
  return true;
}

function procInetSpeed(data){
  //alert ("in procInetSpeed");
  consoleLog(data);
  var intSpeed = data["internet_speed"];
  var html = "";
  for (var i in intSpeed)
  html += intSpeed[i] + "<BR>"

  $( "#intSpeed1" ).html(html);
  return true;
}

function getInetSpeed2(){
  var command = "GET-INET-SPEED2"
  sendCmdSrvCmd(command, procInetSpeed2, "GET-INET-SPEED2");
  $( "#intSpeed2" ).html("Working ...");
  return true;
}

function procInetSpeed2(data){
  //alert ("in procInetSpeed2");
  consoleLog(data);
  var intSpeed = data["internet_speed"];
  var html = "";
  for (var i in intSpeed)
  html += intSpeed[i] + "<BR>"

  $( "#intSpeed2" ).html(html);
  //consoleLog(jqXHR);
}

function logOutUser(){
  authData.credentials = ':';
  authData.token = ''; // possible future use
  $('#iiabAdminUserName').val('');
  $('#iiabAdminUserPassword').val('');
  init();
}

function rebootServer()
{
  var command = "REBOOT"
  sendCmdSrvCmd(command, genericCmdHandler);
  alert ("Reboot Initiated");
  return true;
}

function poweroffServer()
{
  var command = "POWEROFF"
  sendCmdSrvCmd(command, genericCmdHandler);
  alert ("Shutdown Initiated");
  return true;
}

function getHelp(arg)
{
  $.get( "help/" + arg, function( data ) {
    var rst = data;
    var convert = new Markdown.getSanitizingConverter().makeHtml;
    var html = convert(rst);
    $( "#helpItem" ).html( html );
  });
  return true;
}

function showAboutSummary()
{
  //consoleLog("in showAboutSummary");
  var html = '<table>';

  html += '<tr><td ><b>Version:</b></td>';
  html += '<td>' + iiab_ini.runtime.runtime_branch + '</td></tr>';
  html += '<td><b>Date Installed:</b></td>';
  html += '<td>' + iiab_ini.runtime.runtime_date + '</td></tr>';
  html += '<td><b>Commit ID:</b></td>';
  html += '<td>' + iiab_ini.runtime.runtime_commit + '</td></tr>';

  html += "</tr></table>";

  $( "#aboutSummaryText" ).html( html );
}

function getServerInfo() {
	displayServerCommandStatus("Checking Server Connection");
  var resp = $.ajax({
    type: 'GET',
    cache: false,
    global: false, // don't trigger global error handler
    url: 'server-info.php',
    dataType: 'json'
  })
  .done(function( data ) {
    serverInfo.iiab_server_ip = data.iiab_server_ip;
    serverInfo.iiab_client_ip = data.iiab_client_ip;
    serverInfo.iiab_cmdsrv_running = data.iiab_cmdsrv_running;

    consoleLog(serverInfo);
    if (serverInfo.iiab_cmdsrv_running == "FALSE"){
      displayServerCommandStatus("IIAB-CMDSRV is not running");
      alert ("IIAB-CMDSRV is not running on the server");
    }
    else
      displayServerCommandStatus("Successfully connected to Server");
  })
  .fail(getServerInfoError);

  return resp;
}

function getServerInfoError (jqXHR, textStatus, errorThrown){
  jsonErrhandler (jqXHR, textStatus, errorThrown); //check for json errors
  serverInfo.iiab_server_found = "FALSE";
  consoleLog("Connection to Server failed.");
  displayServerCommandStatus('Connection to Server <span style="color:red">FAILED</span>.');
  alert ("Connection to Server failed.\n Please make sure your network settings are correct,\n that the server is turned on,\n and that the web server is running.");
}

function secondsToDuration(seconds){
  var d = Number(seconds);

  var h = Math.floor(d / 3600);
  var m = Math.floor(d % 3600 / 60);
  var s = Math.floor(d % 3600 % 60);

  return ('0' + h).slice(-2) + ":" + ('0' + m).slice(-2) + ":" + ('0' + s).slice(-2);
}

// Command Functions

function formCommand(cmd_verb, args_name, args_obj)
{
  var cmd_args = {}
  cmd_args[args_name] = args_obj;
  var command = cmd_verb + " " + JSON.stringify(cmd_args);
  consoleLog(command);

  return command;
}
async function sendCmdSrvCmd(command, callback, buttonId = '', errCallback, cmdArgs, encryptFlag = false) {
  // takes following arguments:
  //   command - Command to send to cmdsrv
  //   callback - Function to call on success
  //   buttonId - Optional ID of button to disable and re-enable
  //   errCallback - Optional function to call if return from cmdsrv has error object; not the same as an error in ajax
  //   cmdArgs - Optional arguments to original command for use by errCallback
  //   TODO  - add assignmentVar so can assign variable before running callback
  //alert ("in sendCmdSrvCmd(");
  //consoleLog (command, callback.name);
  //consoleLog ('buttonid = ' + buttonId);

  // skip command if init has already failed - not sure this works

  //if (initStat.active == true && initStat.error == true){ - This causes intermittant init failures
  //	var deferredObject = $.Deferred();
  //	logServerCommands (command, "failed", "Init already failed");
  //	return deferredObject.reject();
  //}

  var nonce64 = await getServerNonceAsync();
  var encryptedCredentials64 = naclEncryptText(authData.credentials, nonce64);
  var cmdVerb = command.split(" ")[0];
  // the ajax call escapes special characters, but converts space to plus sign
  // convert space to %20

  // var enCommand = encodeURIComponent(command); - perhaps preferred in future if it can be made to work
  // var enCommand = command.replace(" ", "%20"); - only does the first one
  var encodedCommand = command.replace(/ /g, "%20");
  var encryptedCommand = null;
  //coleonsLog ("command: " + command);
  //consoleLog ("enCommand: " + enCommand);
  var payload = {command: encodedCommand};
  if (encryptFlag){
    encryptedCommand = naclEncryptText(encodedCommand, nonce64);
    payload = {encrypted_command: encryptedCommand};
  }

  logServerCommands (cmdVerb, "sent");

  if (buttonId != '')
    make_button_disabled('#' + buttonId, true);
    setCmdsrvWorkingModalOn();

  var resp = $.ajax({
    type: 'POST',
    url: iiabCmdService,
    headers: {"X-IIAB-Credentials": encryptedCredentials64,
            "X-IIAB-Nonce": nonce64,
            "X-IIAB-ClientKey": authData.clientPubKey64},
    data: payload,
    dataType: 'json',
    buttonId: buttonId
  })
  //.done(callback)
  .done(function(dataResp, textStatus, jqXHR) {
    //consoleLog (dataResp);
  	//consoleLog (callback);
  	//var dataResp = data;
  	if ("Error" in dataResp){
  	  cmdSrvError(cmdVerb, dataResp);
  	  if (typeof errCallback != 'undefined'){
  	    consoleLog(errCallback);
  	    errCallback(data, cmdArgs);
  	  }
  	}
    else if ("Warning" in dataResp.Data) {
      cmdSrvWarning(cmdVerb, dataResp);
      var data = dataResp.Data;
  	  callback(data, command);
      logServerCommands (cmdVerb, "warning", "", dataResp.Resp_time);
    }
  	else {
  		var data = dataResp.Data;
  	  callback(data, command);
  	  logServerCommands (cmdVerb, "succeeded", "", dataResp.Resp_time);
  	}
  })
  .fail(async function(jqXHR, textStatus, errorThrown) {
    consoleLog('in sendAuthCmdSrvCmd .fail');
    if (jqXHR.status == 403){ // not logged in
      // probably need to reinitialize
      init ('Server Password Reset. Please Sign in Again');

    } else {
      jsonErrhandler(jqXHR, textStatus, errorThrown);
    }
    })
  .always(function() {
  	setCmdsrvWorkingModalOff();
  	if (this.buttonId != "")
      make_button_disabled('#' + this.buttonId, false);
  });

  return resp;
}

function genSendCmdSrvCmdCallback(command, cmdArgs, callbackName){
	var callbackFunc = function() {
    window[callbackName](command, cmdArgs);
  };
  return callbackFunc;
}

// Report errors that came from cmdsrv or cmd-service

function cmdSrvError (cmdVerb, dataResp){
	var errorText = dataResp["Error"];
	consoleLog(errorText);
  logServerCommands (cmdVerb, "failed", errorText);
  cmdSrvErrorAlert (cmdVerb, dataResp)
  initStat["error"] = true;
}

function cmdSrvWarning(cmdVerb, dataResp){
  var errorText = dataResp.Data.Warning;
	var alertText = cmdVerb + " " + errorText;
	alert(alertText);
}

function cmdSrvErrorAlert (cmdVerb, dataResp){
	var errorText = dataResp["Error"];
	var alertText = cmdVerb + " FAILED and reported " + errorText;

	if (initStat["active"] == false)
	  alert(alertText);
	else {
		// during init only alert if flagged from server
		if (("Alert" in dataResp) && ! (errorText in initStat["alerted"])){
		  alert(alertText);
		  initStat["alerted"][errorText] = true;
		}
  }
}

// Generic ajax error handler called by all .fail events unless global: false set

function ajaxErrhandler (event, jqxhr, settings, thrownError) {
	consoleLog("in .ajaxError");
  consoleLog(event);
  consoleLog(jqxhr);
  consoleLog(settings);
  consoleLog(thrownError);

  // For commands sent to command server
  if (settings.url == iiabCmdService){
    var cmdstr = settings.data.split("command=")[1];
    var cmdVerb = cmdstr.split(/[ +]/)[0];
    consoleLog(cmdVerb);
    logServerCommands (cmdVerb, "failed", jqxhr.statusText);
    // see if we are connected to server
    consoleLog(jqxhr.statusText, serverInfo.iiab_server_found);
    //if (jqxhr.statusText == "error" && serverInfo.iiab_server_found == "TRUE"){
    if (jqxhr.statusText == "error"){
      consoleLog("calling getServerInfo");
      getServerInfo();
    }
  }
  if (initStat["active"] == true)
    initStat["error"] = true;
}

// Error handler mostly for json errors, which should be bugs or bad data

function jsonErrhandler (jqXHR, textStatus, errorThrown)
{
  // only handle json parse errors here, others in ajaxErrHandler
  if (textStatus == "parserror") {
    //alert ("Json Errhandler: " + textStatus + ", " + errorThrown);
    displayServerCommandStatus("Json Errhandler: " + textStatus + ", " + errorThrown);
  }
  //consoleLog("In Error Handler logging jqXHR");
  consoleLog(textStatus);
  consoleLog(errorThrown);
  consoleLog(jqXHR);

  return false;
}

function setCmdsrvWorkingModalOn (){
	cmdsrvWorkingModalCount += 1;
  if (cmdsrvWorkingModalCount == 1)
		  $('#sendCmdsrvWorkingModal').modal('show');
}

function setCmdsrvWorkingModalOff (){
  cmdsrvWorkingModalCount -= 1;
	if (cmdsrvWorkingModalCount == 0)
	  $('#sendCmdsrvWorkingModal').modal('hide');
}

function consoleLog (msg)
{
  console.log(msg); // for IE there can be no console messages unless in tools mode
}

function logServerCommands (command, status, extraData="", respTime=0)
{
  var msg = "";

  switch (status) {
    case "sent":
        msg = "Command " + command + " sent to server";
        break;
    case "succeeded":
        msg = command + ' <span style="color:green">SUCCEEDED</span> (' + Math.round(1000 * respTime) + ' ms)';
        break;
    case "failed":
        msg = command + ' <span style="color:red">FAILED</span>';
        if (extraData != "" && extraData != "error"){
          msg += ' and returned ' + extraData;
        }

        break;

  }
  displayServerCommandStatus(msg);
}

function displayServerCommandStatus (msg)
{
  var initSelector = "#initLog";
  var logSelector = "#serverCmdLog";
  var now = new Date();

  $(logSelector).prepend(now.toLocaleString() + ": " + msg + "<BR>");
  if (initStat.active == true)
    $(initSelector).prepend(now.toLocaleString() + ": " + msg + "<BR>");
}

// Init Functions

function init (loginMsg='')
{
  //$('#initDataModal').modal('show');

  initStat["active"] = true;
  initStat["complete"] = false;
  initStat["error"] = false;
  initStat["alerted"] = {};

  displayServerCommandStatus("Starting init");

  getServerInfo(); // see if we can connect

  // generate client public/private keys
  authData['clientKeyPair'] = nacl.box.keyPair();
  authData['clientPubKey64'] = nacl.util.encodeBase64(authData.clientKeyPair.publicKey);
  authData['credentials'] = ':';
  authData.keepLogin = true;

  getServerPublicKey();
  launchcmdServerLoginForm(loginMsg) //force login
  // on success will continue with initPostLogin()
}

function initPostLogin(){

  // this is all conditional on successful login
  // invoked by login.done

  $('#help-tip').show()

  $.when(
    sendCmdSrvCmd("GET-ADM-CONF", getAdminConfig))
    .then(initPostLogin2)
    .fail(initFailed)
}

function initPostLogin2(){
  initGetHtml();
  initGetData();
}

function initGetHtml(){
  $.when(
			$.get('htmlf/20-configure.html', function (data) {
				$('#Configure').html(data);
				configButtonsEvents();
			}),
			$.get('htmlf/40-install_content.html', function (data) {
				$('#InstallContent').html(data);
				instContentButtonsEvents();
			}),
			$.get('htmlf/50-edit_menus.html', function (data) { // this should be conditional on js_menu_install: True
				$('#ContentMenus').html(data);
        contentMenuButtonsEvents();
			}),
			$.get('htmlf/70-utilities.html', function (data) {
				$('#Util').html(data);
				utilButtonsEvents();
			})
		).done(function () {
      initVars();
		});
}

function initGetData(){
  $.when(
    getLangCodes(),
    readKiwixCatalog(),
    sendCmdSrvCmd("GET-VARS", getInstallVars),
    sendCmdSrvCmd("GET-ANS", getAnsibleFacts),
    sendCmdSrvCmd("GET-IIAB-INI", procXsceIni),
    sendCmdSrvCmd("GET-ZIM-STAT", procZimStatInit),
    getOer2goStat(),
    readMapCatalog(),
    readMapIdx(),
    getOsmVectStat(),
    getSpaceAvail(),
    getExternalDevInfo())
    .then(initDone)
    .fail(initFailed)
}


function kixixInitStatus(msg){
  consoleLog(msg);
}

function initVars(){
	initManContSelections("internal");
}

function initManContSelections(dev, reset=false){
	if (! manContSelections.hasOwnProperty(dev)){
	  manContSelections[dev] = {};
	  reset=true;
	}

	if (reset){
	  manContSelections[dev]["zims"] = [];
	  manContSelections[dev]["modules"] = [];
	  manContSelections[dev]["sum"] = 0;
  }
}

function initDone (){
	if (initStat.error == false){
    consoleLog("starting initConfigVars");
    initConfigVars();
    consoleLog("starting procZimCatalog");
    procZimCatalog();
    displayServerCommandStatus('<span style="color:green">Init Finished Successfully</span>');
	  //selectedLangsDefaults(); // any installed or wip content plus default language
	  displaySpaceAvail(); // display on various panels
	  // now turn on navigation
    navButtonsEvents();
    //$('#initDataModal').modal('hide');

    // Set Password Change Fields
    var user = authData.credentials.split(':')[0]
    $( "#iiab_admin_user").val(user);

    consoleLog("Init Finished Successfully");
    $('#help-tip').hide()
  } else {
    initFailed()
    //$('#initDataModalResult').html("<b>There was an error on the Server.</b>");
  }
  initStat.complete = true;
  initStat.active = false;
}

function initFailed(){
  $('#help-tip').hide()
  displayServerCommandStatus('<span style="color:red">Init Failed</span>');
  consoleLog("Init failed");
}

function waitDeferred(msec) {
    var deferredObject = $.Deferred();

    setTimeout(function() { deferredObject.resolve();  }, msec);

    return deferredObject.promise();
}
