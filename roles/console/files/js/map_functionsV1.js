// map_functions.js
// copyright 2019 George Hunt

var regionList = [];
var mapAssetsDir = '/osm-vector-maps/maplist/assets/';

function instMapError(data, cmd_args) {
    consoleLog(cmd_args);
    //cmdargs = JSON.parse(command);
    //consoleLog(cmdargs);
    consoleLog(cmd_args["map_id"]);
    mapDownloading.pop(cmd_args["map_id"]);
    return true;
}

function getMapStat(){
  // called during the init
  console.log('in getMapStat');
  readMapCatalog();
  readMapIdx();
}

function readMapIdx(){
	//consoleLog ("in readMapIdx");
  var resp = $.ajax({
    type: 'GET',
    url: consoleJsonDir + 'vector-map-idx.json',
    dataType: 'json'
  })
  .done(function( data ) {
  	//mapInstalled = data['regions'];
   consoleLog (data);
   mapInstalled = [];
   //mapInstalled = Object.keys(data);
   for (var map in data) {
   	 consoleLog (map)
     if (data[map]) {
       mapInstalled.push(data[map]);
     }
  };
  consoleLog(mapInstalled + '');
  })
  .fail(jsonErrhandler);

  return resp;
}

function readMapCatalog(){
	//console.log ("in readMapCalalog");
	// read regions.json from common/assets in case osm vectors not installed
  regionList = [];
  var resp = $.ajax({
    type: 'GET',
    url: consoleJsonDir + 'regions.json',
    dataType: 'json'
  })
  .done(function( data ) {
  	 regionJson = data;
    mapCatalog = regionJson['regions'];
    for(var key in mapCatalog){
      //console.log(key + '  ' + mapCatalog[key]['title']);
      mapCatalog[key]['name'] = key;
      regionList.push(mapCatalog[key]);
    }
  })
  .fail(jsonErrhandler);
  return resp;
}

function renderRegionList(checkbox) { // generic
	var html = "";
   // order the regionList by seq number
   var regions = regionList;
	console.log ("in renderRegionList");

	// sort on basis of seq
  regions = regions.sort(function(a,b){
    if (a.seq < b.seq) return -1;
    else return 1;
    });
  //console.log(regions);
	// render each region
   html += '<form>';
	regions.forEach((region, index) => { // now render the html
      //console.log(region.title + " " +region.seq);
      html += genRegionItem(region,checkbox);
  });
  html += '</form>';
  //console.log(html);
  $( "#mapRegionSelectList" ).html(html);
}


function genRegionItem(region,checkbox) {
  var html = "";
  console.log("in genRegionItem: " + region.name);
  var itemId = region.title;
  var ksize = region.size / 1000;
  //console.log(html);
  html += '<div class="extract" data-region={"name":"' + region.name + '"}> ';
  html += '<label>';
  if ( checkbox ) {
    if (selectedMapItems.indexOf(region.name) != -1)
      checked = 'checked';
    else
      checked = '';
      html += '<input type="checkbox" name="' + region.url + '"';
      html += ' onChange="updateMapSpace(this)" ' + checked + '> ';
  }
  html += itemId;
  if ( checkbox ) { html += '</input>';};
  html += '</label>'; // end input
  html += ' ' + readableSize(ksize);
  html += '</div>';
  //console.log(html);

  return html;
}

function get_region_from_url(url){
  for (const region in mapCatalog ){
    if (mapCatalog[region].hasOwnProperty('url') &&
      mapCatalog[region].url === url ){
      return mapCatalog[region].name;
    }
  }
  return null
}

function instMapItem(map_url) {
  var command = "INST-OSM-VECT-SET";
  var cmd_args = {};
  region_id = get_region_from_url(map_url);
  if ( !region_id ) return false;
  cmd_args['osm_vect_id'] = region_id;
  cmd = command + " " + JSON.stringify(cmd_args);
  sendCmdSrvCmd(cmd, genericCmdHandler);
  mapDownloading.push(map_url);
  if ( mapWip.indexOf(map_url) == -1 )
     mapWip.push(map_url);
  console.log('mapWip: ' + mapWip);
  return true;
}

function updateMapSpace(cb){
  console.log("in updateMapSpace" + cb);
  var region = get_region_from_url(cb.name);
  updateMapSpaceUtil(region, cb.checked);
}

function updateMapSpaceUtil(region, checked){
  var size =  parseInt(mapCatalog[region].size);

  var modIdx = selectedMapItems.indexOf(region);

  if (checked){
    if (mapInstalled.indexOf(region) == -1){ // only update if not already installed mods
      sysStorage.map_selected_size += size;
      selectedMapItems.push(region);
    }
  }
  else {
    if (modIdx != -1){
      sysStorage.map_selected_size -= size;
      selectedMapItems.splice(modIdx, 1);
    }
  }

  displaySpaceAvail();
}

function renderMap(){
   //console.log('in renderMap');
   if (Object.keys(mapCatalog).length === 0)
     $("#map-container").html('<BR><BR><center><span style="font-size: 30px;"><B>MAPS NOT INSTALLED<B></span></center>');
   else{
     window.map.setTarget($("#map-container")[0]);
     window.map.render();
     renderRegionList(true);
  }
}
function initMap(){
   var url =  mapAssetsDir + 'regions.json';
   sysStorage.map_selected_size = 0; // always set to 0
   if (UrlExists(url)){
      $.when(getMapStat()).then(renderRegionList);
   }
}
function UrlExists(url)
{
    var http = new XMLHttpRequest();
    http.open('HEAD', url, false);
    http.send();
    return http.status!=404;
}
