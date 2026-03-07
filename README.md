# 🎵 Atmosphera

**Dynamic AI-generated music that reacts to your FoundryVTT game.**

Atmosphera uses the [Suno AI](https://suno.com) music generation API to create contextual background music that responds to what's happening in your game — combat, exploration, tense moments, and more.

## Features

- **Combat Detection** — Automatically generates battle music when initiative is rolled, with tags based on creature types (undead → gothic organ, dragon → epic brass, fey → whimsical harp)
- **HP Monitoring** — Switches to tense/urgent music when player characters drop below a configurable HP threshold
- **Scene Atmosphere** — Set per-scene atmosphere (tavern, dungeon, wilderness, temple, etc.) for ambient music
- **Smart Caching** — Generated tracks are cached locally so you never pay to generate the same vibe twice
- **Smooth Crossfades** — A/B deck pattern ensures seamless transitions between musical states
- **GM Control Panel** — Floating UI to manually set atmosphere, override mood, monitor generation status, and check remaining credits
- **Macro/API Access** — Full API exposed for macro integration

## Installation

### Manual
1. Download or clone this repository into your Foundry `Data/modules/` directory
2. Rename the folder to `atmosphera`
3. Restart Foundry and enable the module in your world

### Manifest URL
```
https://github.com/Schwanky-Dev/fvtt-atmosphera/releases/latest/download/module.json
```

## Setup

### Prerequisites
1. **Suno Account** — Sign up at [suno.com](https://suno.com) (Pro or Premier plan recommended for credits)
2. **Suno API Server** — This module communicates with the [gcui-art/suno-api](https://github.com/gcui-art/suno-api) server
3. **2Captcha Account** — Required for Suno authentication ([2captcha.com](https://2captcha.com))

### Getting Your Suno Cookie
1. Log into [suno.com](https://suno.com) in your browser
2. Open Developer Tools (F12) → Network tab
3. Find any request to `clerk.suno.com`
4. Copy the `Cookie` header value
5. Paste it into the module's "Suno Cookie" setting

### Starting the Suno API Server
```bash
cd /path/to/suno-api
npm install
# Set your cookie in .env or pass via the module settings
npm run dev -- -p 3001
```

### Module Configuration
In Foundry → Settings → Module Settings → Atmosphera:

| Setting | Default | Description |
|---------|---------|-------------|
| **Enabled** | ✅ | Master toggle |
| **Suno API URL** | `http://localhost:3001` | URL of your suno-api server |
| **Suno Cookie** | — | Your Suno authentication cookie |
| **2Captcha Key** | — | 2Captcha API key |
| **Master Volume** | 0.5 | Overall music volume (0–1) |
| **Auto-Detect Combat** | ✅ | React to combat start/end |
| **Auto-Detect HP** | ✅ | React to low player HP |
| **HP Threshold** | 25% | HP % that triggers tense music |
| **Default Atmosphere** | Calm | Fallback atmosphere for scenes |
| **Crossfade Duration** | 3s | Transition time between tracks |

## How It Works

1. **Game state changes** (combat starts, scene loads, HP drops) trigger the state detector
2. The detector analyzes combatants, creature types, HP levels, and scene flags to build a **musical profile** (atmosphere + mood + creature tags + intensity)
3. The profile is converted to **Suno generation tags** (e.g., "dungeon, dark ambient, undead, minor key, organ, gothic")
4. If a matching track is **cached**, it plays immediately with a crossfade
5. If not cached, a new track is **generated** via the Suno API, downloaded, cached, then played
6. The GM panel shows real-time status throughout

## API / Macros

Access the module API from macros or the console:

```javascript
const api = game.modules.get("atmosphera").api;

// Trigger a state reaction
api.react("manual");

// Set atmosphere
api.setAtmosphere("dungeon");

// Stop music
api.stop();

// Clear the cache
api.clearCache();
```

## Compatibility

- **FoundryVTT:** v12+
- **Game Systems:** Designed for dnd5e but creature detection gracefully degrades for other systems

## License

[MIT](LICENSE)
