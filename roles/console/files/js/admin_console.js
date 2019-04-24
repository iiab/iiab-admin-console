// admin_console.js
// copyright 2018 Tim Moody

var today = new Date();
var dayInMs = 1000*60*60*24;

var iiabContrDir = "/etc/iiab/";
var consoleJsonDir = "/common/assets/";
var iiabCmdService = "/cmd-service";
var ansibleFacts = {};
var ansibleTagsStr = "";
var effective_vars = {};
var config_vars = {};
var iiab_ini = {};
var job_status = {};
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
var osmCatalog = {}; // osm regions specified by bounding boxes, downloadable
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
var osmDownloading = []; // list of Osm items being downloaded
var osmWip = {}; // list of copying, downloading, exporting
var osmInstalled = {}; // list of osm regions already installed
var externalDeviceContents = {}; // zims and other content on external devices, only one active at a time

var langNames = []; // iso code, local name and English name for languages for which we have zims sorted by English name for language
var topNames = ["ara","eng","spa","fra","hin","por"]; // languages for top language menu
var defaultLang = "eng";
var langGroups = {"en":"eng","fr":"fra"}; // language codes to treat as a single code
var selectedLangs = []; // languages selected by gui for display of content
var selectedZims = [];
var selectedOer2goItems = [];
var selectedOsmItems = [];
var manContSelections = {};
var selectedUsb = null;

var sysStorage = {};
sysStorage.root = {};
sysStorage.library = {};
sysStorage.library.partition = false; // no separate library partition

// because jquery does not percolate .fail conditions in async chains
// and because an error returned from the server is not an ajax error
// flag must be set to false before use

// defaults for ip addr of server and other info returned from server-info.php
var serverInfo = {"iiab_server_ip":"","iiab_client_ip":"","iiab_server_found":"TRUE","iiab_cmdsrv_running":"FALSE"};
var initStat = {};

// MAIN ()

function main() {

// Set jquery ajax calls not to cache in browser
  $.ajaxSetup({ cache: false });
  //$.ajaxSetup({
  // type: 'POST',
  // headers: { "cache-control": "no-cache" }
  //});

// declare generic ajax error handler called by all .fail events
 $( document ).ajaxError(ajaxErrhandler);

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
}

// BUTTONS

// Control Buttons

