// map_functions.js
// copyright 2019 George Hunt
var regionGeojson = {};
var regionDict = {};
var regionList = [];
var consoleJsonDir = '/common/assets/';
var onChangeFunc = "setSize";

function readBoundingBox(){
	console.log ("in readBoundingBox");
  var resp = $.ajax({
    type: 'GET',
    url: consoleJsonDir + 'regions.json',
    dataType: 'json'
  })
  .done(function( data ) {
  	 regionGeojson = data;
    regionDict = regionGeojson['regions'];
    for(var key in regionDict){
      console.log(key + '  ' + regionDict[key]['title']);
      regionDict[key]['name'] = key;
      regionList.push(regionDict[key]);
    }
    renderRegionList();
  })
  .fail(jsonErrhandler);
}

function renderRegionList() { // generic
	var html = "";
   // order the regionList by seq number
   var regions = regionList;
	console.log ("in renderRegionList");

	// sort on basis of seq
  regions = regions.sort(function(a,b){
    if (a.seq < b.seq) return -1;
    else return 1;
    });
  console.log(regions);
	// render each region
   html += '<form>';
	regions.forEach((region, index) => { // now render the html
      console.log(region.title + " " +region.seq);
      html += genRegionItem(region);
  });
  html += '</form>';
  console.log(html);
  $( "#regionlist" ).html(html);
}

readBoundingBox();

function genRegionItem(region) {
  var html = "";
  console.log("in genRegionItem: " + region.name);
  var itemId = region.title;
  var ksize = region.size / 1000;
console.log(html);
  html += '<div  class="extract" data-region={"name":"' + region.name + '"}>';
  html += ' <label><input type="checkbox" name="region"';
  html += ' onChange="totalSpace(this)">' + itemId + '</input></label>'; // end input
  html += ' Size: ' + readableSize(ksize);
  html += '</div>';
console.log(html);

  return html;
}

function instMapItem(name) {
  var command = "INST-OSM-VECT-SET";
  var cmd_args = {};
  cmd_args['osm_vect_id'] = name;
  cmd = command + " " + JSON.stringify(cmd_args);
  sendCmdSrvCmd(cmd, genericCmdHandler);
  mapDownloading.push(name);
  //renderOer2goCatalog();
  return true;
}

function jsonErrhandler (jqXHR, textStatus, errorThrown)
{
  // only handle json parse errors here, others in ajaxErrHandler
  if (textStatus == "parserror") {
    //alert ("Json Errhandler: " + textStatus + ", " + errorThrown);
    displayServerCommandStatus("Json Errhandler: " + textStatus + ", " + errorThrown);
  }
  //consoleLog("In Error Handler logging jqXHR");
  consoleLog(textStatus);
  consoleLog(errorThrown);
  consoleLog(jqXHR);

  return false;
}

function totalSpace(){
  var sum = 0;
  $( ".extract" ).each(function(ind,elem){
    var data = JSON.parse($(this).attr('data-region'));
    var region = data.name;
    var size = parseInt(regionDict[region]['size']);
    var chk = $( this ).find(':checkbox').prop("checked") == true;
    if (chk && typeof size !== 'undefined')
        sum += size;
    });
   var ksize = sum / 1000;
  $( "#osmDiskSpace" ).html(readableSize(ksize));
}
