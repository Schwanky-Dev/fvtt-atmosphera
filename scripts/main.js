/**
 * Atmosphera — AI-powered dynamic atmosphere music for FoundryVTT
 * v2.1 — Full audio lifecycle ownership. Enable, configure, forget.
 */

const MODULE_ID = "atmosphera";

/* ──────────────────────────── FALLBACK HINT MAPS ──────────────────────────── */

const CREATURE_HINTS = {
  aberration: "eerie dissonant alien otherworldly",
  beast: "primal nature tribal wild",
  celestial: "angelic radiant holy ethereal",
  construct: "mechanical industrial rhythmic metallic",
  dragon: "epic majestic brass fanfare soaring",
  elemental: "primal swirling raw energy elemental",
  fey: "whimsical enchanting celtic harp mystical",
  fiend: "dark infernal heavy demonic",
  giant: "thunderous deep drums massive earth-shaking",
  humanoid: "adventurous varied dynamic",
  monstrosity: "tense suspenseful lurking predatory",
  ooze: "bubbling ambient unsettling viscous",
  plant: "organic slow creeping overgrowth",
  undead: "haunting ghostly minor key spectral"
};

const SCENE_KEYWORD_HINTS = {
  tavern: "medieval tavern lute fiddle warm folk",
  inn: "medieval tavern cozy warm hearth",
  dungeon: "dark underground dungeon crawl dripping tension drones",
  cave: "dark underground cavern echoing dripping",
  crypt: "dark crypt tomb haunting cold stone",
  forest: "forest woodland nature birds rustling leaves",
  swamp: "murky swamp humid buzzing insects fog",
  marsh: "murky marsh wet fog oppressive",
  desert: "arid desert wind sand heat desolate",
  mountain: "mountain wind altitude epic vista",
  ocean: "ocean waves vast horizon salt wind",
  sea: "sea waves rolling water nautical",
  city: "bustling urban market lively cosmopolitan",
  town: "town quaint streets chatter",
  village: "village rustic peaceful pastoral",
  temple: "sacred reverb choir solemn holy",
  church: "sacred organ reverb solemn prayer",
  castle: "stone halls regal medieval grandeur",
  throne: "regal grand court nobility",
  feywild: "enchanted whimsical sparkling dreamy magical",
  shadowfell: "bleak melancholy hollow wind despair",
  underdark: "deep underground oppressive alien dark echo",
  underwater: "subaquatic deep muffled pressure ambient",
  library: "quiet contemplative scholarly dusty pages",
  graveyard: "somber eerie fog mournful",
  battlefield: "war-torn desolate aftermath wind",
  volcano: "rumbling heat fire molten danger",
  arctic: "frozen wind icy desolate cold",
  jungle: "dense tropical humid exotic birds"
};

const MOOD_PRESETS = {
  tension: "rising tension, suspenseful, uneasy, something lurking",
  calm: "peaceful, gentle, serene, soft ambient",
  mystery: "mysterious, curious, investigative, subtle intrigue",
  horror: "dread, creeping fear, unsettling, dissonant",
  triumph: "triumphant, victorious, celebratory, fanfare",
  sorrow: "melancholy, loss, mournful strings, somber",
  wonder: "awe-inspiring, discovery, magical, breathtaking",
  chase: "urgent, fast-paced, running, pursuit, adrenaline",
  stealth: "quiet, careful, tip-toe, held breath, minimal",
  epic: "grand, sweeping, orchestral, cinematic, powerful"
};

/* ──────────────────────────── RESOURCE THRESHOLDS ──────────────────────────── */

const RESOURCE_DESCRIPTORS = {
  fresh: { min: 0.75, prompt: "well-rested, prepared, confident" },
  moderate: { min: 0.40, prompt: null },
  low: { min: 0.15, prompt: "weary, strained, running low on resources" },
  critical: { min: 0, prompt: "exhausted, desperate, on the edge of defeat" }
};

const HP_DESCRIPTORS = {
  healthy: { min: 0.75, prompt: null },
  bloodied: { min: 0.25, prompt: "wounded" },
  critical: { min: 0, prompt: "near death, critical" }
};

function getDescriptor(pct, table) {
  for (const [, entry] of Object.entries(table)) {
    if (pct >= entry.min) return entry.prompt;
  }
  return null;
}

/* ──────────────────────────── SETTINGS ──────────────────────────── */

