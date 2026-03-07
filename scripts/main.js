/**
 * Atmosphera — AI-powered dynamic atmosphere music for FoundryVTT
 * Uses Suno AI to generate contextual background music based on game state.
 */

const MODULE_ID = "atmosphera";

/* ──────────────────────────── CREATURE TYPE → MUSIC TAGS ──────────────────────────── */

const CREATURE_TAG_MAP = {
  aberration: "eerie, dissonant, alien, unsettling, otherworldly",
  beast: "primal, nature, tribal drums, organic, wild",
  celestial: "angelic choir, radiant, holy, uplifting, ethereal",
  construct: "mechanical, industrial, rhythmic, metallic, clockwork",
  dragon: "epic, orchestral, brass fanfare, powerful, majestic",
  elemental: "primal forces, swirling, dynamic, raw energy, elemental",
  fey: "whimsical, enchanting, playful, celtic harp, mystical",
  fiend: "dark, ominous, infernal, heavy, demonic choir",
  giant: "thunderous, deep drums, massive, earth-shaking, powerful",
  humanoid: "adventurous, varied, dynamic, orchestral, cinematic",
  monstrosity: "tense, suspenseful, lurking, predatory, danger",
  ooze: "bubbling, squelching, ambient, unsettling, viscous",
  plant: "organic, slow, creeping, nature ambient, overgrowth",
  undead: "haunting, ghostly, minor key, dark ambient, spectral"
};

/* ──────────────────────────── ATMOSPHERE → SUNO TAGS ──────────────────────────── */

const ATMOSPHERE_TAG_MAP = {
  tavern: "medieval tavern, lute, fiddle, warm, lively folk music, acoustic",
  dungeon: "dark ambient, dungeon crawl, dripping, tension, low drones",
  wilderness: "open world, nature, adventure, orchestral, sweeping",
  city: "bustling, urban fantasy, market sounds, lively, cosmopolitan",
  temple: "sacred, reverb, choir, solemn, organ, holy",
  underwater: "subaquatic, deep, muffled, whale song, pressure, ambient",
  feywild: "enchanted, whimsical, sparkling, celtic, magical, dreamy",
  shadowfell: "bleak, desaturated, melancholy, hollow wind, despair",
  combat_generic: "intense, fast-paced, battle music, percussion, adrenaline",
  boss_fight: "epic boss battle, orchestral, heavy, choir, climactic",
  victory: "triumphant, fanfare, celebratory, brass, uplifting",
  defeat: "somber, loss, slow, minor key, mournful strings",
  calm: "peaceful, ambient, gentle, relaxing, soft piano"
};

/* ──────────────────────────── SETTINGS REGISTRATION ──────────────────────────── */

