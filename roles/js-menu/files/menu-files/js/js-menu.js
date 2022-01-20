// js-menu.js
// copyright 2019 Tim Moody

var menuConfig = {};

// Flags
var debug = true; // start with on a let it be turned off by menu.json so can catch initial read errors
// var forceFullDisplay = false; // not used
var dynamicHtml = true; // not used. is a hook for generation of static html

var include_apk_links = false; // for now make this conditional
// constants
var zimVersionIdx = "/common/assets/zim_version_idx.json";
var osmVersionIdx = "/common/assets/vector-map-idx.json";
var htmlBaseUrl = "/modules/";
var webrootBaseUrl = "/";
var apkBaseUrl = "/content/apk/";
var downloadBaseUrl = "/files/"
var menuUrl = '/js-menu/menu-files/';
var configJson = '/js-menu/config.json';
var menuJson = 'menu.json'; // later soft code this as option in index.html
var defUrl = menuUrl + 'menu-defs/';
var imageUrl = menuUrl + 'images/';
var menuServicesUrl = menuUrl + 'services/';
var iiabMeterUrl = menuServicesUrl + "/iiab_meter.php"
var undefinedPageUrl = "/js-menu/menu-files/html/undefined.html"
var consoleJsonDir = "/common/assets/";
var langCodes = {}; // iso code, local name and English name for all languages we support, read from file
var langCodesIndex = {}; // iso2 to iso code map
var defaultLang = "eng";
var langGroups = { "en": "eng" }; // language codes to treat as a single code
//var selectedLangs = ["en","ne"]; // languages selected by gui for display of content
var selectedLangs = []; // languages selected by gui for display of content

var host = 'http://' + window.location.hostname;
var isMobile = detectMob();
var toggleDisplay = false; // if true display opposite - desktop on mobile and vice versa
var showFullDisplay = true; // leave for now in case we want to toggle
// var showFullDisplay = true; // show full display if not mobile device or if force Full Display
// if (isMobile && !forceFullDisplay)
//  showFullDisplay = false;
// var baseFontSize = 16; // for non-mobile in px
// var mobilePortraitSize = baseFontSize + "px";
// var mobileLscapeSize = baseFontSize / 2  + "px";
var showDescription = false;
var showExtraDescription = false;
var showExtraHtml = false;
var showFootnote = false;
var menuParams = {};
var menuItems = [];
var menuHtml = "";
var menuDefs = {};
var zimVersions = {};
var osmVersions = {};
var zimSubstParams = ["article_count", "media_count", "size", "tags",
    "language", "zim_date"];
var hrefRegEx;
var substRegEx = {};

var menuDivId = "content";
var scaffold = $.Deferred();
var ajaxCallCount = 0;
var i;
var searchResults = "";

// get config
var getConfigJson = $.getJSON(configJson)
    .done(function (data) {
        consoleLog(data);
        menuConfig = data;
        downloadBaseUrl = menuConfig['downloadBaseUrl'];
        apkBaseUrl = menuConfig['apkBaseUrl'];
        //  if (isMobile){
        //    baseFontSize = menuConfig['mobilePortraitSize'].split("px")[0];
        //    mobilePortraitSize = baseFontSize + "px";
        //    mobileLscapeSize = baseFontSize / 2 + "px";
        //    window.addEventListener("resize", resizeHandler);
        //  }
    })
    .fail(jsonErrhandler);

// get menu items
var getMenuJson = $.getJSON(menuJson)
    .done(function (data) {
        consoleLog(data);
        menuParams = data;
        if (menuParams.hasOwnProperty('debug')) {
            debug = menuParams.debug;
        }
        menuItems = menuParams.menu_items_1; // hooks for multi tab menu later
    })
    .fail(jsonErrhandler);

// get name to instance index for zim files
var getZimVersions = $.getJSON(zimVersionIdx)
    .done(function (data) {
        //consoleLog(data);
        zimVersions = data;
    })
    .fail(jsonErrhandler);

