// ============================================================
// WorldGenerator: 3D 群島幾何模型生成器（層疊台地、地標、動物、居民、點綴）
// ============================================================

import * as THREE from 'three';

export class WorldGenerator {
  constructor() {
    this.materials = this.initMaterials();
    this.nightLights = [];
    this.animatedProps = {
      windmills: [],
      waterfalls: [],
      balloons: [],
      animals: [],
      residents: [],
      deliveryWorkers: [],
      clouds: [],
      birds: [],
      boats: []
    };
    this.interactiveObjects = []; // 可射線點擊互動的物件（島嶼地標、NPC、動物、貝殼）
  }

  initMaterials() {
    return {
      // 地形材質
      grassTop: new THREE.MeshLambertMaterial({ color: 0x488a42, flatShading: true }),
      grassMid: new THREE.MeshLambertMaterial({ color: 0x5fa856, flatShading: true }),
      grassLight: new THREE.MeshLambertMaterial({ color: 0x7ebf6d, flatShading: true }),
      dirtCliff: new THREE.MeshLambertMaterial({ color: 0x7a634b, flatShading: true }),
      rockGrey: new THREE.MeshLambertMaterial({ color: 0x7f8880, flatShading: true }),
      beachSand: new THREE.MeshLambertMaterial({ color: 0xdfcd98, flatShading: true }),
      stonePath: new THREE.MeshLambertMaterial({ color: 0xdde3d6, flatShading: true }),

      // 植被
      woodBark: new THREE.MeshLambertMaterial({ color: 0x6e482b, flatShading: true }),
      leafGreen: new THREE.MeshLambertMaterial({ color: 0x3d7836, flatShading: true }),
      pineGreen: new THREE.MeshLambertMaterial({ color: 0x2b572a, flatShading: true }),
      sakuraPink: new THREE.MeshLambertMaterial({ color: 0xf5a9be, flatShading: true }),
      flowerRed: new THREE.MeshLambertMaterial({ color: 0xe04848, flatShading: true }),
      flowerYellow: new THREE.MeshLambertMaterial({ color: 0xf5c338, flatShading: true }),
      flowerWhite: new THREE.MeshLambertMaterial({ color: 0xf8fbf5, flatShading: true }),

      // 建築與道具
      woodPlank: new THREE.MeshLambertMaterial({ color: 0x9e6c43, flatShading: true }),
      redRoof: new THREE.MeshLambertMaterial({ color: 0xbf4b3b, flatShading: true }),
      blueRoof: new THREE.MeshLambertMaterial({ color: 0x395b7a, flatShading: true }),
      whiteWall: new THREE.MeshLambertMaterial({ color: 0xeff3eb, flatShading: true }),
      brickWall: new THREE.MeshLambertMaterial({ color: 0xa87158, flatShading: true }),
      metalIron: new THREE.MeshLambertMaterial({ color: 0x475154, flatShading: true }),
      goldAccent: new THREE.MeshLambertMaterial({ color: 0xe0a838, flatShading: true }),
      cyberCyan: new THREE.MeshLambertMaterial({ color: 0x38bfbe, flatShading: true }),
      japanTorii: new THREE.MeshLambertMaterial({ color: 0xcc3322, flatShading: true }),

      // 夜間發光材質
      windowGlow: new THREE.MeshBasicMaterial({ color: 0xffdf80 }),
      streetLightGlow: new THREE.MeshBasicMaterial({ color: 0xffea9f }),

      // 水與半透明
      waterClear: new THREE.MeshLambertMaterial({ color: 0x5cb5cc, transparent: true, opacity: 0.8, flatShading: true }),
      foamWhite: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65, flatShading: true }),

