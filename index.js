mapboxgl.accessToken = "pk.eyJ1IjoiZ2lzZmVlZGJhY2siLCJhIjoiY2l2eDJndmtjMDFkeTJvcHM4YTNheXZtNyJ9.-HNJNch_WwLIAifPgzW2Ig";

function socrataPointToLatLon (point) {
    var latlon = JSON.parse(point.replace('(', '[').replace(')', ']')); // "(-37.8, 144.9)" => [-37.8, 144.9]
    return [latlon[1], latlon[0]];
}

function sensorCsvToGeoJSON(sensors) {
    var gj = window.sensorGeoJSON = {
        type: 'FeatureCollection',
        features: []
    };
    var keys = [], start = Date.now();
    if (sensors.length > 0) {
        keys = Object.keys(sensors[0]);
    }
    sensors.forEach(function(sensor) {
        var ret = {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: socrataPointToLatLon(sensor.location) 
            }, properties: {
                bay_id: sensor.bay_id,
                st_marker_id: sensor.st_marker_id,
                status: sensor.status
            }
        };
        var r = getRestriction(sensor.bay_id);                 
        if (r) {
            // Embed restrictions directly into feature.
             Object.keys(r).forEach(function(k) {
                ret.properties[k] = r[k];
             });
             if (r.DisabilityExt === 0 && r.TypeDesc.match('Disab')) {
                // Simplify life so we always have the total duration with permit available.
                r.DisabilityExt = r.Duration;
             }
        }
        gj.features.push(ret);

    });
    //console.log('Converted sensor data. ', Date.now() - start, 'ms');
    //console.log(gj);
    return gj;
}
var sensorCsv;

function updateSensorData(newSensorCsv) {
    if (newSensorCsv) {
        //console.log('Got sensor data.');
        sensorCsv = newSensorCsv;
    }
    if (sensorCsv)
        map.getSource('sensors').setData(sensorCsvToGeoJSON(sensorCsv));
}

function zeroPad(n) {
    return String(100 + n).slice(1);
}

// returns a dateTime object with correct day of week and hour. Who cares about the date?
function asDate(dayOfWeek, hour) {
    
    // Day must be zero-prepended for IE11.
    var dstr = '2015-05-' + zeroPad(+dayOfWeek + 3);
    if (hour) {
        dstr += 'T' + hour.replace(/^(\d:)/, '0$1');
    }
    var d = new Date(dstr);
    if (d.getDay() !== d.getDay()) { // test for NaN
        console.warn(dstr + ' is not a valid date.')
        //debugger;
    }
    return d;
}

function findRestrictionIndex(restrictionRow, time) {
    function restrictionAsDate(i, isStart) {
        var day = restrictionRow[(isStart ? 'From' : 'To') + 'Day' + i];
        var time = restrictionRow[(isStart ? 'Start' : 'End') + 'Time' + i];
        if (!isStart && day === '0') {
            // make Sunday the 7th day, not the 0th day, for computing end of ranges.
            day = '7';
        }
        return asDate(day, time);
    }
    for (var i = 1; i <= 6; i++) {
        if (time >= restrictionAsDate(i, true) && time <= restrictionAsDate(i, false))
            return i;
    }
}

function getRestriction(bayID, time) {
    if (!restrictions)
        return;
    time = time || new Date();

    // Move the given time to one in the same date range as those given by asDate, for comparisons.
    var timeish = asDate(time.getDay(), time.getHours() + ':' + zeroPad(time.getMinutes()));
    var device = restrictionsByBayID[bayID];
    if (!device)
        return;

    var ri = findRestrictionIndex(device, timeish);
    var ret = {};
    Object.keys(device).forEach(function(k) {
        if (k[k.length - 1] == ri) {
            var newk = k.slice(0, k.length-1);
            ret[newk] = (newk === 'Duration' || newk === 'DisabilityExt') ? +device[k] : device[k];
        }
    });

    return  ret;

}

var restrictions;
var restrictionsByBayID = {};
var nowish = asDate(6, '16:30');

function howlong(f, s) {
    var x = Date.now();
    f();
    console.log(s, ': ', (Date.now() - x) + 'ms');
}

function updateRestrictionData(map) {
    // StartTime1: 07:30:00
    // EndTime1: 19:30:00
    // question: find the index (1-6) such that:
    // (new Date()).getDay() is between FromDayX and ToDayX
    // (new Date('2001-01-01 ' + StartTime1)) > (new Date()

    //var ymd = ((new Date()).getYear() + 1900) + '-' + (new Date().getMonth() + 1)  + '-' + new Date().getDay();

    // 2017-05-8+
    //Keep: var nowish = asDate(new Date().getDay(), new Date().getHours() + ':' + new Date().getMinutes());
    
    var url = !testMode ?
        //'https://gist.githubusercontent.com/stevage/7bfcc7ad8fa9f4211a194e28bd0bdeaf/raw/gistfile1.txt' 
        'https://data.melbourne.vic.gov.au/api/views/' + bayDataId + '/rows.csv?accessType=DOWNLOAD'
        : 'temp-restrictions.csv';

    d3.csv(url, function (restrictionData) {
        restrictions = restrictionData;
        
        restrictionData.forEach(function(r) {
            restrictionsByBayID[+r.BayID] = r;
        });        
        updateSensorData(); // todo: maybe check if this hasn't already been done.
        
    });
}