function registerSettings() {
  const s = (key, data) => game.settings.register(MODULE_ID, key, data);

  s("sunoApiUrl", {
    name: "Suno API URL",
    hint: "Base URL for the Suno API proxy (e.g. http://localhost:3000)",
    scope: "world",
    config: true,
    type: String,
    default: "http://localhost:3000"
  });

  s("sunoCookie", {
    name: "Suno Cookie",
    hint: "Your Suno session cookie for authentication.",
    scope: "world",
    config: true,
    type: String,
    default: "",
    secret: true
  });

  s("twoCaptchaKey", {
    name: "2Captcha API Key",
    hint: "API key for 2Captcha service (used to solve Suno captchas).",
    scope: "world",
    config: true,
    type: String,
    default: "",
    secret: true
  });

  s("masterVolume", {
    name: "Master Volume",
    hint: "Master volume for Atmosphera playback (0.0 – 1.0).",
    scope: "world",
    config: true,
    type: Number,
    default: 0.5,
    range: { min: 0, max: 1, step: 0.05 }
  });

  s("enabled", {
    name: "Enable Atmosphera",
    hint: "Toggle automatic atmosphere music generation.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  s("autoDetectCombat", {
    name: "Auto-Detect Combat",
    hint: "Automatically switch music when combat starts/ends.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  s("autoDetectHP", {
    name: "Auto-Detect HP Changes",
    hint: "React to significant HP changes (boss low HP, party wipe, etc.).",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  s("hpThreshold", {
    name: "HP Threshold (%)",
    hint: "HP percentage that triggers mood shifts (e.g. boss below this = intense).",
    scope: "world",
    config: true,
    type: Number,
    default: 25,
    range: { min: 5, max: 50, step: 5 }
  });

  s("defaultAtmosphere", {
    name: "Default Atmosphere",
    hint: "Atmosphere to use when no specific context is detected.",
    scope: "world",
    config: true,
    type: String,
    default: "calm",
    choices: Object.fromEntries(Object.keys(ATMOSPHERE_TAG_MAP).map(k => [k, k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())]))
  });

  s("crossfadeDuration", {
    name: "Crossfade Duration (ms)",
    hint: "Duration in milliseconds for crossfading between tracks.",
    scope: "world",
    config: true,
    type: Number,
    default: 3000,
    range: { min: 500, max: 10000, step: 500 }
  });
}

/* ──────────────────────────── CACHE MANAGER ──────────────────────────── */

class CacheManager {
  static INDEX_KEY = `${MODULE_ID}.cacheIndex`;

  static _getIndex() {
    try {
      return JSON.parse(localStorage.getItem(this.INDEX_KEY)) || {};
    } catch { return {}; }
  }

  static _saveIndex(idx) {
    localStorage.setItem(this.INDEX_KEY, JSON.stringify(idx));
  }

  static has(cacheKey) {
    return cacheKey in this._getIndex();
  }

  static get(cacheKey) {
    const idx = this._getIndex();
    const entry = idx[cacheKey];
    if (!entry) return null;
    entry.lastAccessed = Date.now();
    this._saveIndex(idx);
    return entry;
  }

  static save(cacheKey, data) {
    const idx = this._getIndex();
    idx[cacheKey] = { ...data, cachedAt: Date.now(), lastAccessed: Date.now() };
    this._saveIndex(idx);
  }

  static clear() {
    localStorage.removeItem(this.INDEX_KEY);
  }
}

/* ──────────────────────────── SUNO CLIENT ──────────────────────────── */

class SunoClient {
  static _baseUrl() {
    return game.settings.get(MODULE_ID, "sunoApiUrl").replace(/\/+$/, "");
  }

  static _headers() {
    return {
      "Content-Type": "application/json",
      Cookie: game.settings.get(MODULE_ID, "sunoCookie")
    };
  }

  static async generate(tags, title) {
    const resp = await fetch(`${this._baseUrl()}/api/generate`, {
      method: "POST",
      headers: this._headers(),
      body: JSON.stringify({
        prompt: "",
        tags,
        title,
        make_instrumental: true,
        wait_audio: false
      })
    });
    if (!resp.ok) throw new Error(`Suno generate failed: ${resp.status}`);
    return resp.json();
  }

  static async poll(ids) {
    const query = Array.isArray(ids) ? ids.join(",") : ids;
    const resp = await fetch(`${this._baseUrl()}/api/get?ids=${query}`, {
      headers: this._headers()
    });
    if (!resp.ok) throw new Error(`Suno poll failed: ${resp.status}`);
    return resp.json();
  }

  static async getCredits() {
    const resp = await fetch(`${this._baseUrl()}/api/get_limit`, {
      headers: this._headers()
    });
    if (!resp.ok) throw new Error(`Suno credits failed: ${resp.status}`);
    return resp.json();
  }

  static async generateAndCache(tags, title, cacheKey) {
    if (CacheManager.has(cacheKey)) {
      console.log(`${MODULE_ID} | Cache hit: ${cacheKey}`);
      return CacheManager.get(cacheKey);
    }

    console.log(`${MODULE_ID} | Generating: ${title} [${tags}]`);
    const genResult = await this.generate(tags, title);
    const ids = genResult.map(r => r.id);

    // Poll until complete (max 5 min)
    const maxAttempts = 60;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const status = await this.poll(ids);
      const done = status.filter(s => s.status === "complete");
      if (done.length > 0) {
        const track = done[0];
        const cacheEntry = {
          id: track.id,
          url: track.audio_url,
          title: track.title,
          tags: track.metadata?.tags || tags,
          duration: track.metadata?.duration
        };
        CacheManager.save(cacheKey, cacheEntry);
        return cacheEntry;
      }
      const failed = status.filter(s => s.status === "error");
      if (failed.length === status.length) {
        throw new Error("All Suno generations failed");
      }
    }
    throw new Error("Suno generation timed out");
  }
}

