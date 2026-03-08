/**
 * Atmosphera — AI-powered dynamic atmosphere music for FoundryVTT
 * v2.0 — Dynamic prompt construction with Foundry playlist integration
 */

const MODULE_ID = "atmosphera";

/* ──────────────────────────── FALLBACK HINT MAPS ──────────────────────────── */
// These are NOT the primary system — they enrich dynamically built prompts with flavor words.

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
    hint: "Toggle automatic atmosphere music generation.",
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

  /** Collect everything about the current game state */
  static collect() {
    return {
      combat: this._collectCombat(),
      party: this._collectParty(),
      scene: this._collectScene()
    };
  }

  static _collectCombat() {
    const combat = game.combat;
    if (!combat?.active) return { active: false, round: 0, turn: 0, creatures: [], bosses: [], hasBoss: false };

    const creatures = [];
    const bosses = [];

    for (const c of combat.combatants) {
      const actor = c.actor;
      if (!actor) continue;
      // Skip player-owned
      if (actor.hasPlayerOwner) continue;

      const type = actor.system?.details?.type?.value?.toLowerCase() || "unknown";
      const cr = actor.system?.details?.cr ?? 0;
      const isBoss = (actor.system?.resources?.legact?.max > 0) || cr >= 10;

      creatures.push({ name: actor.name, type, cr, isBoss });
      if (isBoss) bosses.push({ name: actor.name, type, cr });
    }

    const creatureTypes = [...new Set(creatures.map(c => c.type).filter(t => t !== "unknown"))];
    const crValues = creatures.map(c => c.cr).filter(c => c > 0);
    const crRange = crValues.length ? { min: Math.min(...crValues), max: Math.max(...crValues) } : null;

    return {
      active: true,
      round: combat.round || 1,
      turn: combat.turn || 0,
      creatures,
      bosses,
      hasBoss: bosses.length > 0,
      creatureTypes,
      crRange
    };
  }

  static _collectParty() {
    const partyActors = game.actors?.filter(a => a.hasPlayerOwner && a.type === "character") || [];
    if (!partyActors.length) return { hpPct: 1, resourcePct: 1, count: 0 };

    // HP
    let totalHp = 0, totalMaxHp = 0;
    for (const a of partyActors) {
      const hp = a.system?.attributes?.hp;
      if (hp) {
        totalHp += hp.value || 0;
        totalMaxHp += hp.max || 0;
      }
    }
    const hpPct = totalMaxHp > 0 ? totalHp / totalMaxHp : 1;

    // Resources
    let resourcePct = 1;
    if (game.settings.get(MODULE_ID, "resourceTracking")) {
      resourcePct = this._calcResourcePct(partyActors);
    }

    return { hpPct, resourcePct, count: partyActors.length };
  }

  static _calcResourcePct(actors) {
    let totalCurrent = 0, totalMax = 0;

    for (const actor of actors) {
      const sys = actor.system;
      if (!sys) continue;

      // Spell slots (spell1 through spell9)
      if (sys.spells) {
        for (let i = 1; i <= 9; i++) {
          const slot = sys.spells[`spell${i}`];
          if (slot && slot.max > 0) {
            totalCurrent += slot.value || 0;
            totalMax += slot.max;
          }
        }
      }

      // Hit dice — parse "3d10" format, compare to class level
      const hitDiceStr = sys.details?.hitDice;
      if (hitDiceStr && typeof hitDiceStr === "string") {
        const match = hitDiceStr.match(/^(\d+)d\d+$/);
        if (match) {
          const remaining = parseInt(match[1]);
          // Class level as max hit dice
          const level = sys.details?.level || remaining;
          totalCurrent += remaining;
          totalMax += level;
        }
      }
      // Fallback: if hitDice is on classes
      if (sys.attributes?.hd) {
        const hd = sys.attributes.hd;
        if (typeof hd === "object") {
          // v3+ format
          totalCurrent += hd.value || 0;
          totalMax += hd.max || 0;
        }
      }

      // Class resources (primary, secondary, tertiary)
      for (const rKey of ["primary", "secondary", "tertiary"]) {
        const res = sys.resources?.[rKey];
        if (res && res.max > 0) {
          totalCurrent += res.value || 0;
          totalMax += res.max;
        }
      }
    }

    return totalMax > 0 ? totalCurrent / totalMax : 1;
  }

  static _collectScene() {
    const scene = canvas?.scene;
    if (!scene) return { name: "", darkness: 0, weather: null, keywords: [] };

    const name = scene.name || "";
    const darkness = scene.darkness ?? 0;
    const weather = scene.getFlag("core", "weather") || scene.weather || null;

    // Extract environment tags from actors in scene
    const environments = new Set();
    for (const token of scene.tokens || []) {
      const env = token.actor?.system?.details?.environment;
      if (env) environments.add(env.toLowerCase());
    }

    // Extract keywords from scene name
    const keywords = [];
    const nameLower = name.toLowerCase();
    for (const kw of Object.keys(SCENE_KEYWORD_HINTS)) {
      if (nameLower.includes(kw)) keywords.push(kw);
    }

    return { name, darkness, weather, keywords, environments: [...environments] };
  }
}

