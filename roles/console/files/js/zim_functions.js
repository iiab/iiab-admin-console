// zim_functions.js
// copyright 2018 Tim Moody

// Install Content functions are at around 750

  function instZim(zim_id)
  {
    zimsDownloading.push(zim_id);
    var command = "INST-ZIMS"
    var cmd_args = {}
    cmd_args['zim_id'] = zim_id;
    cmd = command + " " + JSON.stringify(cmd_args);
    sendCmdSrvCmd(cmd, genericCmdHandler, "", instZimError, cmd_args);
    return true;
  }

  function instZimError(data, cmd_args)
  {
    consoleLog(cmd_args);
    //cmdargs = JSON.parse(command);
    //consoleLog(cmdargs);
    consoleLog(cmd_args["zim_id"]);
    zimsDownloading.pop(cmd_args["zim_id"]);
    procZimGroups();
    return true;
  }

  function restartKiwix() // Restart Kiwix Server
  {
    var command = "RESTART-KIWIX";
    sendCmdSrvCmd(command, genericCmdHandler);
    alert ("Restarting Kiwix Server.");
    return true;
  }

  function reindexKiwix() // Restart Kiwix Server
  {
    var command = "MAKE-KIWIX-LIB";
    sendCmdSrvCmd(command, genericCmdHandler);
    alert ("Reindexing Kiwix Content.\n\nPlease view Utilities->Display Job Status to see the results.");
    return true;
  }

  function getKiwixCatalog() // Downloads kiwix catalog from kiwix
  {
    make_button_disabled("#KIWIX-LIB-REFRESH", true);
    // remove any selections as catalog may have changed
    selectedZims = [];

    var command = "GET-KIWIX-CAT";
    sendCmdSrvCmd(command, procKiwixCatalog, "KIWIX-LIB-REFRESH");
    return true;
  }

  function refreshZimStat(){
  	// Retrieve installed and wip zims and refresh screen
    // Remove any unprocessed selections
    selectedZims = [];

    $.when(getSpaceAvail(), getZimStat()).then(procDiskSpace);
    return true;
  }

  function getZimStat(){
    // return sendCmdSrvCmd("GET-ZIM-STAT", procZimStatInit);
    return sendCmdSrvCmd("GET-ZIM-STAT", procZimStat); // may cause display space calcs to be repeated
  }

  function procKiwixCatalog() {
    $.when(
      getZimStat(),
      readKiwixCatalog()
    )
    .done(function() {
      procZimCatalog();
      displaySpaceAvail();
    })
    .always(function() {
      alert ("Kiwix Catalog has been downloaded.");
      make_button_disabled("#KIWIX-LIB-REFRESH", false);
    })
  }

  function procZimStatInit(data) {
    installedZimCatalog = data;
    addZimStatAttr('INSTALLED');
    // addZimStatAttr('WIP'); - not used
  }

  function procZimStat(data) {
    installedZimCatalog = data;
    addZimStatAttr('INSTALLED');
    // addZimStatAttr('WIP'); - not used

    procZimCatalog();
    procDiskSpace();
  }

  function addZimStatAttr(section) {
  	var creatorToCategoryMap = {"University of Colorado":"Phet"}; // we are fudging category as it is not in kiwix catalog
    for (var id in installedZimCatalog[section]){                 // our fudge is not carried into local library.xml
    	var creator = installedZimCatalog[section][id]['creator'];
    	if (creator in creatorToCategoryMap)
    	  creator = creatorToCategoryMap[creator];

      installedZimCatalog[section][id]['category'] = creator; // best we can do
      installedZimCatalog[section][id]['sequence'] = 1; // put these first
      var permRef = installedZimCatalog[section][id]['path'];
      if (permRef.indexOf('/') != -1)
        permRef = permRef.split("/")[1]
      installedZimCatalog[section][id]['perma_ref'] = permRef;
    }
  }

function lookupZim(zimId) { // act as virtual merged zim catalog
	var zim = {"language":"eng", "title":"Unknown Zim"}; // minimal dummy zim

  if (zimId in installedZimCatalog['INSTALLED'])
  	zim = installedZimCatalog['INSTALLED'][zimId];
  else if	(zimId in kiwixCatalog)
  	zim = kiwixCatalog[zimId];
  else {
    for (var dev in externalDeviceContents){
    	if (zimId in externalDeviceContents[dev].zim_modules)
    	  zim = externalDeviceContents[dev].zim_modules[zimId];
    }
  }
  return zim;
}