// get name to instance index for osm files
var getOsmVersions = $.getJSON(osmVersionIdx)
    .done(function (data) {
        //consoleLog(data);
        osmVersions = data;
    })
    .fail(jsonErrhandler);

var getLangCodes = $.getJSON(consoleJsonDir + 'lang_codes.json')
    .done(function (data) {
        langCodes = data;
        for (var lang in langCodes)
            langCodesIndex[langCodes[lang]['iso2']] = lang;
        consoleLog(langCodes);
    })
    .fail(jsonErrhandler);

// $.when(getMenuJson, getZimVersions, getConfigJson, getLangCodes).always(procMenu);

// This is the main processing
function jsMenuMain(menuDiv) {
    menuDivId = menuDiv || "content";
    genRegEx(); // regular expressions for subtitution

    if (dynamicHtml) {
        if (hasLocalStorage()) {
            getLocalStore();
        } else {
            toggleDisplay = false;
        }
        $.when(getMenuJson, getZimVersions, getConfigJson).always(procPage); // ignore errors like kiwix not installed
    }
    else {
        $.when(getConfigJson).then(procStatic);
    }
}

function procPage() {
    createScaffold();
    drawMenu();
    updateServerTime();

    // choose the header and header font family
    $('#headerMobile').css('font-family', menuParams.mobile_header_font);
    $('#headerDesktop').css('font-family', menuParams.desktop_header_font);
    if (!menuParams.allow_poweroff) {
        gEBI("poweroffLink").style.display = "none";
    }
    else {
        gEBI("poweroffLink").innerHTML = "<strong>" + menuParams.poweroff_prompt + "</strong>";
        gEBI("poweroffLink").style.display = "block";
    }

    if (isMobile) {
        $('#headerMobile').css('display', 'flex');
        if (!menuParams.allow_kiwix_search) {
            gEBI("btn-kiwixSearch").style.display = "none";
        }
    }
    else
        $('#headerDesktop').css('display', 'flex');
}

function updateServerTime() {
    if (isMobile || navigator.userAgent.search('Win64') !== -1 || navigator.platform == 'MacIntel') {
        var allowed = menuConfig.apache_allow_sudo || false;
        var desired = menuParams.allow_server_time_update || false;
        if (allowed && desired) {

            var now = new Date();
            var user_utc_datetime = now.toISOString().substr(0, 19) + 'Z';
            var user_timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

            $.ajax({
                url: menuServicesUrl + 'set-server-time.php',
                type: 'POST',
                data: {
                    user_agent: navigator.userAgent,
                    user_utc_datetime: user_utc_datetime,
                    user_timezone: user_timezone
                },
                dataType: 'text'
            })
                .done(function (data) {
                    consoleLog(data);
                    //alert(data);
                })
                .fail(function (data) {
                    consoleLog(data);
                    //alert(data);
                });
        }
    }
}

function genRegEx() {
    hrefRegEx = new RegExp('##HREF-BASE##', 'g');
    for (var i = 0; i < zimSubstParams.length; i++) {
        var param = zimSubstParams[i];
        substRegEx[param] = new RegExp('##' + param.toLocaleUpperCase() + '##', 'gi');
    }
}

function createScaffold() {
    var html = "";
    for (var i = 0; i < menuItems.length; i++) {
        var menu_item_name = menuItems[i];
        menuDefs[menu_item_name] = {}
        menuItemDivId = i.toString() + "-" + menu_item_name;
        menuDefs[menu_item_name]['menu_id'] = menuItemDivId;

        html += '<div id="' + menuItemDivId + '" class="flex-row content-item" dir="auto">&emsp;Attempting to load ' + menu_item_name + ' </div>';
    }
    $("#" + menuDivId).html(html);
    $(".toggleExtraHtml").toggle(showExtraHtml);

}