/* ──────────────────────────── PROMPT BUILDER ──────────────────────────── */

class PromptBuilder {

  /**
   * Build a natural language prompt from game state.
   * Returns { prompt: string, category: string, title: string }
   */
  static build(state, moodOverride = null) {
    const parts = [];
    const prefix = game.settings.get(MODULE_ID, "promptPrefix")?.trim();

    // Always instrumental
    parts.push("instrumental");

    // Style prefix from settings
    if (prefix) parts.push(prefix);

    // Mood override takes priority for flavor
    if (moodOverride && moodOverride !== "auto") {
      const preset = MOOD_PRESETS[moodOverride];
      if (preset) {
        parts.push(preset);
      } else {
        parts.push(moodOverride);
      }
    }

    const { combat, party, scene } = state;
    let category = "ambient";

    if (combat.active) {
      // Combat prompt
      category = this._buildCombatCategory(combat);
      parts.push(this._buildCombatPrompt(combat));
    } else {
      // Ambient / exploration prompt
      category = this._buildAmbientCategory(scene);
      parts.push(this._buildAmbientPrompt(scene));
    }

    // Party condition
    const hpDesc = getDescriptor(party.hpPct, HP_DESCRIPTORS);
    const resDesc = getDescriptor(party.resourcePct, RESOURCE_DESCRIPTORS);
    if (hpDesc) parts.push(`party ${hpDesc}`);
    if (resDesc) parts.push(resDesc);

    // Combine and clean
    const prompt = parts.filter(Boolean).join(", ").replace(/,\s*,/g, ",").replace(/\s+/g, " ").trim();
    const title = this._buildTitle(combat, scene, category);

    return { prompt, category, title };
  }

  static _buildCombatPrompt(combat) {
    const parts = [];

    if (combat.hasBoss) {
      parts.push("epic boss battle music, climactic, orchestral, choir");
      const bossNames = combat.bosses.map(b => b.name).join(" and ");
      parts.push(`fighting ${bossNames}`);
    } else {
      parts.push("intense combat music, battle, percussion, adrenaline");
    }

    // Creature flavor
    for (const type of combat.creatureTypes.slice(0, 3)) {
      parts.push(`fighting ${type}`);
      if (CREATURE_HINTS[type]) parts.push(CREATURE_HINTS[type]);
    }

    // CR-based intensity
    if (combat.crRange) {
      if (combat.crRange.max >= 15) parts.push("extremely dangerous, legendary threat");
      else if (combat.crRange.max >= 10) parts.push("powerful enemies, high stakes");
      else if (combat.crRange.max >= 5) parts.push("challenging foes");
    }

    return parts.join(", ");
  }

