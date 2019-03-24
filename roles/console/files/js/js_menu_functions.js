// js_menu_functions.js
// copyright 2019 Tim Moody

var jsMenuUrl = "/js-menu";
var jsMenuImageUrl = "/js-menu/menu-files/images/";
var jsMenuItemDefUrl = "/js-menu/menu-files/menu-defs/";
var currentJsMenuToEdit = {};
var menuItemDefList = [];
var menuItemDefs = {};
menuItemDefs['call_count'] = null; // mark as not downloaded
var menuItemDefPrefixes = {"all" : "all-items", "current" : "current-items", "select" : "select-items"};
var homeMenuLoaded = false;
var menuItemDragSrcElement = null;
var menuItemDragSrcParent = null;
var menuItemDragDuplicate = null;
var menuItemEditMode = 'edit';
var jsMenuTypeTargets =
  {
    "zim" : "zim_name",
    "html" : "moddir",
    "webroot" : "moddir",
    //"kalite"  : "",
    //"kolibri"  : "",
    //"cups"  : "",
    //"nodered"  : "",
    //"calibre"  : "",
    //"calibreweb"  : "",
    //"osm"  : "",
    //"info"  : "",
    "download"  : "download_folder"
  };
// var targetTypes = ['zim', 'html', 'webroot', 'download']

function getMenuItemDefLists(){
	var resp = getMenuItemDefList();
	if (!homeMenuLoaded) {
		getContentMenuToEdit('home'); // load home menu on first run
		//homeMenuLoaded = true;
	}
	return resp;
}

function getMenuItemDefList(){
	return sendCmdSrvCmd("GET-MENU-ITEM-DEF-LIST", procMenuItemDefList);
}

function procMenuItemDefList (data){
	var html = "";
	menuItemDefList = data;
	html = createMenuItemScaffold(menuItemDefList, menuItemDefPrefixes.all);
	$("#menusDefineMenuAllItemList").html(html);
	menuItemDefs['call_count'] = 0; // ready to download
	for (var i = 0; i < menuItemDefList.length; i++) {
		getMenuItemDef(menuItemDefList[i], menuItemDefPrefixes.all)
	}
}

function getContentMenuToEdit(currentJsMenuToEditUrl){ // passed by button click from form
	  var jsMenuToEditUrl = '/' + currentJsMenuToEditUrl + '/';
		var resp = $.ajax({
		type: 'GET',
		async: true,
		url: jsMenuToEditUrl + 'menu.json',
		dataType: 'json'
	})
	.done(function( data ) {
		currentJsMenuToEdit = data;
		// don't allow blank list of menu item defs
		if (!Array.isArray(currentJsMenuToEdit.menu_items_1) || !currentJsMenuToEdit.menu_items_1.length)
		  currentJsMenuToEdit.menu_items_1 = ['en-credits'];
		setContentMenuToEditFormValues();
    if (homeMenuLoaded)
      delayedProcCurrentMenuItemDefList (5000, currentJsMenuToEdit.menu_items_1, menuItemDefPrefixes.current); // hard coded name
    else { // the first time we let the all menu item list completion draw the current menu
      var html = createMenuItemScaffold(currentJsMenuToEdit.menu_items_1, menuItemDefPrefixes.current);
	    $("#menusDefineMenuCurrentItemList").html(html);
      homeMenuLoaded = true;
    }
	})
	.fail(function (jqXHR, textStatus, errorThrown){
		if (errorThrown == 'Not Found'){
		  currentJsMenuToEdit = {};
		  procCurrentMenuItemDefList ([], menuItemDefPrefixes.current);
		  alert ('Content Menu not Found.');
		}
		else
		  jsonErrhandler (jqXHR, textStatus, errorThrown); // probably a json error
	});
	return resp;
}