function procStatic() {
    $('a[href*="##HOST##"]')
        .each(function () {
            hrefStr = $(this).attr('href');
            hrefStr = hrefStr.replace(/##HOST##/g, window.location.host);
            this.href = hrefStr;
        });
    resizeHandler(); // if a mobile device set font-size for portrait or landscape
    $('a').click(iiabMeter);
}

function drawMenu() {
    calcItemVerbosity();
    for (var i = 0; i < menuItems.length; i++) {
        consoleLog(menuItems[i]);
        if (menuDefs[menuItems[i]].hasOwnProperty('menu_item_name')) // already loaded
            procMenuItem(menuDefs[menuItems[i]]);
        else
            getMenuDef(menuItems[i]);
    }
}

function calcItemVerbosity() {
    showDescription = false;
    showExtraDescription = false;
    showExtraHtml = false;
    showFootnote = false;
    var showMobile = isMobile;
    if (toggleDisplay)
        showMobile = !showMobile;
    if (showMobile) {
        if (menuParams.mobile_incl_description)
            showDescription = true
        if (menuParams.mobile_incl_extra_description)
            showExtraDescription = true
        if (menuParams.mobile_incl_extra_html)
            showExtraHtml = true
        if (menuParams.mobile_incl_footnote)
            showFootnote = true
    }
    else {
        if (menuParams.desktop_incl_description)
            showDescription = true
        if (menuParams.desktop_incl_extra_description)
            showExtraDescription = true
        if (menuParams.desktop_incl_extra_html)
            showExtraHtml = true
        if (menuParams.desktop_incl_footnote)
            showFootnote = true
    }
}

function setDisplayToggle() {
    toggleDisplay = !toggleDisplay;
    drawMenu();
    if (hasLocalStorage()) {
        setLocalStore();
    }
    //activateButtons();
}

function getMenuDef(menuItem) {
    var module;
    var menuId = menuDefs[menuItem]['menu_id']; // save this value
    ajaxCallCount += 1;

    var resp = $.ajax({
        type: 'GET',
        async: true,
        url: defUrl + menuItem + '.json',
        dataType: 'json'
    })
        .done(function (data) {
            menuDefs[menuItem] = data;
            menuDefs[menuItem]['menu_item_name'] = menuItem;
            menuDefs[menuItem]['add_html'] = "";
            menuDefs[menuItem]['menu_id'] = menuId;
            module = menuDefs[menuItem];
            //alert(string(substRegEx));
            if (menuDefs[menuItem].hasOwnProperty('zim_name')) {
                zimName = menuDefs[menuItem]['zim_name'];
                for (var i = 0; i < zimSubstParams.length; i++) {
                    field = zimSubstParams[i];
                    if (zimVersions.hasOwnProperty(zimName) &&
                        zimVersions[zimName].hasOwnProperty(field)) {
                        menuDefs[menuItem][field] = zimVersions[zimName][field];
                    }
                }
            }
            procMenuItem(module);
            checkMenuDone();
        })
        .fail(function (jqXHR, textStatus, errorThrown) {
            var menuHtml = '<div class="content-item" style="padding:10px; color: red; font-size: 1.5em">' + menuItem + ' - file not found or improperly formatted</div>';
            $("#" + menuId).html(menuHtml);
            checkMenuDone();
            jsonErrhandler(jqXHR, textStatus, errorThrown); // probably a json error
        });
    return resp;
}

function procMenuItem(module) {
    var menuHtml = "";
    var langClass = "";
    var menuItemDivId = "#" + module['menu_id'];

    if (selectedLangs.length > 0 && selectedLangs.indexOf(module.lang) == -1) { // not a selected language
        $(menuItemDivId).hide();
        return;
    }
    $(menuItemDivId).show();
    consoleLog(module);
    if (module['intended_use'] == "zim")
        menuHtml += calcZimLink(module);
    else if (module['intended_use'] == "html")
        menuHtml += calcHtmlLink(module);
    else if (module['intended_use'] == "webroot")
        menuHtml += calcWebrootLink(module);
    else if (module['intended_use'] == "external")
        menuHtml += calcExternalLink(module);
    else if (module['intended_use'] == "kalite")
        menuHtml += calcKaliteLink(module);
    else if (module['intended_use'] == "kolibri")
        menuHtml += calcKolibriLink(module);
    else if (module['intended_use'] == "cups")
        menuHtml += calcCupsLink(module);
    else if (module['intended_use'] == "nodered")
        menuHtml += calcNoderedLink(module);
    else if (module['intended_use'] == "calibre")
        menuHtml += calcCalibreLink(module);
    else if (module['intended_use'] == "calibreweb")
        menuHtml += calcCalibreWebLink(module);
    else if (module['intended_use'] == "internetarchive")
        menuHtml += calcInternetArchiveLink(module);
    else if (module['intended_use'] == "map")
        menuHtml += calcMapLink(module);
    else if (module['intended_use'] == "info")
        menuHtml += calcInfoLink(module);
    else if (module['intended_use'] == "download")
        menuHtml += calcDownloadLink(module);

    else
        menuHtml += '<div class="content-item" style="padding:10px; color: red; font-size: 1.5em">' + module['menu_item_name'] + ' - unknown module type</div>';

    langClass = 'lang_' + module.lang;
    $(menuItemDivId).addClass(langClass);
    $(menuItemDivId).html(menuHtml);
    getExtraHtml(module);
}

function calcZimLink(module) {
    // if kiwix_url is defined use it otherwise use port
    var href = '';
    if (zimVersions.hasOwnProperty(module.zim_name) &&
        typeof zimVersions[module.zim_name].file_name != 'undefined') {
        href = zimVersions[module.zim_name].file_name + '/';
        if (menuConfig.hasOwnProperty('kiwixUrl'))
            href = menuConfig.kiwixUrl + href;
        else
            href = host + ':' + menuConfig.kiwixPort + '/' + href;
    }
    else
        href = undefinedPageUrl + '?menu_item=' + module.menu_item_name + '&zim_name=' + module.zim_name; //not defined in zimVersions
    var html = calcItemHtml(href, module);
    return html
}

function calcHtmlLink(module) {
    var href = htmlBaseUrl + module.moddir;

    var html = calcItemHtml(href, module);
    return html
}

function calcWebrootLink(module) {
    var href = webrootBaseUrl;
    // var href = webrootBaseUrl + module.moddir;

    var html = calcItemHtml(href, module);
    return html
}

function calcExternalLink(module) {
    var href = "";

    var html = calcItemHtml(href, module);
    return html
}

function calcKaliteLink(module) {
    var portRef = module.lang + '-kalitePort';
    var href = host + ':'
    if (menuConfig.hasOwnProperty(portRef))
        href += menuConfig[portRef];
    else
        href += menuConfig['en-kalitePort'];

    var html = calcItemHtml(href, module);
    return html
}

function calcKolibriLink(module) {
    // if kolibri_url is defined use it otherwise use port (which currently doesn't work)
    var href = '';
    if (menuConfig.hasOwnProperty('kolibriUrl'))
        href = menuConfig.kolibriUrl + href;
    else {
        var portRef = module.lang + '-kolibriPort';
        if (menuConfig.hasOwnProperty(portRef))
            href = host + ':' + menuConfig[portRef] + '/' + href;
        else
            href = host + ':' + menuConfig.kolibriPort + '/' + href;
    }

    if (module.hasOwnProperty('kolibri_channel_id'))
        if (module.kolibri_channel_id != '')
            href += '/learn/#/topics/' + module.kolibri_channel_id;

    var html = calcItemHtml(href, module);
    return html
}

function calcCalibreLink(module) {
    var href = host + ':' + menuConfig.calibrePort;

    var html = calcItemHtml(href, module);
    return html
}

function calcCalibreWebLink(module) {
    var href = host + ':' + menuConfig.calibreWebPort;

    var html = calcItemHtml(href, module);
    return html
}

function calcCupsLink(module) {
    var href = host + ':' + menuConfig.cupsPort;

    var html = calcItemHtml(href, module);
    return html
}

function calcNoderedLink(module) {
    var href = host + ':' + menuConfig.noderedPort;

    var html = calcItemHtml(href, module);
    return html
}

function calcInternetArchiveLink(module) {
    var href = host + ':' + menuConfig.internetarchivePort;
    var html = calcItemHtml(href, module);
    return html
}

function calcMapLink(module) {
    var href = 'osm-vector-maps/';

    if (osmVersions.hasOwnProperty(module.map_name) &&
        typeof osmVersions[module.map_name].file_name != 'undefined') {
        href = host + ':/' + href + osmVersions[module.map_name].file_name + '/';
    } else {
        href = host + ':/' + href;
    }
    var html = calcItemHtml(href, module);
    return html

}

function calcInfoLink(module) {
    var href = null;

    var html = calcItemHtml(href, module);
    return html
}

function calcDownloadLink(module) {
    var href = downloadBaseUrl + '/' + module.download_folder;
    if (module.hasOwnProperty("download_file")) // treat specific file as a start page for downloads
        module['start_url'] = module['download_file']

    var html = calcItemHtml(href, module);
    return html
}

function calcItemHtml(href, module) {
    var startPage = href;
    var html = "";

    // record href for extra html
    menuDefs[module.menu_item_name]['href'] = href;

    // a little kluge but ignore start_url if is dummy link to undefinedPageUrl
    if (href != undefinedPageUrl) {
        if (module.hasOwnProperty("start_url") && module.start_url != "") {
            if (module.intended_use == "external") // don't add initial / if external
                startPage = module['start_url'];
            else {
                if (startPage[startPage.length - 1] == '/')
                    startPage = startPage.substr(0, startPage.length - 1); // strip final /
                if (module['start_url'][0] != '/')
                    startPage = startPage + '/' + module['start_url'];
                else
                    startPage = startPage + module['start_url'];
            }
        }
    }
    //var html = '<div style="display: table;"><div style="display: table-row;">';
    // icon
    html += '<div class="content-icon">';
    if (href != null)
        html += '<a href="' + startPage + '"><img src="' + imageUrl + module.logo_url + '" alt="' + module.title + '"></div>';
    else
        html += '<img src="' + imageUrl + module.logo_url + '" alt="' + module.title + '"></div>';
    // item right side
    html += '<div class="flex-col">';
    html += '<div class="content-cell">';
    // title
    html += '<div class="content-item-title">';
    if (href != null)
        html += '<a href="' + startPage + '">' + module.title + '</a>';
    else
        html += module.title;
    html += '</div>'; // end content-item-title
    // description - this will become multiple parts
    if (showDescription) {
        html += getTextField(module, 'description');
        // apks for medwiki, etc. move to download menu def
        if (module.hasOwnProperty("apk_file") && include_apk_links) {
            var sizeClause = '';
            if (module.hasOwnProperty("apk_file_size"))
                sizeClause = ' (' + module.apk_file_size + ')';
            if (menuConfig['apkLinkPhrase'].hasOwnProperty(module.lang))
                html += '<p>' + menuConfig['apkLinkPhrase'][module.lang] + ' <span dir="ltr"><a href="' + apkBaseUrl + module.apk_file + '">' + module.apk_file + sizeClause + '</a></span></p>';
            else
                html += '<p>Click here to download <a href="' + apkBaseUrl + module.apk_file + '">' + module.apk_file + '</a></p>';
        }
    }
    if (showExtraDescription)
        html += getTextField(module, 'extra_description');
    consoleLog('href = ' + href);
    html += '<div id="' + module.menu_id + '-htmlf" class="content-extra toggleExtraHtml"></div>'; // scaffold for extra html
    if (showFootnote) {
        var footnote = getTextField(module, 'footnote', false);
        if (footnote != "")
            html += '<p><small>' + footnote + '</small></p>';
    }
    html += '</div></div></div>';

    return html;
}

function getTextField(module, fieldName, addPar) {
    addPar = addPar || true;
    var html = "";

    if (module.hasOwnProperty(fieldName) && module[fieldName] != "") {
        html = substitute(module[fieldName], module)
        if (addPar)
            html = '<p>' + html + '</p>';
    }
    return html;
}

function substitute(instr, module) {
    for (var i = 0; i < zimSubstParams.length; i++) {
        field = zimSubstParams[i];
        if (field === "article_count" || field === "media_count")    //  && typeof module[field] === "string"
            // 9999999 -> 9,999,999 or 9.999.999 or 9 999 999 in footnotes, depending on locale
            instr = instr.replace(substRegEx[field], Number(module[field]).toLocaleString());
        else
            instr = instr.replace(substRegEx[field], module[field]);
    }
    return instr;
}

function detectMob() {
    var check = false;
    (function (a) { if (/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino|android|ipad|playbook|silk/i.test(a) || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0, 4))) check = true; })(navigator.userAgent || navigator.vendor || window.opera);
    return check;
}

