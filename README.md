# 🎵 Atmosphera

**AI-powered dynamic atmosphere music for Foundry VTT** — powered by [Suno AI](https://suno.ai).

Atmosphera listens to your game. When combat starts, it generates intense battle music tailored to the creatures you're fighting. When you move to a new scene, it creates ambient tracks that match the environment. When the party is bloodied and out of spell slots, the music shifts to reflect their desperation. Enable it, configure your Suno credentials, and forget about it.

> **v3.0** — Background pre-generation · Fuzzy library matching · Gap-free playback · Scene pre-warming · Smart combat re-eval · Error recovery · Clean macro API

---

## Quick Start

1. Install the module in Foundry VTT
2. On your Foundry server, navigate to the module folder:
   ```
   cd /path/to/FoundryVTT/Data/modules/atmosphera
   ```
3. Copy and edit the environment file:
   ```
   cp .env.example .env
   nano .env  # Add your Suno cookie and optional 2Captcha key
   ```
4. Start the proxy:
   ```
   docker-compose up -d
   ```
5. Enable Atmosphera in your world — the setup wizard will guide you through the rest

---

## Getting Your Suno Cookie

Atmosphera uses the [Suno API proxy](https://github.com/gcui-art/suno-api) to generate music. It needs your Suno session cookie to authenticate:

1. Go to [suno.com/create](https://suno.com/create) and log in
2. Open your browser's DevTools (F12)
3. Go to the **Network** tab
4. Look for a request containing `?__clerk_api_version` in the URL
5. Click on it and find the **Cookie** header in the request headers
6. Copy the entire cookie value — paste it into your `.env` file as `SUNO_COOKIE`

> **Note:** Cookies expire periodically. If generation stops working, repeat these steps to get a fresh cookie.

## 2Captcha (Optional but Recommended)

Suno uses hCaptcha to prevent automated access. The Suno API proxy can solve these automatically using [2Captcha](https://2captcha.com):

- **Cost:** ~$3 per 1,000 captcha solves
- **Setup:** Create an account at [2captcha.com](https://2captcha.com), fund it, and copy your API key into `TWOCAPTCHA_KEY` in your `.env` file
- Without 2Captcha, you may need to manually solve captchas or your cookie may expire faster

---

## Features

### 🤖 Automatic Game State Detection
Atmosphera reads your game in real time:
- **Combat** — creature types, CR, boss detection (legendary actions / CR ≥ 10)
- **Party health** — HP percentage across all PCs, "bloodied" and "critical" thresholds
- **Party resources** — spell slots, hit dice, class resources (optional)
- **Scene** — name keywords, darkness level, weather, token environments
- All of this feeds into a dynamic prompt sent to Suno to generate perfectly-fitted music

### ⚔️ Combat Lifecycle
1. **Combat starts** → generates combat music based on creature types and CR
2. **Pre-generates** victory and defeat stings in the background (fire-and-forget)
3. **Round changes** → only regenerates if creature composition actually changed (new types entered, boss died)
4. **Combat ends** → instantly plays pre-generated victory/defeat sting, then crossfades back to ambient

### 🎭 Scene Transitions
- Moving to a new scene crossfades to new ambient music
- **Scene pre-warming**: on `canvasReady`, if we've never generated for this scene, background generation starts immediately — no waiting for the GM

### 📚 Smart Playlist Library
Every generated track is saved to a Foundry playlist organized by category. The library grows over time and becomes more useful:
- **Exact matching** — `combat-undead` checks the "Combat (undead)" playlist first
- **Fuzzy matching** — `combat-undead-aberration` finds `combat-undead` as a partial match (67% keyword overlap)
- Partial matches accepted at >50% score, so a track from last session works for similar encounters
- Tracks are saved as MP3 files in your configured data folder

### 🔄 Gap-Free Playback
When a track is within 15 seconds of ending, Atmosphera re-evaluates the game state:
- If context is the same → the track loops seamlessly (HTML5 Audio `loop=true`)
- If context changed → crossfades to the next appropriate track

### 🛡️ Error Recovery
If Suno generation fails, Atmosphera **never leaves silence**:
1. Try playing any existing track from the same category (fuzzy match)
2. If nothing in that category, try "calm" / "ambient" fallbacks
3. If the library is completely empty, report the error (but at least we tried)

### 🎛️ GM Control Panel
Click the 🎵 button in the token controls toolbar to open the panel:
- **Enable/Disable** — master switch
- **Auto/Manual** toggle — auto reads game state, manual lets you pick a mood
- **Mood presets** — tension, calm, mystery, horror, triumph, sorrow, wonder, chase, stealth, epic
- **Prompt editor** — see and edit the generated prompt before sending
- **Volume slider** — with crossfade support
- **Status display** — generation progress, credits remaining, current track info

---

## Installation

### Module JSON URL
```
https://github.com/Schwanky-Dev/fvtt-atmosphera/releases/latest/download/module.json
```

### Requirements
- **Foundry VTT v12+**
- **Suno API proxy** — such as [Suno API](https://github.com/SunoAI-API/Suno-API) running locally or on a server
- **Suno account** with credits (free tier works, pro recommended for longer sessions)

### Configuration
1. Install the module in Foundry
2. Enable it in your world's module settings
3. Set **Suno API URL** (e.g. `http://localhost:3100`)
4. Set **Suno Cookie** (your session cookie from suno.com)
5. Optionally set a **2Captcha API Key** if your proxy supports it
6. Optionally set a **Prompt Style Prefix** (e.g. `"orchestral cinematic"` or `"dark ambient electronic"`)

---

## Macro API

Access the API from macros or the console:

```js
const atmo = game.modules.get("atmosphera").api;
```

### Available Methods

| Method | Description |
|---|---|
| `atmo.setMood("tension")` | Manual override — sets mood to any preset or custom string |
| `atmo.setMood("auto")` | Release override, return to auto-detection |
| `atmo.stop()` | Stop all playback |
| `atmo.play()` | Resume auto-detection and start playing |
| `atmo.getStatus()` | Returns `{playing, track, mood, autoMode, prompt}` |
| `atmo.generate("epic boss choir")` | Force generate a specific prompt (power users) |
| `atmo.openPanel()` | Open the GM control panel |
| `atmo.getLibrary()` | List all cached tracks grouped by category |
| `atmo.getCredits()` | Check remaining Suno credits |
| `atmo.evaluate()` | Force re-evaluate game state and play |

### Mood Presets
`tension` · `calm` · `mystery` · `horror` · `triumph` · `sorrow` · `wonder` · `chase` · `stealth` · `epic`

### Example Macros

**Quick mood toggle:**
```js
// Toggle between tension and auto
const atmo = game.modules.get("atmosphera").api;
const status = atmo.getStatus();
atmo.setMood(status.mood === "tension" ? "auto" : "tension");
```

**Custom generation:**
```js
game.modules.get("atmosphera").api.generate(
  "instrumental, sea shanty, pirates, accordion, fiddle, rowdy tavern"
);
```

**Check library size:**
```js
const lib = game.modules.get("atmosphera").api.getLibrary();
const total = Object.values(lib).reduce((sum, tracks) => sum + tracks.length, 0);
ui.notifications.info(`Atmosphera library: ${total} tracks across ${Object.keys(lib).length} categories`);
```

---

## How It Works

### Architecture
```
Game Hooks → GameStateCollector → PromptBuilder → SunoClient → PlaylistCacheManager → AudioManager
                                       ↑                              ↑
                                  Mood Presets              Fuzzy Matching / Library
                                  Creature Hints            File Storage / Playlists
                                  Scene Keywords
```

1. **GameStateCollector** reads combat, party HP/resources, and scene data from Foundry
2. **PromptBuilder** combines that into a Suno-ready prompt with creature hints, mood descriptors, and resource state
3. **PlaylistCacheManager** checks the library first (exact then fuzzy match) before generating
4. **SunoClient** generates via the API proxy, polls until complete
5. **AudioManager** handles A/B deck crossfading with configurable duration
6. **AtmospheraController** orchestrates everything and manages the lifecycle

### Category System
Tracks are organized into categories like:
- `combat-undead` / `combat-fiend-humanoid` / `boss-dragon`
- `ambient-tavern` / `ambient-dungeon` / `ambient-general`
- `sting-victory` / `sting-defeat`

These map to Foundry playlists named like "Atmosphera — Combat (undead)".

### Resource Tracking
When enabled, Atmosphera tracks:
- **Spell slots** (levels 1–9) — current vs max
- **Hit dice** — remaining vs total
- **Class resources** (primary/secondary/tertiary)

Resource depletion shifts the music toward "weary, desperate" tones. At critical levels (<15%), prompts include "exhausted, on the edge of defeat".

---

## Settings

| Setting | Default | Description |
|---|---|---|
| Suno API URL | `http://localhost:3100` | Base URL for Suno API proxy |
| Suno Cookie | — | Session cookie for authentication |
| 2Captcha API Key | — | Optional captcha solving |
| Master Volume | 0.5 | Playback volume (0.0–1.0) |
| Enable Atmosphera | ✅ | Master on/off switch |
| Crossfade Duration | 3000ms | Duration of crossfade transitions |
| Auto-Detect | ✅ | Auto-read game state for music |
| Track Resources | ✅ | Include spell slots/hit dice in mood |
| Prompt Style Prefix | — | Prepend to all prompts (e.g. "orchestral") |
| Audio Folder | `atmosphera` | Data folder for saved tracks |

---

## License

MIT