function initMap() {
    var map = new mapboxgl.Map({
        // style: "mapbox://styles/gisfeedback/ciyt7up4l000p2sqvm9vnrxvw",
        //style: "mapbox://styles/gisfeedback/ciyt7up4l000p2sqvm9vnrxvw?update=" + Math.random() * 10000,
        //style: "mapbox://styles/gisfeedback/cj6rcey7b4cra2sqpqkil6697?update=" + Math.random(),
        style: 'mapbox://styles/gisfeedback/cj6yh34pk0ga92slnivcr5v4n',
        container: "map",
        maxBounds: [ [144.88, -37.86], [145.01, -37.76] ],
        attributionControl: false,
        zoom: 15,
        minZoom: 13.5,
        maxZoom:19,
        dragRotate: false,
        pitchWithRotate: false, // no 3D nonsense
        center: [144.960712, -37.815]
    }).addControl(new mapboxgl.FullscreenControl());
    map.whenLoaded = function(f) { 
        return this.loaded() ? f() : this.once('load', f);
    };

    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.keyboard.enable(); // Enable keyboard navigation

    return map;
}

function innerCircle(partialId, filter, color) {
    return {
        id: 'sensor-points-' + partialId,
        source: 'sensors',
        type: 'circle',
        filter: filter,
        paint: {
            'circle-radius': { base: 1.5, stops: [ [15, 0], [18, 4]] },
            'circle-color': color || 'white'
        }
    };
}

function outerCircle(partialId, filter, color) {
    return {
        id: 'restriction-points-' + partialId,
        source: 'sensors',
        type: 'circle',
        filter: filter,
        paint: {
            'circle-radius': { base: 1.5, stops: [ [13, 2], [18, 12]]},
            'circle-color': color
        }
    }
}

var layersAdded=[];
function addLayer(layer) {
    map.addLayer(layer);
    layersAdded.push(layer.id);
}


/*
The plan:
- each spot has an outer and inner circle:
-- outer: if available, is restriction-colored, else occupy-colored
-- inner: present/occupy colored
- any space that is currently available to occupy


*/

