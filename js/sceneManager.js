// ============================================================
// SceneManager: Three.js 核心場景、相機運鏡、日夜燈光與動態循環
// ============================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';

export class SceneManager {
  constructor(container, worldGen, dataManager) {
    this.container = container;
    this.worldGen = worldGen;
    this.dataManager = dataManager;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // 燈光與天體
    this.dirLight = null;
    this.hemiLight = null;
    this.skyDome = null;
    this.seaMesh = null;
    this.stars = null;
    this.fireflies = null;

    // 島嶼節點對照表
    this.islandNodes = new Map(); // id -> { group, center, topY, radius, data }

    // 運鏡與補間狀態
    this.isCinemaActive = false;
    this.cinemaStartTime = 0;
    this.cinemaDuration = 4500; // 開場 4.5 秒
    this.flyAnimation = null; // 點島飛近補間物件

    // 日夜光線數值
    this.currentLightTime = 'day'; // day, dusk, night
    this.targetLightProps = null;
    this.autoTimeFlow = false;
    this.timeFlowProgress = 0.2; // 0~1 一天

    // 效能與節流
    this.clock = new THREE.Clock();
    this.lastFrameTime = 0;
    this.lowQuality = this.dataManager.lowQuality;
    this.reducedMotion = this.dataManager.reducedMotion;

    // 回調通知 UI
    this.onCinemaFinished = null;
    this.onIslandFocusFinished = null;
    this.onObjectClicked = null;
  }

  init() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    // 1. 建立 Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xeef3e6, 0.0035);