function registerSettings() {
  const s = (key, data) => game.settings.register(MODULE_ID, key, data);

  s("sunoApiUrl", {
    name: "Suno API URL",
    hint: "Base URL for the Suno API proxy (e.g. http://localhost:3000)",
    scope: "world", config: true, type: String, default: "http://localhost:3000"
  });

  s("sunoCookie", {
    name: "Suno Cookie",
    hint: "Your Suno session cookie for authentication.",
    scope: "world", config: true, type: String, default: ""
  });

  s("twoCaptchaKey", {
    name: "2Captcha API Key",
    hint: "API key for 2Captcha service (used to solve Suno captchas).",
    scope: "world", config: true, type: String, default: ""
  });

  s("masterVolume", {
    name: "Master Volume",
    hint: "Master volume for Atmosphera playback (0.0 – 1.0).",
    scope: "world", config: true, type: Number, default: 0.5,
    range: { min: 0, max: 1, step: 0.05 }
  });

  s("enabled", {
    name: "Enable Atmosphera",
    hint: "Master switch. When on, music plays automatically based on game state.",
    scope: "world", config: true, type: Boolean, default: true
  });

  s("crossfadeDuration", {
    name: "Crossfade Duration (ms)",
    hint: "Duration in milliseconds for crossfading between tracks.",
    scope: "world", config: true, type: Number, default: 3000,
    range: { min: 500, max: 10000, step: 500 }
  });

  s("autoDetect", {
    name: "Auto-Detect Game State",
    hint: "Automatically read combat, scene, HP, and resources to pick music.",
    scope: "world", config: true, type: Boolean, default: true
  });

  s("resourceTracking", {
    name: "Track Party Resources",
    hint: "Include spell slots, hit dice, and class resources in mood detection.",
    scope: "world", config: true, type: Boolean, default: true
  });

  s("promptPrefix", {
    name: "Prompt Style Prefix",
    hint: 'Prepend style preferences (e.g. "orchestral cinematic" or "dark ambient electronic").',
    scope: "world", config: true, type: String, default: ""
  });

  s("audioFolder", {
    name: "Audio Folder",
    hint: "Folder name under Data/ for saved Atmosphera tracks.",
    scope: "world", config: true, type: String, default: "atmosphera"
  });
}

/* ──────────────────────────── GAME STATE COLLECTOR ──────────────────────────── */

class GameStateCollector {

  static collect() {
    return {
      combat: this._collectCombat(),
      party: this._collectParty(),
      scene: this._collectScene()
    };
  }

  static _collectCombat() {
    const combat = game.combat;
    if (!combat?.active) return { active: false, round: 0, turn: 0, creatures: [], bosses: [], hasBoss: false, creatureTypes: [], crRange: null };

    const creatures = [];
    const bosses = [];

    for (const c of combat.combatants) {
      const actor = c.actor;
      if (!actor || actor.hasPlayerOwner) continue;

      const type = actor.system?.details?.type?.value?.toLowerCase() || "unknown";
      const cr = actor.system?.details?.cr ?? 0;
      const isBoss = (actor.system?.resources?.legact?.max > 0) || cr >= 10;

      creatures.push({ name: actor.name, type, cr, isBoss });
      if (isBoss) bosses.push({ name: actor.name, type, cr });
    }

    const creatureTypes = [...new Set(creatures.map(c => c.type).filter(t => t !== "unknown"))];
    const crValues = creatures.map(c => c.cr).filter(c => c > 0);
    const crRange = crValues.length ? { min: Math.min(...crValues), max: Math.max(...crValues) } : null;

    return { active: true, round: combat.round || 1, turn: combat.turn || 0, creatures, bosses, hasBoss: bosses.length > 0, creatureTypes, crRange };
  }

  static _collectParty() {
    const partyActors = game.actors?.filter(a => a.hasPlayerOwner && a.type === "character") || [];
    if (!partyActors.length) return { hpPct: 1, resourcePct: 1, count: 0, allDown: false };

    let totalHp = 0, totalMaxHp = 0;
    for (const a of partyActors) {
      const hp = a.system?.attributes?.hp;
      if (hp) { totalHp += hp.value || 0; totalMaxHp += hp.max || 0; }
    }
    const hpPct = totalMaxHp > 0 ? totalHp / totalMaxHp : 1;
    const allDown = partyActors.every(a => (a.system?.attributes?.hp?.value || 0) <= 0);

    let resourcePct = 1;
    if (game.settings.get(MODULE_ID, "resourceTracking")) {
      resourcePct = this._calcResourcePct(partyActors);
    }

    return { hpPct, resourcePct, count: partyActors.length, allDown };
  }