function resizeHandler() {
    if (isMobile) {
        if (screen.height > screen.width)
            $(":root").css("font-size", mobilePortraitSize);
        else
            $(":root").css("font-size", mobileLscapeSize);
    }
}

function getExtraHtml(module) {
    if (showExtraHtml && module.hasOwnProperty("extra_html") && (module['extra_html'] != "")) {
        consoleLog('starting get extra');
        consoleLog(module.extra_html);
        ajaxCallCount += 1;
        var resp = $.ajax({
            type: 'GET',
            async: true,
            url: defUrl + module.extra_html,
            dataType: 'html'
        })
            .done(function (data) {
                //menuDefs[module.menu_item_name]['add_html'] = data;
                consoleLog('in get extra done');
                var add_html = data;
                add_html = add_html.replace(hrefRegEx, module.href);
                add_html = substitute(add_html, module);
                menuItemHtmlfDivId = "#" + module.menu_id + '-htmlf';
                consoleLog(menuItemHtmlfDivId);
                $(".toggleExtraHtml").toggle(showExtraHtml);
                $(menuItemHtmlfDivId).html(add_html);
                checkMenuDone();
            })
            .fail(checkMenuDone);
        return resp;
    }
}

function getKiwixSearch() {
    var searchArg = {};
    searchArg["pattern"] = $("#kiwixsearchbox").val();
    consoleLog(searchArg);
    var resp = $.get("/kiwix/search", searchArg)
        .always(function (responseText) {
            var resultParts = parseKiwixSearchResults(responseText);
            consoleLog(responseText);
            $("#searchResultsHeader").html(resultParts.header);
            $("#searchResultsBody").html(resultParts.results);
            $("#searchResultsFooter").html(resultParts.footer);
            //$('#searchResultsModal').modal('show');
        });
    //return resp;
}