/* ──────────────────────────── AUDIO MANAGER ──────────────────────────── */

class AudioManager {
  constructor() {
    this.deckA = null;
    this.deckB = null;
    this.activeDeck = "A";
    this.volume = 0.5;
    this._fadeInterval = null;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.activeDeck === "A" && this.deckA) this.deckA.volume = this.volume;
    if (this.activeDeck === "B" && this.deckB) this.deckB.volume = this.volume;
  }

  async play(url, crossfadeDuration = 3000) {
    const incoming = new Audio(url);
    incoming.crossOrigin = "anonymous";
    incoming.volume = 0;
    incoming.loop = true;

    const outgoing = this.activeDeck === "A" ? this.deckA : this.deckB;

    if (this.activeDeck === "A") {
      this.deckB = incoming;
      this.activeDeck = "B";
    } else {
      this.deckA = incoming;
      this.activeDeck = "A";
    }

    try { await incoming.play(); } catch (e) {
      console.warn(`${MODULE_ID} | Audio play blocked:`, e);
      return;
    }

    this._crossfade(outgoing, incoming, crossfadeDuration);
  }

  _crossfade(outgoing, incoming, duration) {
    if (this._fadeInterval) clearInterval(this._fadeInterval);
    const steps = 30;
    const stepTime = duration / steps;
    let step = 0;

    this._fadeInterval = setInterval(() => {
      step++;
      const progress = step / steps;
      if (incoming) incoming.volume = Math.min(this.volume, progress * this.volume);
      if (outgoing) outgoing.volume = Math.max(0, (1 - progress) * this.volume);

      if (step >= steps) {
        clearInterval(this._fadeInterval);
        this._fadeInterval = null;
        if (outgoing) {
          outgoing.pause();
          outgoing.src = "";
        }
      }
    }, stepTime);
  }

  stop(fadeDuration = 1000) {
    const active = this.activeDeck === "A" ? this.deckA : this.deckB;
    if (active) {
      this._crossfade(active, null, fadeDuration);
    }
    this.deckA = null;
    this.deckB = null;
  }

  get isPlaying() {
    const d = this.activeDeck === "A" ? this.deckA : this.deckB;
    return d ? !d.paused : false;
  }
}

/* ──────────────────────────── GAME STATE DETECTOR ──────────────────────────── */

class GameStateDetector {
  static detectCombat() {
    return !!game.combat?.active;
  }

  static detectCreatureTypes() {
    if (!game.combat?.combatants) return [];
    const types = new Set();
    for (const c of game.combat.combatants) {
      const actor = c.actor;
      if (!actor) continue;
      // D&D 5e stores creature type in system.details.type.value
      const creatureType = actor.system?.details?.type?.value
        || actor.system?.details?.creatureType
        || null;
      if (creatureType && CREATURE_TAG_MAP[creatureType.toLowerCase()]) {
        types.add(creatureType.toLowerCase());
      }
    }
    return [...types];
  }

  static detectHPThreshold(actor) {
    const hp = actor?.system?.attributes?.hp;
    if (!hp || !hp.max) return null;
    const pct = (hp.value / hp.max) * 100;
    const threshold = game.settings.get(MODULE_ID, "hpThreshold");
    return { pct, belowThreshold: pct <= threshold, hp: hp.value, max: hp.max };
  }

