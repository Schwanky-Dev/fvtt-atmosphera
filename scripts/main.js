/**
 * Atmosphera — AI-powered dynamic atmosphere music for FoundryVTT
 * v0.2.0 — Foundry Playlist playback (syncs to all players), existing playlist search,
 *           Atmosphera-flagged playlists, removed browser-only AudioManager.
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
    hint: "Base URL for the Suno API proxy (e.g. http://localhost:3100)",
    scope: "world", config: true, type: String, default: "http://localhost:3100"
  });

  s("sunoModel", {
    name: "Suno Model Version",
    hint: "Which Suno AI model to use for generation.",
    scope: "world", config: true, type: String, default: "chirp-v4",
    choices: {
      "chirp-v3-5": "v3.5",
      "chirp-v4": "v4",
      "chirp-v4-5": "v4.5 (newest)"
    }
  });

  s("instrumental", {
    name: "Instrumental",
    hint: "Generate instrumental tracks (no vocals).",
    scope: "world", config: true, type: Boolean, default: true
  });

  s("negativeTags", {
    name: "Negative Tags",
    hint: "Styles/elements to avoid in generated music. Comma-separated.",
    scope: "world", config: true, type: String, default: "vocals, singing, voice"
  });

  s("waitAudio", {
    name: "Wait for Audio",
    hint: "Wait for Suno to fully generate before returning (slower but more reliable). Enable if tracks aren't completing.",
    scope: "world", config: true, type: Boolean, default: false
  });

  s("titlePrefix", {
    name: "Title Prefix",
    hint: "Prefix for generated track titles.",
    scope: "world", config: true, type: String, default: "Atmosphera"
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

  s("setupComplete", {
    name: "Setup Complete",
    scope: "world", config: false, type: Boolean, default: false
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
      const hp = actor.system?.attributes?.hp;
      const isDead = hp && hp.value <= 0;
      const isBoss = (actor.system?.resources?.legact?.max > 0) || cr >= 10;

      creatures.push({ name: actor.name, type, cr, isBoss, isDead });
      if (isBoss) bosses.push({ name: actor.name, type, cr, isDead });
    }

    const creatureTypes = [...new Set(creatures.filter(c => !c.isDead).map(c => c.type).filter(t => t !== "unknown"))];
    const crValues = creatures.filter(c => !c.isDead).map(c => c.cr).filter(c => c > 0);
    const crRange = crValues.length ? { min: Math.min(...crValues), max: Math.max(...crValues) } : null;

    return { active: true, round: combat.round || 1, turn: combat.turn || 0, creatures, bosses, hasBoss: bosses.some(b => !b.isDead), creatureTypes, crRange };
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
    const darkness = scene.environment?.darknessLevel ?? scene.darkness ?? 0;
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

  static combatSignature() {
    const combat = this._collectCombat();
    if (!combat.active) return "";
    const types = combat.creatureTypes.slice().sort().join(",");
    const bossFlag = combat.hasBoss ? "|BOSS" : "";
    return `${types}${bossFlag}`;
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
      parts.push(`fighting ${combat.bosses.filter(b => !b.isDead).map(b => b.name).join(" and ")}`);
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
    const darknessLevel = scene.environment?.darknessLevel ?? scene.darkness ?? 0;
    if (darknessLevel > 0.7) parts.push("dark, torchlit, shadows");
    else if (darknessLevel > 0.4) parts.push("dim, moody lighting");
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
    const prefix = game.settings.get(MODULE_ID, "titlePrefix") || "Atmosphera";
    const parts = [prefix];
    if (combat.active) {
      parts.push(combat.hasBoss ? "Boss Battle" : "Combat");
      if (combat.creatureTypes[0]) parts.push(`(${combat.creatureTypes[0]})`);
    } else {
      parts.push(scene.name || "Ambient");
    }
    return parts.join(" — ");
  }

  static buildSting(type) {
    const prefix = game.settings.get(MODULE_ID, "titlePrefix") || "Atmosphera";
    const stings = {
      victory: { prompt: "instrumental, triumphant victory fanfare, celebratory, brass, short", category: "sting-victory", title: `${prefix} — Victory` },
      defeat: { prompt: "instrumental, somber defeat, loss, mournful strings, fading hope, short", category: "sting-defeat", title: `${prefix} — Defeat` }
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
    const resp = await fetch(`${this._baseUrl()}/api/custom_generate`, {
      method: "POST", headers: this._headers(),
      body: JSON.stringify({
        prompt: game.settings.get(MODULE_ID, "instrumental") ? "" : prompt,
        tags: prompt,
        title: title,
        make_instrumental: game.settings.get(MODULE_ID, "instrumental"),
        model: game.settings.get(MODULE_ID, "sunoModel"),
        wait_audio: game.settings.get(MODULE_ID, "waitAudio"),
        negative_tags: game.settings.get(MODULE_ID, "negativeTags") || undefined
      })
    });
    if (!resp.ok) throw new Error(`Suno generate failed: ${resp.status}`);
    return resp.json();
  }

  static async poll(ids) {
    const query = Array.isArray(ids) ? ids.join(",") : ids;
    for (let attempt = 0; attempt < 3; attempt++) {
      const resp = await fetch(`${this._baseUrl()}/api/get?ids=${query}`, { headers: this._headers() });
      if (resp.ok) return resp.json();
      if (resp.status === 500 || resp.status === 429) {
        const wait = (attempt + 1) * 15000;
        console.warn(`${MODULE_ID} | Poll got ${resp.status}, retrying in ${wait/1000}s (attempt ${attempt + 1}/3)`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw new Error(`Suno poll failed: ${resp.status}`);
    }
    throw new Error("Suno poll failed after 3 retries");
  }

  static async getCredits() {
    const resp = await fetch(`${this._baseUrl()}/api/get_limit`, { headers: this._headers() });
    if (!resp.ok) throw new Error(`Suno credits failed: ${resp.status}`);
    return resp.json();
  }

  static async generateAndWait(prompt, title) {
    console.log(`${MODULE_ID} | Generating: "${title}" — ${prompt}`);
    const genResult = await this.generate(prompt, title);

    if (Array.isArray(genResult)) {
      const alreadyDone = genResult.find(r => r.status === "complete" && r.audio_url);
      if (alreadyDone) {
        console.log(`${MODULE_ID} | wait_audio returned completed track immediately`);
        return { id: alreadyDone.id, url: alreadyDone.audio_url, title: alreadyDone.title, tags: alreadyDone.metadata?.tags || prompt, duration: alreadyDone.metadata?.duration, prompt };
      }
    }

    const ids = genResult.map(r => r.id);

    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 5000));
      if (i % 10 === 0) console.log(`${MODULE_ID} | Polling attempt ${i}/120...`);
      const status = await this.poll(ids);
      const done = status.filter(s => s.status === "complete");
      if (done.length > 0) {
        const track = done[0];
        return { id: track.id, url: track.audio_url, title: track.title, tags: track.metadata?.tags || prompt, duration: track.metadata?.duration, prompt };
      }
      if (status.every(s => s.status === "error")) throw new Error("All Suno generations failed");
    }
    throw new Error("Suno generation timed out");
  }
}

/* ──────────────────────────── FOUNDRY PLAYLIST MANAGER ──────────────────────────── */

