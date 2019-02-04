// ==UserScript==
// @name           IITC Plugin: Höslä
// @version        0.39
// @description    HSL dataa kartalle ja heti
// @include        https://*.ingress.com/intel*
// @include        http://*.ingress.com/intel*
// @match          https://*.ingress.com/intel*
// @match          http://*.ingress.com/intel*
// @grant          none
// ==/UserScript==

// start of plugin wrapper
function wrapper(plugin_info) {

// ensure plugin framework is there, even if iitc is not yet loaded
if(typeof window.plugin !== 'function') window.plugin = function() {};

// init namespace
if(!window.plugin.j1) window.plugin.j1 = {};
window.plugin.j1.hsl = function() {};

// build number for other plugins to check against
window.plugin.j1.hsl.build = 1;

window.plugin.j1.hsl.detailLevel = 1;
window.plugin.j1.hsl.visibleRoutes = [];
window.plugin.j1.hsl.searchResultCache = [];
window.plugin.j1.hsl.routeCache = {};
window.plugin.j1.hsl.polyClickEvents = [];
window.plugin.j1.hsl.polyClickEventsHandled = true;
window.plugin.j1.hsl.highlightedRoutes = [];
window.plugin.j1.hsl.popup = {};

window.plugin.j1.hsl.gtfsList = {
    TRAM: ["HSL:1001", "HSL:1002", "HSL:1003", "HSL:1004", "HSL:1005", "HSL:1006", "HSL:1007", "HSL:1008", "HSL:1009", "HSL:1010"],
    SUBWAY: ["HSL:31M1", "HSL:31M2"],
    RAIL: ["HSL:3002A", "HSL:3001D", "HSL:3002E", "HSL:3001I", "HSL:3001K", "HSL:3002L", "HSL:3001N", "HSL:3002P", "HSL:3001R", "HSL:3001T", "HSL:3002U", "HSL:3002X", "HSL:3002Y", "HSL:3001Z"],
    // all rail + all subway + bus 550 + bus 560
    TRUNK: ["HSL:31M1", "HSL:31M2", "HSL:3002A", "HSL:3001D", "HSL:3002E", "HSL:3001I", "HSL:3001K", "HSL:3002L", "HSL:3001N", "HSL:3002P", "HSL:3001R", "HSL:3001T", "HSL:3002U", "HSL:3002X", "HSL:3002Y", "HSL:3001Z", "HSL:2550", "HSL:4560"]
};

window.plugin.j1.hsl.colors = {
    BUS: '#007AC9',
    RAIL: '#8C4799',
    SUBWAY: '#FF6319',
    TRAM: '#00985F',
    FERRY: '#00B9E4'
};

window.plugin.j1.hsl.apiUrl = 'https://api.digitransit.fi/routing/v1/routers/hsl/index/graphql';

window.plugin.j1.hsl.queryApi = function(query, callback) {
    $.ajax({
        url: window.plugin.j1.hsl.apiUrl,
        type: 'POST',
        data: query,
        contentType: 'application/graphql',
        dataType: 'json',
        success: function(data) {
            callback(data);
        }
    });
};

window.plugin.j1.hsl.isTrunkRoute = function(gtfsId) {
    return window.plugin.j1.hsl.gtfsList.TRUNK.indexOf(gtfsId) !== -1;
};

window.plugin.j1.hsl.isRouteHighlighted = function(gtfsId) {
    for(var i = 0; i < window.plugin.j1.hsl.highlightedRoutes.length; i++) {
        if(window.plugin.j1.hsl.highlightedRoutes[i] === gtfsId) {
            return true;
        }
    }

    return false;
};

window.plugin.j1.hsl.isRouteVisible = function(gtfsId) {
    for(var i = 0; i < window.plugin.j1.hsl.visibleRoutes.length; i++) {
        if(window.plugin.j1.hsl.visibleRoutes[i] && window.plugin.j1.hsl.visibleRoutes[i].gtfsId === gtfsId) {
            return true;
        }
    }

    return false;
};

window.plugin.j1.hsl.getRouteByGtfsId = function(gtfsId, callback) {
    if(window.plugin.j1.hsl.routeCache[gtfsId]) {
        console.log('Using cached route data for gtfs id ' + gtfsId);
        callback(window.plugin.j1.hsl.routeCache[gtfsId]);
        return;
    }

    var query = `
{
    routes(ids: "${gtfsId}") {
        gtfsId
        mode
        shortName
        longName
        patterns {
            name
            directionId
            geometry {
                lat
                lon
            }
        }
    }
}
    `;

    window.plugin.j1.hsl.queryApi(query, function(data) {
        window.plugin.j1.hsl.routeCache[gtfsId] = data;
        callback(data);
    });
};

window.plugin.j1.hsl.queryRoutes = function(name, callback) {
    var query = `
{
    routes(name: "${name}") {
        gtfsId
        mode
        shortName
        longName
        patterns {
            name
            directionId
            geometry {
                lat
                lon
            }
        }
    }
}
    `;

    window.plugin.j1.hsl.queryApi(query, callback);
};

window.plugin.j1.hsl.addRoute = function(route) {
    if(!window.plugin.j1.hsl.isRouteVisible(route.gtfsId)) {
        window.plugin.j1.hsl.visibleRoutes.push(route);
        window.plugin.j1.hsl.updateVisibleRoutesList();
        window.plugin.j1.hsl.drawRoute(route);
    } else console.log('Not adding route ' + route.gtfsId + ': already visible');
};

window.plugin.j1.hsl.hideRouteByGtfsId = function(gtfsId, skipRedraw) {
    for(var i = 0; i < window.plugin.j1.hsl.visibleRoutes.length; i++) {
        if(window.plugin.j1.hsl.visibleRoutes[i] && window.plugin.j1.hsl.visibleRoutes[i].gtfsId === gtfsId) {
            delete window.plugin.j1.hsl.visibleRoutes[i];

            window.plugin.j1.hsl.updateVisibleRoutesList();
            if(!skipRedraw) window.plugin.j1.hsl.redraw();

            return;
        }
    }

    console.log('Not hiding route ' + gtfsId + ': not visible to begin with');
};

window.plugin.j1.hsl.updateVisibleRoutesList = function() {
    var html = '';

    window.plugin.j1.hsl.visibleRoutes.forEach(function(route) {
        html += '<li>' + route.humanName + '</li>';
    });

    $('#j1-hsl-visibleRoutes').html(html);
};

window.plugin.j1.hsl.addResultRoute = function(cacheId) {
    window.plugin.j1.hsl.addRoute(window.plugin.j1.hsl.searchResultCache[cacheId]);
};

window.plugin.j1.hsl.getAdjustedName = function(route, pattern) {
    if(pattern.directionId === 0) return route.longName;
    else return route.longName.split('-').reverse().join('-');
};

window.plugin.j1.hsl.createRouteFromPattern = function(route, pattern) {
    var adjustedName = window.plugin.j1.hsl.getAdjustedName(route, pattern);

    return {
        gtfsId: route.gtfsId,
        humanName: route.shortName + ' ' + route.mode + ' ' + adjustedName,
        adjustedName: adjustedName,
        longName: route.longName,
        shortName: route.shortName,
        patternName: pattern.name,
        directionId: pattern.directionId,
        mode: route.mode,
        geometry: pattern.geometry
    };
};

window.plugin.j1.hsl.searchRouteButtonPressed = function() {
    var routeName = $('#routeInput').val();

    if(routeName === '') return;

    $('#j1-hsl-searchResults').html('Searching...');

    window.plugin.j1.hsl.queryRoutes(routeName, function(data) {
        var routes = data.data.routes;

        if(routes.length === 0) {
            $('#j1-hsl-searchResults').html('No routes found.');
            return;
        }

        var routeList = [];

        routes.forEach(function(route) {
            route.patterns.forEach(function(pattern) {
                routeList.push(window.plugin.j1.hsl.createRouteFromPattern(route, pattern));
            });
        });

        var routeListHTML = '<ul>';

        routeList.forEach(function(route) {
            window.plugin.j1.hsl.searchResultCache.push(route);

            routeListHTML += '<li><a onclick="window.plugin.j1.hsl.addResultRoute('+ (window.plugin.j1.hsl.searchResultCache.length-1) +');">add</a> ' + route.humanName + '</li>';
        });

        routeListHTML += '</ul>';

        $('#j1-hsl-searchResults').html(routeListHTML);
    });
};

window.plugin.j1.hsl.reset = function() {
    window.plugin.j1.hsl.visibleRoutes = [];
    window.plugin.j1.hsl.routeLayerGroup.clearLayers();
    window.plugin.j1.hsl.updateVisibleRoutesList();
    window.plugin.j1.hsl.updateCheckboxes();
};

window.plugin.j1.hsl.compareRouteNumbers = function(a, b) {
    if(a.length == 1 == b.length)
        return a.charCodeAt(0) - b.charCodeAt(0);

    return Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, ''));
};

