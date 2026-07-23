let selectedLayer = null;
let selectedLat = null;
let selectedLng = null;
let countriesData = {};
let initialCountriesData = {};
let countryMapLayers = {};
let surrenderedCountries = [];
let playerCountry = null;
let allMapsLoaded = false;
let pendingCapitalSpawn = false;
let capitalsSpawned = false;
let capitalRelocationLock = false;
    // --- ここから追加：countries.jsonの読み込み処理 ---
fetch('countries.json')
    .then(response => {
        if (!response.ok) {
            throw new Error('ネットワーク応答が正常ではありません');
        }
        return response.json();
    })
    .then(data => {
        countriesData = data;
        initialCountriesData = JSON.parse(JSON.stringify(data)); // バックアップ用
        console.log("国家データの読み込みに成功しました:", countriesData);
        
        // もしすでにマップの描画などが終わっていれば、このタイミングで各国個別のGeoJSONマップを読み込む処理等につなげてください
        // 例: loadCountryMaps(); 
    })
    .catch(error => {
        console.error('countries.jsonの読み込み中にエラーが発生しました:', error);
    });
// --- ここまで追加 ---

    // 国を選択したときに呼び出される関数
    function selectCountry(tag) {
        resetTerritories();
        resetGameState();
        playerCountry = tag;
        console.log("プレイヤーターゲット国家:", playerCountry);
        
        // 国家選択画面を非表示にする
        document.getElementById("countrySelectModal").style.display = "none";
        const country = countriesData[tag];
        if (country && country.capital && country.capital.lat && country.capital.lng) {
            const layerGroup = countryMapLayers[tag] || country.mapLayer;
            if (layerGroup && typeof layerGroup.getBounds === 'function') {
                map.fitBounds(layerGroup.getBounds(), {
                    animate: true,
                    duration: 1.8,
                    maxZoom: 7
                });
            } else {
                let zoomlevel = 7;
                if(tag === "RUS") zoomlevel = 5;

                map.flyTo([country.capital.lat, country.capital.lng], zoomlevel, {
                    animate: true,
                    duration: 1.8
                });
            }
            if (allMapsLoaded) {
                spawnInitialCapitals();
            } else {
                pendingCapitalSpawn = true;
            }
            alert(`${country.name} (${tag}) でプレイを開始します。首都 ${country.capital.name} から国土を防衛してください！`);
        } else {
            alert(`${tag}でプレイを開始します`)
        }
        
    }
    function findLayerAtPoint(lat, lng, rootLayer = null) {
        const visit = (layer) => {
            if (!layer) return null;
            if (layer.feature && typeof layer.getBounds === 'function') {
                try {
                    if (layer.getBounds().contains([lat, lng])) {
                        return layer;
                    }
                } catch (e) {}
            }
            if (layer.eachLayer && typeof layer.eachLayer === 'function') {
                let found = null;
                layer.eachLayer(inner => {
                    if (!found) {
                        found = visit(inner);
                    }
                });
                return found;
            }
            return null;
        };

        if (rootLayer) {
            return visit(rootLayer);
        }

        let found = null;
        map.eachLayer(layer => {
            if (!found && !(layer instanceof L.TileLayer)) {
                found = visit(layer);
            }
        });
        return found;
    }

    function spawnInitialCapitals() {
    console.log("初期首都の配置を開始します...");

    // countriesDataに登録されているすべての国をループする
    Object.entries(countriesData).forEach(([tag, country]) => {
        if (tag === 'DPRK') return;
            const lat = country.capital.lat;
            const lng = country.capital.lng;
            const cityName = country.capital.name + "(首都)";

            const rootLayer = countryMapLayers[tag] || country.mapLayer;
            let targetLayer = findLayerAtPoint(lat, lng, rootLayer);

            // もし範囲検索で見つからなければ、名前一致で探すフォールバックを試す
            if (!targetLayer) {
                const capitalName = country.capital.name;
                const searchByName = (layer) => {
                    if (!layer) return null;
                    if (layer.feature && layer.feature.properties) {
                        const areaName = layer.feature.properties.name || layer.feature.properties.name_latin;
                        if (areaName && areaName === capitalName) {
                            return layer;
                        }
                    }
                    if (layer.eachLayer && typeof layer.eachLayer === 'function') {
                        let found = null;
                        layer.eachLayer(inner => {
                            if (!found) {
                                found = searchByName(inner);
                            }
                        });
                        return found;
                    }
                    return null;
                };
                targetLayer = searchByName(rootLayer);
            }

            // それでも見つからない場合は、首都座標に最も近い区画を候補にする
            if (!targetLayer) {
                let bestLayer = null;
                let bestDistance = Infinity;
                const collectCandidates = (layer) => {
                    if (!layer) return;
                    if (layer.feature && typeof layer.getBounds === 'function') {
                        const center = layer.getBounds().getCenter();
                        const dx = center.lat - lat;
                        const dy = center.lng - lng;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        if (distance < bestDistance) {
                            bestDistance = distance;
                            bestLayer = layer;
                        }
                    }
                    if (layer.eachLayer && typeof layer.eachLayer === 'function') {
                        layer.eachLayer(inner => collectCandidates(inner));
                    }
                };
                collectCandidates(rootLayer);
                if (bestLayer && bestDistance < 3.0) {
                    targetLayer = bestLayer;
                }
            }

            // もし座標または名前または近接で一致する行政区画が見つかったら、そこに都市を自動建設！
            if (targetLayer) {
                // すでに都市がある場合はスキップ
                if (targetLayer.hasCity) return;

                // 最初から建設完了状態の都市（サークル）を直接マップに配置する
                const baseColor = country.color || "blue";
                const marker = L.circle([lat, lng], { color: baseColor, radius: 600, fillOpacity: 0.7 }).addTo(map);
                
                // ポップアップの設定
                marker.bindPopup(`
                    <b>${cityName}</b><br>
                    <div class="hp-container">
                        <div id="bar-${cityName}" class="hp-bar" style="background: ${baseColor}; width: 100%;"></div>
                    </div>
                    <span>建設完了（初期首都）</span>
                `);

                // エリアに都市があるフラグを立て、所有者をその国のタグにする
                targetLayer.hasCity = true;
                targetLayer.cityMarker = marker;
                targetLayer.feature.properties.owner = tag;
                targetLayer.feature.properties.isCapitalArea = true;
                targetLayer.feature.properties.capitalCountry = tag;
                targetLayer.feature.properties.capitalName = country.capital.name;
                targetLayer.setStyle({
                    fillColor: baseColor,
                    fillOpacity: 0.5,
                    color: 'gray'
                });

                // 都市データ配列に保存（★ownerを追加して初期配置の首都も数えられるように修正）
                citys.push({ name: cityName, lat: lat, lng: lng, hp: 100, owner: tag });
                console.log(`${country.name}の首都 ${cityName} を配置しました。`);
            }
        }
    );
    
    console.log("初期首都の配置が完了しました！現在の全都市データ:", citys);
    }

    const map = L.map('map', {
            worldCopyJump: false,
            minZoom: 3
    }).setView([46.97, 142.73], 7);
    map.setMaxBounds([
    [-90, -180],
    [90, 180]
    ]);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors Leaflet.com'
        }).addTo(map);

        function resetMapLayer(layer) {
            if (!layer.feature || !layer.feature.properties) return;
            const props = layer.feature.properties;
            if (props.originalOwner) {
                props.owner = props.originalOwner;
            }
            if (props.ownerColor) {
                layer.setStyle && layer.setStyle({ fillColor: props.ownerColor, fillOpacity: 0.5, color: 'gray' });
            } else {
                layer.setStyle && layer.setStyle({ fillColor: 'gray', fillOpacity: 0.5, color: 'gray' });
            }
            delete props.isCapitalArea;
            delete props.capitalCountry;
            delete props.capitalName;
            delete layer.hasCity;
            if (layer.cityMarker) {
                map.removeLayer(layer.cityMarker);
                layer.cityMarker = null;
            }
        }

        function haversineDistance(coordA, coordB) {
            const toRad = Math.PI / 180;
            const [lng1, lat1] = coordA;
            const [lng2, lat2] = coordB;
            const dLat = (lat2 - lat1) * toRad;
            const dLng = (lng2 - lng1) * toRad;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                      Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
                      Math.sin(dLng / 2) * Math.sin(dLng / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const earthRadiusKm = 6371;
            return earthRadiusKm * c;
        }

        function extractCoordinates(geom) {
            if (!geom || !geom.type || !geom.coordinates) return [];
            if (geom.type === 'Polygon') {
                return geom.coordinates.flat(1);
            }
            if (geom.type === 'MultiPolygon') {
                return geom.coordinates.flat(2);
            }
            return [];
        }

        function filterFeaturesByDistance(geojson, capital, maxKm) {
            if (!geojson || !Array.isArray(geojson.features)) return geojson;
            return Object.assign({}, geojson, {
                features: geojson.features.filter(feature => {
                    const geom = feature.geometry;
                    if (!geom) return false;
                    const coords = extractCoordinates(geom);
                    if (coords.length === 0) return false;
                    const lats = coords.map(pt => pt[1]);
                    const lons = coords.map(pt => pt[0]);
                    const minLat = Math.min(...lats);
                    const maxLat = Math.max(...lats);
                    const minLon = Math.min(...lons);
                    const maxLon = Math.max(...lons);

                    return (
                        minLat >= 46.0 &&
                        maxLat <= 50.5 &&
                        minLon >= 141.0 &&
                        maxLon <= 143.7
                    );
                })
            });
        }

        function filterSnlPolygons(geojson) {
            if (!geojson || !Array.isArray(geojson.features)) return geojson;

            const sakhalinBounds = {
                minLon: 141.0,
                maxLon: 145.5,
                minLat: 45.8,
                maxLat: 54.6
            };

            const polygonIsValid = polygon => {
                const coords = polygon.flat();
                if (!coords.length) return false;

                const lons = coords.map(pt => pt[0]);
                const lats = coords.map(pt => pt[1]);
                const minLon = Math.min(...lons);
                const maxLon = Math.max(...lons);
                const minLat = Math.min(...lats);
                const maxLat = Math.max(...lats);

                const overlapsBox = minLon <= sakhalinBounds.maxLon && maxLon >= sakhalinBounds.minLon && minLat <= sakhalinBounds.maxLat && maxLat >= sakhalinBounds.minLat;
                if (!overlapsBox) return false;

                const centroidLon = lons.reduce((sum, v) => sum + v, 0) / lons.length;
                const centroidLat = lats.reduce((sum, v) => sum + v, 0) / lats.length;
                return centroidLon >= sakhalinBounds.minLon && centroidLon <= sakhalinBounds.maxLon && centroidLat >= sakhalinBounds.minLat && centroidLat <= sakhalinBounds.maxLat;
            };

            const normalizeFeature = feature => {
                if (!feature.geometry) return null;
                const geom = feature.geometry;
                if (geom.type === 'MultiPolygon') {
                    const filtered = geom.coordinates
                        .map(polygon => polygon.filter(ring => ring && ring.length > 0))
                        .filter(polygon => polygonIsValid(polygon));
                    if (filtered.length === 0) return null;
                    return {
                        ...feature,
                        geometry: {
                            ...geom,
                            coordinates: filtered
                        }
                    };
                }
                if (geom.type === 'Polygon') {
                    if (!polygonIsValid(geom.coordinates)) return null;
                    return feature;
                }
                return null;
            };

            return {
                ...geojson,
                features: geojson.features
                    .map(normalizeFeature)
                    .filter(Boolean)
            };
        }

        function resetTerritories() {
            map.eachLayer(layer => {
                if (layer instanceof L.TileLayer) return;
                if (layer.eachLayer && typeof layer.eachLayer === 'function') {
                    layer.eachLayer(inner => {
                        resetMapLayer(inner);
                    });
                    return;
                }
                if (layer.feature && layer.feature.properties) {
                    resetMapLayer(layer);
                }
            });
        }

        function resetGameState() {
            selectedLayer = null;
            selectedLat = null;
            selectedLng = null;
            surrenderedCountries = [];
            capitalRelocationLock = false;
            capitalMoves = { "CHN": 0 };
            citys = [];
            countriesData = JSON.parse(JSON.stringify(initialCountriesData));

            map.eachLayer(layer => {
                if (layer instanceof L.TileLayer) return;
                if (layer.eachLayer && typeof layer.eachLayer === 'function') {
                    layer.eachLayer(inner => {
                        resetMapLayer(inner);
                    });
                    return;
                }
                if (layer.feature && layer.feature.properties) {
                    resetMapLayer(layer);
                }
            });
        }

        // 【最重要】基地のデータを溜める箱を、一番最初に作っておきます
        let citys = [];

        // 2. GeoJSONを読み込んで、エリア（区画）をクリックできるようにする

        fetch('data/countries.json')
            .then(res => res.json())
            .then(countries => {
                initialCountriesData = JSON.parse(JSON.stringify(countries));
                delete initialCountriesData['DPRK'];
                countriesData = JSON.parse(JSON.stringify(initialCountriesData));
                console.log('countries.json loaded', Object.keys(countriesData));
                const loadTags = new Set(["SNL", "CHN", "JPN", "KOR", "RUS"]);
                const loadPromises = Object.entries(countriesData).map(([tag, country]) => {
                    if (!loadTags.has(tag)) {
                        return Promise.resolve();
                    }
                    console.log('fetching map for', tag, country.map);
                    return fetch(country.map)
                        .then(res => {
                            if (res.ok) return res.json();
                            throw new Error(`HTTP ${res.status}`);
                        })
                        .then(data => {
                            if (!data) {
                                console.warn('no data for', tag);
                                return;
                            }
                            // SNL の pref.json は正常なサハリン領域データなので、すべてのフィーチャーを読み込みます。
                            console.log('geojson parsed for', tag, 'features', data.features.length);
                            if (tag === 'SNL') {
                                data = filterSnlPolygons(data);
                                console.log('SNL filtered polygons =>', data.features.length);
                            }
                            data.features.forEach(feature => {
                                if (!feature.properties) {
                                    feature.properties = {};
                                }
                                feature.properties.owner = tag;
                                feature.properties.originalOwner = tag;
                                feature.properties.ownerColor = country.color;
                            });

                            try {
                                const layerGroup = L.geoJSON(data, {
                                filter: function(feature) {
                                    return true; 
                                },
                                style: {
                                    color: "gray",
                                    weight: 1,
                                    fillColor: country.color,
                                    fillOpacity: 0.5
                                },
                                onEachFeature: function(feature, layer){
                                    const props = feature.properties || {};
                                    if (country.capital && country.capital.lat && country.capital.lng) {
                                        try {
                                            if (layer.getBounds && layer.getBounds().contains([country.capital.lat, country.capital.lng])) {
                                                props.isCapitalArea = true;
                                                props.capitalCountry = tag;
                                                props.capitalName = country.capital.name;
                                            }
                                        } catch (e) {
                                            // 無害: 一部レイヤーで getBounds が使えない場合がある
                                        }
                                    }

                                    layer.on('click', function(e){
                                        if(e.originalEvent.ctrlKey){
                                            console.log("CTRL");
                                            createcity(
                                                e.latlng.lat,
                                                e.latlng.lng,
                                                layer
                                            );
                                            return;
                                        }

                                        selectedLayer = layer;
                                        selectedLat = e.latlng.lat;
                                        selectedLng = e.latlng.lng;

                                        const menu = document.getElementById("actionMenu");
                                        menu.style.display = "block";
                                        menu.style.left = e.originalEvent.pageX + "px";
                                        menu.style.top = e.originalEvent.pageY + "px";
                                    });
                                }
                            }).addTo(map);
                            country.mapLayer = layerGroup;
                            countryMapLayers[tag] = layerGroup;
                        } catch (err) {
                            console.error('L.geoJSON エラー:', tag, err);
                        }
                        })
                        .catch(error => console.error(`エリアデータの読み込みに失敗しました: ${country.map}`, error));
                });

                Promise.all(loadPromises).then(() => {
                    allMapsLoaded = true;
                    if (pendingCapitalSpawn) {
                        spawnInitialCapitals();
                        pendingCapitalSpawn = false;
                    }
                }).catch(error => console.error('マップ読み込み時にエラーが発生しました:', error));
            })
            .catch(error => console.error('日本地図の読み込みに失敗しました…:', error));

        // 3. 基地を作るための関数（★ownerを追加して新しく建てた都市も数えられるように修正）
        function createcity(lat, lng, targetArea) {
    const ownerTag = playerCountry ? playerCountry : "SNL";
    const isEnemyCapitalArea = targetArea.feature && targetArea.feature.properties && targetArea.feature.properties.isCapitalArea && targetArea.feature.properties.owner !== ownerTag;

    if (targetArea.hasCity && !isEnemyCapitalArea) {
        alert("この行政区画には既に都市があります！");
        return;
    }

    // 敵の首都エリアを占領する場合、既存の首都マーカーを削除してから建設を開始
    if (isEnemyCapitalArea && targetArea.cityMarker) {
        map.removeLayer(targetArea.cityMarker);
        targetArea.cityMarker = null;
    }

    // 既存の都市データを古いオーナーから削除
    if (isEnemyCapitalArea) {
        citys = citys.filter(city => !(city.lat === lat && city.lng === lng && city.owner !== ownerTag));
    }

    // ★重要: 建設を開始した時点で一時的に仮フラグを立てて、連続クリックによる重複建設を防ぐ
    targetArea.hasCity = "building"; 

    const cityName = "都市_" + (citys.length + 1);
    
    // 最初は「建設中」の目印（黄色）
    const marker = L.circle([lat, lng], { color: 'yellow', radius: 500, fillOpacity: 0.7 }).addTo(map);
    
    // ポップアップを生成して開く
    marker.bindPopup(`
        <b>${cityName}</b><br>
        <div class="hp-container">
            <div id="bar-${cityName}" class="hp-bar" style="background: yellow; width: 0%;"></div>
        </div>
        <span id="text-${cityName}">建設中...</span>
    `).openPopup();

    // 建設シミュレーション（let と const を関数内で完結させることで並行処理を安全にする）
    let progress = 0;
    const interval = setInterval(() => {
        progress += 10;
        
        // DOMが存在するか毎秒チェック（ポップアップが閉じられても裏で進むようにする）
        const bar = document.getElementById(`bar-${cityName}`);
        if (bar) bar.style.width = progress + "%";

        if (progress >= 100) {
            clearInterval(interval);
            
            // 建設完了！正式にフラグを true に書き換える
            targetArea.hasCity = true;
            
            // 完了時のUI変更
            const finalBar = document.getElementById(`bar-${cityName}`);
            const finalText = document.getElementById(`text-${cityName}`);
            if (finalBar) finalBar.style.background = "blue";
            if (finalText) finalText.innerText = "建設完了";
            
            marker.setStyle({ color: 'blue' });
            
            // 領土占領関数を呼び出す
            occupyArea(targetArea);
            
            // データを保存（ownerを追加）
            citys.push({ 
                name: cityName, 
                lat: lat, 
                lng: lng, 
                hp: 100,
                owner: targetArea.feature.properties.owner 
            });
            
            console.log("建設完了！現在のデータ:", citys);
        }
    }, 300);
}

        // 4. エリアを塗りつぶす関数
        function occupyArea(targetArea){
            const currentCountry=countriesData[playerCountry];

            const ownerTag = playerCountry ? playerCountry : "SNL";
            const fillColor = currentCountry ? currentCountry.color: "blue";
            targetArea.feature.properties.owner = ownerTag;
            targetArea.setStyle({
                fillColor: fillColor,
                fillOpacity: 0.5,
                color: "gray",
            });
            console.log("領土は占領されました。");

            const props = targetArea.feature.properties;
            if (props && props.isCapitalArea && props.capitalCountry && props.capitalCountry !== ownerTag) {
                console.log(`occupyArea: captured capital area owner=${props.capitalCountry} by=${ownerTag}`);
                if (props.capitalCountry === "CHN") {
                    tryMoveCapital("CHN");
                } else {
                    if (!surrenderedCountries.includes(props.capitalCountry)) {
                        surrenderCountry(props.capitalCountry);
                        surrenderedCountries.push(props.capitalCountry);
                    }
                }
            }

            checkAllcountries();
            
        }
        function countTerritories(tag){

        let count = 0;

        map.eachLayer(layer => {

            if(
                layer.feature &&
                layer.feature.properties &&
                layer.feature.properties.owner === tag
            ){
                count++;
            }

        });

        return count;
        }
        function checkAllcountries(){
            const countryTags = Object.keys(countriesData).filter(tag => tag !== 'DPRK');

            countryTags.forEach(tag => {
                const territoryCount = countTerritories(tag);
                console.log(`checkAllcountries: ${tag} territoryCount=${territoryCount} surrendered=${surrenderedCountries.includes(tag)}`);
                if(
                    territoryCount === 0 &&
                    !surrenderedCountries.includes(tag)
                ){
                    surrenderCountry(tag);
                    surrenderedCountries.push(tag);
                }
            });
        }
        function surrenderCountry(tag){
            if (countriesData[tag]) {
                countriesData[tag].isSurrendered = true;
            }
            console.log(`surrenderCountry: ${tag} has surrendered`);
            alert(tag + "は降伏しました。");
        }

    function buildSelectedCity(){

    if(!selectedLayer) return;

    createcity(
        selectedLat,
        selectedLng,
        selectedLayer
    );

    document.getElementById("actionMenu").style.display = "none";
}

function showSelectedInfo(){

    if(!selectedLayer) return;

    alert(
        "所有国: " +
        selectedLayer.feature.properties.owner
    );

    document.getElementById("actionMenu").style.display = "none";
}
let capitalMoves = {
    "CHN": 0
};

function getCountryByTag(tag){

    return countriesData[tag];
}

function isCapitalOccupied(tag){

    const country = countriesData[tag];
    if(!country || !country.capital){
        console.log("首都チェック: 国データが見つかりません", tag);
        return false;
    }
    console.log("首都チェック:", country.capital.name);

    const capitalName = country.capital.name;

    let occupied = false;

    map.eachLayer(layer => {
        if(
            layer.feature &&
            layer.feature.properties
        ){
            const props = layer.feature.properties;
            if (
                props.isCapitalArea === true &&
                props.capitalCountry === tag &&
                props.capitalName === capitalName &&
                props.owner !== tag
            ) {
                occupied = true;
            }
        }
    });

    return occupied;
}

function tryMoveCapital(tag){

    if (capitalRelocationLock) {
        console.log("tryMoveCapital: すでに遷都中", tag);
        return;
    }

    const country = countriesData[tag];

    if(!country || tag !== "CHN"){
        return;
    }

    if (surrenderedCountries.includes(tag)) {
        console.log("tryMoveCapital: 降伏済みのため遷都しない", tag);
        return;
    }

    capitalRelocationLock = true;
    try {
        const currentCapital = country.capital.name;

        let chance = 0;

        if(currentCapital === "北京市"){
            chance = 1.00;
        }
        else if(currentCapital === "上海市"){
            chance = 0.95;
        }
        else if(currentCapital === "南京市"){
            chance = 0.70;
        }
        else if(currentCapital === "重庆市"){
            chance = 0.30;
        }
        else if(currentCapital === "天津市"){
            chance = 0.05;
        }

        if (surrenderedCountries.includes(tag)) {
            console.log("tryMoveCapital: すでに降伏済み", tag);
            return;
        }

        const roll = Math.random();
        console.log(`tryMoveCapital: ${country.name} (${currentCapital}) chance=${chance} roll=${roll}`);
        if (roll > chance){
            console.log(`tryMoveCapital: collapse triggered for ${tag} (roll ${roll} > chance ${chance})`);
            alert(
                country.name +
                " は政府崩壊により降伏しました！"
            );

            if (!surrenderedCountries.includes(tag)) {
                surrenderCountry(tag);
                surrenderedCountries.push(tag);
            }

            // 降伏した場合は、現在の CHN 首都フラグをすべて消去して再遷都を防止
            map.eachLayer(layer => {
                if (layer.feature && layer.feature.properties) {
                    const props = layer.feature.properties;
                    if (props.capitalCountry === tag) {
                        delete props.isCapitalArea;
                        delete props.capitalCountry;
                        delete props.capitalName;
                    }
                }
            });
            country.capital = null;
            return;
        }

        const moveIndex = capitalMoves[tag] || 0;

        if(
            !country.backupcities ||
            moveIndex >= country.backupcities.length
        ){
            if (!surrenderedCountries.includes(tag)) {
                surrenderCountry(tag);
                surrenderedCountries.push(tag);
            }
            return;
        }

        const newCapital = country.backupcities[moveIndex];

        // 旧首都フラグを削除し、新しい首都エリアにフラグを再設定する
        map.eachLayer(layer => {
            if (layer.feature && layer.feature.properties) {
                const props = layer.feature.properties;
                if (props.capitalCountry === tag) {
                    delete props.isCapitalArea;
                    delete props.capitalCountry;
                    delete props.capitalName;
                }
            }
        });

        country.capital = newCapital;

        map.eachLayer(layer => {
            if (layer.feature && layer.feature.properties && layer.getBounds && layer.getBounds().contains([newCapital.lat, newCapital.lng])) {
                layer.feature.properties.isCapitalArea = true;
                layer.feature.properties.capitalCountry = tag;
                layer.feature.properties.capitalName = newCapital.name;
            }
        });

        capitalMoves[tag]++;

        alert(
            country.name +
            " は " +
            newCapital.name +
            " に遷都しました！"
        );
    } finally {
        capitalRelocationLock = false;
    }
}

// ========================================================
// リアルタイム軍隊生産・作成基準システム (HoI4風)
// ========================================================

const ARMY_COST_MANPOWER = 1000; // 1師団に必要な人的資源
const TRAINING_SPEED = 10;       // 1秒ごとに進む訓練度（％）

// ゲーム内でリアルタイムに軍隊を作る心臓部ループ（1秒ごと）
setInterval(() => {
    // まだ国データが読み込まれていなければスキップ
    if (!countriesData || Object.keys(countriesData).length === 0) return;

    // 全国家でループを回して軍隊の生産をリアルタイム計算
    Object.entries(countriesData).forEach(([tag, country]) => {
        // 降伏済みの国は軍隊を作らない
        if (surrenderedCountries.includes(tag)) return;

        // 1. この国が持っている「都市（首都含む）」をすべて数える
        const myCities = citys.filter(c => c.owner === tag);
        if (myCities.length === 0) return; // 所有している都市がゼロなら生産不可

        // 2. 人的資源（Manpower）の蓄積（1都市につき毎秒+20資源）
        if (!country.manpower) country.manpower = 0;
        country.manpower += myCities.length * 20; 

        // 3. 訓練度（Progress）を進める
        if (!country.trainingProgress) country.trainingProgress = 0;
        country.trainingProgress += TRAINING_SPEED;

        // 4. 【作成基準】人的資源がコストに達し、訓練も100%完了したか？
        if (country.manpower >= ARMY_COST_MANPOWER && country.trainingProgress >= 100) {
            
            // 資源を消費
            country.manpower -= ARMY_COST_MANPOWER;
            country.trainingProgress = 0; // 次の部隊の訓練へリセット

            // 5. 配備先を、自分が持っている都市の中からランダムで選ぶ
            const spawnCity = myCities[Math.floor(Math.random() * myCities.length)];

            // army.js の関数を呼び出して、地図上に軍隊マーカーをリアルタイム配備！
            if (typeof createArmy === 'function') {
                createArmy(
                    spawnCity.lat, 
                    spawnCity.lng, 
                    tag, 
                    ARMY_COST_MANPOWER
                );
                console.log(`【配備報告】${country.name} (${tag}) が ${spawnCity.name} に新設師団を配置しました。`);
            } else {
                console.error("army.jsのcreateArmy関数が見つかりません。先にarmy.jsが読み込まれているか確認してください。");
            }
        }
    });

}, 1000);