# Death Tank Online - Fan Tribute

Browser-based multiplayer artillery game inspired by Death Tank (1996).

## Setup

### Prerequisites

Install Node.js v20+ from https://nodejs.org/

### Install Dependencies

```bash
# Server
cd server && npm install

# Client
cd client && npm install
```

### Run

Open two terminals:

**Terminal 1 - Server:**
```bash
cd server
npm run dev
```

**Terminal 2 - Client:**
```bash
cd client
npm run dev
```

Then open http://localhost:3000 in multiple browser tabs.

On Windows you can also run `restart.bat` to kill existing node processes and relaunch both.

## Controls

| Action | Keyboard | Gamepad |
|--------|----------|---------|
| Move | Q / E | Left Stick / D-pad ←/→ |
| Aim | A / D or ←/→ | D-pad ↑/↓ or Right Stick |
| Power Up/Down | W / S or ↑/↓ | RT / LT |
| Fire | Space | A |
| Jump Jets | Shift (hold) | B |
| Next Weapon | Tab | RB |
| Prev Weapon | Shift+Tab | LB |
| Chat | Enter | - |

## Weapons

| Weapon | Cost | Ammo | Notes |
|--------|------|------|-------|
| Standard Missile | Free | ∞ | 2s charge |
| Machine Gun | $25 | 100 | Rapid fire, 0.1s charge |
| Missiles | $50 | 3 | Steerable with aim controls; 2s flight limit |
| MIRV | $50 | 1 | Splits at apex into 5 bomblets |
| Nuke | $50 | 1 | Massive blast + screen shake |
| Rolling Mines | $150 | 5 | Rolls downhill, proximity trigger |
| Air Strike | $200 | 1 | 5 bombs dropped from above |
| Death's Head | $250 | 1 | Clusters into 30 downward bomblets after 0.7s |

## Items

| Item | Cost | Effect |
|------|------|--------|
| Corbomite | $25 | Death explosion (5 bomblets) |
| Jump Jets | $50 | Enables flight; fuel carries over between rounds |
| Targeting Computer | $50 | Shows trajectory arc |
| Shield Upgrade | $100 | +50 max shield HP |
| Hover Coil | $125 | Reduces fall speed - Need to to behave as original |

## Room Configuration

When creating a room, the host can set:

| Option | Choices | Default |
|--------|---------|---------|
| Rounds | 5, 10, 15, 20, 30 | 10 |
| Starting Money | $0, $100, $200, $500 | $0 |
| Starting Loadout | None, Missiles (x3), Heavy (Nuke+Air+Mines), Full Arsenal | None |

The starting loadout is given to all players at the beginning of round 1 only. Money earned in rounds carries over to the shop between rounds.

## Economy

- **Kill reward**: money for each kill
- **Leader kill bonus**: extra money for killing the round leader
- **Survival bonus**: staying alive to the end
- **Participation bonus**: awarded to everyone each round
- Weapon inventory (ammo counts) carries over between rounds; one-use items (Corbomite, Targeting Computer) are consumed

## Game Flow

1. Join lobby → create or join a room (2–7 players)
2. All players ready → round starts on destructible mountainous terrain
3. Real-time combat; terrain is permanently destroyed by explosions
4. Round ends when 1 player remains (or the time limit hits)
5. World leveling begins at 60s; continuous damage to all tanks from 90s
6. Shop phase (30s) → spend earned money on weapons and items
7. Repeat for the configured number of rounds
8. Player with the most round wins is champion

## Architecture

- **Server**: Node.js + TypeScript + `ws` (WebSockets), authoritative 30 tick/s game loop
- **Client**: HTML5 Canvas + TypeScript + Vite, no frameworks
- **Shared**: `shared/protocol.ts` — all WebSocket message types, imported by both packages
