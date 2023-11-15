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
    //"webroot" : "moddir",
    //"kalite"  : "",
    "kolibri"  : "kolibri_channel_id",
    //"cups"  : "",
    //"nodered"  : "",
    //"calibre"  : "",
    //"calibreweb"  : "",
    "map"  : "map_name",
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
    var warning_msg = ''
		var resp = $.ajax({
		type: 'GET',
		async: true,
		url: jsMenuToEditUrl + 'menu.json',
		dataType: 'json'
	})
	.done(function( data ) {
		currentJsMenuToEdit = data;
    drawContentMenuToEdit(currentJsMenuToEdit)
	})
	.fail(function (jqXHR, textStatus, errorThrown){
    if (errorThrown == 'Not Found'){
		  alert ('Content Menu not Found.');
      currentJsMenuToEdit = {};
      procCurrentMenuItemDefList ([], menuItemDefPrefixes.current);
    }
		else {
      jsonStr = jqXHR.responseText
      console.log(jsonStr)
      //console.log( "finished", data.responseText );
      try {
          JSON.parse(jsonStr) // should fail
      }
      catch(e) {
        parseErr = e.message
        //consoleLog(e)
        parseErrParts = parseErr.split('Unexpected non-whitespace character after JSON at position ')
        if (parseErrParts.length == 2){
          currentJsMenuToEdit = JSON.parse(jsonStr.substring(0, parseInt(parseErrParts[1])))
          warning_msg = 'The Home Page menu.json file is broken and has been temporarily patched.\n\n'
          warning_msg += 'Click Save Menu To save the patch.'
          alert(warning_msg)
          drawContentMenuToEdit(currentJsMenuToEdit)
        }
        else{
            jsonErrhandler(jqXHR, textStatus, errorThrown) // another problem'
            warning_msg = 'The Home Page menu.json file is broken and could not be patched.'
            alert(warning_msg)
            currentJsMenuToEdit = {};
            drawContentMenuToEdit(currentJsMenuToEdit)
        }
      } // end catch
    }
	});

	return resp;
}

function drawContentMenuToEdit(currentJsMenuToEdit){
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
}

function saveContentMenuDef(readForm=true, callback=genericCmdHandler) {
    var command = "SAVE-MENU-DEF";
    var cmd_args = {};
    var menu_url = gEBI('content_menu_url').value;
    if (menu_url.includes('.') || menu_url.includes('/')){
    	alert ("Menu Folder must not include '.' or '/'");
    	return false;
    }
    if (readForm){
      getContentMenuToEditFormValues ();
      if (!Array.isArray(currentJsMenuToEdit.menu_items_1) || !currentJsMenuToEdit.menu_items_1.length){
        alert ("List of Menu Items is empty. Load before Saving.");
        return false;
      }
    }
    cmd_args['menu_url'] = menu_url;
    cmd_args['menu_def'] = currentJsMenuToEdit;
    cmd = command + " " + JSON.stringify(cmd_args);
    sendCmdSrvCmd(cmd, callback);
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
  setContentMenuToEditFormChecked('allow_server_time_update');
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
  getContentMenuToEditFormParamValues ()
  getContentMenuToEditItemList ();
}

function getContentMenuToEditFormParamValues (){
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
  getContentMenuToEditFormChecked('allow_server_time_update');
  getContentMenuToEditFormChecked('allow_poweroff');
  getContentMenuToEditFormValue('poweroff_prompt');
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

  $('#menusEditMenuItemSelectList').on('click', '.btnClone' ,function (event) {
    handleEditMenuItemClick($(this).attr('menu_item_name'), 'clone');
    //consoleLog($(this));
  });

  // create default menu item in edit panel of first item on menu

  if($('#menu_item_name').val() == ''){
    handleEditMenuItemClick(currentJsMenuToEdit.menu_items_1[0], 'edit');
    $('#menusEditMenuItemTabs a[href="#menusEditMenuItemSelect"]').tab('show'); // redisplay select tab
  }
}

