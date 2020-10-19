// map_functions.js
// copyright 2019 George Hunt
// rewritten for version 2

var regionList = [];
var mapAssetsDir = '/osm-vector-maps/maplist/assets/';
var mapCatalogFile = '/common/assets/adm-map-catalog.json' // unique to admin console

function instMapError(data, cmd_args) {
    consoleLog(cmd_args);
    //cmdargs = JSON.parse(command);
    //consoleLog(cmdargs);
    consoleLog(cmd_args["map_id"]);
    mapDownloading.pop(cmd_args["map_id"]);
    return true;
}

function refreshRegionList(){
  // called during the init
  console.log('in refreshRegionList');
  $.when(
    readMapCatalog(),
    readMapIdx(),
    getOsmVectStat()
  ).then(renderRegionList);
}

function getOsmVectStat(){
  // get installed, wip state from cmdsrv
  sendCmdSrvCmd("GET-OSM-VECT-STAT", procOsmVectStat);
}

//**************************
// mapInstalled is set by both of the next two functions
// *************************

function procOsmVectStat(data){
  mapStat = data;
  mapWip = Object.keys(mapStat.WIP)
  mapInstalled = Object.keys(mapStat.INSTALLED)
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
   vectorMapIdx = data;
   //mapInstalled = [];
   //mapInstalled = Object.keys(data);
   //for (var map in data) {
   //	 consoleLog (map)
   //  if (data[map]) {
   //    mapInstalled.push(data[map]);
   //  }
   //};
  //consoleLog(mapInstalled + '');
  })
  .fail(jsonErrhandler);

  return resp;
}

function readMapCatalog(){
	//console.log ("in readMapCalalog");
  // read map-catalog.json from common/assets in case osm vectors not installed
  regionList = [];
  var resp = $.ajax({
    type: 'GET',
    url: mapCatalogFile,
    dataType: 'json'
  })
  .done(function( data ) {
    // mapCatalog = {};
    // start with the optional regions
    mapCatalog = data['maps'];
    mapRegionIdx = {}
    for(var key in mapCatalog){
      //console.log(key + '  ' + mapCatalog[key]['title']);
      var region = mapCatalog[key]['region'];

      // mapRegionIdx is a map by region cross reference index
      // it is not vector-map-idx.json

      mapRegionIdx[region] = mapCatalog[key]; // this is not vector-map-idx.json
      //mapRegionIdx[region]['url'] = mapCatalog[key]['detail_url']; ? still needed
      mapRegionIdx[region]['map_id'] = key;
      mapRegionIdx[region]['name'] = region;
      regionList.push(mapRegionIdx[region]);
    }
    // add in the base maps
    for (var base_map in data['base']){
      mapCatalog[base_map] = data['base'][base_map];
      mapCatalog[base_map]['map_id'] = base_map;
    }
  })
  .fail(jsonErrhandler);
  return resp;
}

function renderRegionList(checkbox=true) { // generic
  var html = "";
  sysStorage.map_selected_size = 0; // always set to 0
   // order the regionList by seq number
   var regions = Object.keys(mapRegionIdx);
	console.log ("in renderRegionList");

	// sort on basis of seq
  regions = regionList.sort(function(a,b){
    if (a.seq < b.seq) return -1;
    else return 1;
    });
  //console.log(regions);
	// render each region
  html += '<form>';
  html += '<div><h3>Required Base Files</h3></div>';
  html += renderBaseMapsList(checkbox);
  html += '<div><h3>Hi-Res Regions (Zoom to 14)</h3></div>';
	regions.forEach((region, index) => {
      //console.log(region.title + " " +region.seq);
      //consoleLog(mapInstalled);
      html += genRegionItem(region,checkbox);
  });
  html += '</form>';
  //console.log(html);
  $( "#mapRegionSelectList" ).html(html);
}

function renderBaseMapsList(checkbox) {
  var html = "";
  var mapsTilesBaseMapId = adminConfig['maps_tiles_base'];
  html += genRegionItem(mapCatalog[mapsTilesBaseMapId], checkbox, true, true);
  updateMapSpaceUtil(mapsTilesBaseMapId, true) // because defaults to checked

  html += genRegionItem(mapCatalog[adminConfig['maps_sat_base']], checkbox);

  return html;
}