function procZimGroups() {
  var html = "<br>";

  $.each(selectedLangs, function(index, lang) {
    //consoleLog(index);
    if (lang in zimGroups){
      //consoleLog (lang);
      html += "<h2>" + langCodes[lang]['locname'] + ' (' + langCodes[lang]['engname'] + ")</h2>";
      var catList = Object.keys(zimGroups[lang]);
	    catList.sort(zimCatCompare(lang));
      $.each(catList, function(index,category) {
    	  html += renderZimCategory(lang, category);
      });
    }
  });
  //consoleLog (html);
  $( "#ZimDownload" ).html(html);
  activateTooltip();
}

function renderZimCategory(lang, category) {

  var html = "<h3>" + category + "</h3>";
  var zimList = zimGroups[lang][category];
    if (lang == 'eng')
      consoleLog (category);
  html += renderZimList(zimList);
  return html;
}

function renderZimList(zimList, preChecked=true, onChangeFunc="updateZimDiskSpace") { //used by zim download
	var html = "";
	var zimCompare = zimListCompare(zimCatalog);

  zimList.sort(zimCompare);
  $.each(zimList, function(key, zimId) {
    html += genZimItem(zimId, zimCatalog[zimId], preChecked, onChangeFunc);
  });

  return html;
}

function renderZimInstalledList() { // used by manage content
	var html = "";
	// zimsInstalled is sorted when computed
	$.each( zimsInstalled, function( index, zimId ) {
	//$.each( installedZimCatalog.INSTALLED, function( zimId, zim ) {
    html += genZimItem(zimId, zimCatalog[zimId], preChecked=false, onChangeFunc="updateIntZimsSpace", noInstallStat = true);
  });

	$( "#installedZimModules" ).html(html);
	activateTooltip();
}

function renderExternalZimList() { // used by manage content
	var html = "";
  externalZimCatalog = externalDeviceContents[selectedUsb].zim_modules;
	var zimList = Object.keys(externalZimCatalog);
	var zimCompare = zimListCompare(externalZimCatalog);

  zimList.sort(zimCompare)
  $.each( zimList, function( index, zimId ) {
	  html += genZimItem(zimId, externalZimCatalog[zimId], preChecked=false, onChangeFunc="updateExtZimsSpace");
  });
	$( "#externalZimModules" ).html(html);
	activateTooltip();
}

//function genZimItem(zimId, zim, preChecked=true, onChangeFunc="updateZimDiskSpace", matchList=zimsInstalled, matchText=" - INSTALLED") {
function genZimItem(zimId, zim, preChecked=true, onChangeFunc="updateZimDiskSpace", noInstallStat = false, noUsbStat = false) {
  var html = "";
  var colorClass = "";
  var colorClass2 = "";
  var permaref = "";

  var zimStat = genZimStatus(zimId, noInstallStat, noUsbStat);
  //consoleLog (zimId, zimStat);
  colorClass = zimStat.colorClass;
  if (colorClass != "")
    colorClass2 = 'class="' + colorClass + '"';
  var zimStatHtml = zimStat.html;

  if (typeof zim.perma_ref !== 'undefined')
  	permaref = zim.perma_ref;
  else{
  	permaref = zim.path.split("/").pop();
  	permaref = permaref.substring(0, permaref.lastIndexOf("_"));
  }

  html += '<label ';
  html += '><input type="checkbox" name="' + zimId + '" zim_perma_ref="'+ zim.perma_ref + '"';
  //html += '><img src="images/' + zimId + '.png' + '"><input type="checkbox" name="' + zimId + '"';
  if (preChecked && zimStat.checkable) {
      html += ' disabled="disabled" checked="checked"';
  }
  html += ' onChange="' + onChangeFunc + '(this)"></label>'; // end input

  //var zimDesc = zim.title + ' (' + zim.description + ') [' + zim.perma_ref + ']';
  var zimDesc = zim.title + ' (' + permaref + ')';
  //html += '<span class="zim-desc ' + colorClass + '" >&nbsp;&nbsp;' + zimDesc + '</span>';

  var zimToolTip = genZimTooltip(zim);
  html += '<span class="zim-desc ' + colorClass + '"' + zimToolTip + '>&nbsp;&nbsp;' + zimDesc + '</span>';

  html += '<span ' + colorClass2 + 'style="display:inline-block; width:120px;"> Date: ' + zim.date + '</span>';
  html += '<span ' + colorClass2 +'> Size: ' + readableSize(zim.size);

  html += zimStatHtml;
  html += '</span><BR>';
  return html;
}