function saveContentMenuDef() {
    var command = "SAVE-MENU-DEF";
    var cmd_args = {};
    var menu_url = gEBI('content_menu_url').value;
    if (menu_url.includes('.') || menu_url.includes('/')){
    	alert ("Menu Folder must not include '.' or '/'");
    	return false;
    }
    getContentMenuToEditFormValues ();
    if (!Array.isArray(currentJsMenuToEdit.menu_items_1) || !currentJsMenuToEdit.menu_items_1.length){
    	alert ("List of Menu Items is empty. Load before Saving.");
    	return false;
    }
    cmd_args['menu_url'] = menu_url;
    cmd_args['menu_def'] = currentJsMenuToEdit;
    cmd = command + " " + JSON.stringify(cmd_args);
    sendCmdSrvCmd(cmd, genericCmdHandler);
    alert ("Saving Content Menu Definition.");
    return true;
  }

function setContentMenuToEditFormValues (){
  setContentMenuToEditFormValue('mobile_header_font');
  setContentMenuToEditFormChecked('mobile_incl_description');
  setContentMenuToEditFormChecked('mobile_incl_extra_description');
  setContentMenuToEditFormChecked('mobile_incl_extra_html');
  setContentMenuToEditFormChecked('mobile_incl_footnote');
  setContentMenuToEditFormValue('desktop_header_font');
  setContentMenuToEditFormChecked('desktop_incl_description');
  setContentMenuToEditFormChecked('desktop_incl_extra_description');
  setContentMenuToEditFormChecked('desktop_incl_extra_html');
  setContentMenuToEditFormChecked('desktop_incl_footnote');
  setContentMenuToEditFormValue('menu_lang', 'js_menu_lang');
  setContentMenuToEditFormChecked('autoupdate_menu');
  setContentMenuToEditFormChecked('allow_kiwix_search');
  setContentMenuToEditFormChecked('allow_poweroff');
  setContentMenuToEditFormValue('poweroff_prompt');
}

function setContentMenuToEditFormValue (fieldName, screenName='') {
  if (screenName == '')
	  screenName = fieldName;
  gEBI(screenName).value = currentJsMenuToEdit[fieldName];
}

function setContentMenuToEditFormChecked (fieldName, screenName='') {
	if (screenName == '')
	  screenName = fieldName;
  gEBI(fieldName).checked = currentJsMenuToEdit[screenName];
}

function getContentMenuToEditFormValues (){
  getContentMenuToEditFormValue('mobile_header_font');
  getContentMenuToEditFormChecked('mobile_incl_description');
  getContentMenuToEditFormChecked('mobile_incl_extra_description');
  getContentMenuToEditFormChecked('mobile_incl_extra_html');
  getContentMenuToEditFormChecked('mobile_incl_footnote');
  getContentMenuToEditFormValue('desktop_header_font');
  getContentMenuToEditFormChecked('desktop_incl_description');
  getContentMenuToEditFormChecked('desktop_incl_extra_description');
  getContentMenuToEditFormChecked('desktop_incl_extra_html');
  getContentMenuToEditFormChecked('desktop_incl_footnote');
  getContentMenuToEditFormValue('menu_lang', 'js_menu_lang');
  getContentMenuToEditFormChecked('autoupdate_menu');
  getContentMenuToEditFormChecked('allow_kiwix_search');
  getContentMenuToEditFormChecked('allow_poweroff');
  getContentMenuToEditFormValue('poweroff_prompt');

  getContentMenuToEditItemList ();
}

function getContentMenuToEditFormValue (fieldName, screenName='') {
	if (screenName == '')
	  screenName = fieldName;
  currentJsMenuToEdit[fieldName] = gEBI(screenName).value;
}

function getContentMenuToEditFormChecked (fieldName, screenName='') {
	if (screenName == '')
	  screenName = fieldName;
  currentJsMenuToEdit[fieldName] = gEBI(screenName).checked;
}

function getContentMenuToEditItemList () {
	var menuItemList = [];
  $("#menusDefineMenuCurrentItemList .content-item").each(function() {
  	//consoleLog($(this).attr('menu_item_name'));
  	menuItemList.push($(this).attr('menu_item_name'));
  });
  currentJsMenuToEdit.menu_items_1 = menuItemList;
}