function getKiwixSearchSlideMenu() {
    var searchArg = {};
    searchArg["pattern"] = $("#kiwixsearchbox2").val();
    consoleLog(searchArg);
    closeSlideMenu();
    $("#kiwixsearchbox").val(searchArg["pattern"]);
    $('#searchResultsModal').modal('show');
    var resp = $.get("/kiwix/search", searchArg)
        .always(function (responseText) {
            var resultParts = parseKiwixSearchResults(responseText);
            consoleLog(responseText);
            $("#searchResultsHeader").html(resultParts.header);
            $("#searchResultsBody").html(resultParts.results);
            $("#searchResultsFooter").html(resultParts.footer);
            //$('#searchResultsModal').modal('show');
        });
    //return resp;
}

function parseKiwixSearchResults(searchRes) {
    var parsedResults = {};
    var body = searchRes.indexOf('<body');
    var header = searchRes.indexOf('<div class="header">', body);
    var results = searchRes.indexOf('<div class="results">', header);
    var footer = searchRes.indexOf('<div class="footer">', results);
    parsedResults["header"] = searchRes.substring(header + '<div class="header">'.length, searchRes.indexOf('</div>', header));
    parsedResults["results"] = searchRes.substring(results + '<div class="results">'.length, searchRes.lastIndexOf('</div>', footer));
    parsedResults["footer"] = searchRes.substring(footer + '<div class="footer">'.length, searchRes.indexOf('</div>', footer));
    return parsedResults;
}

