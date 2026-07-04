let armies = [];

function createArmy(
    lat,
    lng,
    owner,
    soldiers
){
    armies.push({
        owner: owner,
        soldiers: soldiers,
        lat: lat,
        lng: lng
    });

    L.marker([lat, lng])
    .addTo(map)
    .bindPopup(
        "兵力:" + soldiers
    );
}

// ↓ここに追加

function moveArmy(
    army,
    target
){
    army.lat = target.lat;
    army.lng = target.lng;

    console.log("移動完了");
}

function attackArmy(
    attacker,
    defender
){

    defender.soldiers -= attacker.soldiers * 0.1;

    if(defender.soldiers <= 0){

        console.log("勝利");

        return true;
    }

    return false;
}