window.plugin.j1.hsl.queryRouteListByMode = function(mode, callback) {
    if(window.plugin.j1.hsl.routeCache[mode]) {
        console.log('Using cached route data for mode ' + mode);
        callback(window.plugin.j1.hsl.routeCache[mode]);
        return;
    }

    var query;

    if(mode === 'ALL') query = `
{
    routes {
        gtfsId
        shortName
        longName
    }
}
    `;

    if(mode !== 'ALL') query = `
{
    routes(modes: "${mode}") {
        gtfsId
        shortName
        longName
    }
}
    `;

    window.plugin.j1.hsl.queryApi(query, function(data) {
        window.plugin.j1.hsl.routeCache[mode] = data;
        callback(data);
    });
};

window.plugin.j1.hsl.displayRouteSearchDialog = function() {
    var html = `
Routes visible on map:
<br>
<ul id="j1-hsl-visibleRoutes"></ul>
<hr>
Search for route
<br>
<input type="text" id="routeInput">
<button onclick="window.plugin.j1.hsl.searchRouteButtonPressed()">Search</button>
<br>
<div id="j1-hsl-searchResults"></div>
    `;

    dialog({
        title: 'Route search',
        html: html,
        width: 350,
        buttons: {
            'RESET': window.plugin.j1.hsl.reset
        }
    });

    window.plugin.j1.hsl.updateVisibleRoutesList();
};

