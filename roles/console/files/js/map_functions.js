// map_functions.js
// copyright 2019 George Hunt
// rewritten for version 2

var regionList = [];
var mapProdDir = '/osm-vector-maps/viewer';
var mapAssetsDir = '/osm-vector-maps/viewer/assets';
var mapTileServer = '/osm-vector-maps/installer/tileserver.php?./detail/{z}/{x}/{y}.pbf';

var mapCatalogFile = '/common/assets/adm-map-catalog.json' // unique to admin console
var mapsDrawn = {'regions': false, 'addons': false};

var mapSelectedLat = 0;
var mapSelectedLong = 0;
var mapSelectedRadius = 50;

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
  //sysStorage.map_selected_size = 0; // always set to 0
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
  html += '<div class="installed">INSTALLED</div>';
  html += '<div class="scheduled">DOWNLOADING</div>';
  //console.log(html);

  $( "#mapRegionSelectList" ).html(html);
  updateMapEstimatedSpace();
}

function renderBaseMapsList(checkbox) {
  var html = "";
  var mapsTilesBaseMapId = adminConfig['maps_tiles_base'];
  var mapsSatBaseMapId = adminConfig['maps_sat_base'];
  html += genRegionItem(mapCatalog[mapsTilesBaseMapId], checkbox, true, true);
  updateMapSpaceUtil(mapsTilesBaseMapId, true) // because defaults to checked

  html += genRegionItem(mapsSatBaseMapId, checkbox, true, true);
  updateMapSpaceUtil(mapsSatBaseMapId, true) // because defaults to checked
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

function instMaps(){
  calcMapSelected();
  selectedMapItems.forEach(function (mapId, index){
    if (mapWip.indexOf(mapId) == -1)
      instMapItem(mapId);
  });
  alert ("Selected Map Regions scheduled to be installed.\n\nPlease view Utilities->Display Job Status to see the results.");
  renderRegionMap();
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

function instSatArea() {
  var command = "INST-SAT-AREA";
  var cmd_args = {};
  cmd_args['longitude'] = mapSelectedLong;
  cmd_args['latitude'] = mapSelectedLat;
  cmd_args['radius'] = mapSelectedRadius;

  cmd = command + " " + JSON.stringify(cmd_args);
  sendCmdSrvCmd(cmd, genericCmdHandler,"INST-SAT");
  alert ("Selected Satellite Photos scheduled to be installed.\n\nPlease view Utilities->Display Job Status to see the results.");

  return true;
}

function updateMapSpace(cb){ // for single clicks only
  console.log("in updateMapSpace" + cb);
  var mapId = cb.name;
  updateMapSpaceUtil(mapId, cb.checked);
}

function updateMapSpaceUtil(mapId, checked){
  if (mapInstalled.indexOf(mapId) != -1) // already installed so not part of allocation, already in storage
    return;

  var size =  parseInt(mapCatalog[mapId].size);
  var selectedIdx = selectedMapItems.indexOf(mapId);

  if (checked){
    sysStorage.map_selected_size += size;
    selectedMapItems.push(mapId);
  } else {
    sysStorage.map_selected_size -= size;
    selectedMapItems.splice(selectedIdx, 1);
  }

  displaySpaceAvail();
}

function updateMapEstimatedSpace(){
  calcMapSelected();
  displaySpaceAvail();
}

function calcMapSelected(){
  // adds all selected to array even if wip, but not if installed
  var mapId;
  selectedMapItems = []; // refresh list
  $('#mapRegionSelectList input').each( function(){
    if (this.type == "checkbox")
      if (this.checked){
        mapId = this.name;
        if (mapInstalled.indexOf(mapId) == -1){
          selectedMapItems.push(mapId);
        }
    }
  });
}

function renderRegionMap(){
  //console.log('in renderRegionMap');
  if (Object.keys(mapCatalog).length === 0)
    $("#mapRegionContainer").html('<BR><BR><center><span style="font-size: 30px;"><B>MAPS NOT INSTALLED<B></span></center>');
  else if (adminConfig.osm_version != 'V2')
    $("#mapRegionContainer").html('<BR><BR><center><span style="font-size: 30px;"><B>Your version of Maps is not support by this version of Admin Console<B></span></center>');
  else{
    //drawmap("mapRegionsContainer");
    //drawmap("mapAddonsContainer");
    if (!mapsDrawn.regions){
      showRegionsMap();
      mapsDrawn.regions = true;
    }

    //showAddonsMap();
    refreshRegionList();
    //renderRegionList(true);
  }
}

function renderAddonsMap(){
  if (Object.keys(mapCatalog).length === 0)
    $("#mapAddonContainer").html('<BR><BR><center><span style="font-size: 30px;"><B>MAPS NOT INSTALLED<B></span></center>');
  else if (!tile_base_installed || !sat_base_installed){
    var warning = '<BR><BR><center><span style="font-size: 18px;"><B>BASE MAPS NOT INSTALLED<B></span></center>';
    warning += '<BR><BR><center><span style="font-size: 18px;">Please install them in <b>Get Map Regions</b></span></center>';
    $("#mapAddonContainer").html(warning);
    }
    else{
    if (!mapsDrawn.addons){
      showAddonsMap();
      mapsDrawn.addons = true;
    }
  }
}

function showRegionsMap() {
  // variable to control which features are shown
  var mapShowAttr = {};

  $('#mapRegionContainer').html('') // clear container
  var map = new ol.Map({
    target: "mapRegionContainer",
    layers: [
      new ol.layer.Vector({
        source: new ol.source.Vector({
          format: new ol.format.GeoJSON(),
          url: mapAssetsDir + '/countries.json'
        }),
        style: new ol.style.Style({
          fill: new ol.style.Fill({
            color: 'rgb(219, 180, 131)'
          }),
          stroke: new ol.style.Stroke({
            color: 'white'
          })
        })
      }),
    ],
    view: new ol.View({
      center: [0, 0],
      zoom: 2
    })
  });

  var setBoxStyle = function (feature) {
    var name = feature.get("name");
    //alert(keys+'');
    if (typeof mapShowAttr !== 'undefined' &&
      mapShowAttr != null && name == mapShowAttr) {
      return new ol.style.Style({
        fill: new ol.style.Fill({
          color: 'rgba(67, 163, 46, 0.2)'
        }),
        stroke: new ol.style.Stroke({
          color: 'rgba(67, 163, 46, 1)',
          width: 2
        })
      })
    } else {
      return new ol.style.Style({
        fill: new ol.style.Fill({
          color: 'rgba(255,255,255,.10)'
        }),
        stroke: new ol.style.Stroke({
          color: 'rgba(255,255,255,.3)'
        })
      })
    }
  }

  var boxLayer = new ol.layer.Vector({
    source: new ol.source.Vector({
      format: new ol.format.GeoJSON(),
      url: mapAssetsDir + '/bboxes.geojson'
    }),
    id: 'boxes',
    style: setBoxStyle
  });
  map.addLayer(boxLayer);

  $('#mapRegionSelection').on("mouseover", ".extract", function () {
    var data = JSON.parse($(this).attr('data-region'));
    mapShowAttr = data.name;
    //setBoxStyle();
    boxLayer.changed();
  });

  $('#mapRegionSelection').on("mouseout", ".extract", function () {
    var data = JSON.parse($(this).attr('data-region'));
    mapShowAttr = '';
    boxLayer.changed();
  });
}

function showAddonsMap() {
  // variable to control which features are shown
  var mapShowAttr = {};
  var lat = 20;
  var lon = -122;
  var radius = 100;
  var boxcoords = [[[0,0],[0,1],[1,1],[1,0],[0,0]]];
  var ptrcoords = [0,0];

  var TileLayer = ol.layer.Tile;
  var TileImage = ol.source.TileImage;
  var VectorTileLayer = ol.layer.VectorTile;
  var VectorTileSource = ol.source.VectorTile;
  var VectorLayer = ol.layer.Vector;
  var VectorSource = ol.source.Vector;
  var MVT = ol.format.MVT;
  var fromLonLat = ol.proj.fromLonLat;
  var toLonLat = ol.proj.toLonLat;

  $('#mapAddonContainer').html('') // clear container

  var tileLayer = new VectorTileLayer({
    source: new VectorTileSource({
       format: new MVT(),
       url: mapTileServer,
       minZoom: 0,
       attributions: ['&copy <a href="https://openstreetmap.org">OpenStreetMaps, </a> <a href="https://openmaptiles.com"> &copy OpenMapTiles</a>'
       ]
       //maxZoom: 14
    }),
    declutter: true,
  });

  var styleFunction = olms.stylefunction;
    fetch('/osm-vector-maps/installer/style-osm.json').then(function(response) {
      response.json().then(function(glStyle) {
        styleFunction(tileLayer, glStyle,"openmaptiles");
      });
    });

  var getBoxSource = function (lon, lat){
    var box_spec = calcMapBoxCoords(mapSelectedRadius * 1000.0,lon,lat);
    var boxFeature = new ol.Feature({
       geometry: new ol.geom.Polygon([box_spec])
    });
    var boxSource =  new ol.source.Vector({
       features: [boxFeature]
    });
    return(boxSource)
  };

  var satLayer = new ol.layer.Vector({
    style: new ol.style.Style({
       stroke: new ol.style.Stroke({
         color: 'rgb(255, 0, 0, 10)'
       })
    }),
    source: getBoxSource(mapSelectedLong, mapSelectedLat)
  });

  var pointerLayer = new ol.layer.Vector({
    style: new ol.style.Style({
       stroke: new ol.style.Stroke({
         color: 'rgb(115, 77, 38)'
       })
    }),
    source: getBoxSource(lon, lat)
  });

  var map = new ol.Map({
    target: "mapAddonContainer",
    layers: [tileLayer, satLayer, pointerLayer],
    view: new ol.View({
      center: fromLonLat([lon,lat]),
      zoom: 2
    })
  }); //end of new Map

  var view = map.getView();

  map.on("pointermove", function(evt) {
    var toLonLat = ol.proj.toLonLat;
    ptrcoords = toLonLat(evt.coordinate);
    lat = ptrcoords[1];
    lon = ptrcoords[0];
    //satLayer.getSource().clear();
    //update_satbox(evt);
    pointerLayer.setSource(getBoxSource(lon, lat));
    pointerLayer.changed();
  });

  $( '#mapAddonsSelection' ).on('change','#mapAreaSelection',function(elem){
    if ( elem.target.value == 'small' )
       radius = 50;
    else if (elem.target.value == 'medium')
       radius = 150
    else if (elem.target.value == 'large')
       radius = 500;
    mapSelectedRadius = radius;

    satLayer.setSource(getBoxSource(mapSelectedLong, mapSelectedLat));
    satLayer.changed();
    console.log("radius changed");
  });

  map.on("click", function(evt) {
    var coords = ol.proj.toLonLat(evt.coordinate);
    lat = coords[1];
    lon = coords[0];
    mapSelectedLat = lat;
    mapSelectedLong = lon;
    satLayer.setSource(getBoxSource(mapSelectedLong, mapSelectedLat));
    satLayer.changed();
    $('#mapLatLong').html('Latitude: ' + lat.toFixed(4) + '<br>Longitude: ' + lon.toFixed(4));
  });

}

function calcMapBoxCoords(radius,lon,lat){
  // go to polar coords -- Math functions want and provide in radians
  var deltaY = Math.asin(radius / 6378000.0);
  //console.log('deltaYradians'+deltaY);
  var lat_rad = lat * Math.PI /180;
  var deltaX = deltaY / Math.cos(lat_rad);
  var lon_rad = lon * Math.PI / 180;
  var west = (lon_rad - deltaX) * 180 / Math.PI;
  var south = (lat_rad - deltaY) * 180 / Math.PI;
  var east = (lon_rad + deltaX) * 180 / Math.PI
  var north = (lat_rad + deltaY) * 180 / Math.PI
  //console.log('west:'+west+'south:'+south+'east:'+east+'north;'+north)
  var sw = [west,south];
  var se = [east,south];
  var ne = [east,north];
  var nw = [west,north];
  var fromLonLat = ol.proj.fromLonLat;
  sw = fromLonLat(sw);
  se = fromLonLat(se);
  ne = fromLonLat(ne);
  nw = fromLonLat(nw);
  //console.log('box x:' + sw[0]-se[0] + 'box y:' + ne[1]-se[1]);
  var boxcoords = [nw,sw,se,ne,nw];
  //console.log(boxcoords + 'boxcoords');
  return(boxcoords);
}

function initMap(){ // not used

  refreshRegionList(); // should probably only read data here as will draw when option clicked, but small perf penalty
}
