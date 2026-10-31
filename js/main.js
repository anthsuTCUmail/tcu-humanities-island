// ============================================================
// main.js: 慈大人社未來島｜主程式入口
// ============================================================

import { DataManager } from './dataManager.js';
import { WorldGenerator } from './worldGenerator.js';
import { SceneManager } from './sceneManager.js';
import { UIManager } from './uiManager.js';

function isWebGLAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch (e) {
    return false;
  }
}

async function bootstrap() {
  const container = document.getElementById('canvas-container');
  const accessibleFallback = document.getElementById('accessible-fallback');

  // 1. 檢查 WebGL 支援度
  if (!isWebGLAvailable()) {
    console.warn("WebGL not supported, falling back to accessible text view.");
    if (accessibleFallback) accessibleFallback.classList.add('active');
    const cinemaOverlay = document.getElementById('cinema-overlay');
    if (cinemaOverlay) cinemaOverlay.remove();
    return;
  }

  try {
    // 2. 初始化資料管理器
    const dataManager = new DataManager();
    await dataManager.init();

    // 3. 初始化 3D 幾何模型生成器
    const worldGen = new WorldGenerator();

    // 4. 初始化場景管理器
    const sceneManager = new SceneManager(container, worldGen, dataManager);
    sceneManager.init();

    // 5. 初始化使用者介面管理器
    const uiManager = new UIManager(dataManager, sceneManager);
    uiManager.init();

    window.testDataManager = dataManager;
    window.testSceneManager = sceneManager;
    window.testUIManager = uiManager;

    // 6. 啟動電影史詩開場動畫
    sceneManager.startCinemaIntro();

    console.log("🏝️ 慈大人社未來島載入成功！歡迎探索人社院 10 大學系展區。");
  } catch (error) {
    console.error("Initialization failed:", error);
    if (accessibleFallback) accessibleFallback.classList.add('active');
  }
}

// 頁面載入完成後啟動
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
