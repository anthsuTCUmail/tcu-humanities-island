// ============================================================
// UIManager: 網頁介面互動、3D Overlay 標籤、對話泡泡、Modal 與無障礙
// ============================================================

import * as THREE from 'three';

export class UIManager {
  constructor(dataManager, sceneManager) {
    this.dm = dataManager;
    this.sm = sceneManager;

    this.markersContainer = document.getElementById('markers-container');
    this.bubbleContainer = document.getElementById('speech-bubble-container');
    this.panel = document.getElementById('island-panel');

    // 狀態追蹤
    this.activeIslandId = null;
    this.activeBubble = null;
    this.markers = []; // { id, elem }
    this.clockTimer = null;
    this.currentTheme = this.dm.theme;
    this.currentTimeMode = this.dm.timeMode;

    // 貝殼重生定時器
    this.respawningShells = new Map();
  }

  init() {
    this.bindGlobalEvents();
    this.bindControlDockEvents();
    this.bindHeaderTools();
    this.bindActionButtons();
    this.buildMarkers();
    this.updateTheme(this.currentTheme);
    this.updateTimeMode(this.currentTimeMode);
    this.renderStampsModal();
    this.renderBackpackModal();
    this.renderIslandListModal();
    this.renderAccessibleView();
    this.startLiveClock();

    // SceneManager 事件串接
    this.sm.onCinemaFinished = () => {
      const cinemaOverlay = document.getElementById('cinema-overlay');
      if (cinemaOverlay) {
        cinemaOverlay.classList.add('fade-out');
        setTimeout(() => cinemaOverlay.remove(), 800);
      }
    };

    this.sm.onIslandFocusFinished = (islandId) => {
      this.openIslandPanel(islandId);
    };

    this.sm.onObjectClicked = (userData, screenPos, object3D) => {
      this.handle3DObjectClick(userData, screenPos, object3D);
    };

    // 每幀更新浮動標籤與對話泡泡位置
    this.updateOverlaysLoop();
  }

  // 1. 建立各島 HTML 3D 浮動標籤
  buildMarkers() {
    this.markersContainer.innerHTML = '';
    this.markers = [];

    const islands = this.dm.content.islands;
    const center = this.dm.content.centerIsland;

    const allList = [{ id: 'island-center', name: center.name, order: 0, group: '活動服務台' }, ...islands];

    allList.forEach(item => {
      const marker = document.createElement('div');
      marker.className = 'island-marker';
      marker.setAttribute('data-id', item.id);
      marker.setAttribute('role', 'button');
      marker.setAttribute('tabindex', '0');
      marker.setAttribute('aria-label', `前往 ${item.name}`);

      const isCenter = item.id === 'island-center';
      const numLabel = isCenter ? '★' : `${item.order}`;

      marker.innerHTML = `
        <div class="marker-card">
          <span class="marker-num">${numLabel}</span>
          <span class="marker-title">${item.name}</span>
        </div>
        <div class="marker-pointer"></div>
      `;

      marker.addEventListener('click', () => {
        this.closeSpeechBubble();
        this.sm.flyToIsland(item.id);
      });

      marker.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.sm.flyToIsland(item.id);
        }
      });