function genZimTooltip(zim) {
  var zimToolTip = ' data-toggle="tooltip" data-placement="top" data-html="true" ';
  zimToolTip += 'title="<h3>' + zim.title + '</h3>' + zim.description + '<BR>';
  zimToolTip += 'Articles: ' + Intl.NumberFormat().format(zim.articleCount) + '<BR>';
  zimToolTip += 'Media: ' + Intl.NumberFormat().format(zim.mediaCount) + '<BR>';
  if (typeof zim.download_url !== 'undefined')
  	zimToolTip += 'Download URL: ' + zim.download_url + '<BR>';
  else
  	zimToolTip += 'Path: ' + zim.path + '<BR>';

  zimToolTip += 'With:<ul>';
  zimToolTip += zim.has_embedded_index ? '<li>Internal Full Text Index</li>' : '';
  zimToolTip += zim.has_video ? '<li>Videos</li>' : '';
  zimToolTip += zim.has_pictures ? '<li>Images</li>' : '';
  zimToolTip += zim.has_details ? '<li>Complete Articles</li>' : '';
  //zimToolTip += '<table><tr><td>Full Text Index</td><td>' + zim.has_video ? "&#10003;" : "X";
  //zimToolTip += '</li></ul></b>"'
  zimToolTip += '</ul></b>"'
  //zimToolTip += 'title="<em><b>' + zim.description + '</b><BR>some more text that is rather long"';
  return zimToolTip;
}

function genZimStatus(zimId, noInstallStat, noUsbStat){
	var zimStat = {};
	var html = "";
	var colorClass = "";
	var checkable = false;
	var action = "";

	if (!noInstallStat && zimId in installedZimCatalog['INSTALLED']){
	  html = " - INSTALLED";
	  colorClass = "installed";
	  checkable = true;
	}
  else if (zimId in installedZimCatalog['WIP']){
  	action = installedZimCatalog['WIP'][zimId].action;
  	switch(action) {
      case "DOWNLOAD":
        html = " - DOWNLOADING";
  	    colorClass = "scheduled";
  	    checkable = true;
        break;
      case "IMPORT":
        html = " - COPYING";
  	    colorClass = "scheduled";
  	    checkable = true;
        break;
      case "EXPORT":
        html = " - COPYING to USB";
  	    colorClass = "backed-up";
  	    checkable = true;
        break;

    }
  }
	else	if (!noUsbStat && (zimsExternal.indexOf(zimId) >= 0)){
	  html = " - ON USB";
	  colorClass = "backed-up";
	}

	zimStat['html'] = html;
	zimStat['colorClass'] = colorClass;
	zimStat['checkable'] = checkable;
  return zimStat;
}

function zimCatCompare(lang) {
    return function(a, b) {
    // Compare function to sort list of zim categories by priority
    var aPriority = zimCategories[lang][a];
    var bPriority = zimCategories[lang][b];

    if (aPriority == bPriority)
      if (a == b)
        return 0;
      else if (a < b)
      	return -1;
      else
        return 1;
    else if (aPriority < bPriority)
      return -1;
    else
      return 1;
  }
}

function zimListCompare(catalog) {
	// Compare function to sort list of zims by name, date, sequence
  return function(a, b) {
    var zimA = catalog[a];
    var zimB = catalog[b];
    if (zimA.title == zimB.title)
      if (zimA.date == zimB.date)
        if (zimA.sequence == zimB.sequence)
          return 0;
        else if (zimA.sequence < zimB.sequence)
        	return -1;
        else
        	return 1;
      else if (zimA.date < zimB.date)
      	return -1;
      else
        return 1;
    else if (zimA.title < zimB.title)
      return -1;
    else
      return 1;
  }
}

