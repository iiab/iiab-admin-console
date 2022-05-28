// content_functions.js
// copyright 2020 Tim Moody

var presetList = {};

// Install Content Functions

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
    if (lang in langGroups)
      lang = langGroups[lang]; // some locally generated zims use wrong code for EN and FR
    if (selectedLangs.indexOf(lang) == -1) // automatically select any language for which zim is installed
      selectedLangs.push (lang);
  }
  for (var id in installedZimCatalog['WIP']){
  	var zim = lookupZim(id);
    lang = zim.language;
    if (lang in langGroups)
      lang = langGroups[lang]; // some locally generated zims use wrong code for EN and FR
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

// Install Preset Functions

function installPresetInit(){
  $.when(getSpaceAvail(), getJobActiveSum(),getPresetList()).then(procPresetStorage);
}

function getPresetList(){
  if ($("#PresetList").html() != '') // only populate if empty
    // return;
    return $.Deferred().resolve().promise();
  var command = "GET-PRESET-LIST";
  var cmd_args = {};
  cmd = command + " " + JSON.stringify(cmd_args);
  return sendCmdSrvCmd(cmd, procPresetList);
}

function procPresetList(data){
  presetList = data;
  var html = '';
  checked = ' checked';

  for (var id in presetList){
    html += '<div class="radio">';
    html += '<label><input type="radio" name="content-preset" id="';
    html += id + '" value="' + id + '"' + checked + ' onchange="procPresetStorage()">';
    checked = '' // only first one
    html += '<b>' + presetList[id].name + '</b>: ' + presetList[id].description;
    html += '</label><div>';

    $("#PresetList").html(html);
  }
}

function procPresetStorage(){
  var internalSpace = calcLibraryDiskSpace(); // returns mix of str and number
  var allocatedSpace = calcAllocatedSpace();
  var presetId = $("#instConPresets input[type='radio']:checked").val()
  var presetSpace = presetList[presetId].size_in_gb * 1024 * 1024; // convert to k
  var warningStyle = '';
  var html = '';
	var availableSpace = Number(internalSpace.availableSpace);
	var usedSpace = Number(internalSpace.usedSpace);

  if (presetSpace / availableSpace > .85)
    warningStyle = 'style="color: darkorange;"';
  if (presetSpace > availableSpace)
    warningStyle = 'style="color: red;"';

  html += 'Storage for Preset: ';
  html += '<b><span ' + warningStyle + '>' + readableSize(presetSpace) + '</span</b>';

  $("#presetTotalDiskSpace").html('Total Storage: <b>' + readableSize(usedSpace + availableSpace) + '</b>');
  $("#presetAvailDiskSpace").html('Available Storage: <b>' + readableSize(availableSpace) + '</b>');
  $("#presetReqdDiskSpace").html(html);

}

function updatePresetSpace(cb){
  procPresetStorage();
}


function installPreset(presetId){
  var command = "INST-PRESETS";
  var cmd_args = {};
  cmd_args['preset_id'] = presetId;
  cmd = command + " " + JSON.stringify(cmd_args);
  return sendCmdSrvCmd(cmd, genericCmdHandler, "INST-CONTENT-PRESET");

}

// Manage Content Functions

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
	$.when(getDownloadList(), getOer2goStat(), getZimStat(), getExternalDevInfo(), getOsmVectStat())
	.done(renderZimInstalledList, renderOer2goInstalledList, renderExternalList, renderRegionList, refreshDiskSpace);
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
  .done(refreshAllContentPanels); // this is overkill, but hopefully not too heavy
  return true;
}

// Clone IIAB Image

function getIiabCloneStats(){
  getSpaceAvail ();
  getRemovableDevList();
}
function getRemovableDevList(){
  var command = "GET-REM-DEV-LIST";
    return sendCmdSrvCmd(command, procRemovableDevList, "FIND-REM-DEV");
  }

function procRemovableDevList(data){
  var html = "";
  removableDevices = {};
  var checked = 'checked';
  $.each(Object.keys(data).sort(), function(index, dev) {
    removableDevices[dev] = data[dev];
    html += instCloneServerDevicesHtml(dev, data[dev], checked);
    checked = '';
    });
  $("#instCloneServerDevices").html(html);
}

function instCloneServerDevicesHtml(dev, devSize, checked){
  var html = "";
  html += '<tr>';
  html += '<td><input type="radio" name="selRemDevice" value="' + dev + '"' + checked + '></td>';
  html += "<td>" + dev + "</td>";
  html += '<td style="text-align:right">' + readableSize(devSize/1024) + "</td>";

  html +=  '</tr>';
  return(html);
}

function copyDevImage(){
  var selectedDevice = $('input[name="selRemDevice"]:checked').val();

  if (selectedDevice == null){
    alert("No USB Device Selected.")
    return;
  }

  var destDevInK = removableDevices[selectedDevice]/1024;

  if (sysStorage.imageSizeInK > destDevInK){
    alert('USB Device is not large enough for a ' + readableSize(sysStorage.imageSizeInK) + ' image.')
    return;
  }

  var r = confirm("This will overwrite the target USB. Press OK to Continue.");
    if (r != true)
      return;

  var cmd = ""
  var cmd_args = {}

  cmd_args['dest_dev'] = selectedDevice;
  cmd = "COPY-DEV-IMAGE " + JSON.stringify(cmd_args);
  sendCmdSrvCmd(cmd, genericCmdHandler);
  alert ("Server image will be copied.\n\nPlease view Utilities->Display Job Status to see the results.");
  return true;
}