  static _buildCombatCategory(combat) {
    const types = combat.creatureTypes.slice(0, 2).join("-") || "generic";
    if (combat.hasBoss) {
      const bossType = combat.bosses[0]?.type || "unknown";
      return `boss-${bossType}`;
    }
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

    // Darkness
    if (scene.darkness > 0.7) parts.push("dark, torchlit, shadows");
    else if (scene.darkness > 0.4) parts.push("dim, moody lighting");

    // Weather
    if (scene.weather) parts.push(`${scene.weather} weather`);

    // Environment tags from actors
    for (const env of (scene.environments || []).slice(0, 2)) {
      parts.push(env);
    }

    return parts.join(", ");
  }

  static _buildAmbientCategory(scene) {
    if (scene.keywords.length) return `ambient-${scene.keywords[0]}`;
    if (scene.name) return `ambient-${scene.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`;
    return "ambient-general";
  }

  static _buildTitle(combat, scene, category) {
    const parts = ["Atmosphera"];
    if (combat.active) {
      parts.push(combat.hasBoss ? "Boss Battle" : "Combat");
      if (combat.creatureTypes[0]) parts.push(`(${combat.creatureTypes[0]})`);
    } else {
      parts.push(scene.name || "Ambient");
    }
    return parts.join(" — ");
  }

