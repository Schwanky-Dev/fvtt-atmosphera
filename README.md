# 🎵 Atmosphera

**AI-powered dynamic atmosphere music for FoundryVTT** — uses [Suno AI](https://suno.com) to generate contextual background music based on your game state.

## Features

- **Auto-detect combat** — switches to battle music when initiative is rolled, victory fanfare when combat ends
- **Creature-aware** — analyzes D&D 5e creature types (undead, dragon, fiend, etc.) and flavors the music accordingly
- **Boss detection** — recognizes legendary creatures and high-CR enemies, triggers epic boss fight music
- **HP monitoring** — reacts to critical HP thresholds (boss low HP = intensified music, party wipe = somber defeat)
- **12 atmosphere presets** — tavern, dungeon, wilderness, city, temple, underwater, feywild, shadowfell, and more
- **A/B deck crossfade** — smooth transitions between tracks with configurable crossfade duration
- **Local caching** — generated tracks are cached in localStorage to avoid redundant API calls
- **GM control panel** — floating dark-themed panel with atmosphere selector, mood override, volume, and generation status
- **Suno credits display** — monitor your remaining Suno generation credits
- **Full API** — accessible at `game.modules.get("atmosphera").api` for macro/module integration

## Requirements

- **FoundryVTT v12**
- **Suno AI account** with active credits
- **Suno API proxy** — a self-hosted Suno API server (e.g. [gcui-art/suno-api](https://github.com/gcui-art/suno-api))
- **2Captcha account** (optional) — for automated captcha solving during generation

## Installation

### Manual Install
1. Download the [latest release](https://github.com/Schwanky-Dev/fvtt-atmosphera/releases)
2. Extract to `Data/modules/atmosphera/`
3. Enable "Atmosphera" in FoundryVTT module settings

### Manifest URL
```
https://github.com/Schwanky-Dev/fvtt-atmosphera/releases/latest/download/module.json
```

## Setup

### 1. Deploy Suno API Proxy

Clone and run a Suno API proxy server:

```bash
git clone https://github.com/gcui-art/suno-api.git
cd suno-api
cp .env.example .env
# Edit .env with your Suno cookie
npm install && npm start
```

### 2. Get Your Suno Cookie

1. Log in to [suno.com](https://suno.com)
2. Open browser DevTools → Application → Cookies
3. Copy the full cookie string

### 3. Configure Atmosphera

In FoundryVTT, go to **Settings → Module Settings → Atmosphera**:

| Setting | Description | Default |
|---------|-------------|---------|
| **Suno API URL** | Base URL of your Suno API proxy | `http://localhost:3000` |
| **Suno Cookie** | Your Suno session cookie (secret) | — |
| **2Captcha API Key** | 2Captcha key for captcha solving (secret) | — |
| **Master Volume** | Playback volume (0.0–1.0) | `0.5` |
| **Enabled** | Toggle automatic music generation | `true` |
| **Auto-Detect Combat** | Switch music on combat start/end | `true` |
| **Auto-Detect HP** | React to HP changes | `true` |
| **HP Threshold (%)** | HP % that triggers mood shifts | `25` |
| **Default Atmosphere** | Fallback atmosphere when idle | `calm` |
| **Crossfade Duration** | Track transition time in ms | `3000` |

### 4. Open the Panel

Click the 🎵 music icon in the Token Controls toolbar (left sidebar) to open the Atmosphera panel.

## Atmosphere Presets

| Preset | Musical Style |
|--------|--------------|
| Tavern | Medieval lute, fiddle, warm folk |
| Dungeon | Dark ambient, tension, low drones |
| Wilderness | Open world, orchestral, sweeping |
| City | Bustling, urban fantasy, lively |
| Temple | Sacred choir, organ, solemn |
| Underwater | Deep ambient, whale song, muffled |
| Feywild | Enchanted, celtic, sparkling |
| Shadowfell | Bleak, melancholy, hollow wind |
| Combat | Intense percussion, adrenaline |
| Boss Fight | Epic orchestral, choir, climactic |
| Victory | Triumphant fanfare, celebratory |
| Defeat | Somber, mournful strings |
| Calm | Peaceful ambient, soft piano |

## API Usage

```javascript
const api = game.modules.get("atmosphera").api;

// Set atmosphere manually
api.setAtmosphere("dungeon");

// Stop playback
api.stop();

// Open control panel
api.openPanel();

// Check credits
const credits = await api.getCredits();

// Direct Suno generation
const result = await api.generate("epic orchestral", "Battle Theme");
```

## Creature Type Tags

When combat includes specific creature types, Atmosphera blends their musical tags into the generation prompt:

| Type | Musical Flavor |
|------|---------------|
| Aberration | Eerie, dissonant, alien |
| Beast | Primal, tribal drums, wild |
| Celestial | Angelic choir, radiant, holy |
| Construct | Mechanical, industrial, clockwork |
| Dragon | Epic brass fanfare, majestic |
| Elemental | Primal forces, raw energy |
| Fey | Whimsical, celtic harp, mystical |
| Fiend | Dark, infernal, demonic choir |
| Giant | Thunderous, deep drums, massive |
| Humanoid | Adventurous, orchestral |
| Monstrosity | Tense, suspenseful, predatory |
| Ooze | Bubbling, ambient, unsettling |
| Plant | Organic, creeping, overgrowth |
| Undead | Haunting, ghostly, spectral |

## License

[MIT](LICENSE)