  static _calcResourcePct(actors) {
    let totalCurrent = 0, totalMax = 0;

    for (const actor of actors) {
      const sys = actor.system;
      if (!sys) continue;

      if (sys.spells) {
        for (let i = 1; i <= 9; i++) {
          const slot = sys.spells[`spell${i}`];
          if (slot && slot.max > 0) { totalCurrent += slot.value || 0; totalMax += slot.max; }
        }
      }

      const hitDiceStr = sys.details?.hitDice;
      if (hitDiceStr && typeof hitDiceStr === "string") {
        const match = hitDiceStr.match(/^(\d+)d\d+$/);
        if (match) {
          const remaining = parseInt(match[1]);
          const level = sys.details?.level || remaining;
          totalCurrent += remaining; totalMax += level;
        }
      }
      if (sys.attributes?.hd && typeof sys.attributes.hd === "object") {
        totalCurrent += sys.attributes.hd.value || 0;
        totalMax += sys.attributes.hd.max || 0;
      }

      for (const rKey of ["primary", "secondary", "tertiary"]) {
        const res = sys.resources?.[rKey];
        if (res && res.max > 0) { totalCurrent += res.value || 0; totalMax += res.max; }
      }
    }

    return totalMax > 0 ? totalCurrent / totalMax : 1;
  }

  static _collectScene() {
    const scene = canvas?.scene;
    if (!scene) return { name: "", darkness: 0, weather: null, keywords: [], environments: [], active: false };

    const name = scene.name || "";
    const darkness = scene.darkness ?? 0;
    const weather = scene.getFlag("core", "weather") || scene.weather || null;

    const environments = new Set();
    for (const token of scene.tokens || []) {
      const env = token.actor?.system?.details?.environment;
      if (env) environments.add(env.toLowerCase());
    }

    const keywords = [];
    const nameLower = name.toLowerCase();
    for (const kw of Object.keys(SCENE_KEYWORD_HINTS)) {
      if (nameLower.includes(kw)) keywords.push(kw);
    }

    return { name, darkness, weather, keywords, environments: [...environments], active: true };
  }
}

/* ──────────────────────────── PROMPT BUILDER ──────────────────────────── */

class PromptBuilder {

  static build(state, moodOverride = null) {
    const parts = [];
    const prefix = game.settings.get(MODULE_ID, "promptPrefix")?.trim();

    parts.push("instrumental");
    if (prefix) parts.push(prefix);

    if (moodOverride && moodOverride !== "auto") {
      const preset = MOOD_PRESETS[moodOverride];
      parts.push(preset || moodOverride);
    }

    const { combat, party, scene } = state;
    let category = "ambient";

    if (combat.active) {
      category = this._buildCombatCategory(combat);
      parts.push(this._buildCombatPrompt(combat));
    } else {
      category = this._buildAmbientCategory(scene);
      parts.push(this._buildAmbientPrompt(scene));
    }

    const hpDesc = getDescriptor(party.hpPct, HP_DESCRIPTORS);
    const resDesc = getDescriptor(party.resourcePct, RESOURCE_DESCRIPTORS);
    if (hpDesc) parts.push(`party ${hpDesc}`);
    if (resDesc) parts.push(resDesc);

    const prompt = parts.filter(Boolean).join(", ").replace(/,\s*,/g, ",").replace(/\s+/g, " ").trim();
    const title = this._buildTitle(combat, scene);

    return { prompt, category, title };
  }

  static _buildCombatPrompt(combat) {
    const parts = [];
    if (combat.hasBoss) {
      parts.push("epic boss battle music, climactic, orchestral, choir");
      parts.push(`fighting ${combat.bosses.map(b => b.name).join(" and ")}`);
    } else {
      parts.push("intense combat music, battle, percussion, adrenaline");
    }
    for (const type of combat.creatureTypes.slice(0, 3)) {
      parts.push(`fighting ${type}`);
      if (CREATURE_HINTS[type]) parts.push(CREATURE_HINTS[type]);
    }
    if (combat.crRange) {
      if (combat.crRange.max >= 15) parts.push("extremely dangerous, legendary threat");
      else if (combat.crRange.max >= 10) parts.push("powerful enemies, high stakes");
      else if (combat.crRange.max >= 5) parts.push("challenging foes");
    }
    return parts.join(", ");
  }

  static _buildCombatCategory(combat) {
    const types = combat.creatureTypes.slice(0, 2).join("-") || "generic";
    if (combat.hasBoss) return `boss-${combat.bosses[0]?.type || "unknown"}`;
    return `combat-${types}`;
  }