function readKiwixCatalog() { // Reads kiwix catalog from file system as json
  //consoleLog ("in readKiwixCatalog");
  //consoleLog ('ran sendCmdSrvCmd');
  //if (asyncFlag === undefined) asyncFlag = false;

  var resp = $.ajax({
    type: 'GET',
    url: consoleJsonDir + 'kiwix_catalog.json',
    dataType: 'json'
  })
  .done(function( data ) {
  	kiwixCatalogDate = Date.parse(data['download_date']);
  	kiwixCatalog = data['zims'];
    //consoleLog(kiwixCatalog);
  })
  .fail(jsonErrhandler);

  return resp;
}

function checkKiwixCatalogDate() {
	today = new Date();
	if (today - kiwixCatalogDate > 30 * dayInMs){
		alert ("Kiwix Catalog is Older than 30 days.\n\nPlease click Refresh Kiwix Catalog in the menu.");
	}
}

function procZimCatalog() {
  // Uses installedZimCatalog, kiwixCatalog, langCodes, and langGroups
  // Calculates zimCatalog, zimGroups, langNames, zimsInstalled, zimsDownloading

  zimCatalog = {};
  zimGroups = {};
  zimLangs = [];

  // Add to zimCatalog

  procOneCatalog(installedZimCatalog['INSTALLED'],0); // pass priority for sorting categories
  procOneCatalog(installedZimCatalog['WIP',0]);
  procOneCatalog(kiwixCatalog,1);

  // Create working arrays of installed and wip
  procZimWorkingLists();

  // sort installed zims by name for manage content
  var zimCompare = zimListCompare(zimCatalog);
  zimsInstalled.sort(zimCompare);

  if (selectedLangs.length == 0)
  selectedLangs.push (defaultLang); // default

  sortZimLangs(); // Create langNames from zimLangs and sort
  procContentLangs(); // Create language menu
  procZimGroups(); // Create zim list for selected languages

  return true;
}

function procZimWorkingLists() {
  zimsInstalled = [];
  zimsDownloading = [];
  zimsCopying = [];

  for (var arrayName in installedZimCatalog){
    for (var id in installedZimCatalog[arrayName]){
    	switch(arrayName) {
      case 'INSTALLED':
          zimsInstalled.push(id);
          break;
      case 'DOWNLOADING':
          zimsDownloading.push(id);
          break;
      case 'COPYING':
          zimsCopying.push(id);
          break;
      }

      var lang = installedZimCatalog[arrayName][id]['language'];
      if (selectedLangs.indexOf(lang) == -1) // automatically select any language for which zim is installed
        selectedLangs.push (lang);
    }
  }
}

function procOneCatalog(catalog, priority){
	  if ($.isEmptyObject(catalog)){
      consoleLog("procOneCatalog found empty data");
      displayServerCommandStatus ("procOneCatalog found empty data")
      return;
    }
  else {
  //if (Object.keys(catalog).length > 0){
    for (var id in catalog) {
      var lang = catalog[id].language;
      if (lang in langGroups)
      lang = langGroups[lang]; // group synomyms like en/eng

      //var cat = catalog[id].creator;
      var cat = catalog[id].category;

      if (!(lang in zimGroups)){
        var cats = {};
        cats[cat] = [];
        zimGroups[lang] = cats;
      }

      // create data structure to sort categories
      if (!(lang in zimCategories))
        zimCategories[lang] = {};
      //if (zimCategories[lang].indexOf(priority) == -1)
      if (!(cat in zimCategories[lang] ))
        zimCategories[lang][cat] = priority;

      if (!(cat in zimGroups[lang]))
      zimGroups[lang][cat] = [];

      if (zimGroups[lang][cat].indexOf(id) == -1)
      zimGroups[lang][cat].push (id);

      zimCatalog[id] = catalog[id]; // add to working catalog
      if (zimLangs.indexOf(lang) == -1)
      zimLangs.push(lang);
    }
  }
}

function sortZimLangs(){
  langNames = [];
  for (var i in zimLangs){
    if (langCodes[zimLangs[i]] === undefined){ // for now ignore languages we don't know
      consoleLog('Language code ' + zimLangs[i] + ' not in langCodes.');
      continue;
    }
    var attr = {};
    attr.locname = langCodes[zimLangs[i]]['locname'];
    attr.code = zimLangs[i];
    attr.engname = langCodes[zimLangs[i]]['engname'];
    langNames.push(attr);
  }
  langNames = langNames.sort(function(a,b){
    if (a.locname < b.locname) return -1;
    else return 1;
    });
}
