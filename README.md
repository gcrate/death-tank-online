# Death Tank Clone

Browser-based multiplayer artillery game inspired by Death Tank (1996).

## Setup

### Prerequisites

Install Node.js v20+ from https://nodejs.org/

### Install Dependencies

```bash
# Server
cd server && npm install

# Client
cd ../client && npm install
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

## Controls

| Action | Keyboard | Gamepad |
|--------|----------|---------|
| Move | A/D or ←/→ | Left Stick |
| Aim | W/S or ↑/↓ | Right Stick |
| Power Up | E | RT |
| Power Down | Q | LT |
| Fire | Space | A |
| Jump Jets | Shift (hold) | B |
| Next Weapon | Tab | RB |
| Prev Weapon | Shift+Tab | LB |
| Chat | Enter | - |

## Weapons

| Weapon | Cost | Ammo | Notes |
|--------|------|------|-------|
| Standard Missile | Free | ∞ | 2s charge |
| Machine Gun | $25 | 100 | Rapid fire |
| Missiles | $50 | 3 | 5s charge |
| MIRV | $50 | 1 | Splits at apex into 5 |
| Nuke | $50 | 1 | Large blast + screen shake |
| Rolling Mines | $150 | 3 | Rolls downhill, proximity trigger |
| Air Strike | $200 | 1 | 5 bombs from above |
| Death's Head | $250 | 1 | Splits into 30 bomblets |

## Items

| Item | Cost | Effect |
|------|------|--------|
| Corbomite | $25 | Death explosion (5 bomblets) |
| Jump Jets | $50 | Enables flight (2s fuel, regens) |
| Targeting Computer | $50 | Shows trajectory arc |
| Shield Upgrade | $100 | +50 max shield HP |
| Hover Coil | $125 | Slow fall speed |

## Architecture

- **Server**: Node.js + TypeScript + ws (WebSockets), 30 tick/s authoritative server
- **Client**: HTML5 Canvas + TypeScript + Vite, no frameworks
- **Shared**: Protocol types in `shared/protocol.ts`

## Game Flow

1. Join lobby → Create or join room (2-7 players)
2. All players ready → Round starts
3. Real-time combat on destructible terrain
4. Round ends when 1 player remains (or time limit)
5. Shop phase (30s) → buy weapons/items with earned money
6. Repeat for configured number of rounds
7. Player with most round wins is champion