  static _buildAmbientPrompt(scene) {
    const parts = [];
    if (scene.keywords.length) {
      parts.push("background music");
      for (const kw of scene.keywords.slice(0, 3)) {
        if (SCENE_KEYWORD_HINTS[kw]) parts.push(SCENE_KEYWORD_HINTS[kw]);
      }
    } else if (scene.name) {
      parts.push(`background music, ${scene.name.toLowerCase()} atmosphere`);
    } else {
      parts.push("peaceful ambient background music, gentle exploration");
    }
    if (scene.darkness > 0.7) parts.push("dark, torchlit, shadows");
    else if (scene.darkness > 0.4) parts.push("dim, moody lighting");
    if (scene.weather) parts.push(`${scene.weather} weather`);
    for (const env of (scene.environments || []).slice(0, 2)) parts.push(env);
    return parts.join(", ");
  }

  static _buildAmbientCategory(scene) {
    if (scene.keywords.length) return `ambient-${scene.keywords[0]}`;
    if (scene.name) return `ambient-${scene.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`;
    return "ambient-general";
  }

  static _buildTitle(combat, scene) {
    const parts = ["Atmosphera"];
    if (combat.active) {
      parts.push(combat.hasBoss ? "Boss Battle" : "Combat");
      if (combat.creatureTypes[0]) parts.push(`(${combat.creatureTypes[0]})`);
    } else {
      parts.push(scene.name || "Ambient");
    }
    return parts.join(" — ");
  }

  static buildSting(type) {
    const stings = {
      victory: { prompt: "instrumental, triumphant victory fanfare, celebratory, brass, short", category: "sting-victory", title: "Atmosphera — Victory" },
      defeat: { prompt: "instrumental, somber defeat, loss, mournful strings, fading hope, short", category: "sting-defeat", title: "Atmosphera — Defeat" }
    };
    return stings[type] || stings.victory;
  }
}

/* ──────────────────────────── SUNO CLIENT ──────────────────────────── */

class SunoClient {
  static _baseUrl() {
    return game.settings.get(MODULE_ID, "sunoApiUrl").replace(/\/+$/, "");
  }

  static _headers() {
    return { "Content-Type": "application/json", Cookie: game.settings.get(MODULE_ID, "sunoCookie") };
  }

  static async generate(prompt, title) {
    const resp = await fetch(`${this._baseUrl()}/api/generate`, {
      method: "POST", headers: this._headers(),
      body: JSON.stringify({ prompt: "", tags: prompt, title, make_instrumental: true, wait_audio: false })
    });
    if (!resp.ok) throw new Error(`Suno generate failed: ${resp.status}`);
    return resp.json();
  }

  static async poll(ids) {
    const query = Array.isArray(ids) ? ids.join(",") : ids;
    const resp = await fetch(`${this._baseUrl()}/api/get?ids=${query}`, { headers: this._headers() });
    if (!resp.ok) throw new Error(`Suno poll failed: ${resp.status}`);
    return resp.json();
  }

  static async getCredits() {
    const resp = await fetch(`${this._baseUrl()}/api/get_limit`, { headers: this._headers() });
    if (!resp.ok) throw new Error(`Suno credits failed: ${resp.status}`);
    return resp.json();
  }

  static async generateAndWait(prompt, title) {
    console.log(`${MODULE_ID} | Generating: "${title}" — ${prompt}`);
    const genResult = await this.generate(prompt, title);
    const ids = genResult.map(r => r.id);

    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const status = await this.poll(ids);
      const done = status.filter(s => s.status === "complete");
      if (done.length > 0) {
        const track = done[0];
        return { id: track.id, url: track.audio_url, title: track.title, tags: track.metadata?.tags || prompt, duration: track.metadata?.duration };
      }
      if (status.every(s => s.status === "error")) throw new Error("All Suno generations failed");
    }
    throw new Error("Suno generation timed out");
  }
}

/* ──────────────────────────── PLAYLIST CACHE MANAGER ──────────────────────────── */

class PlaylistCacheManager {
  static PLAYLIST_PREFIX = "Atmosphera";

  static findCached(category) {
    const playlistName = this._playlistName(category);
    const playlist = game.playlists?.find(p => p.name === playlistName);
    if (!playlist || !playlist.sounds.size) return null;

    const sounds = [...playlist.sounds];
    const sound = sounds[Math.floor(Math.random() * sounds.length)];
    return { playlist, sound, url: sound.path };
  }

