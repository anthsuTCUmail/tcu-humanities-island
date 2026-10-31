// ============================================================
// DataManager: 資料載入與狀態管理（集章、背包、設定、交易）
// ============================================================

export class DataManager {
  constructor() {
    this.content = null;
    this.stamps = new Set();
    this.backpack = {
      "🐚": 3 // 起始 3 個海灘貝殼
    };
    this.visitedIslands = new Set();
    this.theme = localStorage.getItem("tcu_theme") || "auto";
    this.timeMode = localStorage.getItem("tcu_time_mode") || "day";
    this.reducedMotion = localStorage.getItem("tcu_reduced_motion") === "true";
    this.lowQuality = localStorage.getItem("tcu_low_quality") === "true";

    this.loadPersistedData();
  }

  async init() {
    try {
      const res = await fetch("./data/content.json");
      if (!res.ok) throw new Error("Failed to load content.json: " + res.status);
      this.content = await res.json();
      return this.content;
    } catch (err) {
      console.error("Error loading content:", err);
      throw err;
    }
  }

  loadPersistedData() {
    try {
      const savedStamps = localStorage.getItem("tcu_stamps");
      if (savedStamps) {
        this.stamps = new Set(JSON.parse(savedStamps));
      }
      const savedBackpack = localStorage.getItem("tcu_backpack");
      if (savedBackpack) {
        this.backpack = JSON.parse(savedBackpack);
      }
    } catch (e) {
      console.warn("Could not load from localStorage:", e);
    }
  }

  saveBackpack() {
    try {
      localStorage.setItem("tcu_backpack", JSON.stringify(this.backpack));
    } catch (e) {
      console.warn("Could not save backpack:", e);
    }
  }

  saveStamps() {
    try {
      localStorage.setItem("tcu_stamps", JSON.stringify(Array.from(this.stamps)));
    } catch (e) {
      console.warn("Could not save stamps:", e);
    }
  }

  addStamp(islandId) {
    if (!this.stamps.has(islandId)) {
      this.stamps.add(islandId);
      this.saveStamps();
      return true; // 新蓋印
    }
    return false;
  }

  resetStamps() {
    this.stamps.clear();
    this.saveStamps();
  }

  addShell(count = 1) {
    this.backpack["🐚"] = (this.backpack["🐚"] || 0) + count;
    this.saveBackpack();
  }

  resetBackpack() {
    this.backpack = { "🐚": 3 };
    this.saveBackpack();
  }

  executeTrade(resident) {
    if (!resident.trade) return { success: false, msg: "無交易項目" };
    const { need, needName, give, giveName } = resident.trade;

    if (!this.backpack[need] || this.backpack[need] <= 0) {
      return {
        success: false,
        msg: `缺少物品：需要 1 個 ${need}【${needName}】才能交換喔！`
      };
    }

    // 扣除所需物，獲得新物品
    this.backpack[need] -= 1;
    if (this.backpack[need] <= 0) delete this.backpack[need];
    this.backpack[give] = (this.backpack[give] || 0) + 1;
    this.saveBackpack();

    return {
      success: true,
      msg: `交換成功！你送出 1 個 ${need}，獲得了 1 個 ${give}【${giveName}】！🎉`
    };
  }

  getIslandById(id) {
    if (!this.content) return null;
    if (id === "island-center") {
      return {
        ...this.content.centerIsland,
        points: ["全島總覽與諮詢服務", "迎新活動時程表與活動轉播", "探索集章與紀念品兌換處"],
        extra: "慈大人文迎新服務總台",
        link: "https://hcsc.tcu.edu.tw/",
        group: "核心樞紐",
        intro: "歡迎來到慈大人社未來島！這裡是通往各專業學系的啟航港口。"
      };
    }
    return this.content.islands.find(item => item.id === id) || null;
  }

  getResidentById(id) {
    if (!this.content) return null;
    return this.content.residents.find(r => r.id === id) || null;
  }

  getResidentsForIsland(islandId) {
    if (!this.content) return [];
    return this.content.residents.filter(r => r.islandId === islandId);
  }
}
