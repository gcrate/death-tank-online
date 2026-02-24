# Death Tank Online - Fan Tribute

Browser-based multiplayer artillery game inspired by Death Tank (1996).

## Local Development

### Prerequisites

Node.js v20+ from https://nodejs.org/

### Install Dependencies

```bash
cd server && npm install
cd client && npm install
```

### Run

Open two terminals:

**Terminal 1 — Server:**
```bash
cd server && npm run dev
```

**Terminal 2 — Client:**
```bash
cd client && npm run dev
```

Open http://localhost:3000 in multiple browser tabs to play.

On Windows you can also run `restart.bat` to kill existing node processes and relaunch both.

---

## Deployment (AWS ECS Fargate)

The game runs as a single ECS task (two containers: game server + nginx client) on Fargate. Set desired count to 0 when not playing — no charges accrue while stopped.

### Prerequisites

- [AWS CLI](https://aws.amazon.com/cli/) configured (`aws configure`)
- [Terraform](https://developer.hashicorp.com/terraform/install) v1.5+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### First-time setup

```bash
# 1. Create AWS infrastructure (VPC, ECR repos, ECS cluster, service at 0 tasks)
cd infra
terraform init
terraform apply
cd ..

# 2. Build and push Docker images to ECR
./deploy.sh      # Mac/Linux
deploy.bat       # Windows
```

### Playing

```bash
./start.sh       # Scales to 1 task, waits, prints the public IP
./stop.sh        # Scales back to 0 — stops all charges
```

```bat
start.bat        # Windows equivalent
stop.bat
```

Each session gets a new public IP — share it with everyone before you start. The game is open to anyone who has the IP while the task is running.

### Deploying code changes

```bash
./deploy.sh      # Rebuild and push updated images
./start.sh       # Always force-pulls the latest images on start
```

### Teardown

```bash
cd infra && terraform destroy
```

### Estimated cost

Running the task costs roughly **$0.03/hour** (0.5 vCPU + 1 GB RAM on Fargate in us-east-1). ECR storage for the two images is a few cents per month. Nothing is charged while stopped.

---

## Controls

| Action | Key |
|--------|-----|
| Move (grounded) | Q / E |
| Aim | A / D or ←/→ |
| Power | W / S or ↑/↓ |
| Fire | Space |
| Jump Jets (hold) | Shift |
| Rotate body (airborne) | Q / E |
| Next / Prev Weapon | Tab / Shift+Tab |
| Chat | Enter |

---

## Weapons

| Weapon | Cost | Ammo | Notes |
|--------|------|------|-------|
| Standard Missile | Free | ∞ | 2s charge |
| Machine Gun | $25 | 100 | Rapid fire, 0.1s charge |
| Missiles | $50 | 3 | Steerable mid-flight; 2s flight limit |
| MIRV | $50 | 1 | Splits at apex into 5 bomblets |
| Nuke | $50 | 1 | Massive blast radius |
| Rolling Mines | $150 | 3 | Rolls downhill, proximity trigger |
| Air Strike | $200 | 1 | 5 bombs dropped from above |
| Death's Head | $250 | 1 | Clusters into 30 downward bomblets after 0.7s |

---

## Items

| Item | Cost | Effect |
|------|------|--------|
| Jump Jets | $50 | +3s of jet fuel (stack up to 3×, max 9s). Remaining fuel carries over between rounds. Airborne: Q/E rotates body, Shift thrusts in the direction the tank top is pointing. |
| Targeting Computer | $50 | Shows trajectory arc (consumed each round) |
| Corbomite | $25 | On death, triggers an explosion (5 bomblets) |
| Shield Upgrade | $100 | +50 max shield HP |
| Hover Coil | $125 | Reduces fall speed |

---

## Room Configuration

| Option | Choices | Default |
|--------|---------|---------|
| Rounds | 5, 10, 15, 20, 30 | 10 |
| Starting Money | $0, $100, $200, $500 | $0 |
| Starting Loadout | None, Missiles (×3), Heavy (Nuke+Air+Mines), Full Arsenal | None |

The starting loadout is applied once at the beginning of round 1. Money and remaining weapon ammo carry over between rounds.

---

## Economy & Scoring

Score equals total money earned across all rounds (participation bonus excluded).

**Money earned each round:**

| Source | Amount |
|--------|--------|
| Kill | $50 |
| Killing the round leader | $100 (instead of $50) |
| Survival bonus | $50 |
| Groovy bonus (killed everyone) | +50% of round earnings |
| Participation bonus | $25 (not counted toward score) |

The **score screen** is shown for 10 seconds after each round, displaying each player's kills and points earned. Press Space to skip early (shop opens when everyone skips).

---

## Game Flow

1. Join lobby → create or join a room (2–7 players)
2. All players ready → round starts on destructible mountainous terrain
3. Real-time artillery combat; terrain is permanently destroyed by explosions
4. Round ends when 1 player remains (or the time limit is reached)
5. World leveling begins at 60s; all tanks take continuous damage from 90s
6. **Score screen** (10s) → see round results and kill breakdown
7. **Shop phase** (30s) → spend earned money on weapons and items
8. Repeat for the configured number of rounds
9. Player with the highest total score wins

---

## Architecture

- **Server**: Node.js + TypeScript + `ws`, authoritative 30 tick/s game loop
- **Client**: HTML5 Canvas + TypeScript + Vite, no frameworks
- **Shared**: `shared/protocol.ts` — all WebSocket message types, imported by both packages
- **Infra**: Terraform — VPC, ECR, ECS Fargate cluster/service