/**
 * Manages playback through Foundry's native Playlist system.
 * All audio is played via Foundry playlists, which syncs to ALL connected players.
 */
class FoundryPlaylistManager {

  /**
   * Stop all Atmosphera-managed playlists (those with the atmosphera flag).
   * Does NOT stop user's manually-playing playlists.
   */
  static async stopAllAtmosphera(fadeDuration = 1000) {
    const playlists = game.playlists?.filter(p =>
      p.getFlag(MODULE_ID, "managed") === true && p.playing
    ) || [];

    for (const playlist of playlists) {
      try {
        // Stop each playing sound with fade
        for (const sound of playlist.sounds) {
          if (sound.playing) {
            await playlist.stopSound(sound, { fade: fadeDuration });
          }
        }
      } catch (e) {
        console.warn(`${MODULE_ID} | Error stopping playlist "${playlist.name}":`, e);
        // Fallback: try stopAll
        try { await playlist.stopAll(); } catch {}
      }
    }
  }

  /**
   * Play a track via Foundry's playlist system.
   * Finds or creates the appropriate playlist, adds the sound if needed, then plays it.
   * @param {string} filePath - Path to audio file (local) or URL
   * @param {string} category - Category for playlist organization
   * @param {object} options - { volume, fadeDuration, title, prompt }
   * @returns {object} { playlist, sound } - The Foundry playlist and sound documents
   */
  static async play(filePath, category, options = {}) {
    const {
      volume = game.settings.get(MODULE_ID, "masterVolume"),
      fadeDuration = game.settings.get(MODULE_ID, "crossfadeDuration"),
      title = null,
      prompt = ""
    } = options;

    // Stop currently playing Atmosphera playlists first
    await this.stopAllAtmosphera(fadeDuration);

    // Find or create the playlist for this category
    const playlistName = PlaylistCacheManager._playlistName(category);
    let playlist = game.playlists?.find(p => p.name === playlistName);

    if (!playlist) {
      playlist = await Playlist.create({
        name: playlistName,
        mode: CONST.PLAYLIST_MODES.SEQUENTIAL,
        description: `Auto-generated by Atmosphera for "${category}"`,
        playing: false,
        fade: fadeDuration,
        flags: { [MODULE_ID]: { managed: true, category: category } }
      });
    } else if (!playlist.getFlag(MODULE_ID, "managed")) {
      // Ensure existing Atmosphera playlists get flagged
      await playlist.setFlag(MODULE_ID, "managed", true);
      await playlist.setFlag(MODULE_ID, "category", category);
    }

    // Check if this sound already exists in the playlist
    let sound = playlist.sounds.find(s => s.path === filePath);

    if (!sound) {
      // Add the track as a PlaylistSound
      const created = await playlist.createEmbeddedDocuments("PlaylistSound", [{
        name: title || `${category} — ${Date.now()}`,
        path: filePath,
        volume: volume,
        repeat: true,
        fade: fadeDuration,
        description: prompt || `Generated for: ${category}`,
        flags: { [MODULE_ID]: { prompt: prompt || "", category, generatedAt: Date.now() } }
      }]);
      sound = created[0];
    } else {
      // Update volume and fade on existing sound
      await sound.update({ volume: volume, fade: fadeDuration });
    }

    // Play the sound
    await playlist.playSound(sound, { fade: fadeDuration });

    return { playlist, sound };
  }

  /**
   * Update volume on all currently playing Atmosphera sounds.
   */
  static async setVolume(volume) {
    const playlists = game.playlists?.filter(p =>
      p.getFlag(MODULE_ID, "managed") === true && p.playing
    ) || [];

    for (const playlist of playlists) {
      for (const sound of playlist.sounds) {
        if (sound.playing) {
          await sound.update({ volume: volume });
        }
      }
    }
  }

  /**
   * Check if any Atmosphera playlist is currently playing.
   */
  static get isPlaying() {
    return game.playlists?.some(p =>
      p.getFlag(MODULE_ID, "managed") === true && p.playing
    ) || false;
  }

  /**
   * Get the currently playing Atmosphera playlist and sound, if any.
   */
  static getCurrentlyPlaying() {
    for (const playlist of game.playlists || []) {
      if (playlist.getFlag(MODULE_ID, "managed") !== true) continue;
      if (!playlist.playing) continue;
      for (const sound of playlist.sounds) {
        if (sound.playing) return { playlist, sound };
      }
    }
    return null;
  }
}

/* ──────────────────────────── EXISTING PLAYLIST SEARCH ──────────────────────────── */

/**
 * Search ALL Foundry playlists (not just Atmosphera-created) for tracks
 * matching the current context. Prefers Atmosphera-flagged playlists.
 */
class PlaylistSearcher {

  // Common synonyms/related words for better matching
  static KEYWORD_SYNONYMS = {
    combat: ["battle", "fight", "war", "clash", "skirmish"],
    battle: ["combat", "fight", "war", "clash"],
    fight: ["combat", "battle", "war"],
    undead: ["zombie", "skeleton", "ghost", "specter", "wraith", "necro", "death"],
    dragon: ["wyrm", "drake", "draconic"],
    tavern: ["inn", "pub", "bar", "ale", "drinking"],
    forest: ["woods", "woodland", "grove", "trees"],
    dungeon: ["cave", "underground", "crypt", "catacomb", "tomb"],
    ocean: ["sea", "water", "waves", "nautical", "sailing", "ship"],
    city: ["town", "urban", "market", "streets"],
    calm: ["peaceful", "serene", "gentle", "quiet", "relaxing"],
    tension: ["suspense", "suspenseful", "tense", "uneasy", "dread"],
    epic: ["grand", "sweeping", "majestic", "heroic"],
    mystery: ["mysterious", "intrigue", "enigma", "curious"],
    horror: ["scary", "creepy", "dark", "fear", "dread"]
  };