  static detectIsBoss(actor) {
    // Heuristic: legendary actions or CR >= 10
    const cr = actor?.system?.details?.cr;
    const legendary = actor?.system?.resources?.legact?.max > 0;
    return legendary || (cr && cr >= 10);
  }

  static mapToTags(options = {}) {
    const { atmosphere, creatureTypes = [], isBossFight = false, isVictory = false, isDefeat = false } = options;

    let tags = [];

    if (isVictory) return ATMOSPHERE_TAG_MAP.victory;
    if (isDefeat) return ATMOSPHERE_TAG_MAP.defeat;

    if (isBossFight) {
      tags.push(ATMOSPHERE_TAG_MAP.boss_fight);
    } else if (atmosphere && ATMOSPHERE_TAG_MAP[atmosphere]) {
      tags.push(ATMOSPHERE_TAG_MAP[atmosphere]);
    }

    // Layer in creature-specific flavoring
    for (const ct of creatureTypes.slice(0, 2)) {
      if (CREATURE_TAG_MAP[ct]) {
        tags.push(CREATURE_TAG_MAP[ct]);
      }
    }

    return tags.join(", ") || ATMOSPHERE_TAG_MAP.calm;
  }

  static buildTitle(options = {}) {
    const { atmosphere, creatureTypes = [], isBossFight = false } = options;
    const parts = ["Atmosphera"];
    if (isBossFight) parts.push("Boss Fight");
    else if (atmosphere) parts.push(atmosphere.replace(/_/g, " "));
    if (creatureTypes.length) parts.push(creatureTypes[0]);
    return parts.join(" — ");
  }
}

/* ──────────────────────────── CONTROL PANEL UI ──────────────────────────── */

class AtmospheraPanel extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "atmosphera-panel",
      title: "🎵 Atmosphera",
      template: undefined,
      popOut: true,
      width: 320,
      height: "auto",
      top: 80,
      left: 20,
      classes: ["atmosphera-panel"],
      resizable: false
    });
  }

  constructor(controller) {
    super();
    this.controller = controller;
  }

  async _renderInner() {
    const atmos = Object.keys(ATMOSPHERE_TAG_MAP);
    const currentAtmo = this.controller.currentAtmosphere || game.settings.get(MODULE_ID, "defaultAtmosphere");
    const isPlaying = this.controller.audioManager.isPlaying;

    const html = $(`
      <div class="atmosphera-controls">
        <div class="atmo-section">
          <label>Atmosphere</label>
          <select id="atmo-select">
            ${atmos.map(a => `<option value="${a}" ${a === currentAtmo ? "selected" : ""}>${a.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</option>`).join("")}
          </select>
        </div>

        <div class="atmo-section">
          <label>Mood Override</label>
          <input type="text" id="atmo-mood" placeholder="e.g. tense, mysterious..." value="${this.controller.moodOverride || ""}">
        </div>

        <div class="atmo-section atmo-buttons">
          <button id="atmo-play" class="${isPlaying ? "active" : ""}">
            <i class="fas fa-play"></i> ${isPlaying ? "Playing" : "Play"}
          </button>
          <button id="atmo-stop">
            <i class="fas fa-stop"></i> Stop
          </button>
        </div>

        <div class="atmo-section">
          <label>Volume</label>
          <input type="range" id="atmo-volume" min="0" max="1" step="0.05" value="${game.settings.get(MODULE_ID, "masterVolume")}">
        </div>

        <div class="atmo-section atmo-status">
          <div id="atmo-gen-status">${this.controller.generationStatus || "Idle"}</div>
          <div id="atmo-credits">Credits: ${this.controller.credits ?? "—"}</div>
        </div>
      </div>
    `);

    // Event listeners
    html.find("#atmo-select").on("change", (e) => {
      this.controller.setAtmosphere(e.target.value);
    });

    html.find("#atmo-mood").on("change", (e) => {
      this.controller.moodOverride = e.target.value || null;
    });

    html.find("#atmo-play").on("click", () => {
      this.controller.triggerGeneration();
    });

    html.find("#atmo-stop").on("click", () => {
      this.controller.stop();
      this.render();
    });

    html.find("#atmo-volume").on("input", (e) => {
      const v = parseFloat(e.target.value);
      this.controller.audioManager.setVolume(v);
      game.settings.set(MODULE_ID, "masterVolume", v);
    });

    return html;
  }

  updateStatus(status) {
    const el = document.getElementById("atmo-gen-status");
    if (el) el.textContent = status;
  }

  updateCredits(credits) {
    const el = document.getElementById("atmo-credits");
    if (el) el.textContent = `Credits: ${credits}`;
  }
}

