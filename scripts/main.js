/**
 * Atmosphera — AI-powered dynamic atmosphere music for FoundryVTT
 * v0.4.0 — ApplicationV2 migration, consolidated playlists, generation cooldown,
 *           scene variety timer, richer prompts, dedup detection.
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

/* ──────────────────────────── ATMOSPHERIC MODIFIERS (for prompt variety) ──── */

const ATMOSPHERIC_MODIFIERS = [
  "with distant echoes", "tension building slowly", "with subtle percussion",
  "strings prominent", "minimal and sparse", "layered and complex",
  "with reverb", "lo-fi texture", "cinematic quality", "with ambient pads",
  "brooding undertones", "gentle arpeggios", "with deep bass",
  "ethereal atmosphere", "with wind instruments", "rhythmic and driving",
  "sparse and haunting", "warm and enveloping", "with choir accents",
  "mysterious overtones"
];

/* ──────────────────────────── TITLE TEMPLATES ──────────────────────────── */

const COMBAT_TITLE_TEMPLATES = [
  "Battle: {creatures}",
  "Steel Against {creature}",
  "{creature}'s Domain",
  "The {mood} Confrontation",
  "Clash in {scene}",
  "Blades of {scene}",
  "{creature} Rising",
  "Fury of the {creature}",
  "Stand Against {creatures}",
  "The {mood} Battle"
];

const AMBIENT_TITLE_TEMPLATES = [
  "Shadows of {scene}",
  "Echoes in {scene}",
  "The {mood} {scene}",
  "Whispers of {scene}",
  "{scene} — {mood}",
  "Wandering {scene}",
  "Heart of {scene}",
  "Beneath {scene}",
  "The Stillness of {scene}",
  "{mood} Passage"
];

const MOOD_DESCRIPTORS = [
  "Dark", "Haunted", "Serene", "Ancient", "Forgotten", "Sacred",
  "Twisted", "Luminous", "Shifting", "Silent", "Restless", "Fading",
  "Crimson", "Verdant", "Gilded", "Sunken", "Hollow", "Ember"
];

/* ──────────────────────────── DEFAULT SCENE NAMES (skip generation) ──────── */

const DEFAULT_SCENE_NAMES = new Set([
  "foundry virtual tabletop",
  "default scene",
  "new scene",
  "untitled scene",
  "test scene"
]);

/* ──────────────────────────── RESOURCE THRESHOLDS ──────────────────────────── */

const RESOURCE_DESCRIPTORS = {
  fresh: { min: 0.75, prompt: "well-rested, prepared, confident" },
  moderate: { min: 0.40, prompt: null },
  low: { min: 0.15, prompt: "tension rising, resources dwindling, urgent" },
  critical: { min: 0, prompt: "desperate, last reserves, do-or-die intensity" }
};

const HP_DESCRIPTORS = {
  healthy: { min: 0.75, prompt: null },
  bloodied: { min: 0.40, prompt: "desperate, intense, stakes rising, adrenaline, urgent" },
  critical: { min: 0, prompt: "dire peril, last stand, heroic struggle, do-or-die" }
};

function getDescriptor(pct, table) {
  for (const [, entry] of Object.entries(table)) {
    if (pct >= entry.min) return entry.prompt;
  }
  return null;
}

function _pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function _pickRandomN(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

/* ──────────────────────────── DEDUP DETECTION ──────────────────────────── */

class PromptDeduplicator {
  constructor(maxHistory = 5) {
    this._history = [];
    this._maxHistory = maxHistory;
  }

  /**
   * Check if prompt is too similar to recent prompts.
   * Returns true if >80% word overlap with any recent prompt.
   */
  isSimilar(prompt) {
    const words = this._tokenize(prompt);
    for (const prev of this._history) {
      const prevWords = this._tokenize(prev);
      const overlap = this._overlapRatio(words, prevWords);
      if (overlap > 0.8) return true;
    }
    return false;
  }

  record(prompt) {
    this._history.push(prompt);
    if (this._history.length > this._maxHistory) {
      this._history.shift();
    }
  }

  _tokenize(str) {
    return new Set(str.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2));
  }

  _overlapRatio(setA, setB) {
    if (setA.size === 0 || setB.size === 0) return 0;
    let overlap = 0;
    for (const w of setA) {
      if (setB.has(w)) overlap++;
    }
    return overlap / Math.max(setA.size, setB.size);
  }
}

/* ──────────────────────────── SETTINGS ──────────────────────────── */