function getKiwixSearch2(searchStr) { // not used
    var resp = $.ajax({
        type: 'GET',
        async: true,
        url: '/kiwix/search',
        pattern: searchStr,
        dataType: 'html'
    })
        .done(function (html) {
            //menuDefs[module.menu_item_name]['add_html'] = data;
            consoleLog(html);
        })
        .fail();
    return resp;
}

function checkMenuDone() {
    ajaxCallCount -= 1;
    consoleLog(ajaxCallCount);
    if (ajaxCallCount == 0) {
        $('a').click(iiabMeter);
        genLangSelector();
        activateButtons();
        //alert ("menu done");
    }
}

function activateButtons() {
    $('#btn-showLangs').click(function () {
        $('#langCodeSelector').modal({ backdrop: 'static', keyboard: false });
        $('#langCodeSelector').modal('show');
        closeSlideMenu();
    });
    $('#btn-toggleDisplay').off().on('click', function () {
        setDisplayToggle();
        closeSlideMenu();
    });
    $('#btn-custom').click(function () {
        $('#customMenuModal').modal({ backdrop: 'static', keyboard: false });
        $('#customMenuModal').modal('show');
        closeSlideMenu();
    });
    $('#btn-feedback').click(function () {
        $('#feedbackModal').modal({ backdrop: 'static', keyboard: false });
        $('#feedbackModal').modal('show');
        closeSlideMenu();
    });
    $('#btn-kiwixSearch').click(function () {
        $('#searchResultsModal').modal({ backdrop: 'static', keyboard: false });
        $('#searchResultsModal').modal('show');
    });
    $('#btn-submitFeedback').click(function () {
        if (validateFeedback())
            sendFeedback();
    });

    // clear feedback message and enable button for showing modal
    $('#feedbackModal').on('show.bs.modal', function () {
        $('#feedbackMessageModal').html("");
        $("#btn-submitFeedback").prop("disabled", false);

    });
}