  /** Build a victory/defeat sting prompt */
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
    return {
      "Content-Type": "application/json",
      Cookie: game.settings.get(MODULE_ID, "sunoCookie")
    };
  }

  static async generate(prompt, title) {
    const resp = await fetch(`${this._baseUrl()}/api/generate`, {
      method: "POST",
      headers: this._headers(),
      body: JSON.stringify({
        prompt: "",
        tags: prompt,
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

  /** Generate, poll until complete, return track data */
  static async generateAndWait(prompt, title) {
    console.log(`${MODULE_ID} | Generating: "${title}" — ${prompt}`);
    const genResult = await this.generate(prompt, title);
    const ids = genResult.map(r => r.id);

    const maxAttempts = 60;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const status = await this.poll(ids);
      const done = status.filter(s => s.status === "complete");
      if (done.length > 0) {
        const track = done[0];
        return {
          id: track.id,
          url: track.audio_url,
          title: track.title,
          tags: track.metadata?.tags || prompt,
          duration: track.metadata?.duration
        };
      }
      if (status.every(s => s.status === "error")) {
        throw new Error("All Suno generations failed");
      }
    }
    throw new Error("Suno generation timed out");
  }
}

/* ──────────────────────────── PLAYLIST CACHE MANAGER ──────────────────────────── */

class PlaylistCacheManager {
  static PLAYLIST_PREFIX = "Atmosphera";

  /**
   * Look up an existing Atmosphera playlist + sound for the given category.
   * Returns { playlist, sound, url } or null.
   */
  static findCached(category) {
    const playlistName = this._playlistName(category);
    const playlist = game.playlists?.find(p => p.name === playlistName);
    if (!playlist || !playlist.sounds.size) return null;

    // Pick a random sound from the playlist for variety
    const sounds = [...playlist.sounds];
    const sound = sounds[Math.floor(Math.random() * sounds.length)];
    return { playlist, sound, url: sound.path };
  }

  /**
   * Download a Suno track, upload to Foundry, create/update playlist.
   * Returns the PlaylistSound path.
   */
  static async saveTrack(category, track) {
    const folder = game.settings.get(MODULE_ID, "audioFolder") || "atmosphera";
    const subFolder = category.replace(/[^a-z0-9-]/gi, "-");
    const dirPath = `${folder}/${subFolder}`;

    // Ensure directory exists
    try {
      await FilePicker.browse("data", dirPath);
    } catch {
      // Create directories recursively
      try {
        await FilePicker.browse("data", folder);
      } catch {
        await FilePicker.createDirectory("data", folder);
      }
      await FilePicker.createDirectory("data", dirPath);
    }

    // Download the audio file from Suno URL
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
      filePath = track.url; // Fallback to streaming from Suno
    }

    // Find or create playlist
    const playlistName = this._playlistName(category);
    let playlist = game.playlists?.find(p => p.name === playlistName);
    if (!playlist) {
      playlist = await Playlist.create({
        name: playlistName,
        mode: CONST.PLAYLIST_MODES.SEQUENTIAL,
        description: `Auto-generated by Atmosphera for "${category}"`,
        playing: false
      });
    }

    // Add sound to playlist
    await playlist.createEmbeddedDocuments("PlaylistSound", [{
      name: track.title || `${category} — ${track.id}`,
      path: filePath,
      volume: 0.8,
      repeat: true
    }]);

    return filePath;
  }

  /** Get or generate a track for the given prompt/category */
  static async getOrGenerate(prompt, title, category, statusCb) {
    // Check cache first
    const cached = this.findCached(category);
    if (cached) {
      console.log(`${MODULE_ID} | Playlist cache hit: ${category}`);
      statusCb?.("Playing (cached)");
      return cached.url;
    }

    // Generate new
    statusCb?.("Generating…");
    const track = await SunoClient.generateAndWait(prompt, title);

    // Save to Foundry
    statusCb?.("Downloading…");
    const path = await this.saveTrack(category, track);

    return path;
  }

  static _playlistName(category) {
    // "combat-undead" -> "Atmosphera — Combat (Undead)"
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
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    const active = this.activeDeck === "A" ? this.deckA : this.deckB;
    if (active) active.volume = this.volume;
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
        if (outgoing) { outgoing.pause(); outgoing.src = ""; }
      }
    }, stepTime);
  }

  stop(fadeDuration = 1000) {
    const active = this.activeDeck === "A" ? this.deckA : this.deckB;
    if (active) this._crossfade(active, null, fadeDuration);
    this.deckA = null;
    this.deckB = null;
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

    const moodOptions = Object.keys(MOOD_PRESETS).map(k =>
      `<option value="${k}" ${manualMood === k ? "selected" : ""}>${k.replace(/^\w/, c => c.toUpperCase())}</option>`
    ).join("");

    const html = $(`
      <div class="atmosphera-controls">
        <div class="atmo-section">
          <label>Mode</label>
          <div class="atmo-mode-toggle">
            <button id="atmo-auto-toggle" class="${isAuto ? "active" : ""}">
              ${isAuto ? "🔄 Auto" : "🔒 Manual"}
            </button>
            ${!isAuto && manualMood ? `<span class="atmo-manual-indicator">🔒 Manual — ${manualMood}</span>` : ""}
          </div>
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
        </div>
      </div>
    `);

    // Events
    html.find("#atmo-auto-toggle").on("click", () => {
      c.autoMode = !c.autoMode;
      if (c.autoMode) {
        c.manualMood = null;
        c.evaluateAndPlay();
      }
      this.render();
    });

    html.find("#atmo-mood-select").on("change", (e) => {
      const mood = e.target.value;
      if (mood) {
        c.setMood(mood);
      }
    });

    html.find("#atmo-play").on("click", () => {
      // Use the prompt from textarea (GM may have edited it)
      const customPrompt = html.find("#atmo-prompt-display").val();
      c.triggerGeneration(customPrompt);
    });

    html.find("#atmo-stop").on("click", () => {
      c.stop();
      this.render();
    });

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
      this.evaluateAndPlay();
    } else {
      this.autoMode = false;
      this.manualMood = mood;
      this.evaluateAndPlay();
    }
    if (this.panel) this.panel.render();
  }

  /** Evaluate game state, build prompt, and play if category changed */
  evaluateAndPlay(force = false) {
    if (!game.settings.get(MODULE_ID, "enabled")) return;
    if (!game.settings.get(MODULE_ID, "autoDetect") && this.autoMode) return;

    const state = GameStateCollector.collect();
    const { prompt, category, title } = PromptBuilder.build(state, this.manualMood);

    this.currentPrompt = prompt;
    if (this.panel) this.panel.updatePrompt(prompt);

    // Only generate if category actually changed (or forced)
    if (!force && category === this._lastCategory && this.audioManager.isPlaying) {
      return;
    }

    this._lastCategory = category;
    this.currentCategory = category;
    this._doGenerate(prompt, title, category);
  }

  /** Trigger generation with a specific prompt string (from panel edit) */
  async triggerGeneration(customPrompt) {
    const prompt = customPrompt || this.currentPrompt;
    const category = this.currentCategory || "custom";
    const title = `Atmosphera — Custom`;
    this._doGenerate(prompt, title, category);
  }

  async _doGenerate(prompt, title, category) {
    if (this._generating) return;
    this._generating = true;

    try {
      const url = await PlaylistCacheManager.getOrGenerate(
        prompt, title, category,
        (s) => this._setStatus(s)
      );

      this._setStatus("Playing");
      this.currentTrackInfo = `${category}`;
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

  /** Play a victory/defeat sting, then revert to ambient after delay */
  async playSting(type) {
    const { prompt, category, title } = PromptBuilder.buildSting(type);
    this.currentPrompt = prompt;
    if (this.panel) this.panel.updatePrompt(prompt);
    this._lastCategory = category;

    await this._doGenerate(prompt, title, category);

    // After 30 seconds, revert to scene ambient (if auto mode)
    setTimeout(() => {
      if (this.autoMode && !game.combat?.active) {
        this._lastCategory = null; // Force re-evaluation
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

/* ──────────────────────────── HOOKS ──────────────────────────── */

Hooks.once("init", () => {
  registerSettings();
  console.log(`${MODULE_ID} | Initializing Atmosphera v2`);
});

Hooks.once("ready", () => {
  if (!game.user.isGM) return;

  const controller = new AtmospheraController();
  controller.init();

  // Expose API (including macro support)
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
      // Expose maps for extensibility
      CREATURE_HINTS,
      SCENE_KEYWORD_HINTS,
      MOOD_PRESETS
    };
  }

  // Scene control button
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

  // ── Combat Hooks ──

  Hooks.on("combatStart", () => {
    if (!game.settings.get(MODULE_ID, "autoDetect")) return;
    if (!controller.autoMode) return;
    console.log(`${MODULE_ID} | Combat started`);
    controller.evaluateAndPlay(true);
  });

  Hooks.on("deleteCombat", () => {
    if (!game.settings.get(MODULE_ID, "autoDetect")) return;
    if (!controller.autoMode) return;
    console.log(`${MODULE_ID} | Combat deleted`);
    controller._lastCategory = null;
    controller.evaluateAndPlay(true);
  });

  Hooks.on("combatEnd", (combat) => {
    if (!game.settings.get(MODULE_ID, "autoDetect")) return;
    if (!controller.autoMode) return;
    console.log(`${MODULE_ID} | Combat ended`);

    // Check if party won or lost
    const partyActors = game.actors.filter(a => a.hasPlayerOwner && a.system?.attributes?.hp);
    const allDown = partyActors.length > 0 && partyActors.every(a => (a.system.attributes.hp.value || 0) <= 0);

    controller.playSting(allDown ? "defeat" : "victory");
  });

  Hooks.on("updateCombat", (combat, changed) => {
    if (!game.settings.get(MODULE_ID, "autoDetect")) return;
    if (!controller.autoMode) return;
    if (!("round" in changed)) return;
    controller.evaluateAndPlay();
  });

  Hooks.on("updateActor", (actor, changed) => {
    if (!game.settings.get(MODULE_ID, "autoDetect")) return;
    if (!controller.autoMode) return;
    if (!game.combat?.active) return;

    // React to HP or resource changes
    const hpChanged = changed?.system?.attributes?.hp;
    const spellsChanged = changed?.system?.spells;
    const resourcesChanged = changed?.system?.resources;

    if (hpChanged || spellsChanged || resourcesChanged) {
      controller.evaluateAndPlay();
    }
  });

  Hooks.on("canvasReady", () => {
    if (!game.settings.get(MODULE_ID, "enabled")) return;
    if (!controller.autoMode) return;
    if (game.combat?.active) return;
    console.log(`${MODULE_ID} | Scene changed`);
    controller._lastCategory = null;
    controller.evaluateAndPlay(true);
  });

  ui.notifications.info("Atmosphera v2 ready — click 🎵 in token controls to open panel.");
});