  /**
   * Search all playlists for a track matching the given context keywords.
   * @param {string} category - The category string (e.g. "combat-undead", "ambient-tavern")
   * @param {string} prompt - The full prompt string for additional keyword extraction
   * @returns {object|null} { playlist, sound, path, source: "existing"|"atmosphera", score }
   */
  static search(category, prompt = "") {
    const keywords = this._extractKeywords(category, prompt);
    if (keywords.length === 0) return null;

    // Expand keywords with synonyms
    const expandedKeywords = new Set(keywords);
    for (const kw of keywords) {
      const synonyms = this.KEYWORD_SYNONYMS[kw];
      if (synonyms) synonyms.forEach(s => expandedKeywords.add(s));
    }

    let bestMatch = null;
    let bestScore = 0;

    for (const playlist of game.playlists || []) {
      if (!playlist.sounds.size) continue;

      const isAtmosphera = playlist.getFlag(MODULE_ID, "managed") === true;
      const playlistText = (playlist.name + " " + (playlist.description || "")).toLowerCase();

      for (const sound of playlist.sounds) {
        const soundText = (sound.name + " " + (sound.description || "")).toLowerCase();
        const fullText = playlistText + " " + soundText;

        let score = 0;
        for (const kw of expandedKeywords) {
          if (fullText.includes(kw)) score++;
        }

        if (score === 0) continue;

        // Normalize by keyword count
        const normalizedScore = score / expandedKeywords.size;

        // Boost Atmosphera-flagged playlists slightly
        const finalScore = isAtmosphera ? normalizedScore * 1.2 : normalizedScore;

        if (finalScore > bestScore) {
          bestScore = finalScore;
          bestMatch = {
            playlist,
            sound,
            path: sound.path,
            source: isAtmosphera ? "atmosphera" : "existing",
            score: finalScore
          };
        }
      }
    }

    // Only return matches above threshold
    if (bestMatch && bestScore >= 0.3) {
      console.log(`${MODULE_ID} | Playlist search: "${category}" → "${bestMatch.sound.name}" in "${bestMatch.playlist.name}" (score: ${Math.round(bestScore * 100)}%, source: ${bestMatch.source})`);
      return bestMatch;
    }

    return null;
  }

  /**
   * Extract searchable keywords from category and prompt.
   */
  static _extractKeywords(category, prompt) {
    const words = new Set();

    // From category: "combat-undead" → ["combat", "undead"]
    for (const part of category.split("-")) {
      const cleaned = part.trim().toLowerCase();
      if (cleaned && cleaned.length > 2) words.add(cleaned);
    }

    // From prompt: extract significant words (skip common filler)
    const skipWords = new Set(["instrumental", "music", "background", "the", "and", "for", "with", "from", "that", "this", "party", "fighting"]);
    for (const word of prompt.toLowerCase().split(/[\s,]+/)) {
      const cleaned = word.replace(/[^a-z]/g, "");
      if (cleaned.length > 3 && !skipWords.has(cleaned)) words.add(cleaned);
    }

    return [...words];
  }
}

/* ──────────────────────────── PLAYLIST CACHE MANAGER ──────────────────────────── */

class PlaylistCacheManager {
  static PLAYLIST_PREFIX = "Atmosphera";

  /**
   * Find a cached track — first search ALL playlists for matches,
   * then try exact Atmosphera match, then fuzzy Atmosphera match.
   */
  static findCached(category, prompt = "") {
    // First: search ALL playlists (the big win — finds user's existing music)
    const existingMatch = PlaylistSearcher.search(category, prompt);
    if (existingMatch) {
      return {
        playlist: existingMatch.playlist,
        sound: existingMatch.sound,
        url: existingMatch.path,
        category,
        fuzzy: existingMatch.source !== "atmosphera",
        fromExisting: existingMatch.source === "existing"
      };
    }

    // Then: try exact Atmosphera playlist match
    const exact = this._findExact(category);
    if (exact) return exact;

    // Finally: fuzzy Atmosphera match
    return this._findFuzzy(category);
  }

  static _findExact(category) {
    const playlistName = this._playlistName(category);
    const playlist = game.playlists?.find(p => p.name === playlistName);
    if (!playlist || !playlist.sounds.size) return null;
    const sounds = [...playlist.sounds];
    const sound = sounds[Math.floor(Math.random() * sounds.length)];
    return { playlist, sound, url: sound.path, category, fuzzy: false };
  }

  static _findFuzzy(category) {
    const requestedKeywords = category.split("-").filter(Boolean);
    if (requestedKeywords.length === 0) return null;

    const playlists = game.playlists?.filter(p =>
      p.name.startsWith(this.PLAYLIST_PREFIX) && p.sounds.size > 0
    ) || [];

    let bestMatch = null;
    let bestScore = 0;

    for (const playlist of playlists) {
      const catFromName = this._categoryFromPlaylistName(playlist.name);
      if (!catFromName) continue;

      const candidateKeywords = catFromName.split("-").filter(Boolean);
      const overlap = requestedKeywords.filter(kw => candidateKeywords.includes(kw)).length;
      const score = overlap / requestedKeywords.length;

      if (score > bestScore) {
        bestScore = score;
        const sounds = [...playlist.sounds];
        const sound = sounds[Math.floor(Math.random() * sounds.length)];
        bestMatch = { playlist, sound, url: sound.path, category: catFromName, fuzzy: true, score };
      }
    }

    if (bestMatch && bestScore > 0.5) {
      console.log(`${MODULE_ID} | Fuzzy match: "${category}" → "${bestMatch.category}" (${Math.round(bestScore * 100)}%)`);
      return bestMatch;
    }

    return null;
  }