function openSlideMenu() {
    var slideMenu = gEBI("slideMenu");
    var slideMenuSearch = gEBI("slideMenuSearch");
    gEBI("mainOverlay").style.zIndex = "1";

    if (isMobile) { // separate search icon in mobile
        slideMenuSearch.style.display = "none";
        slideMenu.style.height = "250px";
        slideMenu.style.width = "120px";
    }
    else {
        if (menuParams.allow_kiwix_search) { // in desktop show search if enabled
            slideMenuSearch.style.display = "block";
            slideMenu.style.width = "250px";
        }
        else {
            slideMenuSearch.style.display = "none";
            slideMenu.style.height = "250px";
            slideMenu.style.width = "120px";
        }
    }
}

function closeSlideMenu() {
    gEBI("slideMenu").style.width = "0";
    gEBI("mainOverlay").style.zIndex = "-1";
}

function openSubMenu(id) {
    gEBI(id).style.width = "30vw";
}

function closeSubMenu(element) {
    element.parentElement.style.width = "0";
}

function openSearch() {
    $('#searchResultsModal').show();
    gEBI("searchResultsModal").style.display = "block";

}

function closeSearch() { // not used
    gEBI("searchResultsModal").style.width = "0";
}
function getLocalStore() {
    var arrayStr = localStorage.getItem("selected_langs");
    if (arrayStr && arrayStr != "")
        //arrayStr = "";
        selectedLangs = arrayStr.split(',');
    var toggleDisplayFlag = localStorage.getItem("toggleDisplay");
    if (toggleDisplayFlag === null || toggleDisplayFlag == "false")
        toggleDisplay = false;
    else
        toggleDisplay = true;
}

function setLocalStore() {
    if (selectedLangs.length > 0)
        localStorage.setItem("selected_langs", selectedLangs.toLocaleString());
    else
        localStorage.setItem("selected_langs", "");
    localStorage.setItem("toggleDisplay", toggleDisplay);
}