  static async saveTrack(category, track) {
    const folder = game.settings.get(MODULE_ID, "audioFolder") || "atmosphera";
    const subFolder = category.replace(/[^a-z0-9-]/gi, "-");
    const dirPath = `${folder}/${subFolder}`;

    try { await FilePicker.browse("data", dirPath); } catch {
      try { await FilePicker.browse("data", folder); } catch { await FilePicker.createDirectory("data", folder); }
      await FilePicker.createDirectory("data", dirPath);
    }

    const filename = `${track.id}.mp3`;
    let filePath;
    try {
      const audioResp = await fetch(track.url);
      if (!audioResp.ok) throw new Error(`Download failed: ${audioResp.status}`);
      const blob = await audioResp.blob();
      const file = new File([blob], filename, { type: "audio/mpeg" });
      const uploadResult = await FilePicker.upload("data", dirPath, file);
      filePath = uploadResult.path;
    } catch (e) {
      console.warn(`${MODULE_ID} | Failed to download/upload track, using remote URL`, e);
      filePath = track.url;
    }

    const playlistName = this._playlistName(category);
    let playlist = game.playlists?.find(p => p.name === playlistName);
    if (!playlist) {
      playlist = await Playlist.create({
        name: playlistName, mode: CONST.PLAYLIST_MODES.SEQUENTIAL,
        description: `Auto-generated by Atmosphera for "${category}"`, playing: false
      });
    }

    await playlist.createEmbeddedDocuments("PlaylistSound", [{
      name: track.title || `${category} — ${track.id}`,
      path: filePath, volume: 0.8, repeat: true
    }]);

    return filePath;
  }

  /** Get cached track or generate + save. Returns playable URL/path. */
  static async getOrGenerate(prompt, title, category, statusCb) {
    const cached = this.findCached(category);
    if (cached) {
      console.log(`${MODULE_ID} | Playlist cache hit: ${category}`);
      statusCb?.("Playing (cached)");
      return cached.url;
    }

    statusCb?.("Generating…");
    const track = await SunoClient.generateAndWait(prompt, title);
    statusCb?.("Downloading…");
    return this.saveTrack(category, track);
  }

  /**
   * Pre-generate a track in the background. Resolves silently; errors are logged.
   * Returns a promise that resolves to the file path, or null on failure.
   */
  static async preload(prompt, title, category) {
    if (this.findCached(category)) return; // Already have it
    try {
      console.log(`${MODULE_ID} | Preloading: ${category}`);
      const track = await SunoClient.generateAndWait(prompt, title);
      await this.saveTrack(category, track);
      console.log(`${MODULE_ID} | Preloaded: ${category}`);
    } catch (e) {
      console.warn(`${MODULE_ID} | Preload failed for ${category}:`, e);
    }
  }

  static _playlistName(category) {
    const parts = category.split("-");
    const type = (parts[0] || "misc").replace(/^\w/, c => c.toUpperCase());
    const detail = parts.slice(1).join(" ").replace(/^\w/, c => c.toUpperCase()) || "";
    return detail ? `${this.PLAYLIST_PREFIX} — ${type} (${detail})` : `${this.PLAYLIST_PREFIX} — ${type}`;
  }
}

/* ──────────────────────────── AUDIO MANAGER (A/B Crossfade) ──────────────────────────── */

class AudioManager {
  constructor() {
    this.deckA = null;
    this.deckB = null;
    this.activeDeck = "A";
    this.volume = 0.5;
    this._fadeInterval = null;
    this.currentUrl = null;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    const active = this.activeDeck === "A" ? this.deckA : this.deckB;
    if (active) active.volume = this.volume;
  }

  async play(url, crossfadeDuration = 3000) {
    this.currentUrl = url;
    const incoming = new Audio(url);
    incoming.crossOrigin = "anonymous";
    incoming.volume = 0;
    incoming.loop = true;

    const outgoing = this.activeDeck === "A" ? this.deckA : this.deckB;

    if (this.activeDeck === "A") { this.deckB = incoming; this.activeDeck = "B"; }
    else { this.deckA = incoming; this.activeDeck = "A"; }

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
        if (outgoing) { outgoing.pause(); outgoing.src = ""; }
      }
    }, stepTime);
  }

  stop(fadeDuration = 1000) {
    const active = this.activeDeck === "A" ? this.deckA : this.deckB;
    if (active) this._crossfade(active, null, fadeDuration);
    this.deckA = null;
    this.deckB = null;
    this.currentUrl = null;
  }

  get isPlaying() {
    const d = this.activeDeck === "A" ? this.deckA : this.deckB;
    return d ? !d.paused : false;
  }
}

/* ──────────────────────────── CONTROL PANEL ──────────────────────────── */

