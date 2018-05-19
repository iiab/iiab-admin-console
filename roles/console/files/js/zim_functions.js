// zim_functions.js
// copyright 2018 Tim Moody

// Install Content functions are at around 750

  function instZim(zim_id)
  {
    zimsScheduled.push(zim_id);
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
    zimsScheduled.pop(cmd_args["zim_id"]);
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
    addZimStatAttr('WIP');
  }

  function procZimStat(data) {
    installedZimCatalog = data;
    addZimStatAttr('INSTALLED');
    addZimStatAttr('WIP');

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

function renderZimInstalledList() { // used by remove content
	var html = "";
	$.each( zimsInstalled, function( index, zimId ) {
	//$.each( installedZimCatalog.INSTALLED, function( zimId, zim ) {
    html += genZimItem(zimId , preChecked=false, onChangeFunc="nop");
  });

	$( "#installedZimModules" ).html(html);
	activateTooltip();
}

function renderZimList(zimList, preChecked=true, onChangeFunc="updateZimDiskSpace") { //used by zim download
	var html = "";
  zimList.sort(zimCompare);

  $.each(zimList, function(key, zimId) {
    html += genZimItem(zimId , preChecked=true, onChangeFunc="updateZimDiskSpace");
  });

  return html;
}

function genZimItem(zimId , preChecked=true, onChangeFunc="updateZimDiskSpace") {
  var zim = zimCatalog[zimId];
  var html = "";
  var colorClass = "";
  var colorClass2 = "";
  if (zimsInstalled.indexOf(zimId) >= 0){
    colorClass = "installed";
    colorClass2 = 'class="installed"';
  }
  if (zimsScheduled.indexOf(zimId) >= 0){
    colorClass = "scheduled";
    colorClass2 = 'class="scheduled"';
  }
  html += '<label ';
  html += '><input type="checkbox" name="' + zimId + '"';
  //html += '><img src="images/' + zimId + '.png' + '"><input type="checkbox" name="' + zimId + '"';
  if (preChecked) {
    if ((zimsInstalled.indexOf(zimId) >= 0) || (zimsScheduled.indexOf(zimId) >= 0))
      html += ' disabled="disabled" checked="checked"';
  }
  html += ' onChange="' + onChangeFunc + '(this)"></label>'; // end input

  //var zimDesc = zim.title + ' (' + zim.description + ') [' + zim.perma_ref + ']';
  var zimDesc = zim.title + ' (' + zim.perma_ref + ')';
  //html += '<span class="zim-desc ' + colorClass + '" >&nbsp;&nbsp;' + zimDesc + '</span>';

  var zimToolTip = genZimTooltip(zim);
  html += '<span class="zim-desc ' + colorClass + '"' + zimToolTip + '>&nbsp;&nbsp;' + zimDesc + '</span>';

  html += '<span ' + colorClass2 + 'style="display:inline-block; width:120px;"> Date: ' + zim.date + '</span>';
  html += '<span ' + colorClass2 +'> Size: ' + readableSize(zim.size);
  if (zimsInstalled.indexOf(zimId) >= 0)
  html += ' - INSTALLED';
  if (zimsScheduled.indexOf(zimId) >= 0)
  html += ' - WORKING ON IT';
  html += '</span><BR>';
  return html;
}

function genZimTooltip(zim) {
  var zimToolTip = ' data-toggle="tooltip" data-placement="top" data-html="true" ';
  zimToolTip += 'title="<h3>' + zim.title + '</h3>' + zim.description + '<BR>';
  zimToolTip += 'Articles: ' + Intl.NumberFormat().format(zim.articleCount) + '<BR>';
  zimToolTip += 'Media: ' + Intl.NumberFormat().format(zim.mediaCount) + '<BR>';
  zimToolTip += 'Download URL: ' + zim.download_url + '<BR>';
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

function zimCompare(a,b) {
  // Compare function to sort list of zims by name, date, sequence
  var zimA = zimCatalog[a];
  var zimB = zimCatalog[b];
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
  // Calculates zimCatalog, zimGroups, langNames, zimsInstalled, zimsScheduled

  zimCatalog = {};
  zimGroups = {};
  zimLangs = [];

  // Add to zimCatalog

  procOneCatalog(installedZimCatalog['INSTALLED'],0); // pass priority for sorting categories
  procOneCatalog(installedZimCatalog['WIP',0]);
  procOneCatalog(kiwixCatalog,1);

  // Create working arrays of installed and wip
  zimsInstalled = [];
  zimsScheduled = [];

  for (var id in installedZimCatalog['INSTALLED']){
    zimsInstalled.push(id);
    lang = installedZimCatalog['INSTALLED'][id]['language'];
    if (selectedLangs.indexOf(lang) == -1) // automatically select any language for which zim is installed
    selectedLangs.push (lang);
  }
  // sort installed zims by name for remove menu item
  zimsInstalled.sort(zimCompare);

  for (var id in installedZimCatalog['WIP']){
    zimsScheduled.push(id);
    lang = installedZimCatalog['WIP'][id]['language'];
    if (selectedLangs.indexOf(lang) == -1) // automatically select any language for which zim is being installed
    selectedLangs.push (lang);
  }

  if (selectedLangs.length == 0)
  selectedLangs.push (defaultLang); // default

  sortZimLangs(); // Create langNames from zimLangs and sort
  procContentLangs(); // Create language menu
  procZimGroups(); // Create zim list for selected languages

  return true;
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