function genLangSelector() {
    consoleLog('in genLangSelector');
    var html = '';
    var lang = "";
    var dupsCtrl = [];
    var largeCheckStyle = 'style="min-height:40px;min-width:40px;" '

    for (var i in menuItems) {
        consoleLog(i);
        if (typeof menuDefs[menuItems[i]].lang != 'undefined')
            lang = menuDefs[menuItems[i]].lang;
        else
            continue;
        consoleLog(lang);
        if (dupsCtrl.indexOf(lang) != -1)
            continue;
        else {
            var langName = langCodes[langCodesIndex[lang]].locname;
            var engName = langCodes[langCodesIndex[lang]].engname;
            html += '<span class="lang-codes"><label><input type="checkbox" ';
            if (isMobile)
                html += largeCheckStyle;
            html += 'name="' + lang + '"';
            if (selectedLangs.indexOf(lang) != -1)
                html += ' checked';
            html += '>&nbsp;&nbsp;<span>' + langName + '</span><span> (' + engName + ') </span></label></span>';
            dupsCtrl.push(lang);
            consoleLog(dupsCtrl);
        }
    }
    $("#contentLanguages").html(html);
    $('#btn-selectLangs').click(function () {
        $('#langCodeSelector').modal('hide');
        filterContent(); // create selected language list and filter menu items
    });
}

function filterContent() {
    // get list of selected langcodes
    selectedLangs = [];
    $('#langCodeSelector input').each(function () {
        if (this.checked) {
            selectedLangs.push(this.name);
        }
    });
    if (hasLocalStorage()) {
        setLocalStore(); // save them
    }
    drawMenu(); // redraw menu
}


function iiabMeter(event) {
    event.preventDefault();
    //alert("in iiab meter");
    var url = $(this).attr('href');
    consoleLog(url);
    $.ajax({
        method: "GET",
        async: true,
        url: iiabMeterUrl,
        dataType: 'html',
        data: { link_clicked: url }
    })
        .always(function (data) {
            window.location = url;
        });
}

// we need something in comments and a name would be nice
function validateFeedback() {
    if ($("#comments-text").val() == "") {
        $('#feedbackMessageModal').html("Please give us some feedback.");
        return false;
    }
    if ($("#feedback-name").val() == "") {
        $('#feedbackMessageModal').html("Please tell us your name.");
        return false;
    }
    return true;
}

function sendFeedback() {
    $("#btn-submitFeedback").prop("disabled", true);
    var resp = $.ajax({
        url: menuServicesUrl + 'record_feedback.php',
        type: 'post',
        dataType: 'json',
        data: $('form#feedbackForm').serialize()
    })
        .done(function (data) {
            console.log(data);
            if (data == "SUCCESS") {
                //alert ("Thanks for submitting your feedback");
                $('#feedbackMessageModal').html("Thanks for submitting your feedback");
                setTimeout(function () { $('#feedbackModal').modal('hide'); }, 3000);
            }
            else {
                $('#feedbackMessageModal').html(data);
                //alert (data);
            }
        })
        .fail(function (dataResp, textStatus, jqXHR) {
            console.log(jqXHR);
            $('#feedbackMessageModal').html(dataResp);
        });
    return resp;
}
function jsonErrhandler(jqXHR, textStatus, errorThrown) {
    // only handle json parse errors here, others in ajaxErrHandler
    //  if (textStatus == "parserror") {
    //    //alert ("Json Errhandler: " + textStatus + ", " + errorThrown);
    //    displayServerCommandStatus("Json Errhandler: " + textStatus + ", " + errorThrown);
    //  }
    consoleLog("In Error Handler logging jqXHR");
    consoleLog(textStatus);
    consoleLog(errorThrown);
    consoleLog(jqXHR);

    return false;
}

function consoleLog(msg) {
    if (debug == true)
        console.log(msg); // for IE there can be no console messages unless in tools mode
}

function gEBI(elementId) {
    var element = document.getElementById(elementId);
    return element;
}
function hasLocalStorage() {
    var test = 'test';
    try {
        localStorage.setItem(test, test);
        localStorage.removeItem(test);
        return true;
    } catch (e) {
        return false;
    }
}