function drawMenuItemSelectList () { // for selecting menu item to edit definition
  var prefix = menuItemDefPrefixes.select;
  var list = currentJsMenuToEdit.menu_items_1; // hard coded name

  var html = createMenuItemScaffold(list, prefix, draggable = false);
	$("#menusEditMenuItemSelectList").html(html);

	for (var i = 0; i < list.length; i++) {
    drawMenuItemSelectListItem (list[i], prefix);
	}
  $('#menusEditMenuItemSelectList').on('click', '.btnEdit' ,function (event) {
    handleEditMenuItemClick($(this).attr('menu_item_name'), 'edit');
    //consoleLog($(this));
  });

  $('#menusEditMenuItemSelectList').on('click', '.btnCopy' ,function (event) {
    handleEditMenuItemClick($(this).attr('menu_item_name'), 'copy');
    //consoleLog($(this));
  });
}

function drawMenuItemSelectListItem (menuItemName, prefix) {
	var html = '<button type="button" style="margin-left: 5px;" class="btn btn-primary btnEdit" menu_item_name="' + menuItemName + '">Edit</button>';
  //html += '<button type="button" style="margin-left: 5px;" class="btn btn-primary btnCopy" menu_item_name="' + menuItemName + '">Copy</button>';

  html += '<span style="width: 10em; margin-left: 10px; padding-top: 6px;">' + menuItemName + '</span>';
  html += genMenuItemHtml(menuItemName);
  $("#" + prefix + '-' + menuItemName).html(html);
}

function delayedProcCurrentMenuItemDefList (timeout, list, prefix){
	if (menuItemDefs.call_count == 0)
	  procCurrentMenuItemDefList (list, prefix);
	else {
		timeout -= 100;
		if (timeout > 0)
		  window.setTimeout(function(){ delayedProcCurrentMenuItemDefList (timeout, list, prefix)});
		else
			alert ("Unable to Load Menu. Waiting for All Menu Item Definitions to Load. Please try again.");
	}
}

// assumes all menu item definitions have been loaded
function procCurrentMenuItemDefList (list, prefix){
	procCurrentMenuUpdateSelectedLangs(list); // list assumed to be current menu
	var html = createMenuItemScaffold(list, prefix);
	$("#menusDefineMenuCurrentItemList").html(html);
  drawMenuItemDefList (list, prefix);
}

function procCurrentMenuUpdateSelectedLangs (list) { // automatically select any language in menu
	if (menuItemDefs.call_count == 0) {
		for (var i = 0; i < list.length; i++) {
		var menu_item_name = list[i];
		try {
		  var lang = langCodesXRef[menuItemDefs[menu_item_name].lang];
		}
		catch (e){
			lang = 'eng';
		}

    if (selectedLangs.indexOf(lang) == -1) // automatically select any language for which oer2go item is installed
      selectedLangs.push(lang);
    }
  }
}

function redrawAllMenuItemList() {
  // createMenuItemScaffold(menuItemDefList, menuItemDefPrefixes.all); - not needed as done for all items initially
  drawMenuItemDefList(menuItemDefList, menuItemDefPrefixes.all);
}

function drawMenuItemDefList (list, prefix){
	for (var i = 0; i < list.length; i++) {
		drawMenuItemDef(list[i], prefix)
  }
  activateTooltip();
}

function drawMenuItemDef (menuItemName, prefix){
	var divId = prefix + '-' + menuItemName;
		if (menuItemDefs.hasOwnProperty(menuItemName))
  		genMenuItem(divId, menuItemName);
}

function createMenuItemScaffold(list, prefix, draggable = true){
  var html = "";
  for (var i = 0; i < list.length; i++) {
  	var menu_item_name = list[i];
  	html += '<div id="' + prefix + '-' + menu_item_name + '" dir="auto" class="flex-row content-item';
  	if (draggable)
  	  html += ' draggable-content-item" draggable="true'
  	html += '" menu_item_name="' + menu_item_name + '">&emsp;Attempting to load ' + menu_item_name + ' </div>';
  }
  return html;
}

function getMenuItemDef(menuItem, prefix) {
	var divId = prefix + '-' + menuItem;
	menuItemDefs['call_count'] += 1;

	var resp = $.ajax({
		type: 'GET',
		async: true,
		url: jsMenuItemDefUrl + menuItem + '.json',
		dataType: 'json'
	})
	.done(function( data ) {
		menuItemDefs[menuItem] = data;
		genMenuItem(divId, menuItem);
		checkMenuDone();
	})
	.fail(function (jqXHR, textStatus, errorThrown){
		var menuHtml = '<div class="content-item" style="padding:10px; color: red; font-size: 1.5em">' + menuItem + ' - file not found or improperly formatted</div>';
		$("#" + divId).html(menuHtml);
		checkMenuDone();
		jsonErrhandler (jqXHR, textStatus, errorThrown); // probably a json error
	});
	return resp;
}