    // 2. 建立 Camera
    this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 2000);
    this.camera.position.set(0, 85, 125);

    // 3. 建立 Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.lowQuality, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.lowQuality;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    // 4. 建立 OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2.08; // 不讓相機鑽入水底
    this.controls.minDistance = 20;
    this.controls.maxDistance = 260;
    this.controls.target.set(0, 2, 0);

    // 5. 建立燈光
    this.setupLighting();

    // 6. 建立天空穹頂與海面
    this.setupSkyAndSea();

    // 7. 建立遠景遠山輪廓
    this.setupDistantMountains();

    // 8. 建立群島與內容
    this.buildArchipelago();

    // 9. 事件監聽
    window.addEventListener('resize', () => this.onWindowResize());
    this.container.addEventListener('pointerdown', (e) => this.onPointerDown(e));

    // 10. 開始主動畫循環
    this.animate();
  }

  setupLighting() {
    // 半球光（天空光與地面反射）
    this.hemiLight = new THREE.HemisphereLight(0xfff8ee, 0x556b4d, 0.7);
    this.scene.add(this.hemiLight);

    // 平行太陽光
    this.dirLight = new THREE.DirectionalLight(0xfffaed, 1.3);
    this.dirLight.position.set(80, 120, 60);
    this.dirLight.castShadow = !this.lowQuality;
    this.dirLight.shadow.mapSize.width = this.lowQuality ? 1024 : 2048;
    this.dirLight.shadow.mapSize.height = this.lowQuality ? 1024 : 2048;
    this.dirLight.shadow.camera.near = 10;
    this.dirLight.shadow.camera.far = 350;
    const d = 110;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.0005;
    this.scene.add(this.dirLight);
  }

  setupSkyAndSea() {
    // 天空穹頂
    const skyGeo = new THREE.SphereGeometry(650, 24, 16);
    skyGeo.scale(-1, 1, 1);
    const skyMat = new THREE.MeshBasicMaterial({ color: 0xeef3e6, side: THREE.BackSide });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyDome);

    // 星星粒子（夜間顯現）
    const starsGeo = new THREE.BufferGeometry();
    const starCount = 450;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 580;
      starPositions[i] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i + 1] = Math.abs(r * Math.cos(phi)) + 30; // 都在地平線上方
      starPositions[i + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, transparent: true, opacity: 0 });
    this.stars = new THREE.Points(starsGeo, starsMat);
    this.scene.add(this.stars);

    // 低多邊形起伏海面
    const seaGeo = new THREE.PlaneGeometry(800, 800, 48, 48);
    seaGeo.rotateX(-Math.PI / 2);
    this.seaMesh = new THREE.Mesh(seaGeo, new THREE.MeshLambertMaterial({ color: 0x4aa3b8, flatShading: true, transparent: true, opacity: 0.88 }));
    this.seaMesh.position.y = 0;
    this.seaMesh.receiveShadow = true;
    this.scene.add(this.seaMesh);

    // 儲存原始頂點 Y 座標供波動計算
    const pos = seaGeo.attributes.position;
    this.seaOriginalY = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      this.seaOriginalY[i] = pos.getY(i);
    }

    // 螢火蟲粒子（夜間在島上漫舞）
    const ffGeo = new THREE.BufferGeometry();
    const ffCount = 60;
    const ffPos = new Float32Array(ffCount * 3);
    for (let i = 0; i < ffCount * 3; i += 3) {
      ffPos[i] = (Math.random() - 0.5) * 160;
      ffPos[i + 1] = 1.0 + Math.random() * 8.0;
      ffPos[i + 2] = (Math.random() - 0.5) * 160;
    }
    ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
    const ffMat = new THREE.PointsMaterial({ color: 0xffdf55, size: 3.5, transparent: true, opacity: 0 });
    this.fireflies = new THREE.Points(ffGeo, ffMat);
    this.scene.add(this.fireflies);
  }

  setupDistantMountains() {
    // 外海一圈遠山剪影（低多邊形微縮山峰群）
    const mountGroup = new THREE.Group();
    const mountCount = 18;
    for (let i = 0; i < mountCount; i++) {
      const angle = (i / mountCount) * Math.PI * 2;
      const dist = 320 + Math.sin(i * 3) * 30;
      const height = 40 + Math.random() * 35;
      const coneGeo = new THREE.ConeGeometry(35 + Math.random() * 20, height, 5);
      const coneMat = new THREE.MeshLambertMaterial({ color: 0x4d664c, flatShading: true });
      const mount = new THREE.Mesh(coneGeo, coneMat);
      mount.position.set(Math.cos(angle) * dist, height / 2 - 5, Math.sin(angle) * dist);
      mountGroup.add(mount);
    }
    this.scene.add(mountGroup);
  }

  buildArchipelago() {
    const islandsData = this.dataManager.content.islands;
    const centerData = this.dataManager.content.centerIsland;

    // 1. 中央島：慈大人文迎新港 (最大島，半徑 21)
    const centerTerrace = this.worldGen.createTerraceIsland(21, 5.0, 3);
    centerTerrace.group.position.set(0, 0, 0);
    this.scene.add(centerTerrace.group);

    // 放置中央地標（大燈塔與接待大廳）
    const centerLandmark = this.worldGen.createLandmark('island-center');
    centerLandmark.position.set(-2, centerTerrace.topY, 0);
    centerTerrace.group.add(centerLandmark);

    // 中央港石板路、路燈、樹木、市集風車與熱氣球
    const centerPath = this.worldGen.createPath([
      { x: 0, y: centerTerrace.topY, z: 0 },
      { x: 3, y: centerTerrace.topY, z: 4 },
      { x: 6, y: centerTerrace.topY, z: 7 },
      { x: -4, y: centerTerrace.topY, z: -3 }
    ]);
    centerTerrace.group.add(centerPath);

    const centerTree1 = this.worldGen.createTree('sakura', 1.3);
    centerTree1.position.set(-9, centerTerrace.topY, 6);
    const centerTree2 = this.worldGen.createTree('round', 1.2);
    centerTree2.position.set(8, centerTerrace.topY, -7);
    centerTerrace.group.add(centerTree1, centerTree2);

    const centerLamp1 = this.worldGen.createStreetLamp();
    centerLamp1.position.set(4, centerTerrace.topY, 3);
    centerTerrace.group.add(centerLamp1);

    // 🌬️ 港口風車
    const harborWindmill = this.worldGen.createWindmill();
    harborWindmill.position.set(11, centerTerrace.topY, 5);
    centerTerrace.group.add(harborWindmill);

    // 🎈 漂浮熱氣球
    const balloon = this.worldGen.createHotAirBalloon();
    balloon.position.set(-18, centerTerrace.topY + 14, -10);
    centerTerrace.group.add(balloon);

    // 放置中央商人（杜杜）
    const merchant = this.worldGen.createResident(this.dataManager.getResidentById('res-center-01'));
    merchant.position.set(3, centerTerrace.topY, 5);
    centerTerrace.group.add(merchant);

    // 沙灘貝殼
    const centerShell = this.worldGen.createShell(new THREE.Vector3(14, 0.4, -8), 'island-center');
    centerTerrace.group.add(centerShell);

    // 記錄中央島節點
    this.islandNodes.set('island-center', {
      id: 'island-center',
      name: centerData.name,
      group: centerTerrace.group,
      center: new THREE.Vector3(0, 0, 0),
      topY: centerTerrace.topY,
      radius: 21,
      data: centerData,
      foam: centerTerrace.foam
    });

    // 2. 環繞分佈的 10 座展區島
    // 角度均勻分佈在橢圓軌道上，高低微幅錯落
    const islandPositions = [
      { id: 'island-01', x: -58, z: -25, r: 11, h: 4.2 }, // 社工
      { id: 'island-02', x: -38, z: -58, r: 11, h: 4.0 }, // 人發心理
      { id: 'island-03', x: 0,   z: -72, r: 11, h: 4.4 }, // 兒家
      { id: 'island-04', x: 38,  z: -58, r: 11, h: 4.0 }, // 外語科技
      { id: 'island-05', x: 62,  z: -25, r: 11, h: 4.2 }, // 傳播
      { id: 'island-06', x: 60,  z: 28,  r: 11, h: 4.1 }, // 數位創作
      { id: 'island-07', x: 38,  z: 60,  r: 11, h: 4.3 }, // 東語
      { id: 'island-08', x: 0,   z: 72,  r: 11, h: 4.5 }, // 宗教人文
      { id: 'island-09', x: -38, z: 60,  r: 11, h: 4.0 }, // 教育研究
      { id: 'island-10', x: -60, z: 28,  r: 11, h: 4.2 }  // 師培
    ];

    islandsData.forEach((islData, idx) => {
      const cfg = islandPositions[idx];
      const terrace = this.worldGen.createTerraceIsland(cfg.r, cfg.h, 3);
      terrace.group.position.set(cfg.x, 0, cfg.z);
      this.scene.add(terrace.group);

      // 地標建築
      const landmark = this.worldGen.createLandmark(islData.id);
      landmark.position.set(0, terrace.topY, 0);
      landmark.userData = { isLandmark: true, islandId: islData.id };
      terrace.group.add(landmark);
      this.worldGen.interactiveObjects.push(landmark);

      // 小房子（窗戶發光）
      const house = this.worldGen.createHouse(idx % 2 === 0 ? 'red' : 'blue', 2.0, 1.6, 1.8);
      house.position.set(-3.5, terrace.topY, 2.8);
      house.rotation.y = Math.PI / 4;
      terrace.group.add(house);

      // 樹木（櫻花樹＋圓葉樹＋松樹）
      const t1 = this.worldGen.createTree('sakura', 1.0);
      t1.position.set(4.0, terrace.topY, -3.2);
      const t2 = this.worldGen.createTree(idx % 2 === 0 ? 'round' : 'pine', 0.9);
      t2.position.set(-4.5, terrace.topY, -3.0);
      const t3 = this.worldGen.createTree('round', 0.85);
      t3.position.set(3.5, terrace.topY, 3.5);
      terrace.group.add(t1, t2, t3);

      // 石板小徑與道具（圍籬、花圃、路燈、木箱、長椅、水井）
      const path = this.worldGen.createPath([
        { x: 0, y: terrace.topY, z: 0 },
        { x: -2, y: terrace.topY, z: 1.5 },
        { x: -3, y: terrace.topY, z: 2.5 }
      ]);
      terrace.group.add(path);

      const lamp = this.worldGen.createStreetLamp();
      lamp.position.set(1.8, terrace.topY, 1.8);
      terrace.group.add(lamp);

      const crate = this.worldGen.createProp('crate');
      crate.position.set(-2.2, terrace.topY, 3.4);
      const bench = this.worldGen.createProp('bench');
      bench.position.set(2.8, terrace.topY, -1.8);
      bench.rotation.y = -Math.PI / 3;
      const flowers = this.worldGen.createProp('flowers');
      flowers.position.set(-1.2, terrace.topY, -3.5);
      terrace.group.add(crate, bench, flowers);

      // 特殊點綴（兒家島與宗教島加瀑布）
      if (islData.id === 'island-03' || islData.id === 'island-08') {
        const wf = this.worldGen.createWaterfall(cfg.h * 0.9);
        wf.position.set(0, 0.2, cfg.r * 0.88);
        terrace.group.add(wf);
      }

      // 放置動物（松鼠、兔子、蝴蝶、小鹿、小豬、貓咪）
      const animalMap = {
        'island-01': 'squirrel',
        'island-02': 'rabbit',
        'island-03': 'pig',
        'island-04': 'butterfly',
        'island-05': 'cat',
        'island-06': 'butterfly',
        'island-07': 'rabbit',
        'island-08': 'deer',
        'island-09': 'deer',
        'island-10': 'squirrel'
      };
      const animalType = animalMap[islData.id];
      if (animalType) {
        const animal = this.worldGen.createAnimal(animalType);
        animal.position.set(2.5, terrace.topY, 1.5);
        animal.userData.islandId = islData.id;
        terrace.group.add(animal);
      }

      // 放置島民學長姊（每島 2 位）
      const residents = this.dataManager.getResidentsForIsland(islData.id);
      if (residents.length > 0) {
        const r1 = this.worldGen.createResident(residents[0]);
        r1.position.set(-1.5, terrace.topY, -1.5);
        terrace.group.add(r1);

        if (residents.length > 1) {
          const r2 = this.worldGen.createResident(residents[1]);
          r2.position.set(1.5, terrace.topY, -2.5);
          terrace.group.add(r2);
        }
      }

      // 沙灘貝殼拾取物
      const shellPos = new THREE.Vector3(cfg.r * 0.85, 0.35, cfg.r * 0.3);
      const shell = this.worldGen.createShell(shellPos, islData.id);
      terrace.group.add(shell);

      // 連接中央島的木橋
      this.buildConnectingBridge(new THREE.Vector3(0, centerTerrace.topY * 0.6, 0), new THREE.Vector3(cfg.x, cfg.h * 0.6, cfg.z), cfg.r);

      // 儲存節點資訊
      this.islandNodes.set(islData.id, {
        id: islData.id,
        name: islData.name,
        group: terrace.group,
        center: new THREE.Vector3(cfg.x, 0, cfg.z),
        topY: terrace.topY,
        radius: cfg.r,
        data: islData,
        foam: terrace.foam
      });
    });

    // 3. 建立 5 位送貨員（扛木箱穿梭中央港與各島橋樑）
    for (let i = 0; i < 5; i++) {
      const worker = this.worldGen.createDeliveryWorker(i + 1);
      worker.position.set((Math.random() - 0.5) * 8, centerTerrace.topY, (Math.random() - 0.5) * 8);
      centerTerrace.group.add(worker);
    }

    // 4. 建立高空飄浮白雲（8~12 朵）
    for (let i = 0; i < 10; i++) {
      const cloud = this.worldGen.createCloud();
      const dist = 100 + Math.random() * 50;
      const angle = (i / 10) * Math.PI * 2;
      cloud.position.set(Math.cos(angle) * dist, 36 + Math.random() * 12, Math.sin(angle) * dist);
      cloud.userData.orbitDist = dist;
      cloud.userData.orbitAngle = angle;
      cloud.userData.orbitSpeed = 0.015 + Math.random() * 0.01;
      this.scene.add(cloud);
    }

    // 5. 建立飛鳥群（2 群 V 字隊形）
    const flock1 = this.worldGen.createBirdFlock(5);
    flock1.position.set(0, 32, 0);
    flock1.userData.angle = 0;
    flock1.userData.radius = 75;
    this.scene.add(flock1);

    const flock2 = this.worldGen.createBirdFlock(5);
    flock2.position.set(0, 38, 0);
    flock2.userData.angle = Math.PI;
    flock2.userData.radius = 95;
    this.scene.add(flock2);

    // 6. 建立外海巡航帆船
    const boat1 = this.worldGen.createBoat();
    boat1.userData.angle = 0.5;
    boat1.userData.radius = 115;
    this.scene.add(boat1);

    const boat2 = this.worldGen.createBoat();
    boat2.userData.angle = 3.6;
    boat2.userData.radius = 135;
    this.scene.add(boat2);
  }

  buildConnectingBridge(start, end, targetRadius) {
    // 簡易低多邊形木橋樑（連接中央與外島）
    const dir = new THREE.Vector3().subVectors(end, start);
    const totalDist = dir.length();
    dir.normalize();

    // 橋面長度留出中央島與外島岸邊距離
    const bridgeStart = start.clone().add(dir.clone().multiplyScalar(22));
    const bridgeEnd = end.clone().sub(dir.clone().multiplyScalar(targetRadius + 1));
    const bridgeVec = new THREE.Vector3().subVectors(bridgeEnd, bridgeStart);
    const bridgeLen = bridgeVec.length();

    if (bridgeLen <= 2) return;

    const bridgeGeo = new THREE.BoxGeometry(1.6, 0.25, bridgeLen);
    const bridgeMesh = new THREE.Mesh(bridgeGeo, this.worldGen.materials.woodPlank);
    const midPoint = new THREE.Vector3().addVectors(bridgeStart, bridgeEnd).multiplyScalar(0.5);
    bridgeMesh.position.copy(midPoint);
    bridgeMesh.position.y = 0.45; // 浮在海面微高
    bridgeMesh.lookAt(bridgeEnd);
    bridgeMesh.receiveShadow = true;
    this.scene.add(bridgeMesh);
  }

  // 電影史詩開場運鏡
  startCinemaIntro() {
    if (this.reducedMotion) {
      // 減少動態時直接切換至預設俯瞰全景
      this.camera.position.set(0, 85, 125);
      this.controls.target.set(0, 2, 0);
      if (this.onCinemaFinished) this.onCinemaFinished();
      return;
    }

    this.isCinemaActive = true;
    this.cinemaStartTime = performance.now();
    this.controls.enabled = false;
  }

  skipCinemaIntro() {
    if (!this.isCinemaActive) return;
    this.isCinemaActive = false;
    this.controls.enabled = true;
    this.camera.position.set(0, 85, 125);
    this.controls.target.set(0, 2, 0);
    this.controls.update();
    if (this.onCinemaFinished) this.onCinemaFinished();
  }

  // 平滑飛近指定島嶼（點島運鏡 1.8 秒）
  flyToIsland(islandId) {
    const node = this.islandNodes.get(islandId);
    if (!node) return;

    if (this.reducedMotion) {
      // 減少動態直接瞬移
      const targetPos = node.center.clone().add(new THREE.Vector3(0, 14, 24));
      this.camera.position.copy(targetPos);
      this.controls.target.copy(node.center).add(new THREE.Vector3(0, 3, 0));
      this.controls.update();
      if (this.onIslandFocusFinished) this.onIslandFocusFinished(islandId);
      return;
    }

    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    // 目標視角：推近到島嶼正上方前傾約 35 度
    const targetPos = node.center.clone().add(new THREE.Vector3(0, 16, 26));
    const targetLookAt = node.center.clone().add(new THREE.Vector3(0, 3, 0));

    this.flyAnimation = {
      startTime: performance.now(),
      duration: 1800,
      startPos,
      targetPos,
      startTarget,
      targetLookAt,
      islandId
    };
    this.controls.enabled = false;
  }

  // 回到群島全景視角
  resetToOverview() {
    if (this.reducedMotion) {
      this.camera.position.set(0, 85, 125);
      this.controls.target.set(0, 2, 0);
      this.controls.update();
      return;
    }

    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    const targetPos = new THREE.Vector3(0, 85, 125);
    const targetLookAt = new THREE.Vector3(0, 2, 0);

    this.flyAnimation = {
      startTime: performance.now(),
      duration: 1500,
      startPos,
      targetPos,
      startTarget,
      targetLookAt,
      islandId: null
    };
    this.controls.enabled = false;
  }

  // 設定日夜時段光線（白天、黃昏、夜晚）
  setTimeMode(mode) {
    this.currentLightTime = mode;

    let skyColor, fogColor, dirColor, hemiSky, hemiGround, dirIntensity, isNight;

    if (mode === 'day') {
      skyColor = 0xeef3e6;
      fogColor = 0xeef3e6;
      dirColor = 0xfffaed;
      hemiSky = 0xfff8ee;
      hemiGround = 0x556b4d;
      dirIntensity = 1.35;
      isNight = false;
    } else if (mode === 'dusk') {
      skyColor = 0xdfceb4;
      fogColor = 0xd5be9f;
      dirColor = 0xf5a84e;
      hemiSky = 0xfcdcb8;
      hemiGround = 0x5a483a;
      dirIntensity = 1.15;
      isNight = false;
    } else {
      // night
      skyColor = 0x142018;
      fogColor = 0x18241d;
      dirColor = 0x6e8fa8; // 冷月光
      hemiSky = 0x22362b;
      hemiGround = 0x111c14;
      dirIntensity = 0.45;
      isNight = true;
    }

    // 平滑調整天體與環境
    this.skyDome.material.color.setHex(skyColor);
    this.scene.fog.color.setHex(fogColor);
    this.dirLight.color.setHex(dirColor);
    this.dirLight.intensity = dirIntensity;
    this.hemiLight.color.setHex(hemiSky);
    this.hemiLight.groundColor.setHex(hemiGround);

    // 星星與夜燈
    if (this.stars) this.stars.material.opacity = isNight ? 0.9 : 0;
    if (this.fireflies) this.fireflies.material.opacity = isNight ? 0.85 : 0;

    // 路燈與窗戶亮起
    this.worldGen.nightLights.forEach(item => {
      if (item.mesh && item.mesh.material) {
        item.mesh.material.color.setHex(isNight ? 0xffdf66 : 0x777777);
      }
    });

    // 夜晚飛鳥淡出
    this.worldGen.animatedProps.birds.forEach(flock => {
      flock.visible = !isNight;
    });
  }

  // 取得島嶼在螢幕上的 2D 像素座標（供 HTML 浮動標籤跟隨）
  getIslandScreenPosition(islandId) {
    const node = this.islandNodes.get(islandId);
    if (!node) return null;

    const pos = node.center.clone();
    pos.y = node.topY + 3.2; // 浮在島頂地標上方

    pos.project(this.camera);

    // 若在相機背後則隱藏
    if (pos.z > 1) return null;

    const widthHalf = (this.container.clientWidth || window.innerWidth) / 2;
    const heightHalf = (this.container.clientHeight || window.innerHeight) / 2;

    return {
      x: (pos.x * widthHalf) + widthHalf,
      y: -(pos.y * heightHalf) + heightHalf
    };
  }

  // 射線檢測點擊物件
  onPointerDown(event) {
    if (this.isCinemaActive) return; // 運鏡期間不點擊

    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.worldGen.interactiveObjects, true);

    if (intersects.length > 0) {
      let hitObj = intersects[0].object;
      // 往上尋找帶有 userData 的主節點
      while (hitObj && !hitObj.userData.isResident && !hitObj.userData.isAnimal && !hitObj.userData.isLandmark && !hitObj.userData.isShell && hitObj.parent) {
        hitObj = hitObj.parent;
      }

      if (hitObj && hitObj.userData) {
        if (this.onObjectClicked) {
          const screenPos = { x: event.clientX, y: event.clientY };
          this.onObjectClicked(hitObj.userData, screenPos, hitObj);
        }
      }
    }
  }

  onWindowResize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  // 主更新循環
  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = this.clock.getDelta();
    const elapsedTime = this.clock.getElapsedTime();

    // 1. 電影史詩開場動畫
    if (this.isCinemaActive) {
      const now = performance.now();
      const progress = Math.min((now - this.cinemaStartTime) / this.cinemaDuration, 1.0);
      const ease = t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const t = ease(progress);

      // 高空穿雲 -> 俯衝海面 -> 拉遠至全景
      const camX = Math.cos(t * Math.PI) * (180 - t * 70);
      const camY = 120 - Math.sin(t * Math.PI) * 70 + (1 - t) * 25;
      const camZ = Math.sin(t * Math.PI) * (180 - t * 70) + (1 - t) * 60;

      this.camera.position.set(camX, Math.max(camY, 20), camZ);
      this.camera.lookAt(0, 4, 0);

      if (progress >= 1.0) {
        this.isCinemaActive = false;
        this.controls.enabled = true;
        this.camera.position.set(0, 85, 125);
        this.controls.target.set(0, 2, 0);
        this.controls.update();
        if (this.onCinemaFinished) this.onCinemaFinished();
      }
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // 2. 點島或回全景飛行動畫
    if (this.flyAnimation) {
      const now = performance.now();
      const progress = Math.min((now - this.flyAnimation.startTime) / this.flyAnimation.duration, 1.0);
      const ease = t => 1 - Math.pow(1 - t, 3); // easeOutCubic
      const t = ease(progress);

      this.camera.position.lerpVectors(this.flyAnimation.startPos, this.flyAnimation.targetPos, t);
      this.controls.target.lerpVectors(this.flyAnimation.startTarget, this.flyAnimation.targetLookAt, t);
      this.controls.update();

      if (progress >= 1.0) {
        const id = this.flyAnimation.islandId;
        this.flyAnimation = null;
        this.controls.enabled = true;
        if (id && this.onIslandFocusFinished) {
          this.onIslandFocusFinished(id);
        }
      }
    } else {
      this.controls.update();
    }

    // 3. 環境動態（減少動態開啟時暫停微幅擺動）
    if (!this.reducedMotion) {
      // 海浪頂點起伏
      if (this.seaMesh && this.seaOriginalY) {
        const pos = this.seaMesh.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const u = pos.getX(i);
          const v = pos.getZ(i);
          const wave = Math.sin(u * 0.05 + elapsedTime * 1.5) * Math.cos(v * 0.05 + elapsedTime * 1.2) * 0.45;
          pos.setY(i, this.seaOriginalY[i] + wave);
        }
        pos.needsUpdate = true;
      }

      // 風車葉片旋轉
      this.worldGen.animatedProps.windmills.forEach(blades => {
        blades.rotation.z += delta * 1.8;
      });

      // 熱氣球緩慢微動
      this.worldGen.animatedProps.balloons.forEach(balloon => {
        balloon.position.y += Math.sin(elapsedTime * 1.2) * 0.02;
        balloon.rotation.y += delta * 0.1;
      });

      // 雲朵環繞漂移
      this.worldGen.animatedProps.clouds.forEach(cloud => {
        cloud.userData.orbitAngle += delta * cloud.userData.orbitSpeed;
        const dist = cloud.userData.orbitDist;
        cloud.position.x = Math.cos(cloud.userData.orbitAngle) * dist;
        cloud.position.z = Math.sin(cloud.userData.orbitAngle) * dist;
      });

      // 鳥群飛行與拍翅
      this.worldGen.animatedProps.birds.forEach(flock => {
        flock.userData.angle += delta * 0.45;
        const r = flock.userData.radius;
        flock.position.x = Math.cos(flock.userData.angle) * r;
        flock.position.z = Math.sin(flock.userData.angle) * r;
        flock.rotation.y = -flock.userData.angle + Math.PI / 2;

        flock.userData.birds.forEach(b => {
          const flap = Math.sin(elapsedTime * 12) * 0.45;
          b.wingL.rotation.z = flap;
          b.wingR.rotation.z = -flap;
        });
      });

      // 帆船航行與浪中搖擺
      this.worldGen.animatedProps.boats.forEach(boat => {
        boat.userData.angle += delta * 0.08;
        const r = boat.userData.radius;
        boat.position.x = Math.cos(boat.userData.angle) * r;
        boat.position.z = Math.sin(boat.userData.angle) * r;
        boat.rotation.y = -boat.userData.angle + Math.PI / 2;
        boat.rotation.z = Math.sin(elapsedTime * 2) * 0.08; // 隨浪搖晃
      });

      // NPC 與送貨員手腳擺動
      this.worldGen.animatedProps.residents.forEach((npc, i) => {
        if (npc.userData.parts) {
          const walkCycle = Math.sin(elapsedTime * 4 + i) * 0.35;
          npc.userData.parts.armL.rotation.x = walkCycle;
          npc.userData.parts.armR.rotation.x = -walkCycle;
          npc.userData.parts.legL.rotation.x = -walkCycle;
          npc.userData.parts.legR.rotation.x = walkCycle;
        }
      });

      // 動物動作（兔子跳、蝴蝶飛、松鼠晃）
      this.worldGen.animatedProps.animals.forEach((animal, i) => {
        const type = animal.userData.animalType;
        if (type === 'rabbit') {
          animal.position.y = 0.2 + Math.abs(Math.sin(elapsedTime * 4 + i)) * 0.4;
        } else if (type === 'butterfly') {
          animal.position.y = 1.6 + Math.sin(elapsedTime * 3 + i) * 0.3;
          if (animal.userData.wingL && animal.userData.wingR) {
            const wingFlap = Math.sin(elapsedTime * 18) * 0.6;
            animal.userData.wingL.rotation.y = wingFlap;
            animal.userData.wingR.rotation.y = -wingFlap;
          }
        } else if (type === 'squirrel') {
          animal.rotation.y = Math.sin(elapsedTime * 2 + i) * 0.5;
        }
      });
    }

    // 4. 自動時間流動循環
    if (this.autoTimeFlow) {
      this.timeFlowProgress = (this.timeFlowProgress + delta * 0.008) % 1.0;
      let calculatedMode = 'day';
      if (this.timeFlowProgress > 0.4 && this.timeFlowProgress < 0.6) {
        calculatedMode = 'dusk';
      } else if (this.timeFlowProgress >= 0.6 && this.timeFlowProgress < 0.95) {
        calculatedMode = 'night';
      }
      if (calculatedMode !== this.currentLightTime) {
        this.setTimeMode(calculatedMode);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}