class AtmospheraPanel extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "atmosphera-panel",
      title: "🎵 Atmosphera",
      template: undefined,
      popOut: true,
      width: 360,
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
    const c = this.controller;
    const isAuto = c.autoMode;
    const isPlaying = c.audioManager.isPlaying;
    const manualMood = c.manualMood;
    const enabled = game.settings.get(MODULE_ID, "enabled");

    const moodOptions = Object.keys(MOOD_PRESETS).map(k =>
      `<option value="${k}" ${manualMood === k ? "selected" : ""}>${k.replace(/^\w/, ch => ch.toUpperCase())}</option>`
    ).join("");

    const preloadStatus = c._preloadStatus
      ? `<div class="atmo-preload-status">⏳ Preloading: ${c._preloadStatus}</div>` : "";

    const html = $(`
      <div class="atmosphera-controls">
        <div class="atmo-section">
          <label>Master</label>
          <div class="atmo-mode-toggle">
            <button id="atmo-enabled-toggle" class="${enabled ? "active" : ""}" title="Master on/off — music plays automatically when enabled">
              ${enabled ? "🔊 Enabled" : "🔇 Disabled"}
            </button>
            <button id="atmo-auto-toggle" class="${isAuto ? "active" : ""}" title="${isAuto ? "Auto mode — reads game state" : "Manual — GM override active"}">
              ${isAuto ? "🔄 Auto" : "🔒 Manual"}
            </button>
          </div>
          ${!isAuto && manualMood ? `<span class="atmo-manual-indicator">🔒 Manual — ${manualMood}</span>` : ""}
        </div>

        <div class="atmo-section">
          <label>Mood Override</label>
          <select id="atmo-mood-select">
            <option value="">— Select Mood —</option>
            ${moodOptions}
          </select>
        </div>

        <div class="atmo-section">
          <label>Current Prompt</label>
          <textarea id="atmo-prompt-display" rows="3" style="width:100%;font-size:11px;resize:vertical;">${c.currentPrompt || "(none)"}</textarea>
        </div>

        <div class="atmo-section atmo-buttons">
          <button id="atmo-play" class="${isPlaying ? "active" : ""}">
            <i class="fas fa-play"></i> ${isPlaying ? "Playing" : "Generate & Play"}
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
          <div id="atmo-gen-status">${c.generationStatus || "Idle"}</div>
          <div id="atmo-credits">Credits: ${c.credits ?? "—"}</div>
          <div id="atmo-track-info">${c.currentTrackInfo || ""}</div>
          ${preloadStatus}
        </div>
      </div>
    `);

    // Events
    html.find("#atmo-enabled-toggle").on("click", () => {
      const newVal = !game.settings.get(MODULE_ID, "enabled");
      game.settings.set(MODULE_ID, "enabled", newVal);
      if (newVal) {
        c.evaluateAndPlay(true);
      } else {
        c.stop();
      }
      setTimeout(() => this.render(), 100);
    });

    html.find("#atmo-auto-toggle").on("click", () => {
      c.autoMode = !c.autoMode;
      if (c.autoMode) { c.manualMood = null; c.evaluateAndPlay(true); }
      this.render();
    });

    html.find("#atmo-mood-select").on("change", (e) => {
      if (e.target.value) c.setMood(e.target.value);
    });

    html.find("#atmo-play").on("click", () => {
      c.triggerGeneration(html.find("#atmo-prompt-display").val());
    });

    html.find("#atmo-stop").on("click", () => { c.stop(); this.render(); });

    html.find("#atmo-volume").on("input", (e) => {
      const v = parseFloat(e.target.value);
      c.audioManager.setVolume(v);
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

  updatePrompt(prompt) {
    const el = document.getElementById("atmo-prompt-display");
    if (el && document.activeElement !== el) el.value = prompt;
  }

  updateTrackInfo(info) {
    const el = document.getElementById("atmo-track-info");
    if (el) el.textContent = info;
  }
}

/* ──────────────────────────── MAIN CONTROLLER ──────────────────────────── */

class AtmospheraController {
  constructor() {
    this.audioManager = new AudioManager();
    this.panel = null;
    this.autoMode = true;
    this.manualMood = null;
    this.currentPrompt = "";
    this.currentCategory = "";
    this.generationStatus = "Idle";
    this.credits = null;
    this.currentTrackInfo = "";
    this._generating = false;
    this._lastCategory = null;
    this._preloadStatus = null;
    this._preloadPromises = new Map(); // category -> Promise
    this._stingSavedCategory = null;   // category to revert to after sting
  }

  init() {
    this.audioManager.setVolume(game.settings.get(MODULE_ID, "masterVolume"));
  }

  openPanel() {
    if (!this.panel) this.panel = new AtmospheraPanel(this);
    this.panel.render(true);
    this._refreshCredits();
  }

  /** Set a mood (from macro or panel). Switches to manual mode. */
  setMood(mood) {
    if (mood === "auto") {
      this.autoMode = true;
      this.manualMood = null;
    } else {
      this.autoMode = false;
      this.manualMood = mood;
    }
    this.evaluateAndPlay(true);
    if (this.panel) this.panel.render();
  }

  /**
   * Core evaluation loop: collect state → build prompt → play if changed.
   * This is the heartbeat of the entire system.
   */
  evaluateAndPlay(force = false) {
    if (!game.settings.get(MODULE_ID, "enabled")) return;

    const state = GameStateCollector.collect();
    const { prompt, category, title } = PromptBuilder.build(state, this.manualMood);

    this.currentPrompt = prompt;
    this.currentCategory = category;
    if (this.panel) this.panel.updatePrompt(prompt);

    // Skip generation if same category is already playing (unless forced)
    if (!force && category === this._lastCategory && this.audioManager.isPlaying) return;

    this._lastCategory = category;
    this._doGenerate(prompt, title, category);
  }

  /** Trigger generation with a specific prompt string (from panel edit) */
  triggerGeneration(customPrompt) {
    const prompt = customPrompt || this.currentPrompt;
    this._doGenerate(prompt, `Atmosphera — Custom`, this.currentCategory || "custom");
  }

  async _doGenerate(prompt, title, category) {
    if (this._generating) return;
    this._generating = true;

    try {
      const url = await PlaylistCacheManager.getOrGenerate(prompt, title, category, (s) => this._setStatus(s));

      this._setStatus("Playing");
      this.currentTrackInfo = category;
      if (this.panel) this.panel.updateTrackInfo(this.currentTrackInfo);

      const crossfade = game.settings.get(MODULE_ID, "crossfadeDuration");
      await this.audioManager.play(url, crossfade);

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

  /**
   * Preload tracks in the background (fire-and-forget).
   * Used to pre-generate victory/defeat stings when combat starts.
   */
  preload(categories) {
    for (const cat of categories) {
      if (this._preloadPromises.has(cat)) continue; // Already preloading
      if (PlaylistCacheManager.findCached(cat)) continue; // Already cached

      const { prompt, title } = PromptBuilder.buildSting(cat.replace("sting-", ""));
      this._preloadStatus = cat;
      if (this.panel) this.panel.render();

      const p = PlaylistCacheManager.preload(prompt, title, cat).finally(() => {
        this._preloadPromises.delete(cat);
        if (this._preloadPromises.size === 0) {
          this._preloadStatus = null;
          if (this.panel) this.panel.render();
        }
      });
      this._preloadPromises.set(cat, p);
    }
  }

  /** Play a victory/defeat sting, then crossfade back to ambient */
  async playSting(type) {
    const { prompt, category, title } = PromptBuilder.buildSting(type);
    this.currentPrompt = prompt;
    if (this.panel) this.panel.updatePrompt(prompt);

    // Remember what to revert to
    this._stingSavedCategory = this._lastCategory;
    this._lastCategory = category;

    await this._doGenerate(prompt, title, category);

    // Revert to ambient after sting plays (~30s)
    setTimeout(() => {
      if (this.autoMode && !game.combat?.active) {
        this._lastCategory = null;
        this.evaluateAndPlay(true);
      }
    }, 30000);
  }

  stop() {
    this.audioManager.stop();
    this._setStatus("Stopped");
    this._lastCategory = null;
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

/* ──────────────────────────── HOOKS — FULL LIFECYCLE ──────────────────────────── */

Hooks.once("init", () => {
  registerSettings();
  console.log(`${MODULE_ID} | Initializing Atmosphera v2.1`);
});

Hooks.once("ready", () => {
  if (!game.user.isGM) return;

  const controller = new AtmospheraController();
  controller.init();

  // ── Expose API ──
  const moduleData = game.modules.get(MODULE_ID);
  if (moduleData) {
    moduleData.api = {
      controller,
      audioManager: controller.audioManager,
      setMood: (mood) => controller.setMood(mood),
      play: (url) => controller.audioManager.play(url),
      stop: () => controller.stop(),
      openPanel: () => controller.openPanel(),
      getCredits: () => SunoClient.getCredits(),
      evaluate: () => controller.evaluateAndPlay(true),
      CREATURE_HINTS, SCENE_KEYWORD_HINTS, MOOD_PRESETS
    };
  }

  // ── Scene control button ──
  Hooks.on("getSceneControlButtons", (controls) => {
    const tokenControls = controls.find(c => c.name === "token");
    if (tokenControls) {
      tokenControls.tools.push({
        name: "atmosphera", title: "Atmosphera — AI Music",
        icon: "fas fa-music", button: true,
        onClick: () => controller.openPanel()
      });
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  AUTO-START: Begin playing as soon as the world is ready
  //  The GM enables the module and forgets about it.
  // ════════════════════════════════════════════════════════════════

  if (game.settings.get(MODULE_ID, "enabled")) {
    // Short delay to let canvas finish initializing
    setTimeout(() => {
      console.log(`${MODULE_ID} | Auto-starting on world ready`);
      controller.evaluateAndPlay(true);
    }, 2000);
  }

  // ════════════════════════════════════════════════════════════════
  //  SCENE TRANSITIONS: Crossfade to new ambient on scene change
  // ════════════════════════════════════════════════════════════════

  Hooks.on("canvasReady", () => {
    if (!game.settings.get(MODULE_ID, "enabled")) return;
    if (!controller.autoMode) return;
    // If combat is active, combat hooks own the music
    if (game.combat?.active) return;
    console.log(`${MODULE_ID} | Scene activated — evaluating ambient`);
    controller._lastCategory = null; // Force new evaluation
    controller.evaluateAndPlay(true);
  });

  // ════════════════════════════════════════════════════════════════
  //  COMBAT LIFECYCLE: Seamless combat ↔ ambient transitions
  // ════════════════════════════════════════════════════════════════

  Hooks.on("combatStart", () => {
    if (!game.settings.get(MODULE_ID, "enabled")) return;
    if (!controller.autoMode) return;
    console.log(`${MODULE_ID} | Combat started — switching to combat music`);
    controller.evaluateAndPlay(true);

    // Preload victory/defeat stings in background so transitions are instant
    controller.preload(["sting-victory", "sting-defeat"]);
  });

  Hooks.on("updateCombat", (combat, changed) => {
    if (!game.settings.get(MODULE_ID, "enabled")) return;
    if (!controller.autoMode) return;
    if (!("round" in changed)) return;
    // Re-evaluate each round (new creatures may have appeared, HP changed)
    controller.evaluateAndPlay();
  });

  Hooks.on("combatEnd", () => {
    if (!game.settings.get(MODULE_ID, "enabled")) return;
    if (!controller.autoMode) return;
    console.log(`${MODULE_ID} | Combat ended`);

    const party = GameStateCollector._collectParty();
    controller.playSting(party.allDown ? "defeat" : "victory");
  });

  Hooks.on("deleteCombat", () => {
    if (!game.settings.get(MODULE_ID, "enabled")) return;
    if (!controller.autoMode) return;
    console.log(`${MODULE_ID} | Combat deleted — reverting to ambient`);
    controller._lastCategory = null;
    controller.evaluateAndPlay(true);
  });

  // ════════════════════════════════════════════════════════════════
  //  LIVE UPDATES: React to HP / resource changes mid-combat
  // ════════════════════════════════════════════════════════════════

  Hooks.on("updateActor", (actor, changed) => {
    if (!game.settings.get(MODULE_ID, "enabled")) return;
    if (!controller.autoMode) return;
    if (!game.combat?.active) return;

    const hpChanged = changed?.system?.attributes?.hp;
    const spellsChanged = changed?.system?.spells;
    const resourcesChanged = changed?.system?.resources;

    if (hpChanged || spellsChanged || resourcesChanged) {
      // Debounce: many updates can fire in rapid succession
      clearTimeout(controller._updateActorTimer);
      controller._updateActorTimer = setTimeout(() => {
        controller.evaluateAndPlay();
      }, 500);
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  PAUSE / UNPAUSE: Stop music when game is paused
  // ════════════════════════════════════════════════════════════════

  Hooks.on("pauseGame", (paused) => {
    if (!game.settings.get(MODULE_ID, "enabled")) return;
    if (paused) {
      console.log(`${MODULE_ID} | Game paused — fading out`);
      controller.audioManager.stop(2000);
      controller._setStatus("Paused");
    } else {
      console.log(`${MODULE_ID} | Game unpaused — resuming`);
      controller._lastCategory = null;
      controller.evaluateAndPlay(true);
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  SETTING CHANGES: React to enabled toggle without reload
  // ════════════════════════════════════════════════════════════════

  Hooks.on("updateSetting", (setting) => {
    if (setting.key !== `${MODULE_ID}.enabled`) return;
    const enabled = game.settings.get(MODULE_ID, "enabled");
    if (enabled) {
      console.log(`${MODULE_ID} | Enabled — starting playback`);
      controller._lastCategory = null;
      controller.evaluateAndPlay(true);
    } else {
      console.log(`${MODULE_ID} | Disabled — stopping`);
      controller.stop();
    }
  });

  ui.notifications.info("Atmosphera v2.1 ready — music will play automatically.");
});