window.plugin.j1.hsl.addLongestPattern = function(route) {
    var pattern, maxGeometrySize = 0;

    for(var i = 0; i < route.patterns.length; i++) {
        if(route.patterns[i].geometry.length > maxGeometrySize) {
            pattern = route.patterns[i];
            maxGeometrySize = route.patterns[i].geometry.length;
        }
    }

    window.plugin.j1.hsl.addRoute(window.plugin.j1.hsl.createRouteFromPattern(route, pattern));
};

window.plugin.j1.hsl.updateCheckboxes = function() {
    $('.j1-hsl-route-checkbox').each(function(i, box) {
        $(this).prop('checked', window.plugin.j1.hsl.isRouteVisible($(this).data('gtfsid')));
    });
};

window.plugin.j1.hsl.showAll = function(mode) {
    if(!mode) {
        window.plugin.j1.hsl.queryRouteListByMode('ALL', function(data) {
            console.log(data);
            data.data.routes.forEach(function(route) {
                // skip trunk routes for now
                if(window.plugin.j1.hsl.isTrunkRoute(route.gtfsId)) return;

                window.plugin.j1.hsl.getRouteByGtfsId(route.gtfsId, function(routeData) {
                    window.plugin.j1.hsl.addLongestPattern(routeData.data.routes[0]);
                });
            });

            // draw trunk routes over everything else
            window.plugin.j1.hsl.showAll('TRUNK');
        });
    } else {
        window.plugin.j1.hsl.gtfsList[mode].forEach(function(gtfsId) {
            window.plugin.j1.hsl.getRouteByGtfsId(gtfsId, function(data) {
                window.plugin.j1.hsl.addLongestPattern(data.data.routes[0]);
            });
        });
    }

    window.plugin.j1.hsl.updateVisibleRoutesList();
    window.plugin.j1.hsl.updateCheckboxes();
};

window.plugin.j1.hsl.hideAll = function(mode) {
    if(!mode) {
        window.plugin.j1.hsl.reset();
        return;
    }

    window.plugin.j1.hsl.gtfsList[mode].forEach(function(gtfsId) {
        window.plugin.j1.hsl.hideRouteByGtfsId(gtfsId, true);
    });

    window.plugin.j1.hsl.updateVisibleRoutesList();
    window.plugin.j1.hsl.updateCheckboxes();
    window.plugin.j1.hsl.redraw();
};

