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
		procCurrentMenuItemDefList (currentJsMenuToEdit.menu_items_1, "current-items"); // hard coded name of list against future multi-tab menus
	})
	.fail(function (jqXHR, textStatus, errorThrown){
		jsonErrhandler (jqXHR, textStatus, errorThrown); // probably a json error
	});
	return resp;
}

// assumes all menu item definitions have been loaded
function procCurrentMenuItemDefList (list, prefix){
	var html = createMenuItemScaffold(list, prefix);
	$("#menusDefineMenuCurrentItemList").html(html);
	for (var i = 0; i < list.length; i++) {
		var menu_item_name = list[i];
		var divId = prefix + '-' + menu_item_name;

		if (menuItemDefs[menu_item_name] !== 'undefined')
  		genMenuItem(divId, menuItemDefs[menu_item_name]);
  }
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
		genMenuItem(divId, menuItemDefs[menuItem]);
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

function genMenuItem(divId, module) {
  var menuHtml = "";
	var langClass = "";
	var menuItemDivId = "#" + divId;
	var langLookup = langCodesXRef[module.lang]

  if (selectedLangs.length > 0 && selectedLangs.indexOf(langLookup) == -1) { // not a selected language
		$(menuItemDivId).hide();
		return;
	}

	menuHtml+='<div class="content-icon">';
	menuHtml+='<img src="' + jsMenuImageUrl + module.logo_url + '"></div>';

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

function checkMenuDone(){
	menuItemDefs['call_count'] -= 1;
	//consoleLog (menuItemDefs['call_count']);
	if (menuItemDefs['call_count'] == 0){
		//genLangSelector();
		//activateButtons();
		//alert ("menu done");
	}
}

// drag and drop funtions

function menuItemDragStart(e) {
  // Target (this) element is the source node.
  menuItemDragSrcElement = this;
  menuItemDragSrcParent = this.parentNode.id;
  var menu_item_name = this.getAttribute('menu_item_name');
  var targetDivId = gEBI("current-items-" + menu_item_name);

  //console.log("START")
  //console.log(this)
  //console.log(this.parentNode)
  //console.log(targetDivId)

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
  }
  // if copy from items to menu
  if (menuItemDragSrcParent == "menusDefineMenuAllItemList" && dragDestPar == "menusDefineMenuCurrentItemList") {
  	if (!menuItemDragDuplicate) {
      var dropHTML = e.dataTransfer.getData('text/html');
      this.insertAdjacentHTML('beforebegin',dropHTML);
      var dropElem = this.previousSibling;
      dropElem.id = 'current-items-' + dropElem.getAttribute('menu_item_name');
      menuItemAddDnDHandlers(dropElem);
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
	consoleLog(elem);
  elem.addEventListener('dragstart', menuItemDragStart, false);
  elem.addEventListener('dragenter', menuItemDragEnter, false)
  elem.addEventListener('dragover', menuItemDragOver, false);
  elem.addEventListener('dragleave', menuItemDragLeave, false);
  elem.addEventListener('drop', menuItemDrop, false);
  elem.addEventListener('dragend', menuItemDragEnd, false);

}

/*
var menuCols = document.querySelectorAll('#menu .column');
var itemCols = document.querySelectorAll('#items .column');
[].forEach.call(menuCols, menuItemAddDnDHandlers);
[].forEach.call(itemCols, menuItemAddDnDHandlers);
*/
function gEBI(elementId){
	var element = document.getElementById(elementId);
	return element;
}