function registerSettings() {
  const s = (key, data) => game.settings.register(MODULE_ID, key, data);

  s("piapiApiKey", {
    name: "PiAPI API Key",
    hint: "Your PiAPI API key for Udio music generation (from piapi.ai).",
    scope: "world", config: true, type: String, default: ""
  });

  s("instrumental", {
    name: "Instrumental",
    hint: "Generate instrumental tracks (no vocals).",
    scope: "world", config: true, type: Boolean, default: true
  });

  s("negativeTags", {
    name: "Negative Tags",
    hint: "Styles/elements to avoid in generated music. Comma-separated.",
    scope: "world", config: true, type: String,
    default: "vocals, singing, lyrics, voice, spoken word"
  });

  s("titlePrefix", {
    name: "Title Prefix",
    hint: "Prefix for generated track titles.",
    scope: "world", config: true, type: String, default: "Atmosphera"
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

  s("generationCooldown", {
    name: "Max Cooldown (seconds)",
    hint: "Maximum cooldown when rapid switching is detected. Normal scene changes generate immediately — cooldown only activates when 3+ generation requests happen within 60 seconds.",
    scope: "world", config: true, type: Number, default: 180,
    range: { min: 60, max: 600, step: 10 }
  });

  s("sceneRefreshInterval", {
    name: "Scene Variety Timer (minutes)",
    hint: "After this many minutes in the same scene, trigger a fresh generation.",
    scope: "world", config: true, type: Number, default: 15,
    range: { min: 5, max: 60, step: 1 }
  });

  s("setupComplete", {
    name: "Setup Complete",
    scope: "world", config: false, type: Boolean, default: false
  });

  s("reauth", {
    name: "Re-configure PiAPI",
    hint: "Click here to re-open the PiAPI configuration wizard. You can also use the /atmosphera auth chat command.",
    scope: "world", config: true, type: Boolean, default: false,
    onChange: () => {
      game.settings.set(MODULE_ID, "reauth", false);
      const mod = game.modules.get(MODULE_ID);
      if (mod?.api?.openSetup) {
        mod.api.openSetup();
      }
    }
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
    const alive = combat.creatures.filter(c => !c.isDead);
    const types = combat.creatureTypes.slice().sort().join(",");
    const bossFlag = combat.hasBoss ? "|BOSS" : "";
    const aliveCount = alive.length;
    const bossAlive = combat.bosses.filter(b => !b.isDead).length;
    // Include alive counts so monster deaths change the signature
    return `${types}|${aliveCount}e|${bossAlive}b${bossFlag}`;
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

    // Add 1-2 random atmospheric modifiers for variety
    const modifiers = _pickRandomN(ATMOSPHERIC_MODIFIERS, 1 + Math.floor(Math.random() * 2));
    parts.push(...modifiers);

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
    const mood = _pickRandom(MOOD_DESCRIPTORS);

    if (combat.active) {
      const template = _pickRandom(COMBAT_TITLE_TEMPLATES);
      const creatureName = combat.hasBoss
        ? (combat.bosses.filter(b => !b.isDead)[0]?.name || "Boss")
        : (combat.creatureTypes[0] || "Foe");
      const creatureNames = combat.creatureTypes.length
        ? combat.creatureTypes.slice(0, 2).map(t => t.replace(/^\w/, c => c.toUpperCase())).join(" & ")
        : "Unknown Foes";
      const sceneName = canvas?.scene?.name || "the Unknown";

      return template
        .replace("{creature}", creatureName.replace(/^\w/, c => c.toUpperCase()))
        .replace("{creatures}", creatureNames)
        .replace("{scene}", sceneName)
        .replace("{mood}", mood);
    } else {
      const template = _pickRandom(AMBIENT_TITLE_TEMPLATES);
      const sceneName = scene.name || "the Unknown";

      return template
        .replace("{scene}", sceneName)
        .replace("{mood}", mood);
    }
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

/* ──────────────────────────── UDIO CLIENT (PiAPI) ──────────────────────────── */

class UdioClient {
  static _queue = Promise.resolve();

  /** Serialize all PiAPI calls to prevent rate limiting */
  static _enqueue(fn) {
    this._queue = this._queue.then(fn, fn);
    return this._queue;
  }

  static _apiKey() {
    return game.settings.get(MODULE_ID, "piapiApiKey");
  }

  static _headers() {
    return { "Content-Type": "application/json", "x-api-key": this._apiKey() };
  }

  static async createTask(prompt) {
    const resp = await fetch("https://api.piapi.ai/api/v1/task", {
      method: "POST",
      headers: this._headers(),
      body: JSON.stringify({
        model: "music-u",
        task_type: "generate_music",
        input: {
          gpt_description_prompt: prompt,
          negative_tags: game.settings.get(MODULE_ID, "negativeTags") || "",
          lyrics_type: game.settings.get(MODULE_ID, "instrumental") ? "instrumental" : "default",
          seed: -1
        },
        config: {
          service_mode: "public",
          webhook_config: { endpoint: "", secret: "" }
        }
      })
    });
    if (!resp.ok) throw new Error(`PiAPI create task failed: ${resp.status}`);
    const data = await resp.json();
    if (data.code !== 200) throw new Error(`PiAPI create task error: ${JSON.stringify(data)}`);
    return data.data.task_id;
  }

  static async pollTask(taskId) {
    const resp = await fetch(`https://api.piapi.ai/api/v1/task/${taskId}`, {
      headers: { "x-api-key": this._apiKey() }
    });
    if (!resp.ok) throw new Error(`PiAPI poll failed: ${resp.status}`);
    return resp.json();
  }

  static async getCredits() {
    return { credits_left: "N/A (check piapi.ai dashboard)" };
  }

  static generateAndWait(prompt, title) {
    return this._enqueue(() => this._generateAndWaitInner(prompt, title));
  }

  static async _generateAndWaitInner(prompt, title) {
    console.log(`${MODULE_ID} | Generating via PiAPI Udio: "${title}" — ${prompt}`);
    const taskId = await this.createTask(prompt);
    console.log(`${MODULE_ID} | PiAPI task created: ${taskId}`);

    for (let i = 0; i < 180; i++) {
      await new Promise(r => setTimeout(r, 10000));
      if (i % 10 === 0) console.log(`${MODULE_ID} | Polling attempt ${i + 1}/180 for task ${taskId}...`);

      let result;
      try {
        result = await this.pollTask(taskId);
      } catch (e) {
        console.warn(`${MODULE_ID} | Poll error (will retry): ${e.message}`);
        continue;
      }

      const status = result?.data?.status;
      if (status === "completed" || status === "success") {
        const output = result.data.output || result.data.task_result?.output;
        let audioUrl, trackTitle, duration;

        if (output?.songs && Array.isArray(output.songs) && output.songs.length > 0) {
          const track = output.songs[0];
          audioUrl = track.song_path || track.audio_url || track.url;
          trackTitle = track.title;
          duration = track.duration;
        } else if (typeof output === "string") {
          audioUrl = output;
        } else if (Array.isArray(output) && output.length > 0) {
          const track = output[0];
          audioUrl = track.song_path || track.audio_url || track.url || track;
          trackTitle = track.title;
          duration = track.duration;
        } else if (output && typeof output === "object") {
          audioUrl = output.song_path || output.audio_url || output.url;
          trackTitle = output.title;
          duration = output.duration;
        }

        if (!audioUrl) {
          console.warn(`${MODULE_ID} | Task succeeded but no audio URL found in output:`, output);
          throw new Error("PiAPI task succeeded but no audio URL in response");
        }

        console.log(`${MODULE_ID} | Track complete: ${taskId}`);
        return {
          id: taskId,
          url: audioUrl,
          title: trackTitle || title,
          tags: prompt,
          duration: duration || null,
          prompt
        };
      }

      if (status === "failed") {
        const err = new Error("PiAPI Udio generation failed");
        err._taskId = taskId;
        throw err;
      }
    }
    const err = new Error("PiAPI Udio generation timed out (30 min)");
    err._taskId = taskId;
    throw err;
  }
}

/* ──────────────────────────── FOUNDRY PLAYLIST MANAGER ──────────────────────────── */

/**
 * Manages playback through Foundry's native Playlist system.
 * Uses consolidated playlists: "🎵 Atmosphera — Ambient" and "🎵 Atmosphera — Combat".
 */
class FoundryPlaylistManager {

  /**
   * Stop all Atmosphera-managed playlists (those with the atmosphera flag).
   */
  static async stopAllAtmosphera(fadeDuration = 1000) {
    const playlists = game.playlists?.filter(p =>
      p.getFlag(MODULE_ID, "managed") === true && p.playing
    ) || [];

    for (const playlist of playlists) {
      try {
        for (const sound of playlist.sounds) {
          if (sound.playing) {
            await playlist.stopSound(sound, { fade: fadeDuration });
          }
        }
      } catch (e) {
        console.warn(`${MODULE_ID} | Error stopping playlist "${playlist.name}":`, e);
        try { await playlist.stopAll(); } catch {}
      }
    }
  }

  /**
   * Play a track via Foundry's playlist system.
   * Uses consolidated playlists instead of per-category playlists.
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

    // Find or create the categorized playlist (inside Atmosphera folder)
    const playlistName = PlaylistCacheManager._playlistName(category);
    const playlist = await PlaylistCacheManager._getOrCreatePlaylist(playlistName, category, fadeDuration);

    // Check if this sound already exists in the playlist
    let sound = playlist.sounds.find(s => s.path === filePath);

    if (!sound) {
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

class PlaylistSearcher {

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

  static search(category, prompt = "") {
    const keywords = this._extractKeywords(category, prompt);
    if (keywords.length === 0) return null;

    const expandedKeywords = new Set(keywords);
    for (const kw of keywords) {
      const synonyms = this.KEYWORD_SYNONYMS[kw];
      if (synonyms) synonyms.forEach(s => expandedKeywords.add(s));
    }

    let bestMatch = null;
    let bestScore = 0;

    for (const playlist of game.playlists || []) {
      if (!playlist.sounds.size) continue;

      // Skip Atmosphera-managed playlists — those are handled by _findExact/_findFuzzy
      const isAtmosphera = playlist.getFlag(MODULE_ID, "managed") === true;
      if (isAtmosphera) continue;

      const playlistText = (playlist.name + " " + (playlist.description || "")).toLowerCase();

      for (const sound of playlist.sounds) {
        const soundText = (sound.name + " " + (sound.description || "")).toLowerCase();
        const fullText = playlistText + " " + soundText;

        let score = 0;
        for (const kw of expandedKeywords) {
          if (fullText.includes(kw)) score++;
        }

        if (score === 0) continue;

        const normalizedScore = score / expandedKeywords.size;

        if (normalizedScore > bestScore) {
          bestScore = normalizedScore;
          bestMatch = {
            playlist,
            sound,
            path: sound.path,
            source: "existing",
            score: normalizedScore
          };
        }
      }
    }

    if (bestMatch && bestScore >= 0.3) {
      console.log(`${MODULE_ID} | Playlist search: "${category}" → "${bestMatch.sound.name}" in "${bestMatch.playlist.name}" (score: ${Math.round(bestScore * 100)}%, source: ${bestMatch.source})`);
      return bestMatch;
    }

    return null;
  }

  static _extractKeywords(category, prompt) {
    const words = new Set();

    for (const part of category.split("-")) {
      const cleaned = part.trim().toLowerCase();
      if (cleaned && cleaned.length > 2) words.add(cleaned);
    }

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
  static PLAYLIST_PREFIX = "🎵 Atmosphera";

  /**
   * Find a cached track — first search ALL playlists for matches,
   * then try exact Atmosphera match, then fuzzy Atmosphera match.
   */
  static findCached(category, prompt = "") {
    // Priority 1: Exact Atmosphera match (same category flag)
    const exact = this._findExact(category);
    if (exact) return exact;

    // Priority 2: Fuzzy Atmosphera match (keyword overlap between categories)
    const fuzzy = this._findFuzzy(category);
    if (fuzzy) return fuzzy;

    // Priority 3: Search ALL playlists by text similarity (existing user music)
    const existingMatch = PlaylistSearcher.search(category, prompt);
    if (existingMatch) {
      return {
        playlist: existingMatch.playlist,
        sound: existingMatch.sound,
        url: existingMatch.path,
        category,
        fuzzy: true,
        fromExisting: existingMatch.source === "existing"
      };
    }

    return null;
  }

  static _findExact(category) {
    // Search within the consolidated playlist for sounds with matching category flag
    const playlistName = this._playlistName(category);
    const playlist = game.playlists?.find(p => p.name === playlistName);
    if (!playlist || !playlist.sounds.size) return null;

    // Prefer sounds flagged with this exact category
    const matchingSounds = [...playlist.sounds].filter(s =>
      s.getFlag(MODULE_ID, "category") === category
    );
    if (matchingSounds.length) {
      const sound = matchingSounds[Math.floor(Math.random() * matchingSounds.length)];
      return { playlist, sound, url: sound.path, category, fuzzy: false };
    }

    // Fallback: any sound in the playlist
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
      for (const sound of playlist.sounds) {
        const soundCat = sound.getFlag(MODULE_ID, "category") || "";
        const candidateKeywords = soundCat.split("-").filter(Boolean);
        if (!candidateKeywords.length) continue;

        const overlap = requestedKeywords.filter(kw => candidateKeywords.includes(kw)).length;
        const score = overlap / requestedKeywords.length;

        if (score > bestScore) {
          bestScore = score;
          bestMatch = { playlist, sound, url: sound.path, category: soundCat, fuzzy: true, score };
        }
      }
    }

    if (bestMatch && bestScore > 0.5) {
      console.log(`${MODULE_ID} | Fuzzy match: "${category}" → "${bestMatch.category}" (${Math.round(bestScore * 100)}%)`);
      return bestMatch;
    }

    return null;
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
    const topType = category.split("-")[0] || "misc";
    const subFolder = topType === "sting" ? "stings" : topType;
    const dirPath = `${folder}/${subFolder}`;

    const FP = foundry.applications?.apps?.FilePicker?.implementation ?? FilePicker;

    try { await FP.browse("data", dirPath); } catch {
      try { await FP.browse("data", folder); } catch { await FP.createDirectory("data", folder); }
      await FP.createDirectory("data", dirPath);
    }

    const filename = `${track.id}.mp3`;
    let filePath;
    try {
      const audioResp = await fetch(track.url);
      if (!audioResp.ok) throw new Error(`Download failed: ${audioResp.status}`);
      const blob = await audioResp.blob();
      const file = new File([blob], filename, { type: "audio/mpeg" });
      const uploadResult = await FP.upload("data", dirPath, file);
      filePath = uploadResult.path;
    } catch (e) {
      console.warn(`${MODULE_ID} | Failed to download/upload track, using remote URL`, e);
      filePath = track.url;
    }

    // Find or create the categorized playlist (inside Atmosphera folder)
    const playlistName = this._playlistName(category);
    const playlist = await this._getOrCreatePlaylist(playlistName, category);

    await playlist.createEmbeddedDocuments("PlaylistSound", [{
      name: track.title || `${category} — ${track.id}`,
      path: filePath, volume: 0.8, repeat: true,
      fade: game.settings.get(MODULE_ID, "crossfadeDuration"),
      description: track.prompt || `Generated for: ${category}`,
      flags: { [MODULE_ID]: { prompt: track.prompt || "", category, generatedAt: Date.now(), udioTaskId: track.id } }
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
    const track = await UdioClient.generateAndWait(prompt, title);
    statusCb?.("Downloading…");
    return this.saveTrack(category, track);
  }

  static async preload(prompt, title, category) {
    if (this.findCached(category, prompt)) return;
    try {
      console.log(`${MODULE_ID} | Preloading: ${category}`);
      const track = await UdioClient.generateAndWait(prompt, title);
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
      for (const sound of playlist.sounds) {
        const cat = sound.getFlag(MODULE_ID, "category") || "unknown";
        if (!library[cat]) library[cat] = [];
        library[cat].push({
          name: sound.name, path: sound.path, playing: sound.playing
        });
      }
    }
    return library;
  }

  /**
   * Categorized playlist naming (4 playlists max inside an "Atmosphera" folder):
   *   🎵 Atmosphera — Ambient
   *   🎵 Atmosphera — Combat
   *   🎵 Atmosphera — Boss
   *   🎵 Atmosphera — Stings
   */
  static _playlistName(category) {
    const topType = (category.split("-")[0] || "ambient").toLowerCase();
    if (topType === "boss") return `${this.PLAYLIST_PREFIX} — Boss`;
    if (topType === "combat") return `${this.PLAYLIST_PREFIX} — Combat`;
    if (topType === "sting") return `${this.PLAYLIST_PREFIX} — Stings`;
    return `${this.PLAYLIST_PREFIX} — Ambient`;
  }

  /**
   * Find or create the "Atmosphera" playlist folder.
   */
  static async _getOrCreateFolder() {
    let folder = game.folders?.find(f => f.name === "Atmosphera" && f.type === "Playlist");
    if (!folder) {
      folder = await Folder.create({ name: "Atmosphera", type: "Playlist", color: "#7a5ba6" });
    }
    return folder;
  }

  /**
   * Find or create a managed playlist by name, inside the Atmosphera folder.
   */
  static async _getOrCreatePlaylist(playlistName, category, fadeDuration = 3000) {
    let playlist = game.playlists?.find(p => p.name === playlistName);
    if (!playlist) {
      const folder = await this._getOrCreateFolder();
      playlist = await Playlist.create({
        name: playlistName,
        mode: CONST.PLAYLIST_MODES.SEQUENTIAL,
        description: "Auto-generated by Atmosphera",
        playing: false,
        fade: fadeDuration,
        folder: folder.id,
        flags: { [MODULE_ID]: { managed: true, category } }
      });
    } else if (!playlist.getFlag(MODULE_ID, "managed")) {
      await playlist.setFlag(MODULE_ID, "managed", true);
    }
    return playlist;
  }
}

/* ──────────────────────────── CONTROL PANEL (ApplicationV2) ──────────────── */

class AtmospheraPanel extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static DEFAULT_OPTIONS = {
    id: "atmosphera-panel",
    window: {
      title: "🎵 Atmosphera",
      resizable: false
    },
    position: {
      width: 360,
      height: "auto",
      top: 80,
      left: 20
    },
    classes: ["atmosphera-panel"]
  };

  static PARTS = {
    main: {
      template: undefined // We use inline rendering
    }
  };

  constructor(controller, options = {}) {
    super(options);
    this.controller = controller;
  }

  /** Override _renderHTML to provide inline HTML instead of a template file. */
  async _renderHTML(_context, _options) {
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

    const cooldownSec = game.settings.get(MODULE_ID, "generationCooldown");
    const refreshMin = game.settings.get(MODULE_ID, "sceneRefreshInterval");

    const htmlString = `
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
                <label style="font-size:11px;">
                  <input type="checkbox" id="atmo-gen-instrumental" ${game.settings.get(MODULE_ID, "instrumental") ? "checked" : ""}/> Instrumental (no vocals)
                </label>
              </div>
              <div style="margin-bottom:6px;">
                <label style="font-size:11px;">Negative Tags</label>
                <input type="text" id="atmo-gen-negative-tags" value="${game.settings.get(MODULE_ID, "negativeTags")}" style="width:100%;font-size:11px;" placeholder="vocals, singing, voice"/>
              </div>
              <div style="margin-bottom:6px;">
                <label style="font-size:11px;">Cooldown: ${cooldownSec}s | Scene refresh: ${refreshMin}min</label>
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
    `;

    const container = document.createElement("div");
    container.innerHTML = htmlString.trim();
    return { main: container };
  }

  /** Replace inner content of the app element. */
  _replaceHTML(result, content, _options) {
    const main = result.main;
    content.replaceChildren(main);
    this._activateListeners(content);
  }

  _activateListeners(html) {
    const c = this.controller;

    html.querySelector("#atmo-enabled-toggle")?.addEventListener("click", () => {
      const newVal = !game.settings.get(MODULE_ID, "enabled");
      game.settings.set(MODULE_ID, "enabled", newVal);
      if (newVal) {
        c.evaluateAndPlay(true);
      } else {
        c.stop();
      }
      setTimeout(() => this.render(), 100);
    });

    html.querySelector("#atmo-auto-toggle")?.addEventListener("click", () => {
      c.autoMode = !c.autoMode;
      if (c.autoMode) { c.manualMood = null; c.evaluateAndPlay(true); }
      this.render();
    });

    html.querySelector("#atmo-mood-select")?.addEventListener("change", (e) => {
      if (e.target.value) c.setMood(e.target.value);
    });

    html.querySelector("#atmo-play")?.addEventListener("click", () => {
      const textarea = html.querySelector("#atmo-prompt-display");
      c.triggerGeneration(textarea?.value);
    });

    html.querySelector("#atmo-stop")?.addEventListener("click", () => { c.stop(); this.render(); });

    html.querySelector("#atmo-volume")?.addEventListener("input", (e) => {
      const v = parseFloat(e.target.value);
      FoundryPlaylistManager.setVolume(v);
      game.settings.set(MODULE_ID, "masterVolume", v);
    });

    html.querySelector("#atmo-gen-instrumental")?.addEventListener("change", (e) => {
      game.settings.set(MODULE_ID, "instrumental", e.target.checked);
    });

    html.querySelector("#atmo-gen-negative-tags")?.addEventListener("change", (e) => {
      game.settings.set(MODULE_ID, "negativeTags", e.target.value);
    });
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
    this._consecutiveFailures = 0;
    this._lastFailTime = null;
    this._stingSavedCategory = null;

    // Smart combat re-evaluation
    this._lastCombatSignature = "";

    // Scene pre-warming
    this._prewarmedScenes = new Set();

    // Track end detection interval
    this._endCheckInterval = null;

    // Adaptive generation cooldown — detects rapid switching vs normal transitions
    this._lastSuccessfulGeneration = 0;
    this._generationTimestamps = []; // recent generation request timestamps
    this._adaptiveCooldownUntil = 0; // timestamp when adaptive cooldown expires

    // Scene variety timer
    this._sceneRefreshTimer = null;
    this._forceNewGeneration = false;
    this._currentSceneId = null;

    // Dedup detection
    this._dedup = new PromptDeduplicator(5);

    // Playback lock — prevents re-evaluation during playback startup
    this._playbackLock = false;
    this._lastPlayTime = 0;
    this._minPlayDuration = 30000; // Don't switch tracks within 30s
  }

  init() {
    this._startEndDetection();

    Hooks.on("updatePlaylistSound", (sound, changed) => {
      if (!changed.playing && changed.playing === false) {
        const playlist = sound.parent;
        if (playlist?.getFlag(MODULE_ID, "managed")) {
          console.log(`${MODULE_ID} | Atmosphera sound stopped: "${sound.name}"`);
          this._onTrackEnded();
        }
      }
    });
  }

  _startEndDetection() {
    if (this._endCheckInterval) clearInterval(this._endCheckInterval);
    this._endCheckInterval = setInterval(() => {
      if (!game.settings.get(MODULE_ID, "enabled")) return;
      if (!this.autoMode) return;

      if (this._playbackLock) return;

      if (this._lastCategory && !FoundryPlaylistManager.isPlaying) {
        const now = Date.now();
        // Don't re-evaluate within min play duration of last play command
        if (this._lastPlayTime && (now - this._lastPlayTime) < this._minPlayDuration) return;
        const cooldown = this._consecutiveFailures ? Math.min(300000, 30000 * this._consecutiveFailures) : 0;
        if (this._lastFailTime && (now - this._lastFailTime) < cooldown) return;
        console.log(`${MODULE_ID} | No Atmosphera playlist playing — re-evaluating`);
        this._lastCategory = null;
        this.evaluateAndPlay(true);
      }
    }, 10000);
  }

  _onTrackEnded() {
    if (!this.autoMode) return;
    if (!game.settings.get(MODULE_ID, "enabled")) return;

    const state = GameStateCollector.collect();
    const { category } = PromptBuilder.build(state, this.manualMood);
    if (category !== this._lastCategory) {
      this._lastCategory = null;
      this.evaluateAndPlay(true);
    }
  }

  /** Start/reset scene variety timer */
  _resetSceneRefreshTimer() {
    if (this._sceneRefreshTimer) clearTimeout(this._sceneRefreshTimer);
    const intervalMin = game.settings.get(MODULE_ID, "sceneRefreshInterval");
    const intervalMs = intervalMin * 60 * 1000;
    this._sceneRefreshTimer = setTimeout(() => {
      console.log(`${MODULE_ID} | Scene variety timer fired — forcing new generation`);
      this._forceNewGeneration = true;
      this._lastCategory = null;
      this.evaluateAndPlay(true);
      // Reset for another cycle
      this._resetSceneRefreshTimer();
    }, intervalMs);
  }

  onSceneChange(sceneId) {
    this._currentSceneId = sceneId;
    this._forceNewGeneration = false;

    // Don't start variety timer for default/placeholder scenes
    const sceneName = canvas?.scene?.name || "";
    if (DEFAULT_SCENE_NAMES.has(sceneName.toLowerCase().trim())) {
      if (this._sceneRefreshTimer) clearTimeout(this._sceneRefreshTimer);
    } else {
      this._resetSceneRefreshTimer();
    }
  }

  /** Play a cached track directly without triggering generation. */
  async _playFromCache(cached, category) {
    if (this._playbackLock) return;
    if (this._lastPlayTime && (Date.now() - this._lastPlayTime) < this._minPlayDuration) return;

    const fadeDuration = game.settings.get(MODULE_ID, "crossfadeDuration");
    const volume = game.settings.get(MODULE_ID, "masterVolume");

    this._playbackLock = true;
    this._setStatus("Playing (cached)");
    this.currentTrackInfo = category;
    this._lastCategory = category;
    if (this.panel) this.panel.updateTrackInfo(this.currentTrackInfo);

    try {
      await FoundryPlaylistManager.play(cached.url, category, { volume, fadeDuration });
      this._lastPlayTime = Date.now();
      if (this.panel) this.panel.render();
    } catch (e) {
      console.error(`${MODULE_ID} | Cache playback failed:`, e);
    } finally {
      setTimeout(() => { this._playbackLock = false; }, 5000);
    }
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

    // Respect playback lock
    if (this._playbackLock) {
      console.log(`${MODULE_ID} | Playback locked — skipping evaluation`);
      return;
    }

    // Don't switch tracks within minimum play duration (unless forced by combat state change)
    if (!force && this._lastPlayTime && (Date.now() - this._lastPlayTime) < this._minPlayDuration) {
      return;
    }

    const state = GameStateCollector.collect();

    // Default scenes: generate once, then always use cache (no variety timer)
    if (!state.combat.active && state.scene.name) {
      const nameLower = state.scene.name.toLowerCase().trim();
      if (DEFAULT_SCENE_NAMES.has(nameLower)) {
        this._forceNewGeneration = false; // Never force-refresh default scenes
        // If already cached, play from cache and skip generation
        const { category } = PromptBuilder.build(state, this.manualMood);
        const cached = PlaylistCacheManager.findCached(category);
        if (cached) {
          console.log(`${MODULE_ID} | Default scene "${state.scene.name}" — using cached track`);
          this._playFromCache(cached, category);
          return;
        }
        // No cache yet — fall through to generate once
      }
    }

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

    // Adaptive cooldown: detect rapid switching vs normal transitions
    // Normal transition (scene change, combat start) = generate immediately
    // Rapid switching (3+ requests in 60s) = throttle to prevent credit waste
    const now = Date.now();
    const RAPID_WINDOW = 60000; // 60s window to detect rapid switching
    const RAPID_THRESHOLD = 3;  // 3+ generation requests in window = rapid
    const maxCooldownMs = game.settings.get(MODULE_ID, "generationCooldown") * 1000;

    // Track this generation request
    this._generationTimestamps.push(now);
    // Trim old timestamps outside the window
    this._generationTimestamps = this._generationTimestamps.filter(t => now - t < RAPID_WINDOW);

    // Check if we're in an active adaptive cooldown
    if (now < this._adaptiveCooldownUntil) {
      const remaining = Math.round((this._adaptiveCooldownUntil - now) / 1000);
      const cached = PlaylistCacheManager.findCached(category, prompt);
      if (cached) {
        console.log(`${MODULE_ID} | Adaptive cooldown (${remaining}s remaining), playing cached`);
        this._setStatus("Playing (cooldown — cached)");
        this.currentTrackInfo = category;
        if (this.panel) this.panel.updateTrackInfo(this.currentTrackInfo);
        const fadeDuration = game.settings.get(MODULE_ID, "crossfadeDuration");
        const volume = game.settings.get(MODULE_ID, "masterVolume");
        await FoundryPlaylistManager.play(cached.url, category, { volume, fadeDuration, title, prompt });
        this._lastPlayTime = Date.now();
        if (this.panel) this.panel.render();
        return;
      }
      console.log(`${MODULE_ID} | Adaptive cooldown (${remaining}s remaining), no cache — skipping`);
      this._setStatus(`Cooldown (${remaining}s remaining)`);
      return;
    }

    // Detect rapid switching: if 3+ requests in 60s, activate adaptive cooldown
    if (this._generationTimestamps.length >= RAPID_THRESHOLD) {
      // Escalate: cooldown = min(maxCooldown, 60s * overshoot count)
      const overshoot = this._generationTimestamps.length - RAPID_THRESHOLD + 1;
      const cooldownMs = Math.min(maxCooldownMs, 60000 * overshoot);
      this._adaptiveCooldownUntil = now + cooldownMs;
      console.log(`${MODULE_ID} | Rapid switching detected (${this._generationTimestamps.length} requests in 60s), cooldown ${Math.round(cooldownMs / 1000)}s`);
      // Still allow THIS generation through (it's the one that triggered the cooldown)
      // but subsequent ones will be blocked
    }

    // Dedup detection: if prompt is very similar to recent ones and we have cache, use cache
    if (!this._forceNewGeneration && this._dedup.isSimilar(prompt)) {
      const cached = PlaylistCacheManager.findCached(category, prompt);
      if (cached) {
        console.log(`${MODULE_ID} | Dedup: prompt too similar to recent, using cache`);
        this._setStatus("Playing (dedup — cached)");
        this.currentTrackInfo = category;
        if (this.panel) this.panel.updateTrackInfo(this.currentTrackInfo);
        const fadeDuration = game.settings.get(MODULE_ID, "crossfadeDuration");
        const volume = game.settings.get(MODULE_ID, "masterVolume");
        await FoundryPlaylistManager.play(cached.url, category, { volume, fadeDuration, title, prompt });
        if (this.panel) this.panel.render();
        return;
      }
    }

    this._forceNewGeneration = false;
    this._generating = true;
    this._setStatus("Generating…");

    try {
      const url = await PlaylistCacheManager.getOrGenerate(prompt, title, category, (s) => this._setStatus(s));

      this._setStatus("Playing");
      this.currentTrackInfo = category;
      if (this.panel) this.panel.updateTrackInfo(this.currentTrackInfo);

      // Lock playback to prevent re-evaluation during startup
      this._playbackLock = true;

      const fadeDuration = game.settings.get(MODULE_ID, "crossfadeDuration");
      const volume = game.settings.get(MODULE_ID, "masterVolume");
      await FoundryPlaylistManager.play(url, category, {
        volume,
        fadeDuration,
        title: title,
        prompt: prompt
      });

      this._consecutiveFailures = 0;
      this._lastSuccessfulGeneration = Date.now();
      this._lastPlayTime = Date.now();
      this._dedup.record(prompt);

      // Release lock after 5 seconds (allow audio to fully start)
      setTimeout(() => { this._playbackLock = false; }, 5000);
      if (this.panel) this.panel.render();
    } catch (err) {
      this._consecutiveFailures = (this._consecutiveFailures || 0) + 1;
      this._lastFailTime = Date.now();
      console.error(`${MODULE_ID} | Generation error (failure #${this._consecutiveFailures}):`, err);

      if (this._consecutiveFailures >= 3) {
        console.warn(`${MODULE_ID} | ${this._consecutiveFailures} consecutive failures — backing off. Check PiAPI key/connection.`);
        ui.notifications.warn(`Atmosphera: API unavailable (${this._consecutiveFailures} failures). Will retry in ${this._consecutiveFailures * 30}s.`);
      }

      const pendingIds = err._taskId ? [err._taskId] : null;

      const fallback = PlaylistCacheManager.findAnyTrack(category);
      if (fallback) {
        console.log(`${MODULE_ID} | Playing fallback while waiting: "${fallback.category}"`);
        this._setStatus("Playing fallback — generating in background…");
        this.currentTrackInfo = `${fallback.category} (fallback)`;
        if (this.panel) this.panel.updateTrackInfo(this.currentTrackInfo);
        try {
          const fadeDuration = game.settings.get(MODULE_ID, "crossfadeDuration");
          const volume = game.settings.get(MODULE_ID, "masterVolume");
          await FoundryPlaylistManager.play(fallback.url, fallback.category, { volume, fadeDuration });
        } catch (e2) {
          console.error(`${MODULE_ID} | Fallback playback also failed:`, e2);
        }
      } else {
        this._setStatus(`Generating — please wait…`);
      }

      if (pendingIds && pendingIds.length) {
        console.log(`${MODULE_ID} | Continuing background poll for ${pendingIds.join(",")}`);
        this._backgroundPoll(pendingIds, prompt, title, category);
      } else if (!fallback) {
        ui.notifications.error(`Atmosphera: ${err.message}`);
        this._setStatus("Error — no tracks available");
      }
    } finally {
      this._generating = false;
      // Ensure lock releases even on error (with short grace period)
      if (this._playbackLock) {
        setTimeout(() => { this._playbackLock = false; }, 3000);
      }
      this._refreshCredits();

      if (this._queued) {
        const next = this._queued;
        this._queued = null;
        console.log(`${MODULE_ID} | Processing queued generation: ${next.category}`);
        this._doGenerate(next.prompt, next.title, next.category);
      }
    }
  }

  async _backgroundPoll(ids, prompt, title, category) {
    const taskId = ids[0];
    if (!taskId) return;
    for (let i = 0; i < 180; i++) {
      await new Promise(r => setTimeout(r, 10000));
      try {
        const result = await UdioClient.pollTask(taskId);
        const status = result?.data?.status;
        if (status === "completed" || status === "success") {
          const output = result.data.output || result.data.task_result?.output;
          let audioUrl;
          if (output?.songs && Array.isArray(output.songs) && output.songs.length > 0) audioUrl = output.songs[0].song_path || output.songs[0].audio_url || output.songs[0].url;
          else if (typeof output === "string") audioUrl = output;
          else if (Array.isArray(output) && output.length > 0) audioUrl = output[0].song_path || output[0].audio_url || output[0].url || output[0];
          else if (output && typeof output === "object") audioUrl = output.song_path || output.audio_url || output.url;

          if (!audioUrl) { console.warn(`${MODULE_ID} | Background poll: no audio URL in output`); return; }

          console.log(`${MODULE_ID} | Background poll succeeded! Task ready: ${taskId}`);
          const url = await PlaylistCacheManager.saveTrack(category, { id: taskId, url: audioUrl, title, tags: prompt, duration: null, prompt });
          const fadeDuration = game.settings.get(MODULE_ID, "crossfadeDuration");
          const volume = game.settings.get(MODULE_ID, "masterVolume");
          await FoundryPlaylistManager.play(url, category, { volume, fadeDuration, title, prompt });
          this._setStatus("Playing");
          this._lastSuccessfulGeneration = Date.now();
          this._dedup.record(prompt);
          this.currentTrackInfo = category;
          if (this.panel) this.panel.render();
          return;
        }
        if (status === "failed") {
          console.warn(`${MODULE_ID} | Background poll: task failed`);
          return;
        }
      } catch (e) {
        console.warn(`${MODULE_ID} | Background poll error (will retry):`, e.message);
      }
    }
    console.warn(`${MODULE_ID} | Background poll timed out after 30 minutes`);
  }

  async playSting(type) {
    const { prompt, category, title } = PromptBuilder.buildSting(type);
    this.currentPrompt = prompt;
    if (this.panel) this.panel.updatePrompt(prompt);

    this._stingSavedCategory = this._lastCategory;
    this._lastCategory = category;

    // Generate on-demand (uses cache if available)
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
      const data = await UdioClient.getCredits();
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
      <p>Atmosphera generates dynamic background music using <strong>Udio</strong> (via <strong>PiAPI</strong>).
      It reads your game state — scenes, combat, party health — and automatically creates
      fitting instrumental soundtracks.</p>
      <p><strong>New in v0.4.0:</strong> Consolidated playlists, generation cooldown, scene variety timer, richer prompts!</p>
      <p>You'll need:</p>
      <ul>
        <li>A <strong>PiAPI API key</strong> — <a href="https://piapi.ai" target="_blank">piapi.ai</a></li>
      </ul>
    </div>`;
  }

  static _step2HTML() {
    const apiKey = game.settings.get(MODULE_ID, "piapiApiKey") || "";
    return `<div class="atmosphera-wizard-content">
      <h2>API Configuration</h2>
      <div class="atmosphera-wizard-field" style="background:#f0edf5;padding:8px;border-radius:4px;margin-bottom:8px;">
        <strong>Quick Start:</strong> Sign up at <a href="https://piapi.ai" target="_blank">piapi.ai</a>,
        get an API key, and paste it below. That's it — no proxy server needed!
      </div>
      <div class="atmosphera-wizard-field">
        <label>PiAPI API Key</label>
        <input type="password" id="atmo-wiz-apikey" value="${apiKey}" placeholder="your-piapi-api-key"/>
        <span class="atmosphera-wizard-hint">Your API key from <a href="https://piapi.ai" target="_blank">piapi.ai</a>.</span>
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
        const apiKey = html.find("#atmo-wiz-apikey").val()?.trim();
        const result = html.find("#atmo-wiz-test-result");
        if (!apiKey) { result.text("❌ Enter an API key first.").css("color", "#a66"); return; }
        result.text("Testing…").css("color", "#aaa");
        try {
          const resp = await fetch("https://api.piapi.ai/api/v1/task", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": apiKey },
            body: JSON.stringify({ model: "music-u", task_type: "generate_music", input: { gpt_description_prompt: "test", negative_tags: "", lyrics_type: "instrumental", seed: -1 }, config: { service_mode: "public", webhook_config: { endpoint: "", secret: "" } } })
          });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const data = await resp.json();
          if (data.code === 200) {
            result.text(`✅ Connected! Task created: ${data.data?.task_id || "OK"}`).css("color", "#6a6");
            this._testPassed = true;
          } else {
            throw new Error(data.message || `Code ${data.code}`);
          }
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
    const apiKey = html.find("#atmo-wiz-apikey").val()?.trim() || "";
    game.settings.set(MODULE_ID, "piapiApiKey", apiKey);
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
  console.log(`${MODULE_ID} | Initializing Atmosphera v0.4.0`);
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

      controller,
      evaluate: () => controller.evaluateAndPlay(true),
      getCredits: () => UdioClient.getCredits(),
      CREATURE_HINTS, SCENE_KEYWORD_HINTS, MOOD_PRESETS
    };
  }

  // ── First-run setup wizard ──
  if (!game.settings.get(MODULE_ID, "setupComplete")) {
    const apiKey = game.settings.get(MODULE_ID, "piapiApiKey");
    if (!apiKey) {
      AtmospheraSetupWizard.open(controller);
    }
  }

  // ── Create macros on first run ──
  (async () => {
    try {
      const setupDone = game.settings.get(MODULE_ID, "setupComplete");
      if (setupDone && !game.macros?.find(m => m.name === "🎵 Atmosphera Panel")) {
        const macros = [
          { name: "🎵 Atmosphera Panel", command: 'game.modules.get("atmosphera").api.openPanel();', img: "icons/svg/sound.svg" },
          { name: "🎵 Auto Mode", command: 'game.modules.get("atmosphera").api.setMood("auto"); ui.notifications.info("Atmosphera: Auto mode");', img: "icons/svg/sound.svg" },
          { name: "🎵 Tension", command: 'game.modules.get("atmosphera").api.setMood("tension");', img: "icons/svg/sound.svg" },
          { name: "🎵 Calm", command: 'game.modules.get("atmosphera").api.setMood("calm");', img: "icons/svg/sound.svg" },
          { name: "🎵 Epic", command: 'game.modules.get("atmosphera").api.setMood("epic");', img: "icons/svg/sound.svg" },
          { name: "🎵 Horror", command: 'game.modules.get("atmosphera").api.setMood("horror");', img: "icons/svg/sound.svg" },
          { name: "🎵 Mystery", command: 'game.modules.get("atmosphera").api.setMood("mystery");', img: "icons/svg/sound.svg" },
          { name: "🎵 Stop Music", command: 'game.modules.get("atmosphera").api.stop();', img: "icons/svg/sound.svg" },
        ];
        let folder = game.folders?.find(f => f.name === "Atmosphera" && f.type === "Macro");
        if (!folder) {
          folder = await Folder.create({ name: "Atmosphera", type: "Macro", color: "#7a5ba6" });
        }
        for (const m of macros) {
          if (!game.macros?.find(e => e.name === m.name)) {
            await Macro.create({ ...m, type: "script", folder: folder.id });
          }
        }
        console.log(`${MODULE_ID} | Created ${macros.length} hotbar macros in Atmosphera folder`);
      }
    } catch (e) {
      console.warn(`${MODULE_ID} | Failed to create macros:`, e);
    }
  })();

  // ── Scene control button ──
  Hooks.on("getSceneControlButtons", (controls) => {
    try {
      if (!Array.isArray(controls)) {
        const group = controls.sounds || controls.ambient;
        if (group && group.tools) {
          group.tools.atmosphera = {
            name: "atmosphera",
            title: "Atmosphera — AI Music",
            icon: "fa-solid fa-music",
            order: Object.keys(group.tools).length,
            button: true,
            visible: game.user.isGM,
            onChange: () => controller.openPanel()
          };
        }
      } else {
        const group = controls.find(c => c.name === "sounds" || c.name === "ambient");
        if (group) {
          group.tools.push({
            name: "atmosphera", title: "Atmosphera — AI Music",
            icon: "fa-solid fa-music", button: true,
            onClick: () => controller.openPanel()
          });
        }
      }
    } catch (e) {
      console.warn(`${MODULE_ID} | Failed to add scene control button:`, e);
    }
  });

  // ── Persistent button in the Players/UI area ──
  Hooks.on("renderPlayerList", (app, html) => {
    if (!game.user.isGM) return;
    const existing = html[0]?.querySelector?.("#atmosphera-btn") || html.querySelector?.("#atmosphera-btn");
    if (existing) return;
    const btn = document.createElement("button");
    btn.id = "atmosphera-btn";
    btn.type = "button";
    btn.title = "Atmosphera — AI Music";
    btn.innerHTML = '<i class="fa-solid fa-music"></i> Atmosphera';
    btn.style.cssText = "width:100%;margin-top:4px;padding:4px 8px;background:var(--color-shadow-primary,#2a1a4e);border:1px solid var(--color-border-light-tertiary,#7a5ba6);border-radius:4px;color:#e0d0ff;cursor:pointer;font-size:12px;";
    btn.addEventListener("click", () => controller.openPanel());
    const target = html[0] || html;
    target.appendChild(btn);
  });

  // ── Chat commands ──
  Hooks.on("chatMessage", (_html, content) => {
    const cmd = content.trim().toLowerCase();
    if (cmd === "/atmosphera") {
      controller.openPanel();
      return false;
    }
    if (cmd === "/atmosphera auth" || cmd === "/atmosphera setup") {
      AtmospheraSetupWizard.open(controller);
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
      // Start scene refresh timer for current scene
      const sceneId = canvas?.scene?.id;
      if (sceneId) controller.onSceneChange(sceneId);
    }, 2000);
  }

  // ════════════════════════════════════════════════════════════════
  //  SCENE TRANSITIONS + PRE-WARMING
  // ════════════════════════════════════════════════════════════════

  Hooks.on("canvasReady", () => {
    if (!game.settings.get(MODULE_ID, "enabled")) return;

    const sceneId = canvas?.scene?.id;

    // Reset scene variety timer on scene change
    if (sceneId) controller.onSceneChange(sceneId);

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

  ui.notifications.info("Atmosphera v0.4.0 ready — music syncs to all players via Foundry playlists.");
});