window.plugin.j1.hsl.displayRouteListDialog = function() {
    var html = `
<a id="j1-hsl-list-presets-title">- PRESETS</a>
<div id="j1-hsl-list-presets">
    <button onclick="window.plugin.j1.hsl.showAll('TRAM')">show</button>
    <button onclick="window.plugin.j1.hsl.hideAll('TRAM')">hide</button>
    Trams 1-10
    <br>
    <button onclick="window.plugin.j1.hsl.showAll('SUBWAY')">show</button>
    <button onclick="window.plugin.j1.hsl.hideAll('SUBWAY')">hide</button>
    Metro line
    <br>
    <button onclick="window.plugin.j1.hsl.showAll('RAIL')">show</button>
    <button onclick="window.plugin.j1.hsl.hideAll('RAIL')">hide</button>
    Commuter train lines A-Z
    <br>
    <button onclick="window.plugin.j1.hsl.showAll('TRUNK')">show</button>
    <button onclick="window.plugin.j1.hsl.hideAll('TRUNK')">hide</button>
    Trunk routes
    <br>
    <button onclick="window.plugin.j1.hsl.showAll()">show</button>
    <button onclick="window.plugin.j1.hsl.hideAll()">hide</button>
    Everything
</div>
<hr>
<a id="j1-hsl-list-tram-title">+ TRAM</a>
<div id="j1-hsl-list-tram" hidden>Searching...</div>
<hr>
<a id="j1-hsl-list-bus-title">+ BUS</a>
<div id="j1-hsl-list-bus" hidden>Searching...</div>
<hr>
<a id="j1-hsl-list-rail-title">+ RAIL</a>
<div id="j1-hsl-list-rail" hidden>Searching...</div>
<hr>
<a id="j1-hsl-list-subway-title">+ SUBWAY</a>
<div id="j1-hsl-list-subway" hidden>Searching...</div>
<hr>
<a id="j1-hsl-list-ferry-title">+ FERRY</a>
<div id="j1-hsl-list-ferry" hidden>Searching...</div>
    `;

    dialog({
        title: 'Route list',
        html: html,
        width: 350,
        buttons: {
            'RESET': window.plugin.j1.hsl.reset
        }
    });

    // presets toggle
    $('#j1-hsl-list-presets-title').click(function() {
        if($('#j1-hsl-list-presets').is(':visible')) {
            $('#j1-hsl-list-presets-title').html('+ PRESETS');
            $('#j1-hsl-list-presets').hide();
        } else {
            $('#j1-hsl-list-presets-title').html('- PRESETS');
            $('#j1-hsl-list-presets').show();
        }
    });

    ['TRAM', 'BUS', 'RAIL', 'SUBWAY', 'FERRY'].forEach(function(mode) {
        var lower = mode.toLowerCase();

        $('#j1-hsl-list-' + lower + '-title').click(function() {
            if($('#j1-hsl-list-' + lower).is(':visible')) {
                $('#j1-hsl-list-' + lower).hide();
                $('#j1-hsl-list-' + lower + '-title').html('+ ' + mode);
            } else {
                if($('#j1-hsl-list-' + lower).html() === 'Searching...') {
                    window.plugin.j1.hsl.queryRouteListByMode(mode, function(data) {
                        var list = [];

                        data.data.routes.forEach(function(route) {
                            /*route.patterns.forEach(function(pattern) {
                                var adjustedName = window.plugin.j1.hsl.getAdjustedName(route, pattern);

                                list.push([
                                    route.shortName,
                                    adjustedName
                                ]);
                            });*/

                            list.push([
                                route.shortName,
                                route.longName,
                                route.gtfsId
                            ]);
                        });

                        list.sort(function(a, b) {
                            return window.plugin.j1.hsl.compareRouteNumbers(a[0], b[0]);
                        });

                        var listHtml = '';

                        list.forEach(function(item) {
                            var isChecked = window.plugin.j1.hsl.isRouteVisible(item[2]);
                            listHtml += '<input class="j1-hsl-route-checkbox" type="checkbox" data-gtfsid="' + item[2] + '"' + (isChecked ? ' checked' : '') + '><b>' + item[0] + '</b> ' + item[1] + '<br>';
                        });

                        $('#j1-hsl-list-' + lower).html(listHtml);

                        $('.j1-hsl-route-checkbox').change(function() {
                            var checkbox = $(this);
                            var checked = checkbox.is(':checked');
                            var gtfsId = checkbox.data('gtfsid');

                            console.log('checkbox change for ' + gtfsId + ' is now ' + (checked ? 'checked' : 'unchecked'));

                            if(checked) {
                                window.plugin.j1.hsl.getRouteByGtfsId(gtfsId, function(data) {
                                    window.plugin.j1.hsl.addLongestPattern(data.data.routes[0]);
                                });
                            } else {
                                window.plugin.j1.hsl.hideRouteByGtfsId(gtfsId);
                            }
                        });
                    });
                }

                $('#j1-hsl-list-' + lower).show();
                $('#j1-hsl-list-' + lower + '-title').html('- ' + mode);
            }
        });
    });
};