function drawMenuItemSelectListItem (menuItemName, prefix) {
	var html = "";
	var buttonHtml = '<button type="button" style="margin-left: 5px;" class="btn btn-primary btnEdit" menu_item_name="' + menuItemName + '">Edit</button>';
  buttonHtml += '<button type="button" style="margin-left: 5px;" class="btn btn-primary btnClone" menu_item_name="' + menuItemName + '">Clone</button>';
  var itemHtml = genMenuItemHtml(menuItemName);
  if (itemHtml != ""){
  	html = buttonHtml;
  	html += '<span style="width: 10em; margin-left: 10px; padding-top: 6px;">' + menuItemName + '</span>';
  	html += itemHtml
  }
  else
    html += '<span style="margin-left: 10px;">' + menuItemName + ' Menu Item Definition was not found.</span>';

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

    if (selectedLangs.indexOf(lang) == -1)
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

  // don't hide any items on menu
  if (divId.indexOf(menuItemDefPrefixes.current) == -1 && selectedLangs.length > 0 && selectedLangs.indexOf(langLookup) == -1) { // not a selected language
		$(menuItemDivId).hide();
		return;
	}
	var menuHtml = genMenuItemHtml(menuItemName);
	if (menuHtml == "") // skip problem definitions, probably not found
	  return;

	$("#" + divId).html(menuHtml);
	menuItemAddDnDHandlers($("#" + divId).get(0));
	$("#" + divId).show();
}