function addLayers(disabilityPermit) {
    //disabilityPermit = true;
    var timeMultiplier = disabilityPermit ? 2 : 1;
    function legendBullet(color, text) {
        return '<div class="bullet" style="background-color: ' + color + '"> </div> ' + text;
    }
    
    var colorStops = [
            // [15,'hsl(0,80%,40%)'],
            // [30,'hsl(30,80%,40%)'],
            // [60,'hsl(60,80%,50%)'],
            // [120,'hsl(90,90%,60%)'],
            // [180,'hsl(120,90%,60%)'],
            // [240,'hsl(160,90%,60%)']
            // [5,'#FF495C'],
            // [30,'#FF6B00'],
            // [60,'#FFDB00'],
            // [120,'#00C1DE'],
            // [180,'#A35EB5'],
            // [240,'#00BD70']

            // purple scheme
            /*
            [15 * timeMultiplier,'#E2C8E6 '],
            [30 * timeMultiplier,'#CEA2D7 '],
            [60 * timeMultiplier,'#BD83CA '],
            [120 * timeMultiplier,'#A35EB5 '],
            // [180,'#873299 '],
            [180 * timeMultiplier,'#732282 ']
            */
            
            // pastely salmon to turquoise
            [15, '#ff8189'],
            [30, '#ffb359'],
            [60, '#fed771'],
            [120, '#7bccc4'],
            [240, '#43a2ca']

            //[300,'hsl(240,100%,60%)']
        ].map(function(s) { 
            return [s[0] * timeMultiplier, s[1]]
        });

    

    // we add separate layers so that the not-presents can be on top
    // map.addLayer(sensorLayer('present',     ['==', 'status','Present'],     'hsl(350, 90%, 40%)'));
    var colorPresent = '#5d616c';//'hsl(350, 90%, 0%)';
    var colorNotPresent = 'white';
    var colorInactive = '#bbb';
    var colorOuter = '#555'; // very thin outline outside the thick band
    var colorDisabled = disabilityPermit ? 'hsl(180,90%,60%)' : 'hsl(240,50%,30%)'; //'hsl(230,95%,70%)';

    var colorRestrictions = {
        property: disabilityPermit ? 'DisabilityExt' : 'Duration' ,
        stops: colorStops,
        default: colorInactive, 
        colorSpace: 'rgb',
        type: 'exponential'
    };


    /*{
            property: 'status',
            default: colorNotPresent,
            type: 'categorical',
            stops: [
                ['Present', colorPresent]
            ]
        } 
        // this was attached to disabled layer
        */

    //addLayer(innerCircle('not-present', ['==', 'status','Not Present'], 'hsl(100, 90%, 60%)'));
    addLayer(outerCircle('present', ['==', 'status','Present'], colorPresent));
    addLayer(outerCircle('not-present', ['all', ['==', 'status','Unoccupied'], ['!=', 'TypeDesc', 'Loading Zone']], colorRestrictions));
    addLayer(outerCircle('disabled-outer', ['==', 'Exemption','Disabled Logo'], colorDisabled)); // TODO avoid overlapping with previous
    
    /*addLayer(innerCircle('loading-zone', ['==', 'TypeDesc', 'Loading Zone'], 'white'));
    addLayer(innerCircle('disabled', ['==', 'Exemption','Disabled Logo'], colorDisabled));*/

    addLayer(innerCircle('present',     ['==', 'status','Present'], colorPresent));
    addLayer(innerCircle('not-present', ['all', ['==', 'status','Unoccupied'], ['!=', 'TypeDesc', 'Loading Zone']], colorNotPresent));


    addLayer({
        id: 'sensor-times',
        type: 'symbol',
        source:'sensors',
        minzoom: 18,
        layout: {
            'text-field': '{TypeDesc}',
            'text-letter-spacing': -0.1,
            'text-size': { stops: [ [16, 10], [20, 16] ] },
            'text-anchor': 'top'
        },
        paint: {
            'text-halo-width': 1,
            'text-halo-color': 'white'
        }
    });


    legendHTML = colorStops.map(function(stop) {
        return legendBullet(stop[1], stop[0] + ' minutes<br>');
    }).join('') + '<br>';
    legendHTML += legendBullet(colorDisabled, 'Disabled only<br/>');

    legendHTML += legendBullet(colorPresent, 'Occupied<br>');
    legendHTML += legendBullet(colorInactive, 'Inactive');
    document.getElementById('legend').innerHTML = legendHTML;
    $('#legend,#permit-mode').show();

    var popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false
    });
    var sensorHover = function(e) {
        map.getCanvas().style.cursor = 'pointer';
        var p = e.features[0].properties;

         // We don't have to do this. Could use p.Description, p.TypeDesc etc.
        var r = getRestriction(p.bay_id);
        var rtext = '';
        if (r) {
            rtext = '<h4>' + (p.status === 'Present' ? 'Occupied' : 'Unoccupied') + '</h4>' + 
            '<b>Current restrictions:</b><br/>' + 
            //r.Description + '<br><br>' + 
            r.TypeDesc + ' (' + r.StartTime.replace(/:00$/, '') + ' – ' + r.EndTime.replace(/:00$/, '') + ')<br>';
            if (r.Exemption) {
                rtext += '<span class="r-exemption">' + r.Exemption + ' required</span><br>';
            }
            var durationText = r.Duration !== 1440 ? r.Duration + ' minutes<br/>' : '';
            if (+r.DisabilityExt) {
                rtext += durationText + 
                r.DisabilityExt + ' minutes (♿)<br>';//disability permit)<br/>';
            } else {
                rtext += durationText;

            }
            
        }
        rtext += '<div class="r-ids">' +
            '<br/><b>Bay</b>: ' + p.bay_id + 
            '<br/><b>Street marker</b>: ' + p.st_marker_id +
            '</div>';

        popup.setLngLat(e.features[0].geometry.coordinates)
            .setHTML(rtext)
            .addTo(map);
    };
    var sensorLeave = function() {
        map.getCanvas().style.cursor = '';
        popup.remove();
    };

    layersAdded.forEach(function(layer) {
        map.on('mouseenter', layer, sensorHover);
        map.on('mouseleave', layer, sensorLeave );       
    })
}

// in test mode we fetch data locally.
var hash = window.location.hash;
var testMode = hash.match('test');
var sensorDataId, bayDataId;
if (hash.match(/sensordata=(....-....)&baydata=(....-....)/)) {
    sensorDataId = hash.match(/sensordata=(....-....)/)[1];
    bayDataId = hash.match(/baydata=(....-....)/)[1];
} else {
    testMode = true;
}
var map = initMap();
updateRestrictionData(map);

function loopData() {
    console.log('Fetching sensor data!');
    if (!testMode) {
        d3.csv('https://data.melbourne.vic.gov.au/api/views/' + sensorDataId + '/rows.csv?accessType=DOWNLOAD&rand=' + Math.random(), updateSensorData);
    } else {
        d3.csv('temp-sensors.csv', updateSensorData);
    }
    if (!testMode) {
        setTimeout(loopData, 60 * 1000);
    }
}

$('#permit').click(function(e) {
    layersAdded.forEach(function(lid) {
        map.removeLayer(lid);
    });
    layersAdded=[];
    addLayers($('#permit').is(':checked'));
});

map.whenLoaded(function() {
    map.addSource('sensors', {
        type: 'geojson',
        data: sensorCsvToGeoJSON([])
    });
    addLayers($('#permit').is(':checked'));
    loopData();
});