function controlButtonsEvents() {
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

  $("#INST-MAP").click(function(){
    var osm_id;
    make_button_disabled("#INST-MAP", true);
    selectedOsmItems = []; // items no longer selected as are being installed
    $('#osm_select input').each( function(){
      if (this.type == "checkbox")
        if (this.checked){
          osm_id = this.name;
          if (osmInstalled.indexOf(osm_id) >= 0 || osm_id in osmWip)
            consoleLog("Skipping installed Module " + osm_id);
          else
            instOsmItem(osm_id);
        }
    });
    //getOer2goStat();
    //alert ("Selected Osm Region scheduled to be installed.\n\nPlease view Utilities->Display Job Status to see the results.");
    alert ("For now, a Map Region must be downloaded at the command-line, e.g. using:\n\niiab-install-map south_america\nor\niiab-install-map world\n\nSee https://github.com/iiab/maps/blob/master/osm-source/ukids/assets/regions.json");
    make_button_disabled("#INST-MAP", false);
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

}

  // Content Menu Buttons

function contentMenuButtonsEvents() {
  $("#LOAD-CONTENT-MENU").click(function(){
    var currentJsMenuToEditUrl = $("#content_menu_url").val();
    getContentMenuToEdit(currentJsMenuToEditUrl);
  	var currentJsMenuToEditUrl = $("#content_menu_url").val();
    getContentMenuToEdit(currentJsMenuToEditUrl);
  });
  $("#SAVE-CONTENT-MENU").click(function(){
    saveContentMenuDef();
  });
  $("#REFRESH-MENU-LISTS").click(function(){
    getMenuItemDefList();
  });
  $("#CREATE-MENU-ITEM-DEF").click(function(){
    saveContentMenuItemDef();
  });
  $("#UPDATE-MENU-ITEM-DEF").click(function(){
    saveContentMenuItemDef();
  });
}

  // Util Buttons

function utilButtonsEvents() {
  $("#CHGPW").click(function(){
  	changePassword();
  });

  $("#JOB-STATUS-REFRESH").click(function(){
  	make_button_disabled("#JOB-STATUS-REFRESH", true);
    getJobStat();
    make_button_disabled("#JOB-STATUS-REFRESH", false);
  });

  $("#CANCEL-JOBS").click(function(){
  	var cmdList = [];
    make_button_disabled("#CANCEL-JOBS", true);
    $('#jobStatTable input').each( function(){
      if (this.type == "checkbox")
        if (this.checked){
          var job_idArr = this.id.split('-');
          job_id = job_idArr[1];

          // cancelJobFunc returns the function to call not the result as needed by array.push()
          cmdList.push(cancelJobFunc(job_id));
          if (job_status[job_id]["cmd_verb"] == "INST-ZIMS"){
          	var zim_id = job_status[job_id]["cmd_args"]["zim_id"];
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


// Common functions
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

function getAnsibleFacts (data)
{
  //alert ("in getAnsibleFacts");
  consoleLog(data);
  ansibleFacts = data;
  var jstr = JSON.stringify(ansibleFacts, undefined, 2);
  var html = jstr.replace(/\n/g, "<br>").replace(/[ ]/g, "&nbsp;");
  $( "#ansibleFacts" ).html(html);
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

function getInstallVars (data)
{
  //alert ("in getInstallVars");
  consoleLog(data);
  effective_vars = data;
  //consoleLog(jqXHR);
  return true;
}
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

function setConfigVars ()
{
  var cmd_args = {}
  //alert ("in setConfigVars");
  $('#Configure input').each( function(){
    if (this.type == "checkbox") {
      if (this.checked)
      config_vars[this.name] = true; // must be true not True
      else
        config_vars[this.name] = false;
      }
      if (this.type == "text")
      config_vars[this.name] = $(this).val();
      if (this.type == "radio"){
        fieldName = this.name;
        fieldName = "input[name=" + this.name + "]:checked"
        //consoleLog(fieldName);
        config_vars[this.name] = $(fieldName).val();
      }
    });
    cmd_args['config_vars'] = config_vars;
    var cmd = "SET-CONF " + JSON.stringify(cmd_args);
    sendCmdSrvCmd(cmd, genericCmdHandler);
    alert ("Saving Configuration.");
    return true;
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
  sendCmdSrvCmd(cmd, changePasswordSuccess, "CHGPW");
  //alert ("Changing Password.");
  return true;
}

function changePasswordSuccess ()
{
  alert ("Password Changed.");
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

    // Set Password Fields
    $( "#iiab_admin_user").val(iiab_ini['iiab-admin']['iiab_admin_user']);
    return true;
  }
  function getWhitelist (data)
  {
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

  // Install Content functions

function getLangCodes() {
  //alert ("in sendCmdSrvCmd(");
  //consoleLog ('ran sendCmdSrvCmd');
  //if (asyncFlag === undefined) asyncFlag = false;

  var resp = $.ajax({
    type: 'GET',
    url: consoleJsonDir + 'lang_codes.json',
    dataType: 'json'
  })
  .done(function( data ) {
    langCodes = data;
    var xrefLang;
    for (var lang in langCodes){
      if (lang in langGroups)
        xrefLang = langGroups[lang]; // en and fr are used interchangeably with eng and fra
      else
      	xrefLang = lang;
      langCodesXRef[langCodes[xrefLang].iso2] = xrefLang;
    }
    //consoleLog(langCodes);
  })
  .fail(jsonErrhandler);

  return resp;
}

function getSelectedLangs() {
  // get list of selected langcodes
  selectedLangs = [];
  $('#selectLangCodes input').each( function(){
    if (this.checked) {
      selectedLangs.push(this.name);
    }
  });
}

function procContentLangs() {

  var html = '';
  var topHtml = '';
  var bottomHtml = '';
  var langPickerTopHtml = "";
  var langPickerBottomHtml = "";
  var selectName = "";

  selectedLangsDefaults(); // make sure the langs of any downloaded content is selected

  for (var i in langNames){
    html = '<span class="lang-codes"><label><input type="checkbox" name="' + langNames[i].code + '"';
    if (selectedLangs.indexOf(langNames[i].code) != -1)
      html += ' checked';
    html += '>&nbsp;&nbsp;<span>' + langNames[i].locname + '</span><span> (' + langNames[i].engname + ') [' + langNames[i].code + ']</span></label></span>';

    if (topNames.indexOf(langNames[i].code) >= 0 || selectedLangs.indexOf(langNames[i].code) != -1) {
      topHtml += html;
    }
    else {
      bottomHtml += html;
    }
  }

  $( "#ContentLanguages" ).html(topHtml);
  $( "#ContentLanguages2" ).html(bottomHtml);

  if ($("#js_menu_lang").html() == ""){ // calc and insert language pickers if not previously done
    for (i in langNames){
    	selectName = langNames[i].locname + ' [' + langCodes[langNames[i].code].iso2 + ']';
    	if (langNames[i].locname != langNames[i].engname)
    		selectName += ' (' + langNames[i].engname + ')';

      html = '<option value="' + langCodes[langNames[i].code].iso2 + '">' + selectName + '</option>';

      if (topNames.indexOf(langNames[i].code) >= 0) {
        langPickerTopHtml += html;
      }
      else {
        langPickerBottomHtml += html;
      }
    }
    $( "#js_menu_lang" ).html(langPickerTopHtml+langPickerBottomHtml);
    $( "#menu_item_lang" ).html(langPickerTopHtml+langPickerBottomHtml);

  }
}

function selectedLangsDefaults() {
  if (selectedLangs.length == 0)
    selectedLangs.push (defaultLang); // default
  // make sure languages for all installed content are selected

  for (var id in installedZimCatalog['INSTALLED']){
    lang = installedZimCatalog['INSTALLED'][id]['language'];
    if (selectedLangs.indexOf(lang) == -1) // automatically select any language for which zim is installed
      selectedLangs.push (lang);
  }
  for (var id in installedZimCatalog['WIP']){
  	var zim = lookupZim(id);
    lang = zim.language;
    if (selectedLangs.indexOf(lang) == -1) // automatically select any language for which zim is being installed
      selectedLangs.push (lang);
  }
  for (var idx in oer2goInstalled){ // this is an array
    lang = langCodesXRef[oer2goCatalog[oer2goInstalled[idx]]['lang']];
    if (selectedLangs.indexOf(lang) == -1) // automatically select any language for which oer2go item is installed
      selectedLangs.push(lang);
  }
  for (var id in oer2goWip){ // this is an object
    lang = langCodesXRef[oer2goCatalog[id]['lang']];
    if (selectedLangs.indexOf(lang) == -1) // automatically select any language for which oer2go item is wip
      selectedLangs.push(lang);
  }
}

function procSelectedLangs() { // redraw various lists using newly selected language codes
	var topMenu = $("#iiab-top-nav .nav-tabs .active a")[0].hash; // get active top level menu selected
	var contentContext = $(topMenu + " .tab-pane.active").attr("id"); // get active menu option for that menu

	//consoleLog ("in procSelectedLangs " + contentContext);
	if (contentContext == "instConZims") // download zims
	  procZimGroups();
	else if (contentContext == "instConOer2go") // download oer2go modules
		renderOer2goCatalog();
	else if (contentContext == "menusDefineMenu") // edit current menu
		redrawAllMenuItemList();
}

function readableSize(kbytes) {
  if (kbytes == 0)
  return "0";
  var bytes = 1024 * kbytes;
  var s = ['bytes', 'kB', 'MB', 'GB', 'TB', 'PB'];
  var e = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, e)).toFixed(2) + " " + s[e];
}

// **************************************
// Put zim_functions here
// **************************************

// **************************************
// Put oer2go_functions here
// **************************************

function manageContentInit(){
	refreshAllInstalledList();
	refreshExternalList();
}

function getExternalDevInfo(){
var command = "GET-EXTDEV-INFO";
  return sendCmdSrvCmd(command, procExternalDevInfo, "FIND-USB");
}

function procExternalDevInfo(data){
  externalDeviceContents = data;
  externalZimCatalog = {};
  zimsExternal = [];
  oer2goExternal = [];
  var haveUsb = calcExtUsb(); // also sets selectedUsb
  setCopyContentButtonText();

  if (haveUsb){
    externalZimCatalog = externalDeviceContents[selectedUsb].zim_modules;
    zimsExternal = Object.keys(externalZimCatalog);
    oer2goExternal = externalDeviceContents[selectedUsb].oer2go_modules;
    make_button_disabled("#COPY-CONTENT", false);
    make_button_disabled("#REMOVE-USB", false);
    $.each(Object.keys(externalDeviceContents).sort(), function(index, dev) {
  		initManContSelections(dev);
      });
    $("#instManageContentUsbTab").show();
  }
  else{
  	$("#instManageContentUsbTab").hide();
  	make_button_disabled("#COPY-CONTENT", true);
  	make_button_disabled("#REMOVE-USB", true);
  }
}

function calcExtUsb(){ // checks if any usb devices are attached and selects the one to display
	if (Object.keys(externalDeviceContents).length > 0){
	  if (Object.keys(externalDeviceContents).indexOf(selectedUsb)== -1)
      selectedUsb = Object.keys(externalDeviceContents)[0];
    return true;
  }
  else {
    selectedUsb = null;
    return false;
  }
}

function setCopyContentButtonText(){
  var activeDev = calcManContentDevice();
  var text = "Copy Unavailable"; // for selectedUsb is null
  if (selectedUsb != null){
  	if (activeDev == "internal")
  	  text = "Copy Installed to " + selectedUsb;
    else
      text = "Copy " + selectedUsb + " to Installed";
  }
  $("#COPY-CONTENT").text(text);
}

function procDnldList(){

  $("#downloadedFilesRachel").html(calcDnldListHtml(downloadedFiles.rachel.file_list));
  $("#downloadedFilesZims").html(calcDnldListHtml(downloadedFiles.zims.file_list));
  //console.log("in procDnldList");
}



// Not currently used
function getRachelStat(){
  var command = "GET-RACHEL-STAT";
  sendCmdSrvCmd(command, procRachelStat);
  return true;
}

function procRachelStat(data) {
  rachelStat = data;

  setRachelDiskSpace();
  var html = "";
  var htmlNo = "<b>NO</b>";
  var htmlYes = "<b>YES</b>";
  var installedHtml = htmlNo;
  var enabledHtml = htmlNo;
  var contentHtml = htmlNo;

  if (rachelStat["status"] == "INSTALLED")
    installedHtml = htmlYes;

  if (rachelStat["status"] == "ENABLED"){
    installedHtml = htmlYes;
    enabledHtml = htmlYes;
  }

  if (rachelStat["content_installed"] == true)
    contentHtml = htmlYes;

  $("#rachelInstalled").html(installedHtml);
  $("#rachelEnabled").html(enabledHtml);
  $("#rachelContentFound").html(contentHtml);

  var moduleList = [];

  if (rachelStat["content_installed"] == true){
    for (var title in rachelStat.enabled) {
      moduleList.push(title);
    }

    moduleList.sort();

    for (var idx in moduleList) {
    	html += '<tr><td>' + moduleList[idx] + '</td><td>';
    	if (rachelStat.enabled[moduleList[idx]].enabled == true)
    	  html += htmlYes + '</td></tr>'
    	else
    		html += htmlNo + '</td></tr>'
    }
    $("#rachelModules tbody").html(html);
    $("#rachelModules").show();
  }
  else
  	$("#rachelModules").hide();
}

function getDownloadList(){
	var zimCmd = 'LIST-LIBR {"sub_dir":"downloads/zims"}';
	var rachelCmd = 'LIST-LIBR {"sub_dir":"downloads/rachel"}';
	displaySpaceAvail();
	$.when(sendCmdSrvCmd(zimCmd, procDnldZimList), sendCmdSrvCmd(rachelCmd, procDnldRachelList)).done(procDnldList);

  return true;
}

function procDnldZimList(data){
	downloadedFiles['zims'] = data;
}

function procDnldRachelList(data){
	downloadedFiles['rachel'] = data;
}

function procDnldList(){

  $("#downloadedFilesRachel").html(calcDnldListHtml(downloadedFiles.rachel.file_list));
  $("#downloadedFilesZims").html(calcDnldListHtml(downloadedFiles.zims.file_list));
  //console.log("in procDnldList");
}

function calcDnldListHtml(list) {
	var html = "";
	list.forEach(function(entry) {
    //console.log(entry);
    html += '<tr>';
    html += "<td>" + entry['filename'] + "</td>";
    html += "<td>" + entry['size'] + "</td>";
    html +=  '<td><input type="checkbox" name="' + entry['filename'] + '" id="' + entry['filename'] + '">' + "</td>";
    html +=  '</tr>';
  });
  return html;
}

function copyContent(){
  var device = calcManContentDevice();
  var source = "internal";
  var dest = "internal";
  var cmd_args = {};
  var modList = [];
  if (device == "internal")
  	dest = selectedUsb;
  else
  	source = selectedUsb;

  cmd_args['source'] = source;
  cmd_args['dest'] = dest;

  // Zims

  modList = getCopyList(device, "zims");
  modList.forEach( function(item) {
    cmd_args['zim_id'] = item.id;
    cmd_args['file_ref'] = item.file_ref;
    cmd = "COPY-ZIMS " + JSON.stringify(cmd_args);
  	sendCmdSrvCmd(cmd, genericCmdHandler);
  });

  // OER2GO

  modList = getCopyList(device, "modules");
  modList.forEach( function(item) {
    cmd_args['moddir'] = item.id;
    cmd_args['file_ref'] = item.file_ref;
    cmd = "COPY-OER2GO-MOD " + JSON.stringify(cmd_args);
  	sendCmdSrvCmd(cmd, genericCmdHandler);
  });

  clearManContSelections(device, reset=true);
}

function rmContent() {
	var device = calcManContentDevice();
	var clearFunction = clearRmSelections(device, reset=true);
	var refreshFunction = refreshRemovePanel(device);
	var calls =[delModules(device, "zims"),
              delModules(device, "modules")];
	if (device == "internal"){
		calls.push(delDownloadedFileList("downloadedFilesRachel", "zims"));
		calls.push(delDownloadedFileList("downloadedFilesRachel", "rachel"));
	}

  $.when.apply($, calls)
    //delDownloadedFileList("downloadedFilesRachel", "rachel"),
    //delDownloadedFileList("downloadedFilesZims", "zims"),
    //delModules("installedZimModules", "zims"),
    //delModules("installedOer2goModules", "modules"))
    .done(clearFunction, refreshFunction);
}

function calcManContentDevice(){
	var tab = $("ul#instManageContentTabs li.active a").attr('href');
	var device = tab.split("Content")[1].toLowerCase();

  if (device != "internal")
    device = selectedUsb;
  return device;
}

function clearRmSelections(dev, reset){
  return function() {
    initManContSelections(dev, reset);
  }
}

function refreshRemovePanel(dev){
	if (dev == "internal")
    return refreshAllInstalledList;
  else
  	return refreshExternalList;
}

function clearManContSelections(dev, reset=false){
  initManContSelections(dev, reset);
  if (dev == "internal"){
    renderZimInstalledList();
    renderOer2goInstalledList();
  }
  else {
    renderExternalList();
  }
}

function refreshAllContentPanels() {
	$.when(getDownloadList(), getOer2goStat(), getZimStat(), getExternalDevInfo())
	.done(renderZimInstalledList, renderOer2goInstalledList, renderExternalList, refreshDiskSpace);
}

function refreshAllInstalledList() {
	$.when(getDownloadList(), getOer2goStat(), getZimStat())
	.done(renderZimInstalledList, renderOer2goInstalledList, refreshDiskSpace);
}

function refreshExternalList() {
	$.when(getExternalDevInfo())
	.done(renderExternalList, refreshDiskSpace);
}

function renderExternalList() {
	if (selectedUsb != null){ // only render content if we have some
	  $("#instManageContentUsbTab").text("Content on " + selectedUsb);
	  setCopyContentButtonText();
	  renderExternalZimList();
	  renderExternalOer2goModules();
	  renderZimInstalledList(); // update ON USB messages
  }
}

function delDownloadedFileList(id, sub_dir) {
  var delArgs = {}
	var fileList = [];
  $("#" + id + " input").each(function() {
    if (this.type == "checkbox") {
      if (this.checked)
      fileList.push(this.name);
    }
  });

  if (fileList.length == 0)
    return;

  delArgs['sub_dir'] = sub_dir;
  delArgs['file_list'] = fileList;

  var delCmd = 'DEL-DOWNLOADS ' + JSON.stringify(delArgs);
  return sendCmdSrvCmd(delCmd, genericCmdHandler);
}

function delModules(device, mod_type) {
  var delArgs = {}
	var modList = [];

  modList = getRmList(device, mod_type);
  if (modList.length == 0)
    return;

  delArgs['device'] = device;
  delArgs['mod_type'] = mod_type;
  delArgs['mod_list'] = modList;

  var delCmd = 'DEL-MODULES ' + JSON.stringify(delArgs);
  return sendCmdSrvCmd(delCmd, genericCmdHandler);
}

function getCopyList(device, mod_type){
  var modList = [];
	var params;
	var id;
	var item = {};
	var zim_path;
	var zim_file;

	// compute jquery selector
	// we only allow one external usb at a time

	params = getRmCopyListParams(device, mod_type);

  console.log(params.selectorId);
  $("#" + params.selectorId + " input").each(function() {
    if (this.type == "checkbox") {
      if (this.checked){
        item = {};
        item['id'] = this.name;
        item['file_ref'] = this.name; // no separate id for modules
        if (mod_type == "zims"){
        	zim_path = params.catalog[this.name].path;
        	zim_file = zim_path.split('/').pop(); // take only file name
        	item['file_ref'] = zim_file.split('.zim')[0]; // remove .zim
        }
        modList.push(item);
      }
    }
  });
  console.log(modList);
  return modList;
}

function getRmList(device, mod_type){
	var modList = []; // just needs path
	var params;
	//var selectorId;
	//var catalog = {};
	var zim_path;
	var zim_file;

	// compute jquery selector
	// we only allow one external usb at a time

	params = getRmCopyListParams(device, mod_type);

  console.log(params.selectorId);
  $("#" + params.selectorId + " input").each(function() {
    if (this.type == "checkbox") {
      if (this.checked)
        if (mod_type == "zims"){
        	zim_path = params.catalog[this.name].path;
        	zim_file = zim_path.split('/').pop(); // take only file name
        	zim_file = zim_file.split('.zim')[0]; // remove .zim
          modList.push(zim_file);
        }
        else
        	modList.push(this.name);
    }
  });
  console.log(modList);
  return modList;
}

function getRmCopyListParams(device, mod_type){
  // compute jquery selector
	// we only allow one external usb at a time

	var params = {};
  if (device == "internal"){
	  params.selectorId = "installed";
	  params.catalog = installedZimCatalog.INSTALLED;
	}
	else{
		params.selectorId = "external";
		params.catalog = externalZimCatalog;
	}
	if (mod_type == "zims")
		params.selectorId += "ZimModules";
  else if (mod_type == "modules")
    params.selectorId += "Oer2goModules";
  return params;
}

function removeUsb(){
  make_button_disabled("#REMOVE-USB", true);
  var cmd = ""
  var cmd_args = {}
  cmd_args['device'] = selectedUsb;
  cmd = "REMOVE-USB " + JSON.stringify(cmd_args);
  $.when(sendCmdSrvCmd(cmd, genericCmdHandler))
  .done(getExternalDevInfo);
  return true;
}

// Utility Menu functions

function getJobStat()
{
  var command = "GET-JOB-STAT"
  sendCmdSrvCmd(command, procJobStat);
  return true;
}

function procJobStat(data)
{
  job_status = {};
  var html = "";
  var html_break = '<br>';


  data.forEach(function(statusJob) {
    //console.log(statusJob);
    html += "<tr>";
    //var job_info = {};

    //job_info['job_no'] = entry[0];
    html += "<td>" + statusJob.job_id + "<BR>"; // job number
    html +=  '<input type="checkbox" id="' + statusJob.job_id + '">';
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

    // there should be one or two parts - ? still need this; for cancel
    var cmd_parse = statusJob.cmd_msg.split(" ");
    job_status['cmd_verb'] = cmd_parse[0];
    if(cmd_parse.length == 0 || typeof cmd_parse[1] === 'undefined')
      job_status['cmd_args'] = ""
    else
      job_status['cmd_args'] = JSON.parse(cmd_parse[1]);

    consoleLog(statusJob);
    job_status[statusJob.job_no] = statusJob;

  });
  $( "#jobStatTable tbody" ).html(html);
  $( "#jobStatTable div.statusJobResult" ).each(function( index ) {
    $(this).scrollTop(this.scrollHeight);
  });
  today = new Date();
  $( "#statusJobsRefreshTime" ).html("Last Refreshed: <b>" + today.toLocaleString() + "</b>");
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
	if (! sysStorage.library_on_root)
    sysStorage.library = data.library;
}

function displaySpaceAvail(){
	// display space available on various panels
	// assumes all data has been retrieved and is in data structures

	var availableSpace = 0;
	var usedSpace = 0;
	var internalContentSelected = 0;
	var internalSpace = calcLibraryDiskSpace();
	availableSpace = internalSpace.availableSpace;
	usedSpace = internalSpace.usedSpace;

	var allocatedSpace = calcAllocatedSpace();
	var warningStyle = '';

	if (allocatedSpace / availableSpace > .5)
	  warningStyle = 'style="color: darkorange;"';
	if (allocatedSpace / availableSpace > .85)
	  warningStyle = 'style="color: red;"';

	var html = "Library Space Available : <b>";
  html += readableSize(availableSpace) + "</b><BR>";

  $( "#dnldDiskSpace" ).html(html);

  html += "Estimated Space Required: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;";
  html += '<b><span ' + warningStyle + '>' + readableSize(allocatedSpace) + '</span</b>';

  $( "#zimDiskSpace" ).html(html);
  $( "#oer2goDiskSpace" ).html(html);
  $( "#osmDiskSpace" ).html(html);

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
	//var status = (age >= 18) ? 'adult' : 'minor';

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
	totalSpace += sumAllocationList(selectedOsmItems, 'osm');
	totalSpace += sumOsmWip();
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
    else if (type == "osm")
      totalSpace += parseInt(osmCatalog[id].size / 1000);
    
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

function sumOsmWip(){
  var totalSpace = 0;

  for (var moddir in osmWip){
  	totalSpace += parseInt(osmCatalog[moddir].size);
  }
  return totalSpace;
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

function formCommand(cmd_verb, args_name, args_obj)
{
  var cmd_args = {}
  cmd_args[args_name] = args_obj;
  var command = cmd_verb + " " + JSON.stringify(cmd_args);
  consoleLog(command);

  return command;
}

// monitor for awhile and use version if no problems present

function sendCmdSrvCmd(command, callback, buttonId = '', errCallback, cmdArgs) {
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

  var cmdVerb = command.split(" ")[0];
  // the ajax call escapes special characters, but converts space to plus sign
  // convert space to %20

  // var enCommand = encodeURIComponent(command); - perhaps preferred in future if it can be made to work
  // var enCommand = command.replace(" ", "%20"); - only does the first one
  var enCommand = command.replace(/ /g, "%20");
  //consoleLog ("command: " + command);
  //consoleLog ("enCommand: " + enCommand);

  logServerCommands (cmdVerb, "sent");

  if (buttonId != '')
    make_button_disabled('#' + buttonId, true);

  var resp = $.ajax({
    type: 'POST',
    url: iiabCmdService,
    data: {
      command: enCommand
    },
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
  	else {
  		var data = dataResp.Data;
  	  callback(data, command);
  	  logServerCommands (cmdVerb, "succeeded", "", dataResp.Resp_time);
  	}
  })
  .fail(jsonErrhandler)
  .always(function() {
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

function init ()
{
  //$('#initDataModal').modal('show');

  initStat["active"] = true;
  initStat["error"] = false;
  initStat["alerted"] = {};

  displayServerCommandStatus("Starting init");

  getServerInfo(); // see if we can connect

  initVars();

  $.when(
    //sendCmdSrvCmd("GET-ANS-TAGS", getAnsibleTags),
    sendCmdSrvCmd("GET-WHLIST", getWhitelist),
    $.when(sendCmdSrvCmd("GET-VARS", getInstallVars), sendCmdSrvCmd("GET-ANS", getAnsibleFacts),sendCmdSrvCmd("GET-CONF", getConfigVars),sendCmdSrvCmd("GET-IIAB-INI", procXsceIni)).done(initConfigVars),
    $.when(getLangCodes(),readKiwixCatalog(),sendCmdSrvCmd("GET-ZIM-STAT", procZimStatInit)).done(procZimCatalog),
    getOer2goStat(),
    initOsm(),
    getSpaceAvail(),
    getExternalDevInfo())
    .done(initDone)
    .fail(function () {
    	displayServerCommandStatus('<span style="color:red">Init Failed</span>');
    	consoleLog("Init failed");
    	})
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

function initDone ()
{
	if (initStat["error"] == false){
	  consoleLog("Init Finished Successfully");
	  displayServerCommandStatus('<span style="color:green">Init Finished Successfully</span>');
	  //selectedLangsDefaults(); // any installed or wip content plus default language
	  displaySpaceAvail(); // display on various panels
	  // now turn on navigation
	  navButtonsEvents();
	  //$('#initDataModal').modal('hide');
  } else {
    consoleLog("Init Failed");
    displayServerCommandStatus('<span style="color:red">Init Failed</span>');
    //$('#initDataModalResult').html("<b>There was an error on the Server.</b>");
  }
  initStat["active"] = false;
}

function waitDeferred(msec) {
    var deferredObject = $.Deferred();

    setTimeout(function() { deferredObject.resolve();  }, msec);

    return deferredObject.promise();
}