function genMenuItem(divId, menuItemName) {
  var menuHtml = "";
	var langClass = "";
	var menuItemDivId = "#" + divId;
	var module = menuItemDefs[menuItemName];

	var langLookup = langCodesXRef[module.lang];

  if (selectedLangs.length > 0 && selectedLangs.indexOf(langLookup) == -1) { // not a selected language
		$(menuItemDivId).hide();
		return;
	}
	var menuHtml = genMenuItemHtml(menuItemName);

	$("#" + divId).html(menuHtml);
	menuItemAddDnDHandlers($("#" + divId).get(0));
	$("#" + divId).show();
}

function genMenuItemHtml(menuItemName) {
  var menuHtml = "";
  var module = menuItemDefs[menuItemName];
  var menuItemToolTip = genMenuItemTooltip(menuItemName, module);
	menuHtml+='<div class="content-icon"' + menuItemToolTip + '>';
	menuHtml+='<img src="' + jsMenuImageUrl + module.logo_url + '">';
	menuHtml+='</div>';
	// item right side
	menuHtml+='<div class="flex-col">';
	menuHtml+='<div class="content-cell">';
	// title
	menuHtml+='<div class="content-item-title">';
	menuHtml+=module.title;
	menuHtml+='</div>'; // end content-item-title
	menuHtml+='</div></div>';
  return menuHtml;
}

function genMenuItemTooltip(menuItemName, module) {
  var menuItemToolTip = ' data-toggle="tooltip" data-placement="top" data-html="true" ';
  menuItemToolTip += 'title="<h3>' + module.title + '</h3>' + module.description + '<BR>';
  menuItemToolTip += 'Intended Use: ' + module.intended_use + '<BR>';
  menuItemToolTip += 'Language Code: ' + module.lang + '<BR>';
  menuItemToolTip += 'Menu Item Code: ' + menuItemName + '"';

  return menuItemToolTip;
}

function checkMenuDone(){
	menuItemDefs['call_count'] -= 1;
	//consoleLog (menuItemDefs['call_count']);
	if (menuItemDefs['call_count'] == 0){
		//genLangSelector();
		//activateButtons();
		//alert ("menu done");
		if (currentJsMenuToEdit.hasOwnProperty('menu_items_1'))
		  drawMenuItemDefList(currentJsMenuToEdit.menu_items_1, menuItemDefPrefixes.current); // refresh current menu
		activateTooltip();
	}
}

// drag and drop funtions

function menuItemDragStart(e) {
  //$(".tooltip").tooltip("hide"); // close any tooltips
  // Target (this) element is the source node.
  menuItemDragSrcElement = this;
  menuItemDragSrcParent = this.parentNode.id;
  var menu_item_name = this.getAttribute('menu_item_name');
  var targetDivId = gEBI("current-items-" + menu_item_name);


  //console.log("START")
  //console.log(this)
  //consoleLog($('.tooltip' , this));
  //console.log(this.parentNode)
  //console.log(targetDivId)

  $('.tooltip' , this).remove(); // get rid of extraneous tooltips

  e.dataTransfer.effectAllowed = 'moveCopy';

  e.dataTransfer.setData('text/html', this.outerHTML);
  e.dataTransfer.setData('menu_item_name', menu_item_name);
  if (targetDivId == null) {
    menuItemDragDuplicate = false;
    //e.dataTransfer.setData('is_duplicate', false); doesn't work
  }
  else {
    //e.dataTransfer.setData('is_duplicate', true);
    menuItemDragDuplicate = true;
  }
  this.classList.add('dragElem');
}

function menuItemDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault(); // Necessary. Allows us to drop.
  }
  //this.classList.add('over');
  //console.log(this)
  //console.log(this.parentNode)

  if (menuItemDragSrcParent == "menusDefineMenuCurrentItemList"){ // from current menu list
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.dropEffect = 'move';
    this.classList.add('over');
  }
  else { // from available items
    if (this.parentNode.id == "menusDefineMenuCurrentItemList"){ // to menu
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.dropEffect = 'copy';
      this.classList.add('over');
    }
    else { // to itself
      e.dataTransfer.effectAllowed = 'none';
      e.dataTransfer.dropEffect = 'none';
      this.classList.add('no-drop');
    }

    //e.dataTransfer.dropEffect = 'move';  // See the section on the DataTransfer object.
  }
  //return false;
}

function menuItemDragEnter(e) {
  // this / e.target is the current hover target.
}

function menuItemDragLeave(e) {
  this.classList.remove('over');  // this / e.target is previous target element.
  this.classList.remove('no-drop');
}

function menuItemDrop(e) {
  // this/e.target is current target element.
  var dragDestPar = this.parentNode.id;
  //$(".tooltip").tooltip("hide"); // close any tooltips
  this.classList.remove('over');
  menuItemDragSrcElement.classList.remove('dragElem');


  if (e.stopPropagation) {
    e.stopPropagation(); // Stops some browsers from redirecting.
  }
  //console.log("DROP")
  //console.log(dragDestPar)
  //consoleLog("is duplicate",e.dataTransfer.getData('is_duplicate'));
  // If move within menu and new location is different
  if (menuItemDragSrcParent == "menusDefineMenuCurrentItemList" && dragDestPar == "menusDefineMenuCurrentItemList" && menuItemDragSrcElement != this){
    // Set the source column's HTML to the HTML of the column we dropped on.
    //alert(this.outerHTML);
    //menuItemDragSrcElement.innerHTML = this.innerHTML;
    //this.innerHTML = e.dataTransfer.getData('text/html');
    this.parentNode.removeChild(menuItemDragSrcElement);
    var dropHTML = e.dataTransfer.getData('text/html');
    this.insertAdjacentHTML('beforebegin',dropHTML);
    var dropElem = this.previousSibling;
    menuItemAddDnDHandlers(dropElem);
    activateTooltip();
  }
  // if copy from items to menu
  if (menuItemDragSrcParent == "menusDefineMenuAllItemList" && dragDestPar == "menusDefineMenuCurrentItemList") {
  	if (!menuItemDragDuplicate) {
      var dropHTML = e.dataTransfer.getData('text/html');
      this.insertAdjacentHTML('beforebegin',dropHTML);
      var dropElem = this.previousSibling;
      dropElem.id = 'current-items-' + dropElem.getAttribute('menu_item_name');
      menuItemAddDnDHandlers(dropElem);
      activateTooltip();
    }
  }
  // if move from menu to items to delete
  if (menuItemDragSrcParent == "menusDefineMenuCurrentItemList" && dragDestPar == "menusDefineMenuAllItemList"){
    // Set the source column's HTML to the HTML of the column we dropped on.
    //alert(this.outerHTML);
    //menuItemDragSrcElement.innerHTML = this.innerHTML;
    //this.innerHTML = e.dataTransfer.getData('text/html');
    gEBI("menusDefineMenuCurrentItemList").removeChild(menuItemDragSrcElement);
  }
  //this.classList.remove('over');
  //menuItemDragSrcElement.classList.remove('dragElem');

  //return false;
}

function menuItemDragEnd(e) {
  // this/e.target is the source node.
  //console.log("END")
  //console.log(this.id)
  this.classList.remove('over');
  this.classList.remove('dragElem');
  this.classList.remove('no-drop');

  /*[].forEach.call(cols, function (col) {
  col.classList.remove('over');
  });*/
}

function menuItemAddDnDHandlers(elem) {
	if (typeof(elem) === 'undefined') // we can get here before the element is fully drawn
	  return;

  elem.addEventListener('dragstart', menuItemDragStart, false);
  elem.addEventListener('dragenter', menuItemDragEnter, false)
  elem.addEventListener('dragover', menuItemDragOver, false);
  elem.addEventListener('dragleave', menuItemDragLeave, false);
  elem.addEventListener('drop', menuItemDrop, false);
  elem.addEventListener('dragend', menuItemDragEnd, false);

}

// Functions to Edit a Menu Item Definition