window.plugin.j1.hsl.selectHighlightedRoute = function(gtfsId, humanName) {
    var latLng = window.plugin.j1.hsl.popup.getLatLng();

    window.plugin.j1.hsl.labelLayerGroup.clearLayers();

    window.plugin.j1.hsl.highlightedRoutes.push(gtfsId);

    var popup = L.popup();
    popup.setLatLng(latLng);
    popup.setContent(humanName);
    popup.addTo(window.plugin.j1.hsl.labelLayerGroup);
    popup.on('close', function() {
        window.plugin.j1.hsl.highlightedRoutes = [];
        window.plugin.j1.hsl.redraw();
    });

    window.plugin.j1.hsl.popup = popup;
    window.plugin.j1.hsl.redraw();
};

window.plugin.j1.hsl.handlePolyClickEvents = function() {
    if(window.plugin.j1.hsl.polyClickEventsHandled) return;

    var events = window.plugin.j1.hsl.polyClickEvents, text = '', routes = [];
    var latLng = events[0].latlng;

    window.plugin.j1.hsl.polyClickEvents = [];
    window.plugin.j1.hsl.polyClickEventsHandled = true;
    window.plugin.j1.hsl.highlightedRoutes = [];

    events.forEach(function(event) {
        var route = event.target.options.route;

        window.plugin.j1.hsl.highlightedRoutes.push(route.gtfsId);
        routes.push(route);
    });

    routes.sort(function(a, b) {
        return window.plugin.j1.hsl.compareRouteNumbers(a.shortName, b.shortName);
    });

    routes.forEach(function(route) {
        text += '<a style="color:#ffce00;" onclick="window.plugin.j1.hsl.selectHighlightedRoute(\'' + route.gtfsId + '\', \'' + route.humanName + '\')">' + route.humanName + '</a><br>';
    });

    window.plugin.j1.hsl.labelLayerGroup.clearLayers();

    var popup = L.popup();
    popup.setLatLng(latLng);
    popup.setContent(text);
    popup.addTo(window.plugin.j1.hsl.labelLayerGroup);
    popup.on('close', function() {
        window.plugin.j1.hsl.highlightedRoutes = [];
        window.plugin.j1.hsl.redraw();
    });

    window.plugin.j1.hsl.popup = popup;
    window.plugin.j1.hsl.redraw();
};

window.plugin.j1.hsl.onPolylineClick = function(event) {
    window.plugin.j1.hsl.polyClickEventsHandled = false;
    window.plugin.j1.hsl.polyClickEvents.push(event);

    setTimeout(window.plugin.j1.hsl.handlePolyClickEvents, 100);
};

window.plugin.j1.hsl.drawRoute = function(route, highlighted) {
    if(highlighted && !window.plugin.j1.hsl.isRouteHighlighted(route.gtfsId)) return;

    var polylineClickable = {
        weight: 20,
        opacity: 0,
        color: '#FFFFFF',
        clickable: true,
        route: route
    };

    var polylineBack = {
        weight: 6,
        opacity: 1,
        color: '#FFFFFF',
        clickable: false
    };

    var polylineBackHighlighted = {
        weight: 6,
        opacity: 1,
        color: '#FF0000',
        clickable: false
    };

    var polylineFront = {
        weight: 4,
        opacity: 1,
        color: window.plugin.j1.hsl.colors[route.mode],
        clickable: false
    };

    var lastLatLngObj, detailLevel = window.plugin.j1.hsl.detailLevel, drawnCounter = 0;
    var polylineArr = [];

    route.geometry.forEach(function(latLng) {
        if(drawnCounter % detailLevel === 0 || drawnCounter === route.geometry.length - 1)
            polylineArr.push(L.latLng(latLng.lat, latLng.lon));

        drawnCounter++;
    });

    var polylineClickableObj = L.polyline(polylineArr, polylineClickable);
    polylineClickableObj.addTo(window.plugin.j1.hsl.routeLayerGroup);
    polylineClickableObj.on('click', window.plugin.j1.hsl.onPolylineClick);

    if(window.plugin.j1.hsl.isRouteHighlighted(route.gtfsId)) L.polyline(polylineArr, polylineBackHighlighted).addTo(window.plugin.j1.hsl.routeLayerGroup);
    else L.polyline(polylineArr, polylineBack).addTo(window.plugin.j1.hsl.routeLayerGroup);

    L.polyline(polylineArr, polylineFront).addTo(window.plugin.j1.hsl.routeLayerGroup);
};