/* ──────────────────────────── MAIN CONTROLLER ──────────────────────────── */

class AtmospheraController {
  constructor() {
    this.audioManager = new AudioManager();
    this.panel = null;
    this.currentAtmosphere = null;
    this.moodOverride = null;
    this.generationStatus = "Idle";
    this.credits = null;
    this._generating = false;
  }

  init() {
    this.audioManager.setVolume(game.settings.get(MODULE_ID, "masterVolume"));
  }

  openPanel() {
    if (!this.panel) {
      this.panel = new AtmospheraPanel(this);
    }
    this.panel.render(true);
    this._refreshCredits();
  }

  setAtmosphere(atmo) {
    this.currentAtmosphere = atmo;
    if (game.settings.get(MODULE_ID, "enabled")) {
      this.triggerGeneration();
    }
  }

  async triggerGeneration(optionsOverride = {}) {
    if (this._generating) return;
    if (!game.settings.get(MODULE_ID, "enabled")) return;

    this._generating = true;
    this._setStatus("Generating…");

    try {
      const atmosphere = optionsOverride.atmosphere || this.currentAtmosphere || game.settings.get(MODULE_ID, "defaultAtmosphere");
      const creatureTypes = optionsOverride.creatureTypes || (GameStateDetector.detectCombat() ? GameStateDetector.detectCreatureTypes() : []);
      const isBossFight = optionsOverride.isBossFight || false;
      const isVictory = optionsOverride.isVictory || false;
      const isDefeat = optionsOverride.isDefeat || false;

      const tagOptions = { atmosphere, creatureTypes, isBossFight, isVictory, isDefeat };
      let tags = GameStateDetector.mapToTags(tagOptions);

      // Append mood override
      if (this.moodOverride) {
        tags += `, ${this.moodOverride}`;
      }

      const title = GameStateDetector.buildTitle(tagOptions);
      const cacheKey = `${atmosphere}_${creatureTypes.sort().join("-")}_${isBossFight}_${this.moodOverride || ""}`;

      const track = await SunoClient.generateAndCache(tags, title, cacheKey);
      this._setStatus("Playing");

      const crossfade = game.settings.get(MODULE_ID, "crossfadeDuration");
      await this.audioManager.play(track.url, crossfade);

      if (this.panel) this.panel.render();
    } catch (err) {
      console.error(`${MODULE_ID} | Generation error:`, err);
      this._setStatus(`Error: ${err.message}`);
      ui.notifications.error(`Atmosphera: ${err.message}`);
    } finally {
      this._generating = false;
      this._refreshCredits();
    }
  }

  stop() {
    this.audioManager.stop();
    this._setStatus("Stopped");
  }

  _setStatus(status) {
    this.generationStatus = status;
    if (this.panel) this.panel.updateStatus(status);
  }

  async _refreshCredits() {
    try {
      const data = await SunoClient.getCredits();
      this.credits = data.credits_left ?? data.total_credits_left ?? "?";
      if (this.panel) this.panel.updateCredits(this.credits);
    } catch { /* silent */ }
  }
}

/* ──────────────────────────── HOOKS ──────────────────────────── */

Hooks.once("init", () => {
  registerSettings();
  console.log(`${MODULE_ID} | Initializing Atmosphera`);
});