  static _categoryFromPlaylistName(name) {
    const match = name.match(/^Atmosphera\s*—\s*(\w+)\s*(?:\(([^)]+)\))?$/);
    if (!match) return null;
    const type = match[1].toLowerCase();
    const detail = match[2]?.toLowerCase().replace(/\s+/g, "-") || "";
    return detail ? `${type}-${detail}` : type;
  }

  static findAnyTrack(preferredCategory = null) {
    if (preferredCategory) {
      const found = this.findCached(preferredCategory);
      if (found) return found;
    }

    for (const fallback of ["ambient-general", "calm", "ambient"]) {
      const found = this._findExact(fallback) || this._findFuzzy(fallback);
      if (found) return found;
    }

    const anyPlaylist = game.playlists?.find(p =>
      p.name.startsWith(this.PLAYLIST_PREFIX) && p.sounds.size > 0
    );
    if (anyPlaylist) {
      const sounds = [...anyPlaylist.sounds];
      const sound = sounds[Math.floor(Math.random() * sounds.length)];
      return { playlist: anyPlaylist, sound, url: sound.path, category: "fallback", fuzzy: true };
    }

    return null;
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
        description: `Auto-generated by Atmosphera for "${category}"`, playing: false,
        flags: { [MODULE_ID]: { managed: true, category: category } }
      });
    } else if (!playlist.getFlag(MODULE_ID, "managed")) {
      await playlist.setFlag(MODULE_ID, "managed", true);
      await playlist.setFlag(MODULE_ID, "category", category);
    }

    await playlist.createEmbeddedDocuments("PlaylistSound", [{
      name: track.title || `${category} — ${track.id}`,
      path: filePath, volume: 0.8, repeat: true,
      fade: game.settings.get(MODULE_ID, "crossfadeDuration"),
      description: track.prompt || `Generated for: ${category}`,
      flags: { [MODULE_ID]: { prompt: track.prompt || "", category, generatedAt: Date.now(), sunoId: track.id } }
    }]);

    return filePath;
  }

  static async getOrGenerate(prompt, title, category, statusCb) {
    const cached = this.findCached(category, prompt);
    if (cached) {
      const source = cached.fromExisting ? "existing playlist" : (cached.fuzzy ? "fuzzy" : "cached");
      console.log(`${MODULE_ID} | Playlist cache hit: ${category} (${source})`);
      statusCb?.(`Playing (${source})`);
      return cached.url;
    }

    statusCb?.("Generating…");
    const track = await SunoClient.generateAndWait(prompt, title);
    statusCb?.("Downloading…");
    return this.saveTrack(category, track);
  }

  static async preload(prompt, title, category) {
    if (this.findCached(category, prompt)) return;
    try {
      console.log(`${MODULE_ID} | Preloading: ${category}`);
      const track = await SunoClient.generateAndWait(prompt, title);
      await this.saveTrack(category, track);
      console.log(`${MODULE_ID} | Preloaded: ${category}`);
    } catch (e) {
      console.warn(`${MODULE_ID} | Preload failed for ${category}:`, e);
    }
  }

  static getLibrary() {
    const library = {};
    const playlists = game.playlists?.filter(p => p.name.startsWith(this.PLAYLIST_PREFIX)) || [];
    for (const playlist of playlists) {
      const cat = this._categoryFromPlaylistName(playlist.name) || playlist.name;
      library[cat] = [...playlist.sounds].map(s => ({
        name: s.name, path: s.path, playing: s.playing
      }));
    }
    return library;
  }

  static _playlistName(category) {
    const parts = category.split("-");
    const type = (parts[0] || "misc").replace(/^\w/, c => c.toUpperCase());
    const detail = parts.slice(1).join(" ").replace(/^\w/, c => c.toUpperCase()) || "";
    return detail ? `${this.PLAYLIST_PREFIX} — ${type} (${detail})` : `${this.PLAYLIST_PREFIX} — ${type}`;
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
    const isPlaying = FoundryPlaylistManager.isPlaying;
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

        <div class="atmo-section">
          <details>
            <summary style="cursor:pointer;font-weight:bold;font-size:12px;">⚙ Generation Settings</summary>
            <div style="margin-top:6px;">
              <div style="margin-bottom:6px;">
                <label style="font-size:11px;">Model Version</label>
                <select id="atmo-gen-model" style="width:100%;">
                  <option value="chirp-v3-5" ${game.settings.get(MODULE_ID, "sunoModel") === "chirp-v3-5" ? "selected" : ""}>v3.5</option>
                  <option value="chirp-v4" ${game.settings.get(MODULE_ID, "sunoModel") === "chirp-v4" ? "selected" : ""}>v4</option>
                  <option value="chirp-v4-5" ${game.settings.get(MODULE_ID, "sunoModel") === "chirp-v4-5" ? "selected" : ""}>v4.5 (newest)</option>
                </select>
              </div>
              <div style="margin-bottom:6px;">
                <label style="font-size:11px;">
                  <input type="checkbox" id="atmo-gen-instrumental" ${game.settings.get(MODULE_ID, "instrumental") ? "checked" : ""}/> Instrumental (no vocals)
                </label>
              </div>
              <div style="margin-bottom:6px;">
                <label style="font-size:11px;">Negative Tags</label>
                <input type="text" id="atmo-gen-negative-tags" value="${game.settings.get(MODULE_ID, "negativeTags")}" style="width:100%;font-size:11px;" placeholder="vocals, singing, voice"/>
              </div>
            </div>
          </details>
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
      FoundryPlaylistManager.setVolume(v);
      game.settings.set(MODULE_ID, "masterVolume", v);
    });

    html.find("#atmo-gen-model").on("change", (e) => {
      game.settings.set(MODULE_ID, "sunoModel", e.target.value);
    });

    html.find("#atmo-gen-instrumental").on("change", (e) => {
      game.settings.set(MODULE_ID, "instrumental", e.target.checked);
    });

    html.find("#atmo-gen-negative-tags").on("change", (e) => {
      game.settings.set(MODULE_ID, "negativeTags", e.target.value);
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
    this.panel = null;
    this.autoMode = true;
    this.manualMood = null;
    this.currentPrompt = "";
    this.currentCategory = "";
    this.generationStatus = "Idle";
    this.credits = null;
    this.currentTrackInfo = "";
    this._generating = false;
    this._queued = null;
    this._lastCategory = null;
    this._preloadStatus = null;
    this._preloadPromises = new Map();
    this._stingSavedCategory = null;

    // Background pre-generation for combat stings
    this._victoryPromise = null;
    this._defeatPromise = null;

    // Smart combat re-evaluation
    this._lastCombatSignature = "";

    // Scene pre-warming
    this._prewarmedScenes = new Set();

    // Track end detection interval
    this._endCheckInterval = null;
  }

  init() {
    // Start track-end detection polling
    this._startEndDetection();

    // Listen for playlist updates to detect when sounds stop
    Hooks.on("updatePlaylistSound", (sound, changed) => {
      if (!changed.playing && changed.playing === false) {
        // A sound stopped playing — check if it was ours
        const playlist = sound.parent;
        if (playlist?.getFlag(MODULE_ID, "managed")) {
          console.log(`${MODULE_ID} | Atmosphera sound stopped: "${sound.name}"`);
          this._onTrackEnded();
        }
      }
    });
  }

  /**
   * Periodic check for track end — fallback if hooks don't fire reliably.
   */
  _startEndDetection() {
    if (this._endCheckInterval) clearInterval(this._endCheckInterval);
    this._endCheckInterval = setInterval(() => {
      if (!game.settings.get(MODULE_ID, "enabled")) return;
      if (!this.autoMode) return;

      // If we expect to be playing but nothing is playing, re-evaluate
      if (this._lastCategory && !FoundryPlaylistManager.isPlaying) {
        console.log(`${MODULE_ID} | No Atmosphera playlist playing — re-evaluating`);
        this._lastCategory = null;
        this.evaluateAndPlay(true);
      }
    }, 10000); // Check every 10 seconds
  }

  _onTrackEnded() {
    if (!this.autoMode) return;
    if (!game.settings.get(MODULE_ID, "enabled")) return;

    // Re-evaluate: if context changed, play new music
    const state = GameStateCollector.collect();
    const { category } = PromptBuilder.build(state, this.manualMood);
    if (category !== this._lastCategory) {
      this._lastCategory = null;
      this.evaluateAndPlay(true);
    }
    // If same category, the repeat=true on the PlaylistSound handles looping
  }

  openPanel() {
    if (!this.panel) this.panel = new AtmospheraPanel(this);
    this.panel.render(true);
    this._refreshCredits();
  }

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

  evaluateAndPlay(force = false) {
    if (!game.settings.get(MODULE_ID, "enabled")) return;

    const state = GameStateCollector.collect();
    const { prompt, category, title } = PromptBuilder.build(state, this.manualMood);

    this.currentPrompt = prompt;
    this.currentCategory = category;
    if (this.panel) this.panel.updatePrompt(prompt);

    if (!force && category === this._lastCategory && FoundryPlaylistManager.isPlaying) return;

    this._lastCategory = category;
    this._doGenerate(prompt, title, category);
  }

  triggerGeneration(customPrompt) {
    const prompt = customPrompt || this.currentPrompt;
    const prefix = game.settings.get(MODULE_ID, "titlePrefix") || "Atmosphera";
    this._doGenerate(prompt, `${prefix} — Custom`, this.currentCategory || "custom");
  }

  async _doGenerateOnly(prompt, title, category) {
    try {
      return await PlaylistCacheManager.getOrGenerate(prompt, title, category, () => {});
    } catch (e) {
      console.warn(`${MODULE_ID} | Background generation failed for ${category}:`, e);
      return null;
    }
  }

  async _doGenerate(prompt, title, category) {
    if (this._generating) {
      this._queued = { prompt, title, category };
      console.log(`${MODULE_ID} | Generation in progress, queued: ${category}`);
      return;
    }
    this._generating = true;
    this._setStatus("Generating…");

    try {
      const url = await PlaylistCacheManager.getOrGenerate(prompt, title, category, (s) => this._setStatus(s));

      this._setStatus("Playing");
      this.currentTrackInfo = category;
      if (this.panel) this.panel.updateTrackInfo(this.currentTrackInfo);

      // Play through Foundry's playlist system — syncs to all players
      const fadeDuration = game.settings.get(MODULE_ID, "crossfadeDuration");
      const volume = game.settings.get(MODULE_ID, "masterVolume");
      await FoundryPlaylistManager.play(url, category, {
        volume,
        fadeDuration,
        title: title,
        prompt: prompt
      });

      if (this.panel) this.panel.render();
    } catch (err) {
      console.error(`${MODULE_ID} | Generation error:`, err);
      this._setStatus(`Error: ${err.message}`);

      // Error recovery
      console.log(`${MODULE_ID} | Attempting error recovery…`);
      const fallback = PlaylistCacheManager.findAnyTrack(category);
      if (fallback) {
        console.log(`${MODULE_ID} | Recovery: playing fallback from "${fallback.category}"`);
        this._setStatus("Playing (fallback)");
        this.currentTrackInfo = `${fallback.category} (fallback)`;
        if (this.panel) this.panel.updateTrackInfo(this.currentTrackInfo);
        try {
          const fadeDuration = game.settings.get(MODULE_ID, "crossfadeDuration");
          const volume = game.settings.get(MODULE_ID, "masterVolume");
          await FoundryPlaylistManager.play(fallback.url, fallback.category, {
            volume,
            fadeDuration
          });
        } catch (e2) {
          console.error(`${MODULE_ID} | Fallback playback also failed:`, e2);
          this._setStatus("Error — no playback available");
        }
      } else {
        ui.notifications.error(`Atmosphera: ${err.message}`);
        this._setStatus("Error — no tracks available");
      }
    } finally {
      this._generating = false;
      this._refreshCredits();

      if (this._queued) {
        const next = this._queued;
        this._queued = null;
        console.log(`${MODULE_ID} | Processing queued generation: ${next.category}`);
        this._doGenerate(next.prompt, next.title, next.category);
      }
    }
  }

  _pregenerateStings() {
    const victory = PromptBuilder.buildSting("victory");
    const defeat = PromptBuilder.buildSting("defeat");

    this._victoryPromise = this._doGenerateOnly(victory.prompt, victory.title, victory.category);
    this._defeatPromise = new Promise(r => setTimeout(r, 10000))
      .then(() => this._doGenerateOnly(defeat.prompt, defeat.title, defeat.category));

    this._preloadStatus = "victory & defeat stings";
    if (this.panel) this.panel.render();

    Promise.allSettled([this._victoryPromise, this._defeatPromise]).then(() => {
      this._preloadStatus = null;
      if (this.panel) this.panel.render();
    });
  }

  preload(categories) {
    for (const cat of categories) {
      if (this._preloadPromises.has(cat)) continue;
      if (PlaylistCacheManager.findCached(cat)) continue;

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

  async playSting(type) {
    const { prompt, category, title } = PromptBuilder.buildSting(type);
    this.currentPrompt = prompt;
    if (this.panel) this.panel.updatePrompt(prompt);

    this._stingSavedCategory = this._lastCategory;
    this._lastCategory = category;

    const pregenPromise = type === "victory" ? this._victoryPromise : this._defeatPromise;
    if (pregenPromise) {
      try {
        const pregenUrl = await pregenPromise;
        if (pregenUrl) {
          console.log(`${MODULE_ID} | Using pre-generated ${type} sting`);
          this._setStatus("Playing (pre-generated)");
          this.currentTrackInfo = category;
          if (this.panel) this.panel.updateTrackInfo(this.currentTrackInfo);

          const fadeDuration = game.settings.get(MODULE_ID, "crossfadeDuration");
          const volume = game.settings.get(MODULE_ID, "masterVolume");
          await FoundryPlaylistManager.play(pregenUrl, category, { volume, fadeDuration, title, prompt });

          if (this.panel) this.panel.render();
          this._scheduleStingRevert();
          return;
        }
      } catch {
        // Pre-gen failed, fall through
      }
    }

    await this._doGenerate(prompt, title, category);
    this._scheduleStingRevert();
  }

  _scheduleStingRevert() {
    setTimeout(() => {
      if (this.autoMode && !game.combat?.active) {
        this._lastCategory = null;
        this.evaluateAndPlay(true);
      }
    }, 30000);
  }

  prewarmScene(sceneId) {
    if (this._prewarmedScenes.has(sceneId)) return;
    this._prewarmedScenes.add(sceneId);

    const state = GameStateCollector.collect();
    if (state.combat.active) return;

    const { prompt, title, category } = PromptBuilder.build(state, null);

    if (PlaylistCacheManager.findCached(category)) return;

    console.log(`${MODULE_ID} | Pre-warming scene "${state.scene.name}" → ${category}`);
    this._doGenerateOnly(prompt, title, category);
  }

  async stop() {
    const fadeDuration = game.settings.get(MODULE_ID, "crossfadeDuration");
    await FoundryPlaylistManager.stopAllAtmosphera(fadeDuration);
    this._setStatus("Stopped");
    this._lastCategory = null;
  }

  play() {
    this.autoMode = true;
    this.manualMood = null;
    this._lastCategory = null;
    this.evaluateAndPlay(true);
  }

  getStatus() {
    return {
      playing: FoundryPlaylistManager.isPlaying,
      track: this.currentTrackInfo,
      mood: this.manualMood || "auto",
      autoMode: this.autoMode,
      prompt: this.currentPrompt
    };
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

/* ──────────────────────────── SETUP WIZARD ──────────────────────────── */

class AtmospheraSetupWizard {
  static open(controller) {
    this._controller = controller;
    this._step = 1;
    this._testPassed = false;
    this._show();
  }

  static _show() {
    const step = this._step;
    const content = this[`_step${step}HTML`]();
    const buttons = this._buttons(step);

    if (this._dialog) {
      try { this._dialog.close(); } catch {}
    }

    this._dialog = new Dialog({
      title: `Atmosphera Setup (${step}/4)`,
      content,
      buttons,
      default: step < 4 ? "next" : "close",
      render: (html) => this._onRender(html, step),
      close: () => {}
    }, { classes: ["atmosphera-setup-wizard"], width: 480 });

    this._dialog.render(true);
  }

  static _buttons(step) {
    if (step === 1) return { next: { label: "Next →", callback: () => { this._step = 2; this._show(); } } };
    if (step === 2) return {
      back: { label: "← Back", callback: () => { this._step = 1; this._show(); } },
      next: { label: "Next →", callback: (html) => { this._saveStep2(html); this._step = 3; this._show(); } }
    };
    if (step === 3) return {
      back: { label: "← Back", callback: () => { this._step = 2; this._show(); } },
      next: { label: "Finish →", callback: (html) => { this._saveStep3(html); this._step = 4; this._show(); } }
    };
    return {
      panel: { label: "Open Control Panel", callback: () => { game.settings.set(MODULE_ID, "setupComplete", true); this._controller?.openPanel(); } },
      close: { label: "Close", callback: () => { game.settings.set(MODULE_ID, "setupComplete", true); } }
    };
  }

  static _step1HTML() {
    return `<div class="atmosphera-wizard-content">
      <h2>Welcome to Atmosphera!</h2>
      <p>Let's get you set up.</p>
      <p>Atmosphera generates dynamic background music using <strong>Suno AI</strong>.
      It reads your game state — scenes, combat, party health — and automatically creates
      fitting instrumental soundtracks.</p>
      <p><strong>New in v0.2.0:</strong> Music now plays through Foundry's playlist system,
      so <em>all connected players</em> hear the music — not just the GM!</p>
      <p>You'll need:</p>
      <ul>
        <li>A running <strong>Suno API proxy</strong> — <a href="https://github.com/SunoAI-API/Suno-API" target="_blank">github.com/SunoAI-API/Suno-API</a></li>
        <li>Your <strong>Suno session cookie</strong> for authentication</li>
      </ul>
    </div>`;
  }

  static _step2HTML() {
    const url = game.settings.get(MODULE_ID, "sunoApiUrl") || "http://localhost:3100";
    const cookie = game.settings.get(MODULE_ID, "sunoCookie") || "";
    const captcha = game.settings.get(MODULE_ID, "twoCaptchaKey") || "";
    return `<div class="atmosphera-wizard-content">
      <h2>API Configuration</h2>
      <div class="atmosphera-wizard-field" style="background:#f0edf5;padding:8px;border-radius:4px;margin-bottom:8px;">
        <strong>Quick Start:</strong> Run the included Docker proxy on your Foundry server:
        <pre style="background:#2b2b2b;color:#e0e0e0;padding:6px;border-radius:3px;font-size:11px;overflow-x:auto;margin:4px 0;">cd /path/to/modules/atmosphera && cp .env.example .env && nano .env && docker-compose up -d</pre>
        Then use <code>http://localhost:3100</code> as the API URL below.<br/>
        <em style="font-size:11px;">If Foundry runs on a different machine than your browser, use the server's IP address instead of localhost.</em>
      </div>
      <div class="atmosphera-wizard-field">
        <label>Suno API URL</label>
        <input type="text" id="atmo-wiz-url" value="${url}" placeholder="http://localhost:3100"/>
      </div>
      <div class="atmosphera-wizard-field">
        <label>Suno Cookie</label>
        <input type="password" id="atmo-wiz-cookie" value="${cookie}" placeholder="Paste cookie string"/>
        <span class="atmosphera-wizard-hint">Log into <a href="https://suno.com" target="_blank">suno.com</a>, open DevTools → Application → Cookies → copy the full cookie string.</span>
      </div>
      <div class="atmosphera-wizard-field">
        <label>2Captcha API Key <em>(optional)</em></label>
        <input type="text" id="atmo-wiz-captcha" value="${captcha}" placeholder="Only if your proxy requires it"/>
        <span class="atmosphera-wizard-hint">Only needed if your Suno API proxy requires captcha solving.</span>
      </div>
      <div class="atmosphera-wizard-field">
        <button type="button" id="atmo-wiz-test" class="atmosphera-wizard-btn">🔌 Test Connection</button>
        <span id="atmo-wiz-test-result" class="atmosphera-wizard-hint"></span>
      </div>
      ${!this._testPassed ? '<div class="atmosphera-wizard-hint" style="text-align:center;margin-top:4px;"><a href="#" id="atmo-wiz-skip">Skip test and continue anyway</a></div>' : ''}
    </div>`;
  }

  static _step3HTML() {
    const prefix = game.settings.get(MODULE_ID, "promptPrefix") || "";
    const vol = game.settings.get(MODULE_ID, "masterVolume") ?? 0.5;
    const autoDetect = game.settings.get(MODULE_ID, "autoDetect");
    const resourceTracking = game.settings.get(MODULE_ID, "resourceTracking");
    return `<div class="atmosphera-wizard-content">
      <h2>Preferences</h2>
      <div class="atmosphera-wizard-field">
        <label>Prompt Style Prefix</label>
        <input type="text" id="atmo-wiz-prefix" value="${prefix}" placeholder='e.g. "orchestral cinematic"'/>
        <span class="atmosphera-wizard-hint">Examples: "orchestral cinematic", "dark ambient electronic", "celtic folk", "lo-fi chill"</span>
      </div>
      <div class="atmosphera-wizard-field">
        <label>Master Volume: <span id="atmo-wiz-vol-label">${Math.round(vol * 100)}%</span></label>
        <input type="range" id="atmo-wiz-volume" min="0" max="1" step="0.05" value="${vol}"/>
      </div>
      <div class="atmosphera-wizard-field atmosphera-wizard-toggle">
        <label><input type="checkbox" id="atmo-wiz-autodetect" ${autoDetect ? "checked" : ""}/> Auto-detect combat &amp; game state</label>
      </div>
      <div class="atmosphera-wizard-field atmosphera-wizard-toggle">
        <label><input type="checkbox" id="atmo-wiz-resources" ${resourceTracking ? "checked" : ""}/> Track party resources (spell slots, hit dice)</label>
      </div>
    </div>`;
  }

  static _step4HTML() {
    return `<div class="atmosphera-wizard-content" style="text-align:center;">
      <h2>🎵 You're All Set!</h2>
      <p>Atmosphera will now automatically manage your game's soundtrack based on scenes, combat, and party status.</p>
      <p><strong>All players will hear the music</strong> through Foundry's playlist system.</p>
      <p style="color:#7b5ea7;">Tip: Click the <i class="fas fa-music"></i> button in the toolbar to open the control panel anytime.</p>
    </div>`;
  }

  static _onRender(html, step) {
    if (step === 2) {
      html.find("#atmo-wiz-test").on("click", async () => {
        const urlInput = html.find("#atmo-wiz-url").val().replace(/\/+$/, "");
        const cookie = html.find("#atmo-wiz-cookie").val();
        const result = html.find("#atmo-wiz-test-result");
        result.text("Testing…").css("color", "#aaa");
        try {
          const resp = await fetch(`${urlInput}/api/get_limit`, { headers: { "Content-Type": "application/json", Cookie: cookie } });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const data = await resp.json();
          const credits = data.credits_left ?? data.total_credits_left ?? "?";
          result.text(`✅ Connected! Credits remaining: ${credits}`).css("color", "#6a6");
          this._testPassed = true;
        } catch (e) {
          result.text(`❌ Failed: ${e.message}`).css("color", "#a66");
          this._testPassed = false;
        }
      });
      html.find("#atmo-wiz-skip").on("click", (e) => {
        e.preventDefault();
        this._saveStep2(html);
        this._step = 3;
        this._show();
      });
    }
    if (step === 3) {
      html.find("#atmo-wiz-volume").on("input", function () {
        html.find("#atmo-wiz-vol-label").text(`${Math.round(this.value * 100)}%`);
      });
    }
  }

  static _saveStep2(html) {
    const url = html.find("#atmo-wiz-url").val()?.trim() || "http://localhost:3100";
    const cookie = html.find("#atmo-wiz-cookie").val()?.trim() || "";
    const captcha = html.find("#atmo-wiz-captcha").val()?.trim() || "";
    game.settings.set(MODULE_ID, "sunoApiUrl", url);
    game.settings.set(MODULE_ID, "sunoCookie", cookie);
    game.settings.set(MODULE_ID, "twoCaptchaKey", captcha);
  }

  static _saveStep3(html) {
    const prefix = html.find("#atmo-wiz-prefix").val()?.trim() || "";
    const vol = parseFloat(html.find("#atmo-wiz-volume").val()) || 0.5;
    const autoDetect = html.find("#atmo-wiz-autodetect").is(":checked");
    const resources = html.find("#atmo-wiz-resources").is(":checked");
    game.settings.set(MODULE_ID, "promptPrefix", prefix);
    game.settings.set(MODULE_ID, "masterVolume", vol);
    game.settings.set(MODULE_ID, "autoDetect", autoDetect);
    game.settings.set(MODULE_ID, "resourceTracking", resources);
  }
}

/* ──────────────────────────── HOOKS — FULL LIFECYCLE ──────────────────────────── */

Hooks.once("init", () => {
  registerSettings();
  console.log(`${MODULE_ID} | Initializing Atmosphera v0.2.0`);
});

Hooks.once("ready", () => {
  if (!game.user.isGM) return;

  const controller = new AtmospheraController();
  controller.init();

  // ── Expose clean API ──
  const moduleData = game.modules.get(MODULE_ID);
  if (moduleData) {
    moduleData.api = {
      setMood: (mood) => controller.setMood(mood),
      stop: () => controller.stop(),
      play: () => controller.play(),
      getStatus: () => controller.getStatus(),
      generate: (prompt) => controller.triggerGeneration(prompt),
      openPanel: () => controller.openPanel(),
      openSetup: () => AtmospheraSetupWizard.open(controller),
      getLibrary: () => PlaylistCacheManager.getLibrary(),

      // Power-user / internal access
      controller,
      evaluate: () => controller.evaluateAndPlay(true),
      getCredits: () => SunoClient.getCredits(),
      CREATURE_HINTS, SCENE_KEYWORD_HINTS, MOOD_PRESETS
    };
  }

  // ── First-run setup wizard ──
  if (!game.settings.get(MODULE_ID, "setupComplete")) {
    const url = game.settings.get(MODULE_ID, "sunoApiUrl");
    const cookie = game.settings.get(MODULE_ID, "sunoCookie");
    if (!url || url === "http://localhost:3100" || !cookie) {
      AtmospheraSetupWizard.open(controller);
    }
  }

  // ── Scene control button (v13) ──
  Hooks.on("getSceneControlButtons", (controls) => {
    const group = controls.sounds;
    if (group && group.tools) {
      group.tools.atmosphera = {
        name: "atmosphera",
        title: "Atmosphera — AI Music",
        icon: "fa-solid fa-music",
        order: Object.keys(group.tools).length,
        button: true,
        visible: game.user.isGM,
        onChange: () => {
          const existing = foundry.applications.instances?.get("atmosphera-panel");
          if (existing) existing.close();
          else controller.openPanel();
        }
      };
    }
  });

  // ── Fallback: Add chat command to open panel ──
  Hooks.on("chatMessage", (_html, content) => {
    if (content.trim().toLowerCase() === "/atmosphera") {
      controller.openPanel();
      return false;
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  AUTO-START
  // ════════════════════════════════════════════════════════════════

  if (game.settings.get(MODULE_ID, "enabled")) {
    setTimeout(() => {
      console.log(`${MODULE_ID} | Auto-starting on world ready`);
      controller.evaluateAndPlay(true);
    }, 2000);
  }

  // ════════════════════════════════════════════════════════════════
  //  SCENE TRANSITIONS + PRE-WARMING
  // ════════════════════════════════════════════════════════════════

  Hooks.on("canvasReady", () => {
    if (!game.settings.get(MODULE_ID, "enabled")) return;

    const sceneId = canvas?.scene?.id;

    if (sceneId && !controller._prewarmedScenes.has(sceneId)) {
      controller.prewarmScene(sceneId);
    }

    if (!controller.autoMode) return;
    if (game.combat?.active) return;

    console.log(`${MODULE_ID} | Scene activated — evaluating ambient`);
    controller._lastCategory = null;
    controller.evaluateAndPlay(true);
  });

  // ════════════════════════════════════════════════════════════════
  //  COMBAT LIFECYCLE
  // ════════════════════════════════════════════════════════════════

  Hooks.on("combatStart", () => {
    if (!game.settings.get(MODULE_ID, "enabled")) return;
    if (!controller.autoMode) return;
    console.log(`${MODULE_ID} | Combat started — switching to combat music`);

    controller._lastCombatSignature = GameStateCollector.combatSignature();
    controller.evaluateAndPlay(true);
    controller._pregenerateStings();
  });

  Hooks.on("updateCombat", (combat, changed) => {
    if (!game.settings.get(MODULE_ID, "enabled")) return;
    if (!controller.autoMode) return;
    if (!("round" in changed)) return;

    const newSig = GameStateCollector.combatSignature();
    if (newSig === controller._lastCombatSignature) {
      console.log(`${MODULE_ID} | Round changed but combat composition unchanged — skipping`);
      return;
    }
    console.log(`${MODULE_ID} | Combat composition changed: "${controller._lastCombatSignature}" → "${newSig}"`);
    controller._lastCombatSignature = newSig;
    controller.evaluateAndPlay(true);
  });

  Hooks.on("combatEnd", () => {
    if (!game.settings.get(MODULE_ID, "enabled")) return;
    if (!controller.autoMode) return;
    console.log(`${MODULE_ID} | Combat ended`);

    controller._lastCombatSignature = "";
    const party = GameStateCollector._collectParty();
    controller.playSting(party.allDown ? "defeat" : "victory");
  });

  Hooks.on("deleteCombat", () => {
    if (!game.settings.get(MODULE_ID, "enabled")) return;
    if (!controller.autoMode) return;
    console.log(`${MODULE_ID} | Combat deleted — reverting to ambient`);
    controller._lastCombatSignature = "";
    controller._lastCategory = null;
    controller.evaluateAndPlay(true);
  });

  // ════════════════════════════════════════════════════════════════
  //  LIVE UPDATES
  // ════════════════════════════════════════════════════════════════

  Hooks.on("updateActor", (actor, changed) => {
    if (!game.settings.get(MODULE_ID, "enabled")) return;
    if (!controller.autoMode) return;
    if (!game.combat?.active) return;

    const hpChanged = changed?.system?.attributes?.hp;
    const spellsChanged = changed?.system?.spells;
    const resourcesChanged = changed?.system?.resources;

    if (hpChanged || spellsChanged || resourcesChanged) {
      clearTimeout(controller._updateActorTimer);
      controller._updateActorTimer = setTimeout(() => {
        const newSig = GameStateCollector.combatSignature();
        if (newSig !== controller._lastCombatSignature) {
          console.log(`${MODULE_ID} | Combat composition changed via actor update`);
          controller._lastCombatSignature = newSig;
          controller.evaluateAndPlay(true);
        } else {
          controller.evaluateAndPlay();
        }
      }, 500);
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  PAUSE / UNPAUSE
  // ════════════════════════════════════════════════════════════════

  Hooks.on("pauseGame", (paused) => {
    if (!game.settings.get(MODULE_ID, "enabled")) return;
    if (paused) {
      console.log(`${MODULE_ID} | Game paused — stopping Atmosphera playlists`);
      FoundryPlaylistManager.stopAllAtmosphera(2000);
      controller._setStatus("Paused");
    } else {
      console.log(`${MODULE_ID} | Game unpaused — resuming`);
      controller._lastCategory = null;
      controller.evaluateAndPlay(true);
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  SETTING CHANGES
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

  ui.notifications.info("Atmosphera v0.2.0 ready — music syncs to all players via Foundry playlists.");
});