      this.markersContainer.appendChild(marker);
      this.markers.push({ id: item.id, elem: marker });
    });
  }

  // 浮動標籤與泡泡位置每幀投影跟隨
  updateOverlaysLoop() {
    requestAnimationFrame(() => this.updateOverlaysLoop());

    // 更新各島標籤位置
    this.markers.forEach(m => {
      const screenPos = this.sm.getIslandScreenPosition(m.id);
      if (screenPos) {
        m.elem.style.display = 'flex';
        m.elem.style.left = `${screenPos.x}px`;
        m.elem.style.top = `${screenPos.y}px`;

        // 若已集過章標註 visited
        if (this.dm.stamps.has(m.id)) {
          m.elem.classList.add('visited');
        }
      } else {
        m.elem.style.display = 'none';
      }
    });

    // 更新對話泡泡位置
    if (this.activeBubble && this.activeBubble.object3D) {
      const worldPos = new THREE.Vector3();
      this.activeBubble.object3D.getWorldPosition(worldPos);
      worldPos.y += 1.8; // 浮在頭頂

      worldPos.project(this.sm.camera);
      if (worldPos.z <= 1) {
        const widthHalf = window.innerWidth / 2;
        const heightHalf = window.innerHeight / 2;
        const x = (worldPos.x * widthHalf) + widthHalf;
        const y = -(worldPos.y * heightHalf) + heightHalf;
        this.activeBubble.elem.style.display = 'block';
        this.activeBubble.elem.style.left = `${x}px`;
        this.activeBubble.elem.style.top = `${y}px`;
      } else {
        this.activeBubble.elem.style.display = 'none';
      }
    }
  }

  // 2. 處理 3D 物件點擊射線事件
  handle3DObjectClick(userData, screenPos, object3D) {
    if (userData.isShell) {
      // 拾取沙灘貝殼
      this.collectShell(object3D, screenPos);
    } else if (userData.isResident) {
      // 點擊島民
      this.openResidentBubble(userData.residentData, object3D);
    } else if (userData.isAnimal) {
      // 點擊動物
      this.openAnimalBubble(userData.animalType, object3D);
    } else if (userData.isLandmark) {
      // 點擊地標直接開啟該島
      this.closeSpeechBubble();
      this.sm.flyToIsland(userData.islandId);
    }
  }

  // 拾取沙灘貝殼
  collectShell(shellMesh, screenPos) {
    if (!shellMesh.userData.active) return;
    shellMesh.userData.active = false;
    shellMesh.visible = false;

    this.dm.addShell(1);
    this.updateBackpackBadge();

    // 播放貝殼浮動獲得動畫
    const toast = document.createElement('div');
    toast.className = 'shell-float';
    toast.textContent = '+1 🐚 海灘貝殼';
    toast.style.left = `${screenPos.x}px`;
    toast.style.top = `${screenPos.y}px`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1200);

    // 20 秒後在沙灘原位重生
    setTimeout(() => {
      shellMesh.userData.active = true;
      shellMesh.visible = true;
    }, 20000);
  }

  // 開啟居民對話泡泡
  openResidentBubble(residentData, object3D) {
    this.closeSpeechBubble();

    const bubble = document.createElement('div');
    bubble.className = 'speech-bubble';
    bubble.setAttribute('role', 'dialog');
    bubble.setAttribute('aria-label', `${residentData.name} 的對話`);

    let quoteIndex = 0;
    const quotes = residentData.quotes || ["你好呀！歡迎來到慈大人社未來島！"];

    const renderBody = () => {
      const tradeInfo = residentData.trade;
      const canTrade = tradeInfo && (this.dm.backpack[tradeInfo.need] > 0);

      bubble.innerHTML = `
        <div class="speech-bubble-header">
          <div>
            <span class="speech-bubble-name">${residentData.avatar || '🧑'} ${residentData.name}</span>
            <span class="speech-bubble-role">${residentData.role}</span>
          </div>
          <button class="speech-bubble-close" type="button" aria-label="關閉對話">✕</button>
        </div>
        <div class="speech-bubble-body">
          “${quotes[quoteIndex]}”
        </div>
        <div class="speech-bubble-actions">
          <button class="bubble-btn" id="bubble-chat-next" type="button">💬 再聊聊</button>
          ${tradeInfo ? `<button class="bubble-btn primary" id="bubble-trade-action" type="button">🔁 換取 ${tradeInfo.giveName}</button>` : ''}
        </div>
        ${tradeInfo ? `<div style="font-size:0.72rem; color:var(--muted); margin-top:6px;">需要：1 個 ${tradeInfo.need}【${tradeInfo.needName}】</div>` : ''}
      `;

      bubble.querySelector('.speech-bubble-close').addEventListener('click', () => this.closeSpeechBubble());

      bubble.querySelector('#bubble-chat-next').addEventListener('click', () => {
        quoteIndex = (quoteIndex + 1) % quotes.length;
        renderBody();
      });

      const tradeBtn = bubble.querySelector('#bubble-trade-action');
      if (tradeBtn) {
        tradeBtn.addEventListener('click', () => {
          const res = this.dm.executeTrade(residentData);
          alert(res.msg);
          this.updateBackpackBadge();
          this.renderBackpackModal();
          renderBody();
        });
      }
    };

    renderBody();
    this.bubbleContainer.appendChild(bubble);
    this.activeBubble = { elem: bubble, object3D: object3D };
  }

  // 開啟動物台詞泡泡
  openAnimalBubble(animalType, object3D) {
    this.closeSpeechBubble();

    const animalInfo = this.dm.content.animals.find(a => a.id === animalType) || {
      name: '小動物',
      icon: '🐾',
      quotes: '吱吱！'
    };

    const bubble = document.createElement('div');
    bubble.className = 'speech-bubble';
    bubble.style.width = '210px';
    bubble.innerHTML = `
      <div class="speech-bubble-header">
        <span class="speech-bubble-name">${animalInfo.icon} ${animalInfo.name}</span>
        <button class="speech-bubble-close" type="button" aria-label="關閉">✕</button>
      </div>
      <div class="speech-bubble-body" style="margin-bottom:0;">
        “${animalInfo.quotes}”
      </div>
    `;

    bubble.querySelector('.speech-bubble-close').addEventListener('click', () => this.closeSpeechBubble());

    this.bubbleContainer.appendChild(bubble);
    this.activeBubble = { elem: bubble, object3D: object3D };
  }

  closeSpeechBubble() {
    if (this.activeBubble) {
      if (this.activeBubble.elem) this.activeBubble.elem.remove();
      this.activeBubble = null;
    }
  }

  // 3. 打開側邊／底部島嶼詳情面板
  openIslandPanel(islandId) {
    const data = this.dm.getIslandById(islandId);
    if (!data) return;

    this.activeIslandId = islandId;

    // 自動蓋章集點！
    const isNew = this.dm.addStamp(islandId);
    this.updateStampBadge();
    if (isNew) {
      this.renderStampsModal();
    }

    // 填充面板欄位
    document.getElementById('panel-group-badge').textContent = data.group || '學系導覽';
    document.getElementById('panel-title-text').textContent = data.name;
    document.getElementById('panel-intro-text').textContent = data.intro;

    // 特殊重要公告（東語文化島停招、師培非獨立學系）
    const noticeBox = document.getElementById('panel-notice-box');
    if (data.notice) {
      noticeBox.style.display = 'block';
      noticeBox.innerHTML = `<strong>⚠️ 重要說明：</strong>${data.notice}`;
    } else {
      noticeBox.style.display = 'none';
    }

    // 核心學習重點
    const pointsList = document.getElementById('panel-points-list');
    pointsList.innerHTML = (data.points || []).map(p => `<li>${p}</li>`).join('');

    // 展出作品／攤位特展（標註示意）
    const extraLabel = document.getElementById('panel-extra-label');
    extraLabel.textContent = `🎪 ${data.extra || '展出作品／攤位'}`;

    const exhibitsList = document.getElementById('panel-exhibits-list');
    if (data.exhibits && data.exhibits.length > 0) {
      exhibitsList.innerHTML = data.exhibits.map(ex => `
        <div class="exhibit-item">
          <div class="exhibit-item-title">
            <span>${ex.title}</span>
            <span class="exhibit-tag">${ex.tag}</span>
          </div>
          <div class="exhibit-item-desc">${ex.desc}</div>
        </div>
      `).join('');
    } else {
      exhibitsList.innerHTML = `<p style="font-size:0.85rem; color:var(--muted);">此展區攤位專注於系所諮詢與特色交流。</p>`;
    }

    // 攤位現場體驗
    const activityText = document.getElementById('panel-activity-text');
    activityText.textContent = data.boothActivity || "現場提供學系諮詢與探索手冊兌換。（示意）";

    // 學長姊列表
    const residentsList = document.getElementById('panel-residents-list');
    const residents = this.dm.getResidentsForIsland(islandId);
    if (residents.length > 0) {
      residentsList.innerHTML = residents.map(r => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--surface-alt); padding:8px 12px; border-radius:var(--radius-sm); font-size:0.85rem;">
          <div><b>${r.avatar || '🧑'} ${r.name}</b> <span style="font-size:0.75rem; color:var(--muted);">${r.role}</span></div>
          <div style="font-size:0.75rem; color:var(--primary);">${r.trade ? `可交換 ${r.trade.give}` : '可交流'}</div>
        </div>
      `).join('');
    } else {
      residentsList.innerHTML = `<div style="font-size:0.85rem; color:var(--muted);">島上有勤勞的巡遊導覽夥伴。</div>`;
    }

    // 官網連結按鈕（在新分頁開啟）
    const linkBtn = document.getElementById('panel-official-link');
    linkBtn.href = data.link || 'https://hcsc.tcu.edu.tw/';

    this.panel.classList.add('open');
    this.panel.setAttribute('aria-hidden', 'false');
  }

  closeIslandPanel() {
    this.panel.classList.remove('open');
    this.panel.setAttribute('aria-hidden', 'true');
    this.activeIslandId = null;
    this.sm.resetToOverview();
  }

  // 4. 主題底色切換
  updateTheme(themeName) {
    this.currentTheme = themeName;
    localStorage.setItem("tcu_theme", themeName);

    let effectiveTheme = themeName;
    if (themeName === 'auto') {
      // 依目前時間自動判斷
      const hour = new Date().getHours();
      if (hour >= 6 && hour < 16) {
        effectiveTheme = 'forest';
      } else if ((hour >= 16 && hour < 19) || (hour >= 5 && hour < 6)) {
        effectiveTheme = 'tundra';
      } else {
        effectiveTheme = 'deepforest';
      }
    }

    document.documentElement.setAttribute('data-theme', effectiveTheme);

    // 更新 Dock 按鈕 active
    document.querySelectorAll('#theme-buttons-group .dock-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-theme-val') === themeName);
    });

    // 3D 天空海水霧氣色彩同步
    if (effectiveTheme === 'forest') {
      this.sm.setTimeMode('day');
    } else if (effectiveTheme === 'tundra') {
      this.sm.setTimeMode('dusk');
    } else {
      this.sm.setTimeMode('night');
    }
  }

  // 5. 晝夜時段切換
  updateTimeMode(mode) {
    this.currentTimeMode = mode;
    localStorage.setItem("tcu_time_mode", mode);

    document.querySelectorAll('#time-buttons-group .dock-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-time-val') === mode);
    });

    if (mode === 'flow') {
      this.sm.autoTimeFlow = true;
    } else if (mode === 'realtime') {
      this.sm.autoTimeFlow = false;
      const hour = new Date().getHours();
      if (hour >= 6 && hour < 16) {
        this.sm.setTimeMode('day');
      } else if (hour >= 16 && hour < 19) {
        this.sm.setTimeMode('dusk');
      } else {
        this.sm.setTimeMode('night');
      }
    } else {
      this.sm.autoTimeFlow = false;
      this.sm.setTimeMode(mode);
    }
  }

  // 6. 即時時鐘運算
  startLiveClock() {
    const update = () => {
      const now = new Date();
      const hrs = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      const timeStr = `${hrs}:${mins}`;

      let icon = '☀️ 白天';
      if (this.sm.currentLightTime === 'dusk') icon = '🌇 黃昏';
      if (this.sm.currentLightTime === 'night') icon = '🌙 夜晚';

      const clockBadge = document.getElementById('live-clock-badge');
      if (clockBadge) {
        clockBadge.textContent = `${icon} ${timeStr}`;
      }
    };
    update();
    this.clockTimer = setInterval(update, 1000);
  }

  // 7. 更新集章與背包 Badge 標記
  updateStampBadge() {
    const badge = document.getElementById('stamp-count-badge');
    if (badge) {
      badge.textContent = `(${this.dm.stamps.size}/10)`;
    }
  }

  updateBackpackBadge() {
    const badge = document.getElementById('shell-count-badge');
    if (badge) {
      const shells = this.dm.backpack['🐚'] || 0;
      badge.textContent = `(${shells}🐚)`;
    }
  }

  // 8. 模態彈窗內容渲染
  renderStampsModal() {
    const grid = document.getElementById('stamps-grid-container');
    if (!grid) return;

    grid.innerHTML = '';
    const islands = this.dm.content.islands;
    let stampedCount = 0;

    islands.forEach(isl => {
      const isStamped = this.dm.stamps.has(isl.id);
      if (isStamped) stampedCount++;

      const slot = document.createElement('div');
      slot.className = `stamp-slot ${isStamped ? 'stamped' : ''}`;
      slot.innerHTML = `
        <div class="stamp-slot-icon">${isStamped ? '💮' : '⭕'}</div>
        <div class="stamp-slot-name">${isl.name}</div>
        <div style="font-size:0.65rem; color:var(--muted);">${isStamped ? '已打卡' : '未造訪'}</div>
      `;
      grid.appendChild(slot);
    });

    document.getElementById('stamp-progress-text').textContent = `${stampedCount} / 10 島`;
    document.getElementById('stamp-complete-celebration').style.display = (stampedCount >= 10) ? 'block' : 'none';

    // 渲染活動時程表
    const scheduleBox = document.getElementById('schedule-timeline-container');
    const schedule = this.dm.content.centerIsland.schedule || [];
    scheduleBox.innerHTML = schedule.map(s => `
      <div style="display:flex; gap:12px; align-items:flex-start; border-bottom:1px dashed var(--line); padding-bottom:8px;">
        <span style="font-weight:800; color:var(--primary); font-size:0.88rem; width:48px;">${s.time}</span>
        <div style="flex:1;">
          <div style="font-weight:700; font-size:0.9rem; color:var(--ink);">
            ${s.title} <span style="font-size:0.7rem; background:var(--badge-bg); color:var(--ink-secondary); padding:1px 6px; border-radius:4px;">${s.badge}</span>
          </div>
          <div style="font-size:0.78rem; color:var(--muted);">${s.speaker} ── ${s.desc}</div>
        </div>
      </div>
    `).join('');
  }

  renderBackpackModal() {
    const grid = document.getElementById('backpack-items-grid');
    if (!grid) return;

    grid.innerHTML = '';
    const items = Object.entries(this.dm.backpack);

    if (items.length === 0) {
      grid.innerHTML = `<p style="grid-column: span 4; font-size:0.85rem; color:var(--muted);">背包空空如也，快去沙灘尋寶撿貝殼吧！</p>`;
    } else {
      items.forEach(([icon, count]) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'backpack-item';
        itemDiv.innerHTML = `
          <div class="backpack-item-icon">${icon}</div>
          <div class="backpack-item-count">×${count}</div>
        `;
        grid.appendChild(itemDiv);
      });
    }

    // 渲染換物鏈指引
    const chainFlow = document.getElementById('trade-chain-flow');
    chainFlow.innerHTML = `
      <div style="background:var(--surface-alt); padding:10px; border-radius:var(--radius-sm);">
        <b>換物傳承鏈順序：</b><br>
        🐚 貝殼 ➔ 📘 助人筆記（社工） ➔ 🪞 心靈魔鏡（人發心） ➔ 🎨 成長繪本（兒家） ➔ 💾 科技晶片（外語） ➔ 🎞️ 紀實膠卷（傳播） ➔ 🎮 互動搖桿（數位媒體） ➔ 📜 文化古卷（東語） ➔ 🪷 智慧蓮花（宗教） ➔ 🌱 希望幼苗（教育） ➔ <b>🌟 慈大人文未來領航勳章（師培）</b>
      </div>
    `;
  }

  renderIslandListModal() {
    const listContainer = document.getElementById('modal-list-content');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    const islands = this.dm.content.islands;

    islands.forEach(isl => {
      const item = document.createElement('div');
      item.className = 'island-list-item';
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.innerHTML = `
        <div class="list-item-left">
          <div class="list-item-idx">${isl.order}</div>
          <div>
            <div class="list-item-title">${isl.name} <span style="font-size:0.72rem; color:var(--primary); font-weight:normal;">[${isl.group}]</span></div>
            <div class="list-item-desc">${isl.intro}</div>
          </div>
        </div>
        <span style="font-size:1.2rem; color:var(--muted);">➔</span>
      `;

      item.addEventListener('click', () => {
        this.closeAllModals();
        this.sm.flyToIsland(isl.id);
      });

      listContainer.appendChild(item);
    });
  }

  // 純文字無障礙視圖渲染
  renderAccessibleView() {
    const container = document.getElementById('accessible-islands-container');
    if (!container) return;

    const islands = this.dm.content.islands;
    container.innerHTML = islands.map(isl => `
      <article style="border-bottom: 2px solid var(--line); padding: 18px 0;">
        <h2 style="font-size: 1.3rem; color: var(--ink); margin-bottom: 6px;">${isl.order}. ${isl.name} (${isl.group})</h2>
        <p style="font-weight: 700; color: var(--primary); margin-bottom: 8px;">${isl.intro}</p>
        ${isl.notice ? `<p style="background:#fff8eb; color:#7a4805; padding:8px; border-radius:6px; font-size:0.85rem;">⚠️ ${isl.notice}</p>` : ''}
        <h3 style="font-size: 1rem; margin-top: 10px;">核心學習重點：</h3>
        <ul style="padding-left: 20px; line-height: 1.6;">
          ${(isl.points || []).map(p => `<li>${p}</li>`).join('')}
        </ul>
        <h3 style="font-size: 1rem; margin-top: 10px;">展出作品與特色攤位：</h3>
        <p style="font-size: 0.9rem; color: var(--ink-secondary);">${isl.extra}</p>
        <p style="margin-top: 10px;">
          <a href="${isl.link}" target="_blank" rel="noopener noreferrer" style="color:var(--primary); font-weight:bold;">造訪系所官方網站 ↗</a>
        </p>
      </article>
    `).join('');
  }

  // 9. 事件綁定
  bindGlobalEvents() {
    // Esc 鍵快捷關閉（優先關閉最上層彈窗，再關面板與對話）
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const hasOpenModal = document.querySelector('.modal-backdrop.open');
        if (hasOpenModal) {
          this.closeAllModals();
        } else if (this.panel.classList.contains('open')) {
          this.closeIslandPanel();
        } else if (this.activeBubble) {
          this.closeSpeechBubble();
        } else if (this.sm.isCinemaActive) {
          this.sm.skipCinemaIntro();
        }
      }
    });

    // 點擊關閉面板按鈕
    document.getElementById('panel-close-btn').addEventListener('click', () => {
      this.closeIslandPanel();
    });

    // 跳過開場運鏡按鈕
    document.getElementById('skip-cinema-btn').addEventListener('click', () => {
      this.sm.skipCinemaIntro();
    });

    // 品牌導覽小禾點擊
    document.getElementById('brand-badge').addEventListener('click', () => {
      alert(`🐦 小禾導覽：\n${this.dm.content.site.mascot.greeting}`);
    });
  }

  bindControlDockEvents() {
    // 主題底色切換按鈕
    document.querySelectorAll('#theme-buttons-group .dock-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-theme-val');
        this.updateTheme(val);
      });
    });

    // 晝夜時段切換按鈕
    document.querySelectorAll('#time-buttons-group .dock-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-time-val');
        this.updateTimeMode(val);
      });
    });
  }

  bindHeaderTools() {
    // 搜尋
    document.getElementById('btn-open-search').addEventListener('click', () => {
      this.openModal('modal-search');
      document.getElementById('search-query-input').focus();
    });

    // 地點清單
    document.getElementById('btn-open-list').addEventListener('click', () => {
      this.openModal('modal-list');
    });

    // 集章冊
    document.getElementById('btn-open-stamps').addEventListener('click', () => {
      this.renderStampsModal();
      this.openModal('modal-stamps');
    });

    // 背包
    document.getElementById('btn-open-backpack').addEventListener('click', () => {
      this.renderBackpackModal();
      this.openModal('modal-backpack');
    });

    // 分享卡片
    document.getElementById('btn-open-share').addEventListener('click', () => {
      document.getElementById('share-stamp-count').textContent = `${this.dm.stamps.size} / 10`;
      const itemCount = Object.values(this.dm.backpack).reduce((a, b) => a + b, 0);
      document.getElementById('share-item-count').textContent = `${itemCount} 件`;
      this.openModal('modal-share');
    });

    // 複製網站連結按鈕
    document.getElementById('btn-copy-link').addEventListener('click', () => {
      navigator.clipboard.writeText(window.location.href).then(() => {
        const toast = document.getElementById('copy-toast');
        toast.style.display = 'block';
        setTimeout(() => toast.style.display = 'none', 3000);
      }).catch(() => {
        alert("網站網址：" + window.location.href);
      });
    });

    // 搜尋即時輸入過濾
    const searchInput = document.getElementById('search-query-input');
    const searchResults = document.getElementById('search-results-list');
    const clearBtn = document.getElementById('search-clear-btn');

    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      if (!q) {
        searchResults.innerHTML = '';
        return;
      }

      const islands = this.dm.content.islands;
      const matched = islands.filter(isl => {
        return isl.name.toLowerCase().includes(q) ||
               isl.group.toLowerCase().includes(q) ||
               isl.intro.toLowerCase().includes(q) ||
               (isl.points || []).some(p => p.toLowerCase().includes(q)) ||
               (isl.extra && isl.extra.toLowerCase().includes(q));
      });

      if (matched.length === 0) {
        searchResults.innerHTML = `<p style="font-size:0.85rem; color:var(--muted); padding:12px;">查無相關島嶼或攤位，換個關鍵字試試看！</p>`;
      } else {
        searchResults.innerHTML = matched.map(isl => `
          <div class="island-list-item" style="padding:10px 12px; margin-bottom:6px;" data-isl-id="${isl.id}">
            <div>
              <div style="font-weight:700; font-size:0.9rem;">${isl.name} <span style="font-size:0.75rem; color:var(--primary);">[${isl.group}]</span></div>
              <div style="font-size:0.78rem; color:var(--muted);">${isl.intro}</div>
            </div>
            <span>➔</span>
          </div>
        `).join('');

        searchResults.querySelectorAll('.island-list-item').forEach(item => {
          item.addEventListener('click', () => {
            const id = item.getAttribute('data-isl-id');
            this.closeAllModals();
            this.sm.flyToIsland(id);
          });
        });
      }
    });

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchResults.innerHTML = '';
      searchInput.focus();
    });

    // 重置集章按鈕
    document.getElementById('reset-stamps-btn').addEventListener('click', () => {
      if (confirm("確定要重置集章進度嗎？")) {
        this.dm.resetStamps();
        this.updateStampBadge();
        this.renderStampsModal();
      }
    });

    // 重置背包按鈕
    document.getElementById('reset-backpack-btn').addEventListener('click', () => {
      if (confirm("確定要清空背包重置為 3 顆貝殼嗎？")) {
        this.dm.resetBackpack();
        this.updateBackpackBadge();
        this.renderBackpackModal();
      }
    });

    // 關閉所有彈窗
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => this.closeAllModals());
    });
    document.querySelectorAll('.modal-backdrop').forEach(bd => {
      bd.addEventListener('click', (e) => {
        if (e.target === bd) this.closeAllModals();
      });
    });
  }

  bindActionButtons() {
    // 回到全景
    document.getElementById('btn-reset-view').addEventListener('click', () => {
      this.closeIslandPanel();
      this.closeSpeechBubble();
      this.sm.resetToOverview();
    });

    // 重播開場
    document.getElementById('btn-replay-cinema').addEventListener('click', () => {
      this.closeIslandPanel();
      this.closeSpeechBubble();
      this.sm.startCinemaIntro();
    });

    // 動態開關（減少動態）
    const motionBtn = document.getElementById('btn-toggle-motion');
    motionBtn.addEventListener('click', () => {
      this.dm.reducedMotion = !this.dm.reducedMotion;
      this.sm.reducedMotion = this.dm.reducedMotion;
      localStorage.setItem("tcu_reduced_motion", this.dm.reducedMotion);
      alert(this.dm.reducedMotion ? "🍃 已開啟「減少動態模式」（暫停微幅擺動與旋轉）" : "🍃 已恢復正常動態模式");
    });

    // 畫質切換（高／低畫質）
    const qualityBtn = document.getElementById('btn-toggle-quality');
    qualityBtn.addEventListener('click', () => {
      this.dm.lowQuality = !this.dm.lowQuality;
      this.sm.lowQuality = this.dm.lowQuality;
      localStorage.setItem("tcu_low_quality", this.dm.lowQuality);
      if (this.sm.renderer) {
        this.sm.renderer.shadowMap.enabled = !this.dm.lowQuality;
        this.sm.dirLight.castShadow = !this.dm.lowQuality;
      }
      alert(this.dm.lowQuality ? "⚡ 已切換為「低畫質模式」（關閉動態陰影，提升幀率）" : "⚡ 已切換為「高畫質模式」（開啟精緻光影）");
    });

    // 純文字無障礙視圖開關
    const accessibleFallback = document.getElementById('accessible-fallback');
    document.getElementById('btn-open-accessible').addEventListener('click', () => {
      accessibleFallback.classList.add('active');
    });
    document.getElementById('btn-close-accessible').addEventListener('click', () => {
      accessibleFallback.classList.remove('active');
    });
  }

  openModal(modalId) {
    this.closeAllModals();
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  closeAllModals() {
    document.querySelectorAll('.modal-backdrop').forEach(m => {
      m.classList.remove('open');
      m.setAttribute('aria-hidden', 'true');
    });
  }
}
