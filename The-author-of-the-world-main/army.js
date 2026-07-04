let armies = [];

// 1. 軍隊を生み出す関数
function createArmy(lat, lng, owner, soldiers) {
    // マーカーを作って地図に追加
    const marker = L.marker([lat, lng]).addTo(map);
    marker.bindPopup(`<b>${owner}の軍</b><br>兵力: ${soldiers}`);

    // ★データの中に「marker」そのものも一緒に保存するのがコツ！
    const newArmy = {
        owner: owner,
        soldiers: soldiers,
        lat: lat,
        lng: lng,
        marker: marker // これを入れておく
    };
    
    armies.push(newArmy);
    return newArmy; // 作った軍隊のデータを返す
}

// 2. 軍隊を移動させる関数
function moveArmy(army, targetLat, targetLng) {
    // 内部のデータ（緯度経度）を更新
    army.lat = targetLat;
    army.lng = targetLng;

    // ★【重要】地図上のマーカーの位置も、新しい座標へワープ（セット）させる！
    if (army.marker) {
        army.marker.setLatLng([targetLat, targetLng]);
        // ポップアップを開き直して最新の兵力を表示
        army.marker.setPopupContent(`<b>${army.owner}の軍</b><br>兵力: ${army.soldiers}`);
    }

    console.log("移動完了");
}

// 3. 軍隊が攻撃する関数
function attackArmy(attacker, defender) {
    // 攻撃側の兵力の10%を、防御側の兵力から引く
    defender.soldiers -= attacker.soldiers * 0.1;
    
    // 小数点が出ると汚いので、キレイな整数に丸める
    defender.soldiers = Math.max(0, Math.round(defender.soldiers));

    // 防御側のポップアップ表示を最新の兵力に更新
    if (defender.marker) {
        defender.marker.setPopupContent(`<b>${defender.owner}の軍</b><br>兵力: ${defender.soldiers}`);
    }

    if (defender.soldiers <= 0) {
        console.log("勝利！敵軍を殲滅しました。");
        
        // ★敵が全滅したら、地図からマーカーを消す
        if (defender.marker) {
            map.removeLayer(defender.marker);
        }
        
        // armiesリストからも消去する
        armies = armies.filter(a => a !== defender);

        return true; // 勝利
    }

    return false; // 戦闘継続
}