function saveContentMenuItemDef() {
    var command = "SAVE-MENU-ITEM-DEF";
    var cmdArgs = getEditMenuItemFormValues();
    //var callbackFunction = genContentMenuItemDefCallback(command, cmdArgs);
    var callbackFunction = genSendCmdSrvCmdCallback(command, cmdArgs, 'updateContentMenuItemDef');

    cmd = command + " " + JSON.stringify(cmdArgs);
    sendCmdSrvCmd(cmd, callbackFunction);
    alert ("Saving Content Menu Item Definition.");
    return true;
  }

function createContentMenuItemDef (command, cmdArgs){
	//
}

function updateContentMenuItemDef (command, cmdArgs) {
  console.log('in updateContentMenuItemDef');
  console.log(cmdArgs);
  var menuItemName = cmdArgs['menu_item_name'];
  var menuDef = cmdArgs['menu_item_def'];
  menuItemDefs[menuItemName] = menuDef;
  drawMenuItemDef (menuItemName, menuItemDefPrefixes.all);
  drawMenuItemDef (menuItemName, menuItemDefPrefixes.current);
  drawMenuItemSelectListItem (menuItemName, menuItemDefPrefixes.select);
}

function handleEditMenuItemClick (menuItem, action){
  setEditMenuItemTopFormValues (menuItem);
  setEditMenuItemBottomFormValues (menuItem);
  menuItemEditMode = action;
  if (action == 'edit')
    lockMenuItemHeader(true);
  else
  	lockMenuItemHeader(false);

  $('#menusEditMenuItemTabs a[href="#menusEditMenuItemEdit"]').tab('show');
}


function setEditMenuItemTopFormValues (menuItem, menuDef){
	if (typeof(menuDef) === 'undefined')
	  var menuDef = menuItemDefs[menuItem];

  setFormValue ('menu_item_name', menuItem);
  setFormValue ('menu_item_name_suffix', "");

  setEditMenuItemFormValue (menuDef, 'intended_use', screenName='menu_item_type');
  setEditMenuItemFormValue (menuDef, 'lang', screenName='menu_item_lang');

  // Target field name Differs by item type
  var targetFieldNameValue = ""; // default
  if (jsMenuTypeTargets.hasOwnProperty(menuDef['intended_use'])) {
  	var targetFieldName = jsMenuTypeTargets[menuDef['intended_use']];
  	 if (menuDef.hasOwnProperty(targetFieldName))
      targetFieldNameValue = menuDef[targetFieldName];
  }
  console.log(targetFieldName)

  setFormValue ('menu_item_content_target', targetFieldNameValue);
}

function setEditMenuItemBottomFormValues (menuItem, menuDef){
	if (typeof(menuDef) === 'undefined')
	  var menuDef = menuItemDefs[menuItem];

  setEditMenuItemFormValue (menuDef, 'title', screenName='menu_item_title');
  setEditMenuItemFormValue (menuDef, 'logo_url', screenName='menu_item_icon_name');
  setEditMenuItemFormValue (menuDef, 'start_url', screenName='menu_item_start_url');
  setEditMenuItemFormValue (menuDef, 'description', screenName='menu_item_description');
  setEditMenuItemFormValue (menuDef, 'extra_description', screenName='menu_item_extra_description');
  setEditMenuItemFormValue (menuDef, 'extra_html', screenName='menu_item_extra_html');
  setEditMenuItemFormValue (menuDef, 'footnote', screenName='menu_item_footnote');
}

function setEditMenuItemFormValue (menuDef, fieldName, screenName='') {
  var fieldValue = "";
  console.log(fieldName)
  console.log(menuDef)
  if (screenName == '')
	  screenName = fieldName;
	if (menuDef.hasOwnProperty(fieldName))
	  fieldValue = menuDef[fieldName];
  setFormValue (fieldName, fieldValue, screenName)
}

