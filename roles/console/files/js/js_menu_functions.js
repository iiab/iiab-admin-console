// js_menu_functions.js
// copyright 2019 Tim Moody

var jsMenuUrl = "/js-menu";
var jsMenuImageUrl = "/js-menu/menu-files/images/";
var jsMenuItemDefUrl = "/js-menu/menu-files/menu-defs/";
var currentJsMenuToEdit = {};
var menuItemDefList = [];
var menuItemDefs = {};
menuItemDefs['call_count'] = 0;

var menuItemDragSrcElement = null;
var menuItemDragSrcParent = null;
var menuItemDragDuplicate = null;

function getMenuItemDefList(){
	return sendCmdSrvCmd("GET-MENU-ITEM-DEF-LIST", procMenuItemDefList);
}

function procMenuItemDefList (data){
	var html = "";
	menuItemDefList = data;
	html = createMenuItemScaffold(menuItemDefList, "all-items");
	$("#menusDefineMenuAllItemList").html(html);
	for (var i = 0; i < menuItemDefList.length; i++) {
		getMenuItemDef(menuItemDefList[i], "all-items")
	}
}

function getContentMenuToEdit(currentJsMenuToEditUrl){
	  var jsMenuToEditUrl = '/' + currentJsMenuToEditUrl + '/';
		var resp = $.ajax({
		type: 'GET',
		async: true,
		url: jsMenuToEditUrl + 'menu.json',
		dataType: 'json'
	})
	.done(function( data ) {
		currentJsMenuToEdit = data;
		setContentMenuToEditFormValues();
		procCurrentMenuItemDefList (currentJsMenuToEdit.menu_items_1, "current-items"); // hard coded name of list against future multi-tab menus
	})
	.fail(function (jqXHR, textStatus, errorThrown){
		if (errorThrown == 'Not Found'){
		  currentJsMenuToEdit = {};
		  procCurrentMenuItemDefList ([], "current-items");
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
  setContentMenuToEditFormChecked('mobile_incl_extra_html');
  setContentMenuToEditFormValue('desktop_header_font');
  setContentMenuToEditFormChecked('desktop_incl_description');
  setContentMenuToEditFormChecked('desktop_incl_extra_html');
  setContentMenuToEditFormChecked('allow_kiwix_search');
  setContentMenuToEditFormChecked('allow_poweroff');
  setContentMenuToEditFormValue('poweroff_prompt');
}

function setContentMenuToEditFormValue (fieldName) {
  gEBI(fieldName).value = currentJsMenuToEdit[fieldName];
}

function setContentMenuToEditFormChecked (fieldName) {
  gEBI(fieldName).checked = currentJsMenuToEdit[fieldName];
}

function getContentMenuToEditFormValues (){
  getContentMenuToEditFormValue('mobile_header_font');
  getContentMenuToEditFormChecked('mobile_incl_description');
  getContentMenuToEditFormChecked('mobile_incl_extra_html');
  getContentMenuToEditFormValue('desktop_header_font');
  getContentMenuToEditFormChecked('desktop_incl_description');
  getContentMenuToEditFormChecked('desktop_incl_extra_html');
  getContentMenuToEditFormChecked('allow_kiwix_search');
  getContentMenuToEditFormChecked('allow_poweroff');
  getContentMenuToEditFormValue('poweroff_prompt');

  getContentMenuToEditItemList ();
}

function getContentMenuToEditFormValue (fieldName) {
  currentJsMenuToEdit[fieldName] = gEBI(fieldName).value;
}

function getContentMenuToEditFormChecked (fieldName) {
  currentJsMenuToEdit[fieldName] = gEBI(fieldName).checked;
}

function getContentMenuToEditItemList () {
	var menuItemList = [];
  $("#menusDefineMenuCurrentItemList .content-item").each(function() {
  	consoleLog($(this).attr('menu_item_name'));
  	menuItemList.push($(this).attr('menu_item_name'));
  });
  currentJsMenuToEdit.menu_items_1 = menuItemList;
}

// assumes all menu item definitions have been loaded
function procCurrentMenuItemDefList (list, prefix){
	var html = createMenuItemScaffold(list, prefix);
	$("#menusDefineMenuCurrentItemList").html(html);
	for (var i = 0; i < list.length; i++) {
		var menu_item_name = list[i];
		var divId = prefix + '-' + menu_item_name;

		if (menuItemDefs[menu_item_name] !== 'undefined')
  		genMenuItem(divId, menu_item_name);
  }
  activateTooltip();
}

function createMenuItemScaffold(list, prefix){
  var html = "";
  for (var i = 0; i < list.length; i++) {
  	var menu_item_name = list[i];
  	html += '<div id="' + prefix + '-' + menu_item_name + '" class="flex-row content-item" dir="auto" draggable="true" menu_item_name="' + menu_item_name + '">&emsp;Attempting to load ' + menu_item_name + ' </div>';
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

	$("#" + divId).html(menuHtml);
	menuItemAddDnDHandlers($("#" + divId).get(0));
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
    this.classList.add('over');
  }
  else { // from available items
    if (this.parentNode.id == "menusDefineMenuCurrentItemList"){ // to menu
      e.dataTransfer.effectAllowed = 'copy';
      this.classList.add('over');
    }
    else { // to itself
      e.dataTransfer.effectAllowed = 'none';
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
  this.classList.remove('over');

  /*[].forEach.call(cols, function (col) {
  col.classList.remove('over');
  });*/
}

function menuItemAddDnDHandlers(elem) {
  elem.addEventListener('dragstart', menuItemDragStart, false);
  elem.addEventListener('dragenter', menuItemDragEnter, false)
  elem.addEventListener('dragover', menuItemDragOver, false);
  elem.addEventListener('dragleave', menuItemDragLeave, false);
  elem.addEventListener('drop', menuItemDrop, false);
  elem.addEventListener('dragend', menuItemDragEnd, false);

}

function gEBI(elementId){
	var element = document.getElementById(elementId);
	return element;
}
