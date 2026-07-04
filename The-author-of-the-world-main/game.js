    let selectedLayer = null;
    let selectedLat = null;
    let selectedLng = null;
    let countriesData = {};
    let surrenderedCountries = [];

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

        // 【最重要】基地のデータを溜める箱を、一番最初に作っておきます
        let citys = [];

        // 2. GeoJSONを読み込んで、エリア（区画）をクリックできるようにする

        fetch('data/countries.json')
            .then(res => res.json())
            .then(countries => {
                countriesData = countries;
                Object.entries(countries).forEach(([tag, country]) => {

                    fetch(country.map)
                    .then(res => res.json())
                    .then(data => {

                        data.features.forEach(feature => {
                            feature.properties.owner = tag;
                        });

                        L.geoJSON(data, {

                            style: {
                                color: "gray",
                                weight: 1,
                                fillColor: country.color,
                                fillOpacity: 0.5
                            },

                            onEachFeature: function(feature, layer){

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

                                    // 普通のクリックならメニュー表示
                                    selectedLayer = layer;
                                    selectedLat = e.latlng.lat;
                                    selectedLng = e.latlng.lng;

                                    const menu =
                                        document.getElementById("actionMenu");

                                    menu.style.display = "block";
                                    menu.style.left = e.originalEvent.pageX + "px";
                                    menu.style.top = e.originalEvent.pageY + "px";
                                });


                            }

                        }).addTo(map);

                    })
                    .catch(error => console.error(`エリアデータの読み込みに失敗しました: ${country.map}`, error));

                });

            })
            .catch(error => console.error('日本地図の読み込みに失敗しました…:', error));

        // 3. 基地を作るための関数
        function createcity(lat, lng, targetArea) {
            const cityName = "都市_" + (citys.length + 1);
            if(targetArea.hasCity){
                alert("この行政区画には既に都市があります！");
                return;
            }
            // 最初は「建設中」の目印（黄色）
            const marker = L.circle([lat, lng], { color: 'yellow', radius: 500, fillOpacity: 0.7 }).addTo(map);
            
            // ポップアップ
            marker.bindPopup(`
                <b>${cityName}</b><br>
                <div class="hp-container">
                    <div id="bar-${cityName}" class="hp-bar" style="background: yellow;"></div>
                </div>
                <span id="text-${cityName}">建設中...</span>
            `).openPopup();

            // 建設シミュレーション
            let progress = 0;
            const interval = setInterval(() => {
                progress += 10;
                const bar = document.getElementById(`bar-${cityName}`);
                if (bar) bar.style.width = progress + "%";

                if (progress >= 100) {
                    clearInterval(interval);
                    targetArea.hasCity = true;
                    // 建設完了のUI変更
                    document.getElementById(`bar-${cityName}`).style.background = "blue";
                    document.getElementById(`text-${cityName}`).innerText = "建設完了";
                    marker.setStyle({ color: 'blue' });
                    
                    // ここで用意していた占領関数を呼び出す
                    occupyArea(targetArea);
                    
                    // データを保存（ここで citys を使います）
                    citys.push({ name: cityName, lat: lat, lng: lng, hp: 100 });
                    
                    console.log("建設完了！現在のデータ:", citys);
                }
            }, 300);
        }

        // 4. エリアを塗りつぶす関数
        function occupyArea(targetArea){
            targetArea.feature.properties.owner = "SNL";
            targetArea.setStyle({
                fillColor: 'blue',
                fillOpacity: 0.5,
                color: 'blue',
            });
            console.log("領土は占領されました。");
            
            if(isCapitalOccupied("CHN")){
                    tryMoveCapital("CHN");
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

            const countries = ["SNL", "JPN", "DPRK"];
        
            countries.forEach(tag => {
            
            if(
            countTerritories(tag) === 0 &&
            !surrenderedCountries.includes(tag)
            ){
            surrenderCountry(tag);

            surrenderedCountries.push(tag);
            }


            });
    
        }
        function surrenderCountry(tag){

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
    console.log("首都チェック:", country.capital.name);
    if(!country || !country.capital){
        return false;
    }

    const capitalName = country.capital.name;

    let occupied = false;

    map.eachLayer(layer => {

        if(
            layer.feature &&
            layer.feature.properties
        ){

            const areaName =
                layer.feature.properties.name ||
                layer.feature.properties.name_latin;

            if(
                areaName === capitalName &&
                layer.feature.properties.owner !== tag
            ){
                occupied = true;
            }
        }

    });

    return occupied;
}

function tryMoveCapital(tag){

    const country = countriesData[tag];

    if(!country || tag !== "CHN"){
        return;
    }

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

    if(Math.random() > chance){

        alert(
            country.name +
            " は政府崩壊により降伏しました！"
        );

        surrenderCountry(tag);
        return;
    }

    const moveIndex = capitalMoves[tag] || 0;

    if(
        !country.backupcities ||
        moveIndex >= country.backupcities.length
    ){
        surrenderCountry(tag);
        return;
    }

    const newCapital =
        country.backupcities[moveIndex];

    country.capital = newCapital;

    capitalMoves[tag]++;

    alert(
        country.name +
        " は " +
        newCapital.name +
        " に遷都しました！"
    );
}