function genRegionItem(region, checkbox, forceCheck=false, makeDisabled=false) {
  var html = "";
  var checked = '';
  var disabledFlag = '';
  var labelClass = '';

  var installed = false;
  var wip = false;

  console.log("in genRegionItem: " + region.name);
  var itemId = region.title;
  var ksize = region.size / 1024;

  if (selectedMapItems.indexOf(region.name) != -1 || forceCheck)
      checked = 'checked';
  if (makeDisabled)
      disabledFlag = 'disabled';
  if (mapWip.indexOf(region.map_id) != -1){
    checked = 'checked';
    disabledFlag = 'disabled';
    labelClass = 'class="scheduled"';
    // itemMsg = ''; for future installed or wip message
  }
  if (mapInstalled.indexOf(region.map_id) != -1){
    checked = 'checked';
    disabledFlag = 'disabled';
    labelClass = 'class="installed"'
  }

  //console.log(html);
  html += '<div class="extract" data-region={"name":"' + region.name + '"}> ';
  html += '<label ' + labelClass + '>';
  if ( checkbox ) {
    html += '<input type="checkbox" name="' + region.map_id + '"';
    html += ' onChange="updateMapSpace(this)" ' + checked + ' ' + disabledFlag + '> ';
  }
  html += itemId;
  if ( checkbox ) { html += '</input>';};
  html += '</label>'; // end input
  html += ' ' + readableSize(ksize);
  html += '</div>';
  //console.log(html);

  return html;
}

// not used
function get_region_from_url(url){
  for (const region in mapCatalog ){
    if (mapCatalog[region].hasOwnProperty('url') &&
      mapCatalog[region].url === url ){
      return mapCatalog[region].name;
    }
  }
  return null
}

function instMaps(){
  var mapId;
  var region;
  selectedMapItems = []; // items no longer selected as are being installed
  $('#mapRegionSelectList input').each( function(){
    if (this.type == "checkbox")
      if (this.checked){
        //var skip_map = false;
        mapId = this.name;

        // once we mark maps on screen as installed we will silently skip them
        if (mapId in mapInstalled)
          alert ("Selected Map Region is already installed.\n");
        else
          instMapItem(mapId);
      }
    });
}

function instMapItem(map_id) {
  var command = "INST-OSM-VECT-SET";
  var cmd_args = {};
  cmd_args['osm_vect_id'] = map_id;
  cmd = command + " " + JSON.stringify(cmd_args);
  sendCmdSrvCmd(cmd, genericCmdHandler,"INST-MAP");
  mapDownloading.push(map_id);
  if ( mapWip.indexOf(map_id) == -1 )
     mapWip.push(map_id);
  console.log('mapWip: ' + map_id);
  return true;
}

function updateMapSpace(cb){
  console.log("in updateMapSpace" + cb);
  var mapId = cb.name;
  updateMapSpaceUtil(mapId, cb.checked);
}

function updateMapSpaceUtil(mapId, checked){
  var size =  parseInt(mapCatalog[mapId].size);

  var selectedIdx = selectedMapItems.indexOf(mapId);

  if (checked){
    if (mapInstalled.indexOf(mapId) == -1){ // only update if not already installed mods
      sysStorage.map_selected_size += size;
      selectedMapItems.push(mapId);
    }
  }
  else {
    if (selectedIdx != -1){
      sysStorage.map_selected_size -= size;
      selectedMapItems.splice(selectedIdx, 1);
    }
  }

  displaySpaceAvail();
}

function renderMap(){
  //console.log('in renderMap');
  if (Object.keys(mapCatalog).length === 0)
    $("#map-container").html('<BR><BR><center><span style="font-size: 30px;"><B>MAPS NOT INSTALLED<B></span></center>');
  else if (adminConfig.osm_version != 'V2')
    $("#map-container").html('<BR><BR><center><span style="font-size: 30px;"><B>Your version of Maps is not support by this version of Admin Console<B></span></center>');
  else{
     window.map.setTarget($("#map-container")[0]);
     window.map.render();
     refreshRegionList();
     //renderRegionList(true);
  }
}
function initMap(){
   var url =  mapAssetsDir + 'regions.json';
   sysStorage.map_selected_size = 0; // always set to 0
   //if (UrlExists(url)){
   //   $.when(getMapStat()).then(renderRegionList);
   //}

   refreshRegionList(); // should probably only read data here as will draw when option clicked, but small perf penalty
}

function UrlExists(url)
{
    var http = new XMLHttpRequest();
    http.open('HEAD', url, false);
    http.send();
    return http.status!=404;
}