window.plugin.j1.hsl.switchDetailLevel = function() {
    window.plugin.j1.hsl.detailLevel = Number($('#j1-hsl-detailLevel').val());

    console.log('Changing detail level to ' + window.plugin.j1.hsl.detailLevel);

    window.plugin.j1.hsl.redraw();
};

window.plugin.j1.hsl.redraw = function() {
    if(window.plugin.j1.hsl.visibleRoutes.length === 0) return;

    console.log('Redrawing routes...');

    window.plugin.j1.hsl.routeLayerGroup.clearLayers();

    // draw routes
    window.plugin.j1.hsl.visibleRoutes.forEach(function(route) {
        window.plugin.j1.hsl.drawRoute(route);
    });

    // draw highlighted routes again
    window.plugin.j1.hsl.visibleRoutes.forEach(function(route) {
        window.plugin.j1.hsl.drawRoute(route, true);
    });

    if(window.plugin.playerTracker) {
        console.log('Drawing player tracker traces over routes...');

        window.plugin.playerTracker.drawnTracesEnl.clearLayers();
        window.plugin.playerTracker.drawnTracesRes.clearLayers();
        window.plugin.playerTracker.drawData();
    }
};

window.plugin.j1.hsl.setupCSS = function() {
    var left = 180;

    if(window.plugin.farmFind) left += 88;

    $('<style>').prop('type', 'text/css').html(`
        #j1-hsl-detailLevel {
            position: absolute;
            top: 5px;
            left: ${left}px;
            z-index: 2500;
            font-size: 11px;
            font-family: "coda",arial,helvetica,sans-serif;
            background-color: #0E3C46;
            color: #ffce00;
        }\n
    `).appendTo('head');
};

window.plugin.j1.hsl.setupPhoneCSS = function() {
    var right = 0;

    if(window.plugin.farmFind) right += 70;

    $('<style>').prop('type', 'text/css').html(`
        #j1-hsl-detailLevel {
            top: 0px !important;
            right: ${right}px;
            left: auto !important;
            margin-right: 0;
        }\n
    `).appendTo('head');
};

var setup = function() {
    window.plugin.j1.hsl.setupCSS();

    if(window.isSmartphone()) {
        window.plugin.j1.hsl.setupPhoneCSS();
    }

    window.plugin.j1.hsl.routeLayerGroup = new L.LayerGroup();
    window.plugin.j1.hsl.labelLayerGroup = new L.LayerGroup();

    window.addLayerGroup('Routes', window.plugin.j1.hsl.routeLayerGroup, true);
    window.addLayerGroup('Route labels', window.plugin.j1.hsl.labelLayerGroup, true);

    window.addHook('mapDataRefreshEnd', function() {
        window.plugin.j1.hsl.redraw();
    });

    $('#toolbox').append('<a onclick="window.plugin.j1.hsl.displayRouteSearchDialog()">Route search</a>');
    $('#toolbox').append('<a onclick="window.plugin.j1.hsl.displayRouteListDialog()">Route list</a>');

    $('body').append(`<select onchange="window.plugin.j1.hsl.switchDetailLevel()" id="j1-hsl-detailLevel">
        <option value="1">Route detail level 1</option>
        <option value="2">Route detail level 2</option>
        <option value="4">Route detail level 4</option>
        <option value="8">Route detail level 8</option>
        <option value="16">Route detail level 16</option>
    </select>`);
};

setup.info = plugin_info; //add the script info data to the function as a property
if(!window.bootPlugins) window.bootPlugins = [];
window.bootPlugins.push(setup);
// if IITC has already booted, immediately run the 'setup' function
if(window.iitcLoaded && typeof setup === 'function') setup();
} // wrapper end

// inject code into site context
var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) info.script = { version: GM_info.script.version, name: GM_info.script.name, description: GM_info.script.description };
script.appendChild(document.createTextNode('('+ wrapper +')('+JSON.stringify(info)+');'));
(document.body || document.head || document.documentElement).appendChild(script);