      // 貝殼拾取物
      shellGold: new THREE.MeshLambertMaterial({ color: 0xf7d96b, flatShading: true })
    };
  }

  // 1. 產生層疊台地基座 (⛰️ 層疊台地，2~3 階不規則邊緣)
  createTerraceIsland(radius, height, tiers = 3) {
    const islandGroup = new THREE.Group();
    const tierHeights = [height * 0.45, height * 0.35, height * 0.25];
    let currentY = 0;
    let currentRadius = radius;

    for (let i = 0; i < tiers; i++) {
      const segs = 14 + (i * 2);
      const geo = new THREE.CylinderGeometry(currentRadius * 0.92, currentRadius, tierHeights[i], segs);
      
      // 頂點輕微噪聲擾動，形成自然起伏而非正六邊柱
      const pos = geo.attributes.position;
      for (let j = 0; j < pos.count; j++) {
        const x = pos.getX(j);
        const y = pos.getY(j);
        const z = pos.getZ(j);
        if (Math.abs(y - tierHeights[i] / 2) > 0.05) {
          // 頂點邊緣噪聲
          const angle = Math.atan2(z, x);
          const noise = Math.sin(angle * 4 + i) * (currentRadius * 0.06);
          pos.setX(j, x + Math.cos(angle) * noise);
          pos.setZ(j, z + Math.sin(angle) * noise);
        }
      }
      geo.computeVertexNormals();

      // 各層材質區分：底層泥土岩壁/沙灘，頂層草坪
      let mat = (i === 0) ? this.materials.dirtCliff : (i === 1 ? this.materials.grassMid : this.materials.grassTop);
      const tierMesh = new THREE.Mesh(geo, mat);
      tierMesh.position.y = currentY + tierHeights[i] / 2;
      tierMesh.castShadow = true;
      tierMesh.receiveShadow = true;
      islandGroup.add(tierMesh);

      // 每一層頂部加一層綠草皮邊緣修飾
      const capGeo = new THREE.CylinderGeometry(currentRadius * 0.93, currentRadius * 0.93, 0.15, segs);
      const capMesh = new THREE.Mesh(capGeo, i === 0 ? this.materials.beachSand : this.materials.grassLight);
      capMesh.position.y = currentY + tierHeights[i] + 0.06;
      capMesh.receiveShadow = true;
      islandGroup.add(capMesh);

      currentY += tierHeights[i];
      currentRadius *= 0.82; // 往上一階縮小
    }

    // 浪花圈（環繞在島邊海平面，隨海浪輕微動態）
    const foamGeo = new THREE.RingGeometry(radius * 1.02, radius * 1.18, 20);
    foamGeo.rotateX(-Math.PI / 2);
    const foamMesh = new THREE.Mesh(foamGeo, this.materials.foamWhite);
    foamMesh.position.y = 0.15;
    islandGroup.add(foamMesh);

    // 回傳頂層 Y 座標供上方放置物件
    return { group: islandGroup, topY: currentY, topRadius: currentRadius, foam: foamMesh };
  }

  // 2. 建造石板步道
  createPath(points) {
    const pathGroup = new THREE.Group();
    for (let i = 0; i < points.length; i++) {
      const stoneGeo = new THREE.BoxGeometry(0.8 + Math.random() * 0.3, 0.08, 0.8 + Math.random() * 0.3);
      const stoneMesh = new THREE.Mesh(stoneGeo, this.materials.stonePath);
      stoneMesh.position.set(points[i].x, points[i].y + 0.04, points[i].z);
      stoneMesh.rotation.y = Math.random() * Math.PI;
      stoneMesh.receiveShadow = true;
      pathGroup.add(stoneMesh);
    }
    return pathGroup;
  }

  // 3. 建造樹木（兩種樹形：圓形落葉樹、圓錐針葉樹）
  createTree(type = 'round', scale = 1.0) {
    const treeGroup = new THREE.Group();
    treeGroup.scale.set(scale, scale, scale);

    // 樹幹
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 1.8, 6);
    const trunk = new THREE.Mesh(trunkGeo, this.materials.woodBark);
    trunk.position.y = 0.9;
    trunk.castShadow = true;
    treeGroup.add(trunk);

    if (type === 'pine') {
      // 針葉松樹（3 層圓錐）
      for (let i = 0; i < 3; i++) {
        const coneGeo = new THREE.ConeGeometry(1.3 - i * 0.3, 1.2, 6);
        const foliage = new THREE.Mesh(coneGeo, this.materials.pineGreen);
        foliage.position.y = 1.6 + i * 0.7;
        foliage.castShadow = true;
        treeGroup.add(foliage);
      }
    } else if (type === 'sakura') {
      // 🌸 櫻花樹（多顆球體拼合粉色樹冠）
      const mainFoliage = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2, 1), this.materials.sakuraPink);
      mainFoliage.position.y = 2.0;
      mainFoliage.castShadow = true;
      treeGroup.add(mainFoliage);

      const sideFoliage = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8, 1), this.materials.sakuraPink);
      sideFoliage.position.set(0.6, 2.3, 0.3);
      sideFoliage.castShadow = true;
      treeGroup.add(sideFoliage);
    } else {
      // 圓形落葉樹
      const foliageGeo = new THREE.DodecahedronGeometry(1.1, 1);
      const foliage = new THREE.Mesh(foliageGeo, this.materials.leafGreen);
      foliage.position.y = 2.1;
      foliage.castShadow = true;
      treeGroup.add(foliage);
    }

    return treeGroup;
  }

  // 4. 建造小房屋（夜晚窗戶暖黃發光）
  createHouse(roofColor = 'red', width = 2.2, height = 1.8, depth = 2.0) {
    const houseGroup = new THREE.Group();

    // 牆體
    const bodyGeo = new THREE.BoxGeometry(width, height, depth);
    const body = new THREE.Mesh(bodyGeo, this.materials.whiteWall);
    body.position.y = height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    houseGroup.add(body);

    // 屋頂
    const roofMat = (roofColor === 'blue') ? this.materials.blueRoof : this.materials.redRoof;
    const roofGeo = new THREE.ConeGeometry(Math.max(width, depth) * 0.85, 1.2, 4);
    roofGeo.rotateY(Math.PI / 4);
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = height + 0.6;
    roof.castShadow = true;
    houseGroup.add(roof);

    // 木門
    const doorGeo = new THREE.BoxGeometry(0.6, 1.0, 0.1);
    const door = new THREE.Mesh(doorGeo, this.materials.woodPlank);
    door.position.set(0, 0.5, depth / 2 + 0.04);
    houseGroup.add(door);

    // 發光窗戶（帶光暈記錄，夜間增亮）
    const winGeo = new THREE.PlaneGeometry(0.5, 0.5);
    const windowMesh = new THREE.Mesh(winGeo, this.materials.windowGlow.clone());
    windowMesh.position.set(width * 0.28, height * 0.6, depth / 2 + 0.05);
    houseGroup.add(windowMesh);
    this.nightLights.push({ mesh: windowMesh, baseIntensity: 0.1, nightIntensity: 1.0 });

    return houseGroup;
  }

  // 5. 建造路燈（石柱＋金屬燈罩＋暖光）
  createStreetLamp() {
    const lampGroup = new THREE.Group();

    const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 1.8, 6);
    const pole = new THREE.Mesh(poleGeo, this.materials.metalIron);
    pole.position.y = 0.9;
    pole.castShadow = true;
    lampGroup.add(pole);

    const bulbGeo = new THREE.SphereGeometry(0.2, 6, 6);
    const bulb = new THREE.Mesh(bulbGeo, this.materials.streetLightGlow.clone());
    bulb.position.y = 1.85;
    lampGroup.add(bulb);
    this.nightLights.push({ mesh: bulb, baseIntensity: 0.0, nightIntensity: 1.2 });

    return lampGroup;
  }

  // 6. 建造小道具：木箱、長椅、花圃、圍籬、水井、告示牌
  createProp(type) {
    const propGroup = new THREE.Group();

    if (type === 'crate') {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.65, 0.65), this.materials.woodPlank);
      crate.position.y = 0.32;
      crate.castShadow = true;
      propGroup.add(crate);
    } else if (type === 'bench') {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.5), this.materials.woodPlank);
      seat.position.y = 0.45;
      seat.castShadow = true;
      propGroup.add(seat);
      const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.4), this.materials.metalIron);
      leg1.position.set(-0.55, 0.22, 0);
      const leg2 = leg1.clone();
      leg2.position.set(0.55, 0.22, 0);
      propGroup.add(leg1, leg2);
    } else if (type === 'well') {
      // 水井
      const wellBase = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.7, 8), this.materials.rockGrey);
      wellBase.position.y = 0.35;
      wellBase.castShadow = true;
      propGroup.add(wellBase);
      const water = new THREE.Mesh(new THREE.CircleGeometry(0.65, 8), this.materials.waterClear);
      water.rotateX(-Math.PI / 2);
      water.position.y = 0.65;
      propGroup.add(water);
    } else if (type === 'sign') {
      // 告示木牌
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), this.materials.woodBark);
      post.position.y = 0.6;
      propGroup.add(post);
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.08), this.materials.woodPlank);
      board.position.set(0, 0.95, 0);
      propGroup.add(board);
    } else if (type === 'flowers') {
      // 🌷 花圃
      for (let i = 0; i < 5; i++) {
        const flower = new THREE.Mesh(new THREE.SphereGeometry(0.14, 5, 5), Math.random() > 0.5 ? this.materials.flowerRed : this.materials.flowerYellow);
        flower.position.set((Math.random() - 0.5) * 1.2, 0.2 + Math.random() * 0.1, (Math.random() - 0.5) * 1.2);
        propGroup.add(flower);
      }
    }
    return propGroup;
  }

  // 7. 建造各島獨特地標 (10座島＋迎新港)
  createLandmark(islandId) {
    const g = new THREE.Group();

    switch (islandId) {
      case 'island-center': {
        // 慈大人文迎新港：領航大燈塔＋接待大廳＋市集棚架
        // 燈塔
        const towerGeo = new THREE.CylinderGeometry(1.6, 2.5, 9.0, 8);
        const tower = new THREE.Mesh(towerGeo, this.materials.whiteWall);
        tower.position.y = 4.5;
        tower.castShadow = true;
        g.add(tower);

        // 燈塔紅圈裝飾
        const ringGeo = new THREE.CylinderGeometry(1.9, 2.1, 1.2, 8);
        const ring = new THREE.Mesh(ringGeo, this.materials.redRoof);
        ring.position.y = 5.0;
        g.add(ring);

        // 燈塔頂部圓亭與燈
        const topGeo = new THREE.CylinderGeometry(1.4, 1.4, 1.5, 8);
        const topRoom = new THREE.Mesh(topGeo, this.materials.cyberCyan);
        topRoom.position.y = 9.5;
        g.add(topRoom);

        const beaconGeo = new THREE.SphereGeometry(0.8, 8, 8);
        const beacon = new THREE.Mesh(beaconGeo, this.materials.windowGlow.clone());
        beacon.position.y = 9.5;
        g.add(beacon);
        this.nightLights.push({ mesh: beacon, baseIntensity: 0.5, nightIntensity: 2.0 });

        // 接待大廳
        const hall = new THREE.Mesh(new THREE.BoxGeometry(5.0, 3.0, 4.0), this.materials.woodPlank);
        hall.position.set(3.5, 1.5, 0);
        hall.castShadow = true;
        g.add(hall);
        const hallRoof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 1.8, 4), this.materials.blueRoof);
        hallRoof.rotateY(Math.PI / 4);
        hallRoof.position.set(3.5, 3.8, 0);
        hallRoof.castShadow = true;
        g.add(hallRoof);
        break;
      }

      case 'island-01': {
        // 社工助人島：雙層溫暖木屋診所＋心靈涼亭
        const mainClinic = new THREE.Mesh(new THREE.BoxGeometry(4.0, 3.2, 3.2), this.materials.brickWall);
        mainClinic.position.y = 1.6;
        mainClinic.castShadow = true;
        g.add(mainClinic);

        const clinicRoof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1.6, 4), this.materials.redRoof);
        clinicRoof.rotateY(Math.PI / 4);
        clinicRoof.position.y = 3.9;
        clinicRoof.castShadow = true;
        g.add(clinicRoof);

        // 愛心十字裝飾
        const crossH = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.1), this.materials.whiteWall);
        crossH.position.set(0, 2.2, 1.66);
        const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.2, 0.1), this.materials.whiteWall);
        crossV.position.set(0, 2.2, 1.66);
        g.add(crossH, crossV);

        // 助人守護涼亭
        const pavPillar1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.0, 6), this.materials.woodBark);
        pavPillar1.position.set(3.2, 1.0, 1.0);
        const pavPillar2 = pavPillar1.clone(); pavPillar2.position.set(3.2, 1.0, -1.0);
        const pavPillar3 = pavPillar1.clone(); pavPillar3.position.set(4.8, 1.0, 1.0);
        const pavPillar4 = pavPillar1.clone(); pavPillar4.position.set(4.8, 1.0, -1.0);
        const pavRoof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.9, 6), this.materials.goldAccent);
        pavRoof.position.set(4.0, 2.4, 0);
        g.add(pavPillar1, pavPillar2, pavPillar3, pavPillar4, pavRoof);
        break;
      }

      case 'island-02': {
        // 人發心理島：心靈圓頂觀測台＋心理花園長椅
        const observatoryBase = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.7, 3.0, 10), this.materials.whiteWall);
        observatoryBase.position.y = 1.5;
        observatoryBase.castShadow = true;
        g.add(observatoryBase);

        // 圓頂
        const dome = new THREE.Mesh(new THREE.SphereGeometry(2.4, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.materials.cyberCyan);
        dome.position.y = 3.0;
        dome.castShadow = true;
        g.add(dome);

        // 望遠鏡鏡筒（象徵洞察心靈內外）
        const telescope = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 2.4, 8), this.materials.metalIron);
        telescope.rotateX(-Math.PI / 4);
        telescope.position.set(0, 3.8, 1.0);
        g.add(telescope);
        break;
      }

      case 'island-03': {
        // 兒家成長島：紅黃藍三色積木童話屋＋沙坑遊樂設施
        const block1 = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 2.6), this.materials.goldAccent);
        block1.position.set(0, 1.1, 0);
        block1.castShadow = true;
        g.add(block1);

        const block2 = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.6, 1.8), this.materials.blueRoof);
        block2.position.set(1.4, 0.8, 1.2);
        block2.castShadow = true;
        g.add(block2);

        const blockRoof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.5, 4), this.materials.redRoof);
        blockRoof.rotateY(Math.PI / 4);
        blockRoof.position.set(0, 2.8, 0);
        g.add(blockRoof);

        // 圓柱積木
        const cylBlock = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.8, 8), this.materials.cyberCyan);
        cylBlock.position.set(-1.6, 0.9, -1.0);
        g.add(cylBlock);
        break;
      }

      case 'island-04': {
        // 外語科技島：幾何未來科技廊柱＋AI全息智慧柱
        for (let i = 0; i < 4; i++) {
          const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.45, 3.5 + i * 0.4, 0.45), this.materials.metalIron);
          pillar.position.set(-1.8 + i * 1.2, (3.5 + i * 0.4) / 2, 0);
          pillar.castShadow = true;
          g.add(pillar);
        }
        // 懸浮幾何晶片環
        const ringGeo = new THREE.TorusGeometry(1.6, 0.18, 8, 16);
        const ringMesh = new THREE.Mesh(ringGeo, this.materials.cyberCyan);
        ringMesh.position.set(0, 3.2, 0);
        ringMesh.rotation.x = Math.PI / 3;
        g.add(ringMesh);

        // AI 智慧光球
        const aiCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), this.materials.windowGlow.clone());
        aiCore.position.set(0, 3.2, 0);
        g.add(aiCore);
        this.nightLights.push({ mesh: aiCore, baseIntensity: 0.8, nightIntensity: 1.5 });
        break;
      }

      case 'island-05': {
        // 傳播故事島：四角格架轉播電視塔＋階梯露天放映場
        const towerGeo = new THREE.CylinderGeometry(0.4, 1.8, 7.5, 4);
        const tvTower = new THREE.Mesh(towerGeo, this.materials.metalIron);
        tvTower.position.y = 3.75;
        tvTower.castShadow = true;
        g.add(tvTower);

        // 衛星天線小碟
        const dish = new THREE.Mesh(new THREE.SphereGeometry(1.0, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2.5), this.materials.whiteWall);
        dish.rotateX(Math.PI / 3);
        dish.position.set(0, 6.8, 0.8);
        g.add(dish);

        // 聚光燈
        const spotlight = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.8, 6), this.materials.goldAccent);
        spotlight.position.set(0, 7.6, 0);
        g.add(spotlight);
        break;
      }

      case 'island-06': {
        // 數位創作島：像素幾何拱門＋XR 虛擬互動立體舞台
        const archL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.8, 0.8), this.materials.cyberCyan);
        archL.position.set(-1.8, 1.9, 0);
        const archR = archL.clone(); archR.position.set(1.8, 1.9, 0);
        const archTop = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.8, 0.8), this.materials.cyberCyan);
        archTop.position.set(0, 3.8, 0);
        g.add(archL, archR, archTop);

        // 立體像素方塊拼貼
        for (let i = 0; i < 6; i++) {
          const pixel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), (i % 2 === 0) ? this.materials.goldAccent : this.materials.blueRoof);
          pixel.position.set((Math.random() - 0.5) * 2.5, 1.0 + Math.random() * 2.0, (Math.random() - 0.5) * 1.5);
          g.add(pixel);
        }
        break;
      }

      case 'island-07': {
        // 東語文化島：和風歇山雙層木造亭＋朱紅木拱橋（附停招提醒告示木牌）
        const pavPillars = [];
        for (let x of [-1.4, 1.4]) {
          for (let z of [-1.4, 1.4]) {
            const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.8, 6), this.materials.japanTorii);
            p.position.set(x, 1.4, z);
            g.add(p);
          }
        }
        // 雙層歇山黑瓦屋頂
        const roof1 = new THREE.Mesh(new THREE.ConeGeometry(2.6, 0.9, 4), this.materials.metalIron);
        roof1.rotateY(Math.PI / 4);
        roof1.position.y = 2.9;
        const roof2 = new THREE.Mesh(new THREE.ConeGeometry(1.8, 0.8, 4), this.materials.metalIron);
        roof2.rotateY(Math.PI / 4);
        roof2.position.y = 3.6;
        g.add(roof1, roof2);

        // 朱紅拱橋
        const bridge = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.2, 0.9), this.materials.japanTorii);
        bridge.position.set(2.4, 0.6, 0);
        bridge.rotation.z = -0.15;
        g.add(bridge);
        break;
      }

      case 'island-08': {
        // 宗教人文島：靜思禪風古樸藏書閣＋清澈水池
        const templeBase = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.4, 3.6), this.materials.woodPlank);
        templeBase.position.y = 1.2;
        templeBase.castShadow = true;
        g.add(templeBase);

        const templeRoof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1.4, 4), this.materials.woodBark);
        templeRoof.rotateY(Math.PI / 4);
        templeRoof.position.y = 3.0;
        g.add(templeRoof);

        // 清澈倒影水池
        const pondGeo = new THREE.CylinderGeometry(1.6, 1.6, 0.2, 10);
        const pond = new THREE.Mesh(pondGeo, this.materials.waterClear);
        pond.position.set(2.8, 0.1, 0.8);
        g.add(pond);
        break;
      }

      case 'island-09': {
        // 教育研究島：古典鐘塔書齋＋講堂長廊
        const hall = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.8, 2.8), this.materials.brickWall);
        hall.position.y = 1.4;
        hall.castShadow = true;
        g.add(hall);

        // 高聳鐘塔
        const bellTower = new THREE.Mesh(new THREE.BoxGeometry(1.6, 5.5, 1.6), this.materials.whiteWall);
        bellTower.position.set(-1.8, 2.75, 0);
        bellTower.castShadow = true;
        g.add(bellTower);

        const bellRoof = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.5, 4), this.materials.blueRoof);
        bellRoof.rotateY(Math.PI / 4);
        bellRoof.position.set(-1.8, 6.2, 0);
        g.add(bellRoof);

        // 鐘塔時鐘圓盤
        const clockDial = new THREE.Mesh(new THREE.CircleGeometry(0.4, 8), this.materials.goldAccent);
        clockDial.position.set(-1.8, 4.8, 0.82);
        g.add(clockDial);
        break;
      }

      case 'island-10': {
        // 師培夢想島：希望學堂教室＋校園實習樹
        const schoolClass = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.4, 3.0), this.materials.whiteWall);
        schoolClass.position.y = 1.2;
        schoolClass.castShadow = true;
        g.add(schoolClass);

        const schoolRoof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.4, 4), this.materials.grassTop);
        schoolRoof.rotateY(Math.PI / 4);
        schoolRoof.position.y = 3.0;
        schoolRoof.castShadow = true;
        g.add(schoolRoof);

        // 巨型希望實習樹
        const bigTree = this.createTree('round', 1.8);
        bigTree.position.set(3.4, 0, 0);
        g.add(bigTree);
        break;
      }
    }

    return g;
  }

  // 8. 建造專屬點綴：風車、熱氣球、瀑布
  createWindmill() {
    const wmGroup = new THREE.Group();
    // 塔身
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 3.8, 8), this.materials.whiteWall);
    tower.position.y = 1.9;
    tower.castShadow = true;
    wmGroup.add(tower);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.0, 8), this.materials.blueRoof);
    roof.position.y = 4.3;
    wmGroup.add(roof);

    // 旋轉葉片
    const bladesGroup = new THREE.Group();
    bladesGroup.position.set(0, 3.8, 0.9);
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.2, 0.04), this.materials.woodPlank);
      blade.position.y = 1.1;
      const arm = new THREE.Group();
      arm.rotation.z = (Math.PI / 2) * i;
      arm.add(blade);
      bladesGroup.add(arm);
    }
    wmGroup.add(bladesGroup);
    this.animatedProps.windmills.push(bladesGroup);

    return wmGroup;
  }

  createHotAirBalloon() {
    const balloonGroup = new THREE.Group();

    // 熱氣球彩色球體
    const balloonSphere = new THREE.Mesh(new THREE.SphereGeometry(2.4, 12, 10), this.materials.goldAccent);
    balloonSphere.position.y = 4.5;
    balloonSphere.scale.set(1.0, 1.25, 1.0);
    balloonGroup.add(balloonSphere);

    // 吊籃
    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), this.materials.woodPlank);
    basket.position.y = 1.2;
    balloonGroup.add(basket);

    // 繩索
    for (let x of [-0.35, 0.35]) {
      for (let z of [-0.35, 0.35]) {
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.0, 4), this.materials.metalIron);
        rope.position.set(x, 2.2, z);
        balloonGroup.add(rope);
      }
    }

    this.animatedProps.balloons.push(balloonGroup);
    return balloonGroup;
  }

  createWaterfall(height = 3.0) {
    const wfGroup = new THREE.Group();
    const waterSheet = new THREE.Mesh(new THREE.PlaneGeometry(1.2, height), this.materials.waterClear);
    waterSheet.position.set(0, height / 2, 0);
    wfGroup.add(waterSheet);

    const splash = new THREE.Mesh(new THREE.CircleGeometry(0.8, 6), this.materials.foamWhite);
    splash.rotateX(-Math.PI / 2);
    splash.position.set(0, 0.05, 0.3);
    wfGroup.add(splash);

    this.animatedProps.waterfalls.push({ sheet: waterSheet, splash: splash });
    return wfGroup;
  }

  // 9. 建造低多邊形動物（松鼠、兔子、蝴蝶、小鹿、小豬、貓咪）
  createAnimal(type) {
    const animalGroup = new THREE.Group();
    animalGroup.userData = { isAnimal: true, animalType: type };

    switch (type) {
      case 'squirrel': {
        // 🐿️ 松鼠
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.35, 4, 6), this.materials.woodPlank);
        body.position.y = 0.3;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), this.materials.woodPlank);
        head.position.set(0, 0.52, 0.1);
        const tail = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.12, 4, 8, Math.PI * 1.2), this.materials.woodBark);
        tail.position.set(0, 0.45, -0.22);
        tail.rotation.x = Math.PI / 2;
        animalGroup.add(body, head, tail);
        break;
      }
      case 'rabbit': {
        // 🐰 兔子
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 6, 6), this.materials.whiteWall);
        body.position.y = 0.26;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), this.materials.whiteWall);
        head.position.set(0, 0.45, 0.15);
        const ear1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.08), this.materials.sakuraPink);
        ear1.position.set(-0.08, 0.7, 0.12);
        const ear2 = ear1.clone(); ear2.position.set(0.08, 0.7, 0.12);
        animalGroup.add(body, head, ear1, ear2);
        break;
      }
      case 'butterfly': {
        // 🦋 蝴蝶
        const wingL = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.2), this.materials.cyberCyan);
        wingL.position.set(-0.14, 0, 0);
        const wingR = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.2), this.materials.cyberCyan);
        wingR.position.set(0.14, 0, 0);
        animalGroup.add(wingL, wingR);
        animalGroup.userData.wingL = wingL;
        animalGroup.userData.wingR = wingR;
        break;
      }
      case 'deer': {
        // 🦌 小鹿
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.8), this.materials.woodBark);
        body.position.y = 0.65;
        const neck = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.2), this.materials.woodBark);
        neck.position.set(0, 0.95, 0.3);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.35), this.materials.woodBark);
        head.position.set(0, 1.15, 0.42);
        // 四肢
        for (let x of [-0.15, 0.15]) {
          for (let z of [-0.25, 0.25]) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 4), this.materials.woodBark);
            leg.position.set(x, 0.25, z);
            animalGroup.add(leg);
          }
        }
        animalGroup.add(body, neck, head);
        break;
      }
      case 'pig': {
        // 🐷 小豬
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.4, 4, 6), this.materials.sakuraPink);
        body.position.y = 0.35;
        body.rotation.x = Math.PI / 2;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 6, 6), this.materials.sakuraPink);
        head.position.set(0, 0.4, 0.32);
        const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 6), this.materials.sakuraPink);
        snout.rotation.x = Math.PI / 2;
        snout.position.set(0, 0.38, 0.55);
        animalGroup.add(body, head, snout);
        break;
      }
      case 'cat': {
        // 🐱 貓咪
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.55), this.materials.goldAccent);
        body.position.y = 0.25;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.24, 0.25), this.materials.goldAccent);
        head.position.set(0, 0.45, 0.3);
        const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 4), this.materials.goldAccent);
        tail.position.set(0, 0.4, -0.32);
        tail.rotation.x = 0.5;
        animalGroup.add(body, head, tail);
        break;
      }
    }

    this.animatedProps.animals.push(animalGroup);
    this.interactiveObjects.push(animalGroup);
    return animalGroup;
  }

  // 10. 建造低多邊形 Q 版居民 NPC（頭、髮型/帽子、身體、手腳擺動）
  createResident(residentData) {
    const npc = new THREE.Group();
    npc.userData = { isResident: true, residentData: residentData };

    // 身體
    const bodyMat = Math.random() > 0.5 ? this.materials.blueRoof : this.materials.brickWall;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.65, 6), bodyMat);
    body.position.y = 0.65;
    body.castShadow = true;
    npc.add(body);

    // 頭部
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 6), this.materials.beachSand);
    head.position.y = 1.15;
    head.castShadow = true;
    npc.add(head);

    // 帽子或頭髮
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.25, 6), this.materials.goldAccent);
    hat.position.y = 1.34;
    npc.add(hat);

    // 手臂與雙腳（用於走路動態與揮手）
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 4), bodyMat);
    armL.position.set(-0.32, 0.68, 0);
    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 4), bodyMat);
    armR.position.set(0.32, 0.68, 0);

    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.35, 4), this.materials.metalIron);
    legL.position.set(-0.12, 0.18, 0);
    const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.35, 4), this.materials.metalIron);
    legR.position.set(0.12, 0.18, 0);

    npc.add(armL, armR, legL, legR);
    npc.userData.parts = { armL, armR, legL, legR, head };

    this.animatedProps.residents.push(npc);
    this.interactiveObjects.push(npc);
    return npc;
  }

  // 11. 建造送貨員（扛著木箱走橋樑）
  createDeliveryWorker(id) {
    const worker = this.createResident({ id: `worker-${id}`, name: `送貨員小飛 ${id}`, role: '跨島送貨員' });
    worker.userData.isDeliveryWorker = true;
    worker.userData.hasCargo = true;

    // 扛著的大木箱
    const cargo = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 0.48), this.materials.woodPlank);
    cargo.position.set(0, 1.25, -0.3);
    worker.add(cargo);
    worker.userData.cargoMesh = cargo;

    this.animatedProps.deliveryWorkers.push(worker);
    return worker;
  }

  // 12. 建造低多邊形雲朵
  createCloud() {
    const cloud = new THREE.Group();
    const puffCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < puffCount; i++) {
      const radius = 1.2 + Math.random() * 1.0;
      const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 1), this.materials.whiteWall);
      puff.position.set((i - puffCount / 2) * 1.5, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.8);
      cloud.add(puff);
    }
    this.animatedProps.clouds.push(cloud);
    return cloud;
  }

  // 13. 建造飛行鳥群（V 字形小鳥）
  createBirdFlock(birdCount = 5) {
    const flock = new THREE.Group();
    flock.userData.birds = [];

    for (let i = 0; i < birdCount; i++) {
      const bird = new THREE.Group();
      // 鳥身體
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 4), this.materials.whiteWall);
      body.rotateX(Math.PI / 2);
      // 左右翅膀
      const wingL = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), this.materials.whiteWall);
      wingL.position.set(-0.16, 0, 0);
      const wingR = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), this.materials.whiteWall);
      wingR.position.set(0.16, 0, 0);
      bird.add(body, wingL, wingR);

      // V 字排列
      const row = Math.floor((i + 1) / 2);
      const sign = (i % 2 === 0) ? 1 : -1;
      bird.position.set(sign * row * 1.0, 0, -row * 1.2);

      flock.add(bird);
      flock.userData.birds.push({ group: bird, wingL, wingR });
    }

    this.animatedProps.birds.push(flock);
    return flock;
  }

  // 14. 建造外海巡航帆船
  createBoat() {
    const boat = new THREE.Group();

    // 船身
    const hullGeo = new THREE.BoxGeometry(1.6, 0.8, 4.0);
    const hull = new THREE.Mesh(hullGeo, this.materials.woodBark);
    hull.position.y = 0.2;
    boat.add(hull);

    // 桅杆與白色船帆
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6), this.materials.woodBark);
    mast.position.set(0, 1.8, 0.2);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), this.materials.whiteWall);
    sail.position.set(0, 2.2, 0.3);
    sail.rotation.y = Math.PI / 6;
    boat.add(mast, sail);

    this.animatedProps.boats.push(boat);
    return boat;
  }

  // 15. 建造可拾取的沙灘貝殼
  createShell(position, islandId) {
    const shellMesh = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.24, 6), this.materials.shellGold);
    shellMesh.position.copy(position);
    shellMesh.position.y += 0.12;
    shellMesh.rotation.x = Math.PI / 3;
    shellMesh.userData = { isShell: true, islandId: islandId, active: true };
    this.interactiveObjects.push(shellMesh);
    return shellMesh;
  }
}
