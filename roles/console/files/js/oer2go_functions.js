// oer2go_functions.js
// copyright 2018 Tim Moody

// to do
// remove phet, OER2GO from whitelist

// $("#installContentOptions .tab-pane.active").attr("id"); to get active option (between zim and oer
// requires id on <div id="installContentOptions" class="tab-content"> <!-- Start Container for Sub Menu Options Panes -->
// Install Content functions are at around 750

function getOer2goCatalog(){ // Downloads OER2GO catalog from RACHEL
  //make_button_disabled("#OER2GO-CAT-REFRESH", true);
  // remove any selections as catalog may have changed
  // selectedOer2goItems = []; // we already assume that items never disappear from oer2go catalog

  var command = "GET-OER2GO-CAT";
  sendCmdSrvCmd(command, procOer2goCatalog, "OER2GO-CAT-REFRESH");
  return true;
}

function procOer2goCatalog() {
	$.when(getOer2goStat())
    .done(function() {
      // renderOer2goCatalog(); - done by getOer2goStat
      displaySpaceAvail();
    })
    .always(function() {
      alert ("OER2GO Catalog has been downloaded.");
      //make_button_disabled("#OER2GO-CAT-REFRESH", false);
    })
}

function oer2goMenuOption (){
	getOer2goStat();
	today = new Date(); // in case is stale
  if (today - oer2goCatalogDate > 30 * dayInMs){
		alert ("OER2GO Catalog is Older than 30 days.\n\nPlease click Refresh OER2GO Catalog in the menu.");
	}
}

function getOer2goStat(){
	$.when(readOer2goCatalog(),
	       sendCmdSrvCmd("GET-OER2GO-STAT", procOer2goStat))
	.then(renderOer2goCatalog);
}

function readOer2goCatalog(){
	//consoleLog ("in readOer2goCatalog");
  //consoleLog ('ran sendCmdSrvCmd');
  //if (asyncFlag === undefined) asyncFlag = false;

  var resp = $.ajax({
    type: 'GET',
    url: consoleJsonDir + 'oer2go_catalog.json',
    dataType: 'json'
  })
  .done(function( data ) {
  	oer2goCatalogDate = Date.parse(data['download_date']);
  	oer2goCatalog = data['modules'];
    //consoleLog(oer2goCatalog);
  })
  .fail(jsonErrhandler);

  return resp;
}

function procOer2goStat(data) {
	//consoleLog(data);
	oer2goInstalled = data['INSTALLED']
	oer2goScheduled = data['WIP']
}

function renderOer2goCatalog() {
  //var langSelectedCodes = []; // working lookup of 2 char codes
  var selectedLangsOer2goMods = {};  // working lists of oer2go mods for each selected lang

  //consoleLog("starting selectedLangs.forEach");

  // make sure langs are selected for

  selectedLangs.forEach((lang, index) => {
    //console.log(lang);
    //langSelectedCodes.push(langCodes[lang].iso2); // ? not needed
    selectedLangsOer2goMods[langCodes[lang].iso2] = [];
  });

  //consoleLog("starting for (var item in oer2goCatalog)");
  for (var item in oer2goCatalog) { // create lists of modules belonging to selected langs
    var lang = oer2goCatalog[item].lang;
    var moddir = oer2goCatalog[item].moddir;
    //console.log(item);
    //console.log(lang);
    if (lang in selectedLangsOer2goMods) {
    	if (oer2goCatalogFilter.indexOf(oer2goCatalog[item].type) >= 0) // don't add zims and other items handled by other providers
    	  selectedLangsOer2goMods[lang].push(moddir);
    }
  }

  //consoleLog("starting selectedLangs.forEach");
  var html = "<BR>";
  selectedLangs.forEach((lang, index) => { // now render the html
  	var iso2 = langCodes[lang].iso2;
  	//console.log(lang, iso2);
  	if (iso2 in selectedLangsOer2goMods)
  	  html += renderOer2goItems(lang, selectedLangsOer2goMods[iso2]);
  	  //console.log(html);
  });

  $( "#Oer2goDownload" ).html(html);
  activateTooltip();
}

function renderOer2goInstalledList() { // used by remove content
	var html = "";
	html = renderOer2goList(oer2goInstalled, preChecked=false, onChangeFunc="updateIntOer2goSpace");
	$( "#installedOer2goModules" ).html(html);
	activateTooltip();
}

function renderexternalOer2goModules() {
	var html = "";

	if (calcExtUsb){
	  html = renderOer2goList(externalDeviceContents[selectedUsb].oer2go_modules, preChecked=false, onChangeFunc="updateExtOer2goSpace");
    $( "#externalOer2goModules" ).html(html);
	  activateTooltip();
  }
}

function renderOer2goItems(lang, mods) { //used by oer2go download
	var html = "";
	// lang header
	html += "<h2>" + langCodes[lang]['locname'] + ' (' + langCodes[lang]['engname'] + ")</h2>";
	html += renderOer2goList(mods, preChecked=true, onChangeFunc="updateOer2goDiskSpace");
	return html;
}