function getEditMenuItemFormValues (){
	var menuDefArgs = {}
	var menuDef = {};

	var menuItemName = getFormValue ('menu_item_name');
	var suffix = getFormValue ('menu_item_name_suffix');
	var content_target = getFormValue ('menu_item_content_target');

  menuDef['intended_use'] = getFormValue ('intended_use', screenName='menu_item_type');
  menuDef['lang'] = getFormValue ('lang', screenName='menu_item_lang');

  menuDef['title'] = getFormValue ('title', screenName='menu_item_title');
  menuDef['logo_url'] = getFormValue ('logo_url', screenName='menu_item_icon_name');
  menuDef['start_url'] = getFormValue ('start_url', screenName='menu_item_start_url');
  menuDef['description'] = getFormValue ('description', screenName='menu_item_description');
  menuDef['extra_description'] = getFormValue ('extra_description', screenName='menu_item_extra_description');
  menuDef['extra_html'] = getFormValue ('extra_html', screenName='menu_item_extra_html');
  menuDef['footnote'] = getFormValue ('footnote', screenName='menu_item_footnote');

  // calc menu item def name

  //if edit mode use existing
  //else if lang prefix = lang and suffix != '' ? except name + suffix
  //else if use in zim, html, webroot, download =  lang - target - suffix
  //else 	= lang - intended use

  //report if duplicate

  menuDefArgs['menu_item_name'] = menuItemName;
  menuDefArgs['mode'] = menuItemEditMode;
  menuDefArgs['menu_item_def'] = menuDef;

  return menuDefArgs;
}

function valEditMenuItemFormValues (screenName){
	var fieldValue = getFormValue (screenName);

	switch (screenName) {
    case 'menu_item_icon_name':
      console.log('Oranges are $0.59 a pound.');
      break;
    case 'menu_item_extra_html':

    default:
      console.log('Sorry, we are out of ' + expr + '.');
  }
	var menuDef = {};

	var menuItem = getFormValue ('menu_item_name');
	var suffix = getFormValue ('menu_item_name_suffix');
	var content_target = getFormValue ('menu_item_content_target');

  menuDef['intended_use'] = getFormValue ('intended_use', screenName='menu_item_type');
  menuDef['lang'] = getFormValue ('lang', screenName='lang');

  menuDef['title'] = getFormValue ('title', screenName='menu_item_title');
  menuDef['logo_url'] = getFormValue ('logo_url', screenName='menu_item_icon_name');
  menuDef['start_url'] = getFormValue ('start_url', screenName='menu_item_start_url');
  menuDef['description'] = getFormValue ('description', screenName='menu_item_description');
  menuDef['extra_description'] = getFormValue ('extra_description', screenName='menu_item_extra_description');
  menuDef['extra_html'] = getFormValue ('extra_html', screenName='menu_item_extra_html');
  menuDef['footnote'] = getFormValue ('footnote', screenName='menu_item_footnote');
}

function setFormValue (fieldName, fieldValue, screenName='') {
  if (screenName == '')
	  screenName = fieldName;
  gEBI(screenName).value = fieldValue;
}

function setFormChecked (fieldName, fieldValue, screenName='') {
	if (screenName == '')
	  screenName = fieldName;
  gEBI(fieldName).checked = fieldValue;
}

function getFormValue (fieldName, screenName='') {
	if (screenName == '')
	  screenName = fieldName;
  return gEBI(screenName).value;
}

function getFormChecked (fieldName, screenName='') {
	if (screenName == '')
	  screenName = fieldName;
  return gEBI(screenName).checked;
}

function lockMenuItemHeader(lockFlag) {
  $("#menusEditMenuItemEditNew input").each(function() {
  	console.log(this)
  	if ($(this).name != 'menu_item_name')
  	  if (lockFlag) // lock it
  	    $(this).attr('disabled', 'disabled');
  	  else // unlock it
  	  	$(this).prop("disabled",false);
  });
  // Doesn't catch the two selects
  if (lockFlag){ // lock it
    $("#menu_item_type").attr('disabled', 'disabled');
    $("#menu_item_lang").attr('disabled', 'disabled');
    make_button_disabled('#CREATE-MENU-ITEM-DEF', true);
  }
  else {// unlock it
    $("#menu_item_type").prop("disabled",false);
    $("#menu_item_lang").prop("disabled",false);
    make_button_disabled('#CREATE-MENU-ITEM-DEF', false);
  }
}

function gEBI(elementId){
	var element = document.getElementById(elementId);
	return element;
}
