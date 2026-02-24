# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development (two terminals required)

```bash
# Terminal 1 - Server (hot reload via tsx watch)
cd server && npm run dev

# Terminal 2 - Client (Vite dev server)
cd client && npm run dev
```

Or on Windows, run `restart.bat` to kill existing node processes and launch both in new windows.

Server: `ws://localhost:8080` | Client: `http://localhost:3000`

### Build

```bash
cd server && npm run build   # tsc → dist/
cd client && npm run build   # tsc + vite build
```

### Install dependencies

```bash
cd server && npm install
cd client && npm install
```

There are no tests.

## Architecture

Three packages with no build dependency between them:

- **`server/`** — Node.js + TypeScript + `ws`. Authoritative game server at 30 tick/s.
- **`client/`** — TypeScript + Vite + HTML5 Canvas. No frameworks.
- **`shared/protocol.ts`** — Single file imported by both. Defines all WebSocket message types and shared interfaces. Both packages reference it via relative path (`../../shared/protocol`).

### Server data flow

`index.ts` → `GameServer` (WebSocket connection handling, room routing) → `Room` (game loop, economy, shop timer) → `GameEngine` (physics tick) → `Tank`, `Projectile`, `Terrain`.

`Room.gameTick()` runs every `1000/30` ms. It calls `GameEngine.update(deltaTime, inputs)`, processes returned events (`DEATH`, `ROUND_END`, `CORBOMITE`), then broadcasts `GAME_STATE` to all players in the room.

### Client data flow

`main.ts` → `Game` (orchestrator) owns `NetworkClient`, `Renderer`, `InputHandler`, `ParticleSystem`, `AudioManager`, `UI`.

`Game.loop()` runs via `requestAnimationFrame`. Input is sent to server at ~20 Hz (every 0.05s). The client applies `TERRAIN_UPDATE` messages locally to its own heightmap copy to avoid re-sending the full terrain each tick.

### Coordinate system

The game uses a bottom-origin Y axis (Y=0 = ground level), but Canvas uses top-origin. The conversion everywhere is: `screenY = CANVAS_HEIGHT - gameY` (720 - y). This flip happens in `Renderer` methods.

### Terrain

`Terrain` stores a `Float32Array` of length 1280 (one height value per pixel column). The server sends the full heightmap on round start (`GAME_STARTING`). Subsequent changes are sent as `TERRAIN_UPDATE` (array of `{ x, y, radius }` destruction events), which the client applies locally.

World leveling begins at 60 seconds: terrain flattens at 5px/tick. At 90 seconds, all remaining tanks take continuous damage.

### Key constants

All game tuning values live in `server/src/constants.ts` — `GAME`, `PHYSICS`, `COMBAT`, `ECONOMY`, `TERRAIN`. These are **server-only**; the client reads matching values from the spec or hardcodes display constants locally.

### Room state machine

`Room.state`: `'lobby'` → `'playing'` → `'shopping'` → back to `'playing'` (next round) or `'ended'`.

The shop timer is a `setTimeout` of 30s. If all players send `SHOP_READY` before it fires, `Room.handleShopReady()` calls `startNextRound()` immediately and clears the timer.

### Protocol notes

- Client → Server messages: `JOIN_LOBBY`, `CREATE_ROOM`, `JOIN_ROOM`, `LEAVE_ROOM`, `PLAYER_READY`, `INPUT`, `PURCHASE`, `SHOP_READY`, `CHAT`
- Server → Client messages: `WELCOME`, `LOBBY_STATE`, `ROOM_JOINED`, `ROOM_STATE`, `GAME_STARTING`, `GAME_STATE`, `ROUND_END`, `SHOP_OPEN`, `GAME_OVER`, `BLITZ_ROUND`, `TERRAIN_UPDATE`, `EXPLOSION`, `PLAYER_DEATH`, `GROOVY`, `CHAT`, `ERROR`
- `INPUT` messages carry the full `InputState` (aim angle, power, move direction, firing, jumping, selected weapon slot index) — the server clamps all values on receipt.

### Detailed spec

`death-tank-spec.md` contains the full technical specification including complete class implementations for `Tank`, `Projectile`, `GameEngine`, `Renderer`, `InputHandler`, `Room`, and the economy system. When implementing new features, cross-reference this file for intended behavior.