function renderOer2goList(mods, preChecked, onChangeFunc) {
	var html = "";

	// sort mods
  //console.log(mods);
  mods = mods.sort(function(a,b){
    if (oer2goCatalog[a].title < oer2goCatalog[b].title) return -1;
    else return 1;
    });
	// render each mod
	mods.forEach((mod, index) => { // now render the html
  	//console.log(mod);
  	var item = oer2goCatalog[mod];
  	//html += oer2goCatalog[mod].title + "<BR>";
  	html += renderOer2goItem(item, preChecked, onChangeFunc);
  });

	return html;
}

function renderOer2goItem(item, preChecked, onChangeFunc) {

  var html = "";
  var colorClass = "";
  var colorClass2 = "";
  //console.log(item);
  var itemId = item.moddir;

  if (oer2goInstalled.indexOf(itemId) >= 0){
    colorClass = "installed";
    colorClass2 = 'class="installed"';
  }
  if (oer2goScheduled.indexOf(itemId) >= 0){
    colorClass = "scheduled";
    colorClass2 = 'class="scheduled"';
  }
  html += '<label ';
  html += '><input type="checkbox" name="' + itemId + '"';
  //html += '><img src="images/' + zimId + '.png' + '"><input type="checkbox" name="' + zimId + '"';
  if (preChecked) {
    if ((oer2goInstalled.indexOf(itemId) >= 0) || (oer2goScheduled.indexOf(itemId) >= 0))
      html += ' disabled="disabled" checked="checked"';
    if (selectedOer2goItems.indexOf(itemId) >= 0)
      html += ' checked="checked"';
  }
  html += ' onChange="' + onChangeFunc + '(this)"></label>'; // end input

  var itemDesc = item.title + ': ' +item.description;
  var oer2goToolTip = genOer2goToolTip(item);
  html += '<span class="zim-desc ' + colorClass + '"' + oer2goToolTip + '>&nbsp;&nbsp;' + itemDesc + '</span>';

  html += '<span ' + colorClass2 + ' style="display:inline-block; width:120px;"> Size: ' + readableSize(item.ksize) + '</span>';
  if (oer2goInstalled.indexOf(itemId) >= 0)
    html += '<span class="' + colorClass + '">INSTALLED';
  else if (oer2goScheduled.indexOf(itemId) >= 0)
    html += '<span class="' + colorClass + '">WORKING ON IT';
  else
  	html += '<span> <a href="' + item.index_mod_sample_url + '" target="_blank">Sample</a>';
  html += '</span><BR>';

  return html;
}

function genOer2goToolTip(item) {
	// quick fix as there could be other needs to escape
	var desc = item.description.replace(/"/g, '&quot;')

  var oer2goToolTip = ' data-toggle="tooltip" data-placement="auto top" data-html="true" ';
  oer2goToolTip += 'title="<h3>' + item.title + '</h3>' + desc + '<BR><BR>';
  oer2goToolTip += 'Language: ' + item.lang + '<BR>';
  oer2goToolTip += 'Category: ' + item.category + '<BR>';
  oer2goToolTip += 'Age Range: ' + item.age_range + '<BR>';
  oer2goToolTip += 'Rating: ' + item.rating + '<BR>';
  oer2goToolTip += 'Version: ' + item.version + '<BR>';
  oer2goToolTip += 'Size: ' + readableSize(item.ksize) + '<BR>';
  oer2goToolTip += 'Number of Files: ' + item.file_count + '<BR><BR>';

  oer2goToolTip += '"'
  return oer2goToolTip;
}

function instOer2goItem(mod_id) {
  var command = "INST-OER2GO-MOD"
  var cmd_args = {}
  cmd_args['moddir'] = mod_id;
  cmd = command + " " + JSON.stringify(cmd_args);
  sendCmdSrvCmd(cmd, genericCmdHandler);
  oer2goScheduled.push(mod_id);
  renderOer2goCatalog();
  return true;
}

function updateOer2goDiskSpace(cb){
  var mod_id = cb.name
  updateOer2goDiskSpaceUtil(mod_id, cb.checked);
}

function updateOer2goDiskSpaceUtil(mod_id, checked){
  var mod = oer2goCatalog[mod_id]
  var size =  parseInt(mod.ksize);

  var modIdx = selectedOer2goItems.indexOf(mod_id);

  if (checked){
    if (oer2goInstalled.indexOf(mod_id) == -1){ // only update if not already installed mods
      sysStorage.oer2go_selected_size += size;
      selectedOer2goItems.push(mod_id);
    }
  }
  else {
    if (modIdx != -1){
      sysStorage.oer2go_selected_size -= size;
      selectedOer2goItems.splice(mod_id, 1);
    }
  }

  displaySpaceAvail();
}