Hooks.once("ready", () => {
  if (!game.user.isGM) return;

  const controller = new AtmospheraController();
  controller.init();

  // Expose API
  const moduleData = game.modules.get(MODULE_ID);
  if (moduleData) {
    moduleData.api = {
      controller,
      audioManager: controller.audioManager,
      play: (url) => controller.audioManager.play(url),
      stop: () => controller.stop(),
      setAtmosphere: (atmo) => controller.setAtmosphere(atmo),
      generate: (tags, title) => SunoClient.generate(tags, title),
      getCredits: () => SunoClient.getCredits(),
      openPanel: () => controller.openPanel(),
      CREATURE_TAG_MAP,
      ATMOSPHERE_TAG_MAP
    };
  }

  // Add control button
  Hooks.on("getSceneControlButtons", (controls) => {
    const tokenControls = controls.find(c => c.name === "token");
    if (tokenControls) {
      tokenControls.tools.push({
        name: "atmosphera",
        title: "Atmosphera — AI Music",
        icon: "fas fa-music",
        button: true,
        onClick: () => controller.openPanel()
      });
    }
  });

  // Combat hooks
  Hooks.on("combatStart", (combat) => {
    if (!game.settings.get(MODULE_ID, "autoDetectCombat")) return;
    console.log(`${MODULE_ID} | Combat started`);

    const creatureTypes = GameStateDetector.detectCreatureTypes();
    const bosses = combat.combatants.filter(c => c.actor && GameStateDetector.detectIsBoss(c.actor));
    const isBossFight = bosses.length > 0;

    controller.triggerGeneration({
      atmosphere: isBossFight ? "boss_fight" : "combat_generic",
      creatureTypes,
      isBossFight
    });
  });

  Hooks.on("combatEnd", () => {
    if (!game.settings.get(MODULE_ID, "autoDetectCombat")) return;
    console.log(`${MODULE_ID} | Combat ended`);
    controller.triggerGeneration({ atmosphere: "victory", isVictory: true });
  });

  Hooks.on("updateCombat", (combat, changed) => {
    if (!game.settings.get(MODULE_ID, "autoDetectCombat")) return;
    if (!("round" in changed)) return;

    // Re-evaluate creature types each round
    const creatureTypes = GameStateDetector.detectCreatureTypes();
    if (creatureTypes.length) {
      const bosses = combat.combatants.filter(c => c.actor && GameStateDetector.detectIsBoss(c.actor));
      controller.triggerGeneration({
        atmosphere: bosses.length ? "boss_fight" : "combat_generic",
        creatureTypes,
        isBossFight: bosses.length > 0
      });
    }
  });

  Hooks.on("updateActor", (actor, changed) => {
    if (!game.settings.get(MODULE_ID, "autoDetectHP")) return;
    if (!game.combat?.active) return;

    const hpChange = changed?.system?.attributes?.hp;
    if (!hpChange) return;

    const hpInfo = GameStateDetector.detectHPThreshold(actor);
    if (!hpInfo) return;

    if (hpInfo.belowThreshold && GameStateDetector.detectIsBoss(actor)) {
      console.log(`${MODULE_ID} | Boss HP critical: ${hpInfo.pct.toFixed(0)}%`);
      controller.triggerGeneration({
        atmosphere: "boss_fight",
        creatureTypes: GameStateDetector.detectCreatureTypes(),
        isBossFight: true
      });
    }

    // Check for party wipe
    const partyActors = game.actors.filter(a => a.hasPlayerOwner && a.system?.attributes?.hp);
    const allDown = partyActors.every(a => (a.system.attributes.hp.value || 0) <= 0);
    if (allDown && partyActors.length > 0) {
      controller.triggerGeneration({ atmosphere: "defeat", isDefeat: true });
    }
  });

  Hooks.on("canvasReady", () => {
    if (!game.settings.get(MODULE_ID, "enabled")) return;
    if (game.combat?.active) return; // Don't override combat music

    const defaultAtmo = game.settings.get(MODULE_ID, "defaultAtmosphere");
    controller.setAtmosphere(defaultAtmo);
  });

  ui.notifications.info("Atmosphera ready — click 🎵 in token controls to open panel.");
});