function genMenuItemHtml(menuItemName) {
  var menuHtml = "";
  var module = menuItemDefs[menuItemName];
  if (typeof(module) === "undefined") // skip not found
	  return "";;
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

function updateHomeMenu(){
  var command = "UPDATE-HOME-MENU";
  var cmd_args = {};

  cmd = command + " " + JSON.stringify(cmd_args);
  sendCmdSrvCmd(cmd, updateHomeMenuDone, "UPDATE-HOME-MENU");
  return true;
}

function updateHomeMenuDone(){
  if (homeMenuLoaded) {
		getContentMenuToEdit('home'); // refresh home menu
  }
  alert ("Home Page Menu Updated.");
}

function syncMenuItemDefs(){
  var command = "SYNC-MENU-ITEM-DEFS";
  var cmd_args = {};

  cmd = command + " " + JSON.stringify(cmd_args);
  sendCmdSrvCmd(cmd, syncMenuItemDefsHandler, "SYNC-MENU-ITEM-DEFS");
  //alert ("Syncing Menu Item Definitions.");
  return true;
}

function syncMenuItemDefsHandler(data){
  var alertText = "Sync Menu Item Defs Results:\n";
  console.log(data)
  for (var i = 0; i < data.sync_menu_item_defs.length; i++)
    alertText += data.sync_menu_item_defs[i] + "\n";

  alert (alertText);
  return true;
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

  e.dataTransfer.effectAllowed = 'movecopy';

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
    var formVars = getEditMenuItemFormValues(); // also validates
    var validFlag = formVars.validFlag;
    var cmdArgs = formVars.menuDefArgs;

    if (!validFlag) // message issued in called function
      return false;

    // warn if will overwrite central repo
    if (cmdArgs.menu_item_def.upload_flag)
      if (!confirm("These changes will be uploaded for everyone to use.\nAre you certain you want this?"))
        return false;

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
  // take out of clone mode
  lockMenuItemHeader(true);
  menuItemEditMode = 'edit';
  // make sure menu item is in menu
  if (! currentJsMenuToEdit.menu_items_1.includes(menuItemName)){
    var lastDefOnMenu = currentJsMenuToEdit.menu_items_1.pop();
    if (lastDefOnMenu.includes('credits')){ // keep credits as last entry
      currentJsMenuToEdit.menu_items_1.push(menuItemName);
      currentJsMenuToEdit.menu_items_1.push(lastDefOnMenu);
    }
    else {
      currentJsMenuToEdit.menu_items_1.push(lastDefOnMenu);
      currentJsMenuToEdit.menu_items_1.push(menuItemName);
    }
    getContentMenuToEditFormParamValues();
    saveContentMenuDef(readForm=false, callback=refreshContentMenuToEdit);
    drawMenuItemSelectList();
    // master list and menu.json list will get refreshed when those items are accessed
  }
  // what about master list of menu defs
  // delayedProcCurrentMenuItemDefList (5000, currentJsMenuToEdit.menu_items_1, menuItemDefPrefixes.current);
  // getMenuItemDefList();
}

function refreshContentMenuToEdit(){
  var currentJsMenuToEditUrl = $("#content_menu_url").val();
  getContentMenuToEdit(currentJsMenuToEditUrl);
}

function handleEditMenuItemClick (menuItem, action){
  setEditMenuItemTopFormValues (menuItem);
  setEditMenuItemBottomFormValues (menuItem, action);
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

function setEditMenuItemBottomFormValues (menuItem, action, menuDef){
  var noUploadDefs = ['en-sample', 'en-oob', 'en-credits'] // protected menu defs

  if (typeof(menuDef) === 'undefined')
    var menuDef = menuItemDefs[menuItem];

  var title = menuDef.title;
  if (action == 'clone'){
    title = 'CLONE: ' + menuDef.title;
  }

  // set flag defaults for first edit not to share
  if (menuDef.edit_status != 'local_change')  {
    menuDef.upload_flag = false;
    menuDef.download_flag = false;
  }
  // block certain menu defs from upload
  if (noUploadDefs.includes(menuItem)) {
    $('#menu_item_upload_flag').attr('disabled', true);
    $('#menu_item_upload_flag_on').hide();
    $('#menu_item_upload_flag_off').show();
    menuDef.upload_flag = false;
  } else {
    $('#menu_item_upload_flag').attr('disabled', false);
    $('#menu_item_upload_flag_on').show();
    $('#menu_item_upload_flag_off').hide();
  }

  // setEditMenuItemFormValue (menuDef, 'title', screenName='menu_item_title');
  setFormValue ('title', title, screenName='menu_item_title') // override title for clones
  setEditMenuItemFormValue (menuDef, 'logo_url', screenName='menu_item_icon_name');
  setEditMenuItemFormValue (menuDef, 'start_url', screenName='menu_item_start_url');
  setEditMenuItemFormValue (menuDef, 'description', screenName='menu_item_description');
  setEditMenuItemFormValue (menuDef, 'extra_description', screenName='menu_item_extra_description');
  setEditMenuItemFormValue (menuDef, 'extra_html', screenName='menu_item_extra_html');
  setEditMenuItemFormValue (menuDef, 'footnote', screenName='menu_item_footnote');
  setEditMenuItemFormChecked (menuDef, 'upload_flag', screenName='menu_item_upload_flag');
  setEditMenuItemFormChecked (menuDef, 'download_flag', screenName='menu_item_download_flag');
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

function setEditMenuItemFormChecked (menuDef, fieldName, screenName='') {
  var fieldValue = "";
  console.log(fieldName)
  console.log(menuDef)
  if (screenName == '')
	  screenName = fieldName;
	if (menuDef.hasOwnProperty(fieldName))
	  fieldValue = menuDef[fieldName];
  setFormChecked (fieldName, fieldValue, screenName)
}

function getEditMenuItemFormValues (){
  // also validates and returns validFlag

	var menuDefArgs = {}
  var menuDef = {};
  var validFlag = true;

  var menuItemCode = getFormValue ('menu_item_name');
  var suffix = getFormValue ('menu_item_name_suffix');
  var menuItemName = menuItemCode

  if (suffix != '')
    menuItemName = menuItemCode + '-' + suffix

   var content_target = getFormValue ('menu_item_content_target');

  menuDef['intended_use'] = getFormValue ('intended_use', screenName='menu_item_type');
  menuDef['lang'] = getFormValue ('lang', screenName='menu_item_lang');

  // Target field name Differs by item type
  // for now we will use moddir for webroot type, but may switch to start_url
  var targetFieldNameValue = ""; // default
  if (jsMenuTypeTargets.hasOwnProperty(menuDef['intended_use'])) {
  	var targetFieldName = jsMenuTypeTargets[menuDef['intended_use']];
  	menuDef[targetFieldName] = content_target;
  }
  console.log(targetFieldName)


  menuDef['title'] = getEscapedFormValue ('title', screenName='menu_item_title');
  menuDef['logo_url'] = getFormValue ('logo_url', screenName='menu_item_icon_name');
  menuDef['start_url'] = getFormValue ('start_url', screenName='menu_item_start_url');
  menuDef['description'] = getEscapedFormValue ('description', screenName='menu_item_description');
  menuDef['extra_description'] = getEscapedFormValue ('extra_description', screenName='menu_item_extra_description');
  menuDef['extra_html'] = getFormValue ('extra_html', screenName='menu_item_extra_html');
  menuDef['footnote'] = getEscapedFormValue ('footnote', screenName='menu_item_footnote');
  menuDef['upload_flag'] = getFormChecked ('upload_flag', screenName='menu_item_upload_flag');
  menuDef['download_flag'] = getFormChecked ('download_flag', screenName='menu_item_download_flag');

  // calc menu item def name

  //if edit mode use existing
  //else if lang prefix = lang and suffix != '' ? except name + suffix
  //else if use in zim, html, webroot, download =  lang - target - suffix
  //else 	= lang - intended use

  menuDefArgs['menu_item_name'] = menuItemName;
  menuDefArgs['mode'] = menuItemEditMode;
  menuDefArgs['menu_item_def'] = menuDef;

  validFlag = validateMenuItemDef(menuItemName, menuDef);

  return {
    validFlag,
    menuDefArgs
  };
}

function validateMenuItemDef(menuItemName, menuDef){
  if (menuItemEditMode == 'clone')
    if (!validateMenuItemName(menuItemName, menuDef))
      return false;

  if (menuDef['title'] == ''){
    alert('Title may not be left blank.');
    return false;
  }

  if (menuDef['description'] == ''){
    alert('Description may not be left blank.');
    return false;
  }
  return true;
}

function validateMenuItemName(menuItemName, menuDef){
  //console.log(menuItemName)
  // mode is clone and is duplicate
  if (menuItemEditMode == 'clone' && menuItemDefList.includes(menuItemName)){
    alert('This Menu Item Definition already exists. Please use a different Menu Item Code and Suffix when cloning.');
    return false;
  }
  // has lang code
  var nameParts = menuItemName.split('-');
  if (nameParts[1] == ''){
    alert('The Menu Item Code and Suffix together must be a name of the form <language code>-<content indicator text>-<suffix>. For Zims and Modules it should reference the target content.');
    return false;
  }
  var lang = nameParts[0];
  if (!langCodesXRef.hasOwnProperty(lang)){
    alert('The Menu Item Code must start with a valid language code. Use the dropdown to chose one.');
    return false;
  }
  // restrict characters in name
  var re = /^[A-Z\-a-z_0-9]+$/g;
  // var re = /^[a-z_0-9]+$/g;
  if(!re.test(menuItemName)){
    alert('The Menu Item Code can only contain the upper and lower case characters a-z, 0-9, hyphen, and underscore.');
    return false;
  }

  return true;
}

function setFormValue (fieldName, fieldValue, screenName='') {
  if (screenName == '')
	  screenName = fieldName;
  gEBI(screenName).value = fieldValue;
}

function setFormChecked (fieldName, fieldValue, screenName='') {
	if (screenName == '')
	  screenName = fieldName;
  gEBI(screenName).checked = fieldValue;
}

function getFormValue (fieldName, screenName='') {
	if (screenName == '')
	  screenName = fieldName;
	return gEBI(screenName).value;
}

function getEscapedFormValue (fieldName, screenName='') {
	if (screenName == '')
	  screenName = fieldName;
	var value = gEBI(screenName).value;
	var str = JSON.stringify(value); // puts quote on beginning and end
	str = str.substring(1, str.length - 1); // strip them off
	str = str.replace(/\\n/g, '<BR>').replace(/\\"/g, '&quot;'); // let's see if this is enough for actual fields
	gEBI(screenName).value = str; // put back the escaped field
  return str;
}

function getFormChecked (fieldName, screenName='') {
	if (screenName == '')
	  screenName = fieldName;
  return gEBI(screenName).checked;
}

function attachMenuItemDefNameCalc () {
	$("#menu_item_type").change(calcMenuItemDefName);
	$("#menu_item_lang").change(calcMenuItemDefName);
	$("#menu_item_content_target").change(calcMenuItemDefName);
}

function calcMenuItemDefName () {
	var defName = getFormValue ('menu_item_name');
	var newDefName = "";
	var suffix = getFormValue ('menu_item_name_suffix');
	var intendedUse = getFormValue ('intended_use', screenName='menu_item_type');
  var lang = getFormValue ('lang', screenName='menu_item_lang');
	var contentTarget = getFormValue ('menu_item_content_target');
  var defNameBase = defName;
  var hyphenPos = defName.indexOf('-');

  var hyphenPos = defName.split('-');
  if (hyphenPos.length > 1) {
  	// match the longest string that could be a language (e.g. zh, zh-classical, zh-min-nan)
    for (var i = hyphenPos.length-2; i >= 0; i--) {
    	var testLang = hyphenPos[0];
    	for (var j = 1; j <= i; j++) {
    		testLang = testLang + '-' + hyphenPos[j];
    	}
    	if (langCodesXRef.hasOwnProperty(testLang))
    	  break;
    }
    defNameBase = defName.split(testLang + '-')[1];
  }
  //console.log(defNameBase);
  newDefName = lang + '-' + defNameBase;
  setFormValue ('menu_item_name', newDefName)
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

function selectMenuItemIcon() {
  event.preventDefault()
    $.ajax({
    url: jsMenuImageUrl,
    success: function(data) {
      $(data).find("a").attr("href", function (i, val) {
        if( val.match(/\.(jpe?g|png|gif)$/) ) {
          $(".menu-icons-modal-body").append(
            `<img onclick="setMenuItemIconName(this.src)" src=${jsMenuImageUrl + val} class="select-menu-icon" >`
          )
        }
      })
    }
  })
}

function setMenuItemIconName(e) {
  var newIcon = /[^/]*$/.exec(e)[0]
  $("#menu_item_icon_name").val(newIcon),
  $('#menuIconsModal').modal('hide')
}

// leave this for future, but doesn't work with nginx (unlike with apache)
function uploadMenuItemIcon() {
	var formData = new FormData();
  var file = $('#menuIconsUploadFileName')[0].files[0];
  var fileName = file.name
  formData.append('file',file);

	$.ajax({
  url: "upload-image.php", // Url to which the request is send
  //url: "icon_uploader.php",
  //url: "/admin/upload2.php",
  type: "POST",            // Type of request to be send, called as method
  data: formData,          // Data sent to server, a set of key/value pairs (i.e. form fields and values)
  //dataType: "json",
  cache : false,
  contentType: false,
  processData: false
  })
  .done(function(dataResp, textStatus, jqXHR) {
  	if ("Error" in dataResp){
  		console.log (dataResp);
  	  alert ("Error uploading image");
  	  }
  	else {
      $("#menu_item_icon_name").val(fileName);
      // try to move file to js-menu images
      moveUploadedFile(fileName, 'icon', ['image/jpeg', 'image/gif', 'image/png']);
  	}
  })
  .fail(function (jqXHR, textStatus, errorThrown){
    alert ('Error uploading image file - ' + errorThrown);
	});
}

function gEBI(elementId){
	var element = document.getElementById(elementId);
	return element;
}
