# 🎵 Atmosphera

**AI-powered dynamic soundtrack for Foundry VTT** — powered by [Udio](https://udio.com) via [PiAPI](https://piapi.ai).

Atmosphera listens to your game and generates music that matches what's happening. Combat starts — battle music plays. A monster dies — the intensity shifts. You enter a dark dungeon — ambient dread fills the room. Configure your API key, enable it, and the music handles itself.

> **v0.4.3** — Adaptive cooldown · Combat-aware signatures · Consolidated playlists · Scene variety · ApplicationV2

---

## Quick Start

1. Install the module in Foundry VTT (manifest URL below)
2. Enable it in your world
3. The setup wizard will prompt you for your **PiAPI API key**
4. Done — Atmosphera starts generating music automatically

---

## Getting a PiAPI API Key

Atmosphera generates music through [PiAPI](https://piapi.ai), which provides access to Udio's music generation:

1. Create an account at [piapi.ai](https://piapi.ai)
2. Add credits (each song generation costs ~500K credits)
3. Copy your API key from the dashboard
4. Paste it into the Atmosphera setup wizard or module settings

No Docker, no cookies, no captcha solving — just an API key.

---

## Features

### 🤖 Automatic Game State Detection
Atmosphera reads your game in real time:
- **Combat** — creature types, CR, alive enemy count, boss detection (legendary actions / CR ≥ 10)
- **Party health** — HP percentage across all PCs, "bloodied" (40%) and "critical" thresholds
- **Party resources** — spell slots, hit dice, class resources (optional)
- **Scene** — name keywords, darkness level, weather, token environments
- All of this feeds into a natural language prompt sent to Udio for perfectly-fitted music

### ⚔️ Combat Lifecycle
1. **Combat starts** → generates combat music based on creature types and CR
2. **Monster dies** → signature changes, music re-evaluates (more desperate, or triumphant)
3. **Boss dies** → immediate re-evaluation for dramatic shift
4. **Round changes** → only regenerates if enemy composition actually changed
5. **Combat ends** → plays victory/defeat sting, crossfades back to ambient

### 🎭 Scene Transitions
- Moving to a new scene crossfades to new ambient music
- **Scene pre-warming**: generates background music on `canvasReady` — no waiting
- **Default scenes** (e.g., "Foundry Virtual Tabletop") generate once then always use cache
- **Scene variety timer**: after extended time in one scene, generates fresh music

### 📚 Smart Playlist Library
Every generated track is saved to organized Foundry playlists. The library grows over time:
- **Playlist folders**: Ambient, Combat, Boss, and Stings playlists under an "🎵 Atmosphera" folder
- **Fuzzy matching** — `combat-undead-aberration` finds `combat-undead` as a partial match
- Partial matches accepted at >50% score, so tracks from last session work for similar encounters

### ⏱️ Adaptive Cooldown
Unlike a flat timer, Atmosphera uses smart cooldown:
- **Normal transitions generate immediately** — scene change, combat start, mood switch
- **Rapid switching gets throttled** — 3+ generation requests in 60 seconds activates escalating cooldown
- Single scene changes are never blocked; only credit-wasting spam is prevented
- Max cooldown configurable (default 180s)

### 🛡️ Error Recovery
If generation fails, Atmosphera **never leaves silence**:
1. Try playing any existing track from the same category (fuzzy match)
2. If nothing in that category, try fallback categories
3. Exponential backoff on consecutive failures

### 🎛️ GM Control Panel
Open via the macro or scene controls:
- **Enable/Disable** toggle
- **Auto/Manual** mode — auto reads game state, manual lets you pick a mood
- **Mood presets** — tension, calm, mystery, horror, triumph, sorrow, wonder, chase, stealth, epic
- **Volume control** with crossfade
- **Status display** — generation progress, credits remaining, cooldown timer, current track

---

## Installation

### Manifest URL
```
https://github.com/Schwanky-Dev/fvtt-atmosphera/releases/latest/download/module.json
```

### Requirements
- **Foundry VTT v12+** (verified on v13)
- **PiAPI account** with credits ([piapi.ai](https://piapi.ai))

### Configuration
1. Install and enable the module
2. The setup wizard runs automatically on first load
3. Enter your PiAPI API key
4. Optionally set a **Prompt Style Prefix** (e.g., `"orchestral cinematic"` or `"dark ambient electronic"`)
5. Adjust volume, crossfade duration, and other settings as desired

---

## Macro API

```js
const atmo = game.modules.get("atmosphera").api;
```

| Method | Description |
|---|---|
| `atmo.setMood("tension")` | Manual mood override |
| `atmo.setMood("auto")` | Return to auto-detection |
| `atmo.stop()` | Stop all playback |
| `atmo.play()` | Resume auto-detection |
| `atmo.getStatus()` | Returns `{playing, track, mood, autoMode, prompt}` |
| `atmo.generate("epic boss choir")` | Force generate a specific prompt |
| `atmo.openPanel()` | Open the GM control panel |
| `atmo.openSetup()` | Open the setup wizard |
| `atmo.getLibrary()` | List all cached tracks by category |
| `atmo.getCredits()` | Check remaining PiAPI credits |
| `atmo.evaluate()` | Force re-evaluate game state and play |

### Mood Presets
`tension` · `calm` · `mystery` · `horror` · `triumph` · `sorrow` · `wonder` · `chase` · `stealth` · `epic`

### Example Macros

**Quick mood toggle:**
```js
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

---

## How It Works

```
Game Hooks → GameStateCollector → PromptBuilder → UdioClient (PiAPI) → PlaylistCacheManager → Foundry Playlists
                                       ↑                                        ↑
                                  Mood Presets                          Fuzzy Matching / Library
                                  Creature Hints
                                  Scene Keywords
```

1. **GameStateCollector** reads combat state, party HP/resources, and scene data
2. **PromptBuilder** builds a natural language music prompt from game state
3. **PlaylistCacheManager** checks the library first (exact then fuzzy match)
4. **UdioClient** generates via PiAPI, polls until complete (~2 min)
5. **FoundryPlaylistManager** handles playback with crossfade
6. **AtmospheraController** orchestrates lifecycle, cooldown, and deduplication

### Category System
Tracks are organized into categories like:
- `combat-undead` / `combat-fiend-humanoid` / `boss-dragon`
- `ambient-tavern` / `ambient-dungeon` / `ambient-general`

These map to Foundry playlists under the "🎵 Atmosphera" folder.

### Combat Signature
Atmosphera tracks combat state with a signature that includes:
- Active creature types (undead, fiend, etc.)
- Alive enemy count
- Alive boss count
- Boss presence flag

When any of these change (monster dies, new type enters), music re-evaluates.

---

## Settings

| Setting | Default | Description |
|---|---|---|
| PiAPI API Key | — | API key from piapi.ai |
| Enable Atmosphera | ✅ | Master on/off switch |
| Master Volume | 0.5 | Playback volume (0.0–1.0) |
| Crossfade Duration | 3s | Duration of track transitions |
| Max Cooldown | 180s | Maximum cooldown during rapid switching |
| Auto-Detect | ✅ | Auto-read game state for music |
| Track Resources | ✅ | Include spell slots/hit dice in mood |
| Prompt Style Prefix | — | Prepend to all prompts (e.g., "orchestral") |
| Scene Refresh | 15 min | Generate new music after this long in same scene |

---

## License

MIT
