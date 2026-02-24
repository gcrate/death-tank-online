# Death Tank Clone - Technical Specification

## Project Overview

Build a browser-based multiplayer clone of Death Tank (1996), a real-time 2D artillery game. Players control tanks on destructible terrain, firing weapons simultaneously in real-time combat. The game uses WebSockets for multiplayer communication.

**Tech Stack:**
- Server: Node.js with TypeScript, `ws` library for WebSockets
- Client: HTML5 Canvas, TypeScript, vanilla JS (no framework)
- Build: Vite for client bundling

---

## Architecture

```
project/
├── server/
│   ├── src/
│   │   ├── index.ts              # Entry point, WebSocket server setup
│   │   ├── GameServer.ts         # Main server class, room management
│   │   ├── Room.ts               # Individual game room logic
│   │   ├── GameEngine.ts         # Physics, collision, game rules
│   │   ├── Terrain.ts            # Heightmap terrain system
│   │   ├── Tank.ts               # Tank entity
│   │   ├── Projectile.ts         # Projectile entities
│   │   ├── Weapon.ts             # Weapon definitions and behaviors
│   │   ├── types.ts              # Shared type definitions
│   │   └── constants.ts          # Game constants
│   ├── package.json
│   └── tsconfig.json
├── client/
│   ├── src/
│   │   ├── main.ts               # Entry point
│   │   ├── Game.ts               # Main game client class
│   │   ├── Renderer.ts           # Canvas rendering
│   │   ├── InputHandler.ts       # Keyboard/gamepad input
│   │   ├── NetworkClient.ts      # WebSocket client
│   │   ├── UI.ts                 # HUD, menus, shop interface
│   │   ├── AudioManager.ts       # Sound effects and music
│   │   ├── ParticleSystem.ts     # Visual effects
│   │   └── types.ts              # Client-side types
│   ├── public/
│   │   ├── index.html
│   │   └── assets/
│   │       ├── sounds/
│   │       └── fonts/
│   ├── package.json
│   └── vite.config.ts
└── shared/
    └── protocol.ts               # Shared message types
```

---

## Game Constants

```typescript
// constants.ts

export const GAME = {
  CANVAS_WIDTH: 1280,
  CANVAS_HEIGHT: 720,
  TICK_RATE: 30,                    // Server ticks per second
  MAX_PLAYERS: 7,
  MIN_PLAYERS: 2,
  DEFAULT_ROUNDS: 10,
  ROUND_TIME_LIMIT: 90,             // Seconds
  WORLD_LEVELING_START: 60,         // Seconds into round
  SHOP_DURATION: 30,                // Seconds
  BLITZ_CHANCE: 0.10,               // 10% chance per round
  BLITZ_COOLDOWN_REDUCTION: 0.75,   // 75% reduction
};

export const PHYSICS = {
  GRAVITY: 400,                     // Pixels per second squared
  TANK_SPEED: 60,                   // Pixels per second
  TANK_UPHILL_MODIFIER: 0.6,
  TANK_DOWNHILL_MODIFIER: 1.4,
  JUMP_JET_THRUST: 300,             // Pixels per second
  JUMP_JET_FUEL_DURATION: 2,        // Seconds
  JUMP_JET_REGEN_RATE: 0.5,         // Fuel per second when grounded
};

export const COMBAT = {
  TANK_HEALTH: 100,
  SHIELD_MAX: 50,
  SHIELD_REGEN_RATE: 5,             // HP per second
  SHIELD_REGEN_DELAY: 3,            // Seconds after damage
  WEAPON_SWITCH_CHARGE_RETAIN: 0.5, // Retain 50% charge on switch
};

export const ECONOMY = {
  PARTICIPATION_BONUS: 20,
  KILL_REWARD: 50,
  LEADER_KILL_REWARD: 100,
  SURVIVAL_BONUS: 25,
  GROOVY_MULTIPLIER: 1.5,           // 50% bonus for killing everyone
  STARTING_MONEY: 200,
};

export const TERRAIN = {
  RESOLUTION: 1280,                 // One height value per pixel width
  MIN_HEIGHT: 100,
  MAX_HEIGHT: 500,
};
```

---

## Weapon Definitions

```typescript
// Weapon.ts

export enum WeaponType {
  STANDARD = 'standard',
  MACHINE_GUN = 'machine_gun',
  MISSILES = 'missiles',
  MIRV = 'mirv',
  NUKE = 'nuke',
  DEATHS_HEAD = 'deaths_head',
  ROLLING_MINES = 'rolling_mines',
  AIR_STRIKE = 'air_strike',
}

export interface WeaponDefinition {
  type: WeaponType;
  name: string;
  cost: number;
  chargeTime: number;           // Seconds to charge before firing
  damage: number;
  blastRadius: number;
  ammoPerPurchase: number;      // -1 for infinite
  special?: string;
}

export const WEAPONS: Record<WeaponType, WeaponDefinition> = {
  [WeaponType.STANDARD]: {
    type: WeaponType.STANDARD,
    name: 'Standard Missile',
    cost: 0,
    chargeTime: 2.0,
    damage: 35,
    blastRadius: 40,
    ammoPerPurchase: -1,        // Infinite
  },
  [WeaponType.MACHINE_GUN]: {
    type: WeaponType.MACHINE_GUN,
    name: 'Machine Gun',
    cost: 25,
    chargeTime: 0.1,
    damage: 5,
    blastRadius: 5,
    ammoPerPurchase: 100,       // Bullets
    special: 'rapid_fire',
  },
  [WeaponType.MISSILES]: {
    type: WeaponType.MISSILES,
    name: 'Missiles',
    cost: 50,
    chargeTime: 5.0,
    damage: 40,
    blastRadius: 45,
    ammoPerPurchase: 3,
  },
  [WeaponType.MIRV]: {
    type: WeaponType.MIRV,
    name: 'MIRV',
    cost: 50,
    chargeTime: 5.0,
    damage: 15,                 // Per bomblet
    blastRadius: 25,
    ammoPerPurchase: 1,
    special: 'split_5_60deg',   // 5 bomblets, 60° cone
  },
  [WeaponType.NUKE]: {
    type: WeaponType.NUKE,
    name: 'Nuke',
    cost: 50,
    chargeTime: 5.0,
    damage: 80,
    blastRadius: 120,
    ammoPerPurchase: 1,
    special: 'screen_shake',
  },
  [WeaponType.DEATHS_HEAD]: {
    type: WeaponType.DEATHS_HEAD,
    name: "Death's Head",
    cost: 250,
    chargeTime: 5.0,
    damage: 25,                 // Per bomblet
    blastRadius: 30,
    ammoPerPurchase: 1,
    special: 'split_30_120deg', // 30 bomblets, 120° cone
  },
  [WeaponType.ROLLING_MINES]: {
    type: WeaponType.ROLLING_MINES,
    name: 'Rolling Mines',
    cost: 150,
    chargeTime: 5.0,
    damage: 50,
    blastRadius: 35,
    ammoPerPurchase: 3,
    special: 'rolls_on_terrain',
  },
  [WeaponType.AIR_STRIKE]: {
    type: WeaponType.AIR_STRIKE,
    name: 'Air Strike',
    cost: 200,
    chargeTime: 5.0,
    damage: 30,                 // Per bomb
    blastRadius: 30,
    ammoPerPurchase: 1,
    special: 'drops_5_from_sky',
  },
};
```

---

## Utility Items

```typescript
// Items.ts

export enum ItemType {
  JUMP_JETS = 'jump_jets',
  SHIELD = 'shield',
  TARGETING_COMPUTER = 'targeting_computer',
  CORBOMITE = 'corbomite',
  HOVER_COIL = 'hover_coil',
}

export interface ItemDefinition {
  type: ItemType;
  name: string;
  cost: number;
  effect: string;
  duration: 'permanent' | 'single_use';
}

export const ITEMS: Record<ItemType, ItemDefinition> = {
  [ItemType.JUMP_JETS]: {
    type: ItemType.JUMP_JETS,
    name: 'Jump Jets',
    cost: 50,
    effect: 'Enables flight with 2-second fuel tank, regenerates when grounded',
    duration: 'permanent',
  },
  [ItemType.SHIELD]: {
    type: ItemType.SHIELD,
    name: 'Shield',
    cost: 100,
    effect: '+50 max shield capacity',
    duration: 'permanent',
  },
  [ItemType.TARGETING_COMPUTER]: {
    type: ItemType.TARGETING_COMPUTER,
    name: 'Targeting Computer',
    cost: 50,
    effect: 'Shows predicted trajectory arc when aiming',
    duration: 'permanent',
  },
  [ItemType.CORBOMITE]: {
    type: ItemType.CORBOMITE,
    name: 'Corbomite',
    cost: 25,
    effect: 'On death, fires 5 bomblets outward (25 damage each, ~150° arc, low velocity)',
    duration: 'single_use',
  },
  [ItemType.HOVER_COIL]: {
    type: ItemType.HOVER_COIL,
    name: 'Hover Coil',
    cost: 125,
    effect: 'Slow fall speed, improved air control',
    duration: 'permanent',
  },
};
```

---

## Network Protocol

```typescript
// shared/protocol.ts

// ============ CLIENT -> SERVER ============

export type ClientMessage =
  | { type: 'JOIN_LOBBY'; payload: { playerName: string } }
  | { type: 'CREATE_ROOM'; payload: { config: RoomConfig } }
  | { type: 'JOIN_ROOM'; payload: { roomId: string } }
  | { type: 'LEAVE_ROOM' }
  | { type: 'PLAYER_READY' }
  | { type: 'INPUT'; payload: InputState }
  | { type: 'PURCHASE'; payload: { itemType: WeaponType | ItemType } }
  | { type: 'SHOP_READY' }
  | { type: 'CHAT'; payload: { message: string } };

export interface RoomConfig {
  rounds: number;           // 5, 10, 15, 20, 30
  startingMoney: number;    // 100, 200, 500
  mapType: 'random' | 'mountainous' | 'flat' | 'canyon';
}

export interface InputState {
  moveDirection: -1 | 0 | 1;  // Left, None, Right
  aimAngle: number;           // 0-180 degrees (0 = right, 180 = left)
  power: number;              // 0-100
  firing: boolean;
  jumping: boolean;
  selectedWeapon: number;     // Inventory slot index
}

// ============ SERVER -> CLIENT ============

export type ServerMessage =
  | { type: 'WELCOME'; payload: { playerId: string; serverTime: number } }
  | { type: 'LOBBY_STATE'; payload: LobbyState }
  | { type: 'ROOM_JOINED'; payload: { roomId: string; roomState: RoomState } }
  | { type: 'ROOM_STATE'; payload: RoomState }
  | { type: 'GAME_STARTING'; payload: GameStartPayload }
  | { type: 'GAME_STATE'; payload: GameState }
  | { type: 'ROUND_END'; payload: RoundEndPayload }
  | { type: 'SHOP_OPEN'; payload: ShopPayload }
  | { type: 'GAME_OVER'; payload: GameOverPayload }
  | { type: 'BLITZ_ROUND'; payload: { isBlitz: true } }
  | { type: 'TERRAIN_UPDATE'; payload: TerrainDestruction[] }
  | { type: 'EXPLOSION'; payload: ExplosionEvent }
  | { type: 'PLAYER_DEATH'; payload: DeathEvent }
  | { type: 'GROOVY'; payload: { playerId: string } }
  | { type: 'CHAT'; payload: { playerId: string; playerName: string; message: string } }
  | { type: 'ERROR'; payload: { message: string } };

export interface LobbyState {
  rooms: RoomSummary[];
  playerCount: number;
}

export interface RoomSummary {
  roomId: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  config: RoomConfig;
  inProgress: boolean;
}

export interface RoomState {
  roomId: string;
  players: PlayerInfo[];
  config: RoomConfig;
  hostId: string;
  allReady: boolean;
}

export interface PlayerInfo {
  id: string;
  name: string;
  color: string;
  ready: boolean;
  score: number;
  money: number;
}

export interface GameStartPayload {
  terrain: number[];          // Heightmap array
  tankPositions: { [playerId: string]: { x: number; y: number } };
  roundNumber: number;
  totalRounds: number;
  isBlitz: boolean;
}

export interface GameState {
  tick: number;
  serverTime: number;
  roundTime: number;          // Seconds elapsed in round
  tanks: { [playerId: string]: TankState };
  projectiles: ProjectileState[];
}

export interface TankState {
  x: number;
  y: number;
  aimAngle: number;
  power: number;
  health: number;
  shield: number;
  alive: boolean;
  jetFuel: number;
  currentWeapon: WeaponType;
  weaponChargePercent: number;  // 0-100, can fire at 100
}

export interface ProjectileState {
  id: string;
  type: WeaponType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ownerId: string;
}

export interface TerrainDestruction {
  x: number;
  y: number;
  radius: number;
}

export interface ExplosionEvent {
  x: number;
  y: number;
  radius: number;
  damage: number;
  ownerId: string;
  weaponType: WeaponType;
}

export interface DeathEvent {
  playerId: string;
  killedBy: string | null;    // null if suicide/environment
  corbomiteTriggered: boolean;
}

export interface RoundEndPayload {
  winnerId: string | null;    // null if draw
  roundNumber: number;
  earnings: { [playerId: string]: RoundEarnings };
  scores: { [playerId: string]: number };
  groovy: boolean;
  groovyPlayerId?: string;
}

export interface RoundEarnings {
  kills: number;
  killReward: number;
  leaderKills: number;
  leaderKillReward: number;
  survivalBonus: number;
  participationBonus: number;
  groovyBonus: number;
  total: number;
}

export interface ShopPayload {
  money: { [playerId: string]: number };
  inventory: { [playerId: string]: InventoryState };
  timeRemaining: number;
}

export interface InventoryState {
  weapons: { type: WeaponType; ammo: number }[];
  items: ItemType[];
}

export interface GameOverPayload {
  rankings: { playerId: string; playerName: string; score: number; kills: number }[];
  winnerId: string;
  winnerName: string;
}
```

---

## Core Game Logic

### Terrain System

```typescript
// Terrain.ts

export class Terrain {
  heightmap: Float32Array;
  width: number;
  
  constructor(width: number, type: 'random' | 'mountainous' | 'flat' | 'canyon') {
    this.width = width;
    this.heightmap = new Float32Array(width);
    this.generate(type);
  }
  
  generate(type: string): void {
    // Use Perlin noise or simplex noise for natural terrain
    // 'mountainous' = high amplitude, sharp peaks
    // 'flat' = low amplitude, gentle rolling
    // 'canyon' = valleys with high walls
    // 'random' = pick one randomly
  }
  
  getHeightAt(x: number): number {
    const index = Math.floor(Math.max(0, Math.min(this.width - 1, x)));
    return this.heightmap[index];
  }
  
  getSlopeAt(x: number): number {
    const left = this.getHeightAt(x - 1);
    const right = this.getHeightAt(x + 1);
    return Math.atan2(right - left, 2);  // Radians
  }
  
  destroy(centerX: number, centerY: number, radius: number): TerrainDestruction {
    // Circular destruction
    for (let x = centerX - radius; x <= centerX + radius; x++) {
      if (x < 0 || x >= this.width) continue;
      
      const dx = x - centerX;
      const distFromCenter = Math.abs(dx);
      const destructionDepth = Math.sqrt(radius * radius - dx * dx);
      
      const currentHeight = this.heightmap[Math.floor(x)];
      const destructionY = centerY + destructionDepth;
      
      if (destructionY > currentHeight) {
        // Explosion is below terrain surface, carve it out
        this.heightmap[Math.floor(x)] = Math.min(currentHeight, centerY - destructionDepth);
      }
    }
    
    return { x: centerX, y: centerY, radius };
  }
  
  // World leveling - called during end-game
  flatten(amount: number): void {
    for (let i = 0; i < this.width; i++) {
      this.heightmap[i] = Math.max(TERRAIN.MIN_HEIGHT, this.heightmap[i] - amount);
    }
  }
}
```

### Tank Entity

```typescript
// Tank.ts

export class Tank {
  id: string;
  x: number;
  y: number;
  aimAngle: number = 90;          // Degrees, 90 = straight up
  power: number = 50;
  health: number = COMBAT.TANK_HEALTH;
  shield: number = COMBAT.SHIELD_MAX;
  maxShield: number = COMBAT.SHIELD_MAX;
  alive: boolean = true;
  jetFuel: number = 0;            // 0 until Jump Jets purchased
  hasJumpJets: boolean = false;
  hasTargetingComputer: boolean = false;
  hasHoverCoil: boolean = false;
  hasCorbomite: boolean = false;
  
  inventory: Map<WeaponType, number> = new Map();  // Weapon -> ammo count
  currentWeaponIndex: number = 0;
  weaponCharges: Map<WeaponType, number> = new Map();  // Weapon -> charge percent (0-100)
  
  lastDamageTime: number = 0;
  
  constructor(id: string, x: number, y: number) {
    this.id = id;
    this.x = x;
    this.y = y;
    // Standard missile has infinite ammo
    this.inventory.set(WeaponType.STANDARD, -1);
    this.weaponCharges.set(WeaponType.STANDARD, 0);
  }
  
  getCurrentWeapon(): WeaponType {
    const weapons = Array.from(this.inventory.keys());
    return weapons[this.currentWeaponIndex] || WeaponType.STANDARD;
  }
  
  switchWeapon(newIndex: number): void {
    const weapons = Array.from(this.inventory.keys());
    if (newIndex < 0 || newIndex >= weapons.length) return;
    
    const currentWeapon = this.getCurrentWeapon();
    const currentCharge = this.weaponCharges.get(currentWeapon) || 0;
    
    // Retain 50% charge when switching away
    this.weaponCharges.set(currentWeapon, currentCharge * COMBAT.WEAPON_SWITCH_CHARGE_RETAIN);
    
    this.currentWeaponIndex = newIndex;
  }
  
  updateCharge(deltaTime: number, isBlitz: boolean): void {
    const weapon = this.getCurrentWeapon();
    const weaponDef = WEAPONS[weapon];
    const currentCharge = this.weaponCharges.get(weapon) || 0;
    
    let chargeTime = weaponDef.chargeTime;
    if (isBlitz) {
      chargeTime *= (1 - GAME.BLITZ_COOLDOWN_REDUCTION);
    }
    
    const chargePerSecond = 100 / chargeTime;
    const newCharge = Math.min(100, currentCharge + chargePerSecond * deltaTime);
    this.weaponCharges.set(weapon, newCharge);
  }
  
  canFire(): boolean {
    const weapon = this.getCurrentWeapon();
    const charge = this.weaponCharges.get(weapon) || 0;
    const ammo = this.inventory.get(weapon) || 0;
    return charge >= 100 && (ammo === -1 || ammo > 0);
  }
  
  fire(): { canFire: boolean; weapon: WeaponType } | null {
    if (!this.canFire()) return null;
    
    const weapon = this.getCurrentWeapon();
    const ammo = this.inventory.get(weapon) || 0;
    
    if (ammo !== -1) {
      this.inventory.set(weapon, ammo - 1);
      if (ammo - 1 <= 0) {
        this.inventory.delete(weapon);
        // Switch to standard if out of ammo
        this.currentWeaponIndex = 0;
      }
    }
    
    // Reset charge to 0 after firing
    this.weaponCharges.set(weapon, 0);
    
    return { canFire: true, weapon };
  }
  
  takeDamage(amount: number, currentTime: number): { dead: boolean; damageDealt: number } {
    this.lastDamageTime = currentTime;
    
    let remaining = amount;
    
    // Shield absorbs first
    if (this.shield > 0) {
      const shieldDamage = Math.min(this.shield, remaining);
      this.shield -= shieldDamage;
      remaining -= shieldDamage;
    }
    
    // Then health
    this.health -= remaining;
    
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      return { dead: true, damageDealt: amount };
    }
    
    return { dead: false, damageDealt: amount };
  }
  
  updateShieldRegen(deltaTime: number, currentTime: number): void {
    if (!this.alive) return;
    
    const timeSinceDamage = currentTime - this.lastDamageTime;
    if (timeSinceDamage >= COMBAT.SHIELD_REGEN_DELAY) {
      this.shield = Math.min(this.maxShield, this.shield + COMBAT.SHIELD_REGEN_RATE * deltaTime);
    }
  }
  
  move(direction: -1 | 0 | 1, terrain: Terrain, deltaTime: number): void {
    if (!this.alive || direction === 0) return;
    
    const slope = terrain.getSlopeAt(this.x);
    let speed = PHYSICS.TANK_SPEED;
    
    // Adjust speed based on slope
    if ((direction > 0 && slope > 0) || (direction < 0 && slope < 0)) {
      speed *= PHYSICS.TANK_UPHILL_MODIFIER;
    } else if ((direction > 0 && slope < 0) || (direction < 0 && slope > 0)) {
      speed *= PHYSICS.TANK_DOWNHILL_MODIFIER;
    }
    
    this.x += direction * speed * deltaTime;
    this.x = Math.max(20, Math.min(GAME.CANVAS_WIDTH - 20, this.x));
    this.y = terrain.getHeightAt(this.x);
  }
  
  applyJumpJet(deltaTime: number, jumping: boolean, terrain: Terrain): void {
    if (!this.hasJumpJets || !this.alive) return;
    
    const onGround = Math.abs(this.y - terrain.getHeightAt(this.x)) < 5;
    
    if (jumping && this.jetFuel > 0) {
      // Apply upward thrust
      this.y += PHYSICS.JUMP_JET_THRUST * deltaTime;
      this.jetFuel -= deltaTime / PHYSICS.JUMP_JET_FUEL_DURATION;
      this.jetFuel = Math.max(0, this.jetFuel);
    } else if (onGround && !jumping) {
      // Regenerate fuel when grounded
      this.jetFuel = Math.min(1, this.jetFuel + PHYSICS.JUMP_JET_REGEN_RATE * deltaTime);
    }
    
    // Apply gravity if airborne
    if (!onGround && !jumping) {
      let fallSpeed = PHYSICS.GRAVITY * deltaTime;
      if (this.hasHoverCoil) {
        fallSpeed *= 0.4;  // Slower fall with hover coil
      }
      this.y -= fallSpeed;
    }
    
    // Clamp to terrain
    this.y = Math.max(terrain.getHeightAt(this.x), this.y);
  }
  
  getState(): TankState {
    return {
      x: this.x,
      y: this.y,
      aimAngle: this.aimAngle,
      power: this.power,
      health: this.health,
      shield: this.shield,
      alive: this.alive,
      jetFuel: this.jetFuel,
      currentWeapon: this.getCurrentWeapon(),
      weaponChargePercent: this.weaponCharges.get(this.getCurrentWeapon()) || 0,
    };
  }
}
```

### Projectile System

```typescript
// Projectile.ts

export class Projectile {
  id: string;
  type: WeaponType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ownerId: string;
  active: boolean = true;
  armTime: number = 0;          // For mines
  hasReachedApex: boolean = false;
  
  constructor(id: string, type: WeaponType, x: number, y: number, angle: number, power: number, ownerId: string) {
    this.id = id;
    this.type = type;
    this.x = x;
    this.y = y;
    this.ownerId = ownerId;
    
    // Convert angle (degrees) and power (%) to velocity
    const radians = (angle * Math.PI) / 180;
    const speed = power * 8;  // Scale power to velocity
    this.vx = Math.cos(radians) * speed;
    this.vy = Math.sin(radians) * speed;
  }
  
  update(deltaTime: number, terrain: Terrain): ProjectileUpdateResult {
    if (!this.active) return { hit: false };
    
    // Special handling for rolling mines
    if (this.type === WeaponType.ROLLING_MINES) {
      return this.updateRollingMine(deltaTime, terrain);
    }
    
    // Apply gravity
    this.vy -= PHYSICS.GRAVITY * deltaTime;
    
    // Check for apex (for MIRV and Death's Head)
    if (this.vy <= 0 && !this.hasReachedApex) {
      this.hasReachedApex = true;
      if (this.type === WeaponType.MIRV || this.type === WeaponType.DEATHS_HEAD) {
        return { hit: false, split: true };
      }
    }
    
    // Move
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;
    
    // Check terrain collision
    const terrainHeight = terrain.getHeightAt(this.x);
    if (this.y <= terrainHeight) {
      this.active = false;
      return { hit: true, x: this.x, y: terrainHeight };
    }
    
    // Check bounds
    if (this.x < 0 || this.x > GAME.CANVAS_WIDTH || this.y < -500) {
      this.active = false;
      return { hit: false, outOfBounds: true };
    }
    
    return { hit: false };
  }
  
  updateRollingMine(deltaTime: number, terrain: Terrain): ProjectileUpdateResult {
    this.armTime += deltaTime;
    
    // Roll along terrain
    const terrainHeight = terrain.getHeightAt(this.x);
    const slope = terrain.getSlopeAt(this.x);
    
    // Apply gravity to keep on ground
    this.y = terrainHeight;
    
    // Roll downhill
    const rollSpeed = Math.sin(slope) * 100;
    this.x += rollSpeed * deltaTime;
    
    // Explode after 10 seconds
    if (this.armTime > 10) {
      this.active = false;
      return { hit: true, x: this.x, y: this.y };
    }
    
    // Proximity check handled in GameEngine
    return { hit: false, isArmed: this.armTime > 1 };
  }
  
  getState(): ProjectileState {
    return {
      id: this.id,
      type: this.type,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      ownerId: this.ownerId,
    };
  }
}

export interface ProjectileUpdateResult {
  hit: boolean;
  x?: number;
  y?: number;
  split?: boolean;
  outOfBounds?: boolean;
  isArmed?: boolean;
}

// Factory function for split projectiles (MIRV, Death's Head)
export function createSplitProjectiles(
  parent: Projectile,
  count: number,
  coneAngle: number,
  idGenerator: () => string
): Projectile[] {
  const projectiles: Projectile[] = [];
  const baseAngle = Math.atan2(parent.vy, parent.vx) * (180 / Math.PI);
  const halfCone = coneAngle / 2;
  const angleStep = coneAngle / (count - 1);
  
  for (let i = 0; i < count; i++) {
    const angle = baseAngle - halfCone + angleStep * i;
    const speed = Math.sqrt(parent.vx ** 2 + parent.vy ** 2) * 0.6;  // Reduced speed for bomblets
    
    const proj = new Projectile(
      idGenerator(),
      WeaponType.STANDARD,  // Bomblets behave like standard missiles
      parent.x,
      parent.y,
      angle,
      speed / 8,  // Convert back to power scale
      parent.ownerId
    );
    proj.hasReachedApex = true;  // Bomblets don't split again
    projectiles.push(proj);
  }
  
  return projectiles;
}

// Factory function for Corbomite death explosion
export function createCorbomiteProjectiles(
  tankX: number,
  tankY: number,
  ownerId: string,
  idGenerator: () => string
): Projectile[] {
  const projectiles: Projectile[] = [];
  const count = 5;
  const coneAngle = 150;  // 150 degree arc, mostly upward
  const halfCone = coneAngle / 2;
  const angleStep = coneAngle / (count - 1);
  const baseAngle = 90;  // Straight up
  const power = 30;  // Low power
  
  for (let i = 0; i < count; i++) {
    const angle = baseAngle - halfCone + angleStep * i;
    const proj = new Projectile(
      idGenerator(),
      WeaponType.STANDARD,
      tankX,
      tankY,
      angle,
      power,
      ownerId
    );
    projectiles.push(proj);
  }
  
  return projectiles;
}

// Factory function for Air Strike
export function createAirStrikeProjectiles(
  targetX: number,
  ownerId: string,
  idGenerator: () => string
): Projectile[] {
  const projectiles: Projectile[] = [];
  const count = 5;
  const spread = 60;  // Total horizontal spread
  
  for (let i = 0; i < count; i++) {
    const x = targetX - spread / 2 + (spread / (count - 1)) * i;
    const proj = new Projectile(
      idGenerator(),
      WeaponType.STANDARD,
      x,
      GAME.CANVAS_HEIGHT + 50,  // Start above screen
      270,  // Straight down
      20,   // Low power, just falling
      ownerId
    );
    projectiles.push(proj);
  }
  
  return projectiles;
}
```

### Game Engine

```typescript
// GameEngine.ts

export class GameEngine {
  terrain: Terrain;
  tanks: Map<string, Tank> = new Map();
  projectiles: Map<string, Projectile> = new Map();
  roundTime: number = 0;
  isBlitz: boolean = false;
  roundActive: boolean = false;
  projectileIdCounter: number = 0;
  lastDamageDealer: Map<string, string> = new Map();  // victimId -> lastAttackerId
  
  constructor(terrain: Terrain) {
    this.terrain = terrain;
  }
  
  generateProjectileId(): string {
    return `proj_${++this.projectileIdCounter}`;
  }
  
  startRound(isBlitz: boolean): void {
    this.isBlitz = isBlitz;
    this.roundTime = 0;
    this.roundActive = true;
    this.projectiles.clear();
    this.lastDamageDealer.clear();
  }
  
  update(deltaTime: number, inputs: Map<string, InputState>): GameUpdateResult {
    if (!this.roundActive) return { events: [] };
    
    this.roundTime += deltaTime;
    const events: GameEvent[] = [];
    
    // Update tanks
    for (const [playerId, tank] of this.tanks) {
      if (!tank.alive) continue;
      
      const input = inputs.get(playerId);
      if (input) {
        tank.move(input.moveDirection, this.terrain, deltaTime);
        tank.aimAngle = input.aimAngle;
        tank.power = input.power;
        tank.applyJumpJet(deltaTime, input.jumping, this.terrain);
        
        // Weapon switching
        if (input.selectedWeapon !== tank.currentWeaponIndex) {
          tank.switchWeapon(input.selectedWeapon);
        }
        
        // Charging
        tank.updateCharge(deltaTime, this.isBlitz);
        
        // Firing
        if (input.firing) {
          const fireResult = tank.fire();
          if (fireResult) {
            const projectile = this.createProjectile(tank, fireResult.weapon);
            if (projectile) {
              events.push({ type: 'FIRE', playerId, weapon: fireResult.weapon });
            }
          }
        }
      }
      
      tank.updateShieldRegen(deltaTime, this.roundTime);
    }
    
    // Update projectiles
    const terrainDestructions: TerrainDestruction[] = [];
    const explosions: ExplosionEvent[] = [];
    
    for (const [id, projectile] of this.projectiles) {
      const result = projectile.update(deltaTime, this.terrain);
      
      if (result.split) {
        // Handle MIRV / Death's Head split
        const weapon = projectile.type;
        let count = 5;
        let cone = 60;
        
        if (weapon === WeaponType.DEATHS_HEAD) {
          count = 30;
          cone = 120;
        }
        
        const bomblets = createSplitProjectiles(
          projectile,
          count,
          cone,
          () => this.generateProjectileId()
        );
        
        for (const bomblet of bomblets) {
          this.projectiles.set(bomblet.id, bomblet);
        }
        
        this.projectiles.delete(id);
        continue;
      }
      
      if (result.hit && result.x !== undefined && result.y !== undefined) {
        const weaponDef = WEAPONS[projectile.type] || WEAPONS[WeaponType.STANDARD];
        
        // Create explosion
        const explosion: ExplosionEvent = {
          x: result.x,
          y: result.y,
          radius: weaponDef.blastRadius,
          damage: weaponDef.damage,
          ownerId: projectile.ownerId,
          weaponType: projectile.type,
        };
        explosions.push(explosion);
        
        // Destroy terrain
        const destruction = this.terrain.destroy(result.x, result.y, weaponDef.blastRadius);
        terrainDestructions.push(destruction);
        
        // Damage tanks
        for (const [tankId, tank] of this.tanks) {
          if (!tank.alive) continue;
          
          const distance = Math.sqrt((tank.x - result.x) ** 2 + (tank.y - result.y) ** 2);
          if (distance < weaponDef.blastRadius) {
            // Damage falls off with distance
            const falloff = 1 - (distance / weaponDef.blastRadius);
            const damage = Math.floor(weaponDef.damage * falloff);
            
            if (damage > 0) {
              this.lastDamageDealer.set(tankId, projectile.ownerId);
              const damageResult = tank.takeDamage(damage, this.roundTime);
              
              if (damageResult.dead) {
                events.push({
                  type: 'DEATH',
                  playerId: tankId,
                  killedBy: projectile.ownerId === tankId ? null : projectile.ownerId,
                });
                
                // Handle Corbomite
                if (tank.hasCorbomite) {
                  const corbomiteProjectiles = createCorbomiteProjectiles(
                    tank.x,
                    tank.y,
                    tankId,
                    () => this.generateProjectileId()
                  );
                  for (const proj of corbomiteProjectiles) {
                    this.projectiles.set(proj.id, proj);
                  }
                  events.push({ type: 'CORBOMITE', playerId: tankId });
                }
              }
            }
          }
        }
        
        this.projectiles.delete(id);
      }
      
      // Rolling mine proximity check
      if (result.isArmed && projectile.type === WeaponType.ROLLING_MINES) {
        for (const [tankId, tank] of this.tanks) {
          if (!tank.alive || tankId === projectile.ownerId) continue;
          
          const distance = Math.sqrt((tank.x - projectile.x) ** 2 + (tank.y - projectile.y) ** 2);
          if (distance < 50) {
            // Trigger mine explosion
            projectile.active = false;
            // Will be processed as hit on next frame
          }
        }
      }
      
      if (!projectile.active) {
        this.projectiles.delete(id);
      }
    }
    
    // World leveling
    if (this.roundTime >= GAME.WORLD_LEVELING_START) {
      const levelingPhase = this.roundTime - GAME.WORLD_LEVELING_START;
      
      if (levelingPhase > 0) {
        // Gradually flatten terrain
        const flattenRate = 5 * deltaTime;  // Pixels per tick
        this.terrain.flatten(flattenRate);
        
        // Random explosions during phase 2 (15-25 seconds in)
        if (levelingPhase > 15 && levelingPhase < 25 && Math.random() < 0.1) {
          const randomX = Math.random() * GAME.CANVAS_WIDTH;
          const randomY = this.terrain.getHeightAt(randomX) + Math.random() * 100;
          explosions.push({
            x: randomX,
            y: randomY,
            radius: 40,
            damage: 20,
            ownerId: 'world',
            weaponType: WeaponType.STANDARD,
          });
          terrainDestructions.push(this.terrain.destroy(randomX, randomY, 40));
        }
        
        // Sudden death at 90 seconds
        if (this.roundTime >= GAME.ROUND_TIME_LIMIT) {
          for (const [tankId, tank] of this.tanks) {
            if (tank.alive) {
              const damageResult = tank.takeDamage(10 * deltaTime, this.roundTime);
              if (damageResult.dead) {
                events.push({ type: 'DEATH', playerId: tankId, killedBy: null });
              }
            }
          }
        }
      }
    }
    
    // Check for round end
    const aliveTanks = Array.from(this.tanks.values()).filter(t => t.alive);
    if (aliveTanks.length <= 1) {
      this.roundActive = false;
      events.push({
        type: 'ROUND_END',
        winnerId: aliveTanks.length === 1 ? aliveTanks[0].id : null,
      });
    }
    
    return {
      events,
      terrainDestructions,
      explosions,
    };
  }
  
  createProjectile(tank: Tank, weapon: WeaponType): Projectile | null {
    // Air strike is special
    if (weapon === WeaponType.AIR_STRIKE) {
      // Calculate target X based on aim
      const radians = (tank.aimAngle * Math.PI) / 180;
      const targetX = tank.x + Math.cos(radians) * tank.power * 10;
      
      const strikes = createAirStrikeProjectiles(
        targetX,
        tank.id,
        () => this.generateProjectileId()
      );
      
      // Delay spawn by 2 seconds (handled via setTimeout or timer in real impl)
      for (const proj of strikes) {
        this.projectiles.set(proj.id, proj);
      }
      return null;
    }
    
    const projectile = new Projectile(
      this.generateProjectileId(),
      weapon,
      tank.x,
      tank.y + 10,  // Spawn slightly above tank
      tank.aimAngle,
      tank.power,
      tank.id
    );
    
    this.projectiles.set(projectile.id, projectile);
    return projectile;
  }
  
  getState(): GameState {
    const tanks: { [playerId: string]: TankState } = {};
    for (const [id, tank] of this.tanks) {
      tanks[id] = tank.getState();
    }
    
    const projectiles: ProjectileState[] = [];
    for (const [_, proj] of this.projectiles) {
      projectiles.push(proj.getState());
    }
    
    return {
      tick: 0,  // Set by Room
      serverTime: Date.now(),
      roundTime: this.roundTime,
      tanks,
      projectiles,
    };
  }
}

export interface GameUpdateResult {
  events: GameEvent[];
  terrainDestructions?: TerrainDestruction[];
  explosions?: ExplosionEvent[];
}

export type GameEvent =
  | { type: 'FIRE'; playerId: string; weapon: WeaponType }
  | { type: 'DEATH'; playerId: string; killedBy: string | null }
  | { type: 'CORBOMITE'; playerId: string }
  | { type: 'ROUND_END'; winnerId: string | null };
```

---

## Economy System

```typescript
// Economy.ts

export function calculateRoundEarnings(
  playerId: string,
  kills: string[],              // Array of player IDs killed by this player
  leaderId: string | null,      // Current match leader ID
  survived: boolean,
  totalPlayers: number,
  allKilledByPlayer: boolean    // Did this player kill everyone?
): RoundEarnings {
  let killReward = 0;
  let leaderKills = 0;
  let leaderKillReward = 0;
  
  for (const victimId of kills) {
    if (victimId === leaderId) {
      leaderKills++;
      leaderKillReward += ECONOMY.LEADER_KILL_REWARD;
    } else {
      killReward += ECONOMY.KILL_REWARD;
    }
  }
  
  const survivalBonus = survived ? ECONOMY.SURVIVAL_BONUS : 0;
  const participationBonus = kills.length === 0 && !survived ? ECONOMY.PARTICIPATION_BONUS : 0;
  
  let subtotal = killReward + leaderKillReward + survivalBonus + participationBonus;
  
  // Groovy bonus: +50% if killed all other players
  let groovyBonus = 0;
  if (allKilledByPlayer && kills.length === totalPlayers - 1) {
    groovyBonus = Math.floor(subtotal * (ECONOMY.GROOVY_MULTIPLIER - 1));
  }
  
  const total = subtotal + groovyBonus;
  
  return {
    kills: kills.length,
    killReward,
    leaderKills,
    leaderKillReward,
    survivalBonus,
    participationBonus,
    groovyBonus,
    total,
  };
}

export function determineLeader(scores: Map<string, number>): string | null {
  let maxScore = 0;
  let leaderId: string | null = null;
  
  for (const [playerId, score] of scores) {
    if (score > maxScore) {
      maxScore = score;
      leaderId = playerId;
    }
  }
  
  return leaderId;
}
```

---

## Client Rendering

```typescript
// Renderer.ts

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  
  // Colors matching original game aesthetic
  readonly SKY_GRADIENT_TOP = '#000033';
  readonly SKY_GRADIENT_BOTTOM = '#4a0080';
  readonly TERRAIN_COLOR = '#c8c800';  // Yellow-green
  readonly TERRAIN_EDGE_COLOR = '#808000';
  
  readonly TANK_COLORS = [
    '#ff0000',  // Red
    '#0088ff',  // Blue  
    '#00ff00',  // Green
    '#ffff00',  // Yellow
    '#ff00ff',  // Magenta
    '#00ffff',  // Cyan
    '#ff8800',  // Orange
  ];
  
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.canvas.width = GAME.CANVAS_WIDTH;
    this.canvas.height = GAME.CANVAS_HEIGHT;
  }
  
  clear(): void {
    // Draw sky gradient
    const gradient = this.ctx.createLinearGradient(0, 0, 0, GAME.CANVAS_HEIGHT);
    gradient.addColorStop(0, this.SKY_GRADIENT_TOP);
    gradient.addColorStop(1, this.SKY_GRADIENT_BOTTOM);
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, GAME.CANVAS_WIDTH, GAME.CANVAS_HEIGHT);
  }
  
  drawTerrain(heightmap: number[]): void {
    this.ctx.fillStyle = this.TERRAIN_COLOR;
    this.ctx.beginPath();
    this.ctx.moveTo(0, GAME.CANVAS_HEIGHT);
    
    for (let x = 0; x < heightmap.length; x++) {
      const y = GAME.CANVAS_HEIGHT - heightmap[x];
      this.ctx.lineTo(x, y);
    }
    
    this.ctx.lineTo(GAME.CANVAS_WIDTH, GAME.CANVAS_HEIGHT);
    this.ctx.closePath();
    this.ctx.fill();
    
    // Draw terrain edge/outline for depth
    this.ctx.strokeStyle = this.TERRAIN_EDGE_COLOR;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    for (let x = 0; x < heightmap.length; x++) {
      const y = GAME.CANVAS_HEIGHT - heightmap[x];
      if (x === 0) this.ctx.moveTo(x, y);
      else this.ctx.lineTo(x, y);
    }
    this.ctx.stroke();
  }
  
  drawTank(tank: TankState, playerIndex: number, playerName: string): void {
    if (!tank.alive) return;
    
    const x = tank.x;
    const y = GAME.CANVAS_HEIGHT - tank.y;
    const color = this.TANK_COLORS[playerIndex % this.TANK_COLORS.length];
    
    // Tank body (simple rectangle for now)
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x - 15, y - 10, 30, 15);
    
    // Tank turret
    this.ctx.fillRect(x - 8, y - 18, 16, 10);
    
    // Barrel
    const barrelLength = 25;
    const radians = (tank.aimAngle * Math.PI) / 180;
    const barrelEndX = x + Math.cos(radians) * barrelLength;
    const barrelEndY = y - 14 - Math.sin(radians) * barrelLength;
    
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 4;
    this.ctx.beginPath();
    this.ctx.moveTo(x, y - 14);
    this.ctx.lineTo(barrelEndX, barrelEndY);
    this.ctx.stroke();
    
    // Health bar background
    this.ctx.fillStyle = '#333';
    this.ctx.fillRect(x - 20, y - 35, 40, 6);
    
    // Health bar
    const healthPercent = tank.health / COMBAT.TANK_HEALTH;
    this.ctx.fillStyle = healthPercent > 0.5 ? '#00ff00' : healthPercent > 0.25 ? '#ffff00' : '#ff0000';
    this.ctx.fillRect(x - 20, y - 35, 40 * healthPercent, 6);
    
    // Shield bar (if any)
    if (tank.shield > 0) {
      this.ctx.fillStyle = '#0088ff';
      const shieldPercent = tank.shield / COMBAT.SHIELD_MAX;
      this.ctx.fillRect(x - 20, y - 42, 40 * shieldPercent, 4);
    }
    
    // Player name
    this.ctx.fillStyle = '#fff';
    this.ctx.font = '12px monospace';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(playerName, x, y - 48);
  }
  
  drawProjectile(projectile: ProjectileState): void {
    const x = projectile.x;
    const y = GAME.CANVAS_HEIGHT - projectile.y;
    
    // Simple circle for projectile
    this.ctx.fillStyle = '#fff';
    this.ctx.beginPath();
    this.ctx.arc(x, y, 4, 0, Math.PI * 2);
    this.ctx.fill();
    
    // Trail
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.ctx.lineTo(x - projectile.vx * 0.05, y + projectile.vy * 0.05);
    this.ctx.stroke();
  }
  
  drawExplosion(x: number, y: number, radius: number, progress: number): void {
    const screenY = GAME.CANVAS_HEIGHT - y;
    const alpha = 1 - progress;
    const currentRadius = radius * (0.5 + progress * 0.5);
    
    // Outer glow
    const gradient = this.ctx.createRadialGradient(x, screenY, 0, x, screenY, currentRadius);
    gradient.addColorStop(0, `rgba(255, 200, 50, ${alpha})`);
    gradient.addColorStop(0.5, `rgba(255, 100, 0, ${alpha * 0.5})`);
    gradient.addColorStop(1, `rgba(100, 0, 0, 0)`);
    
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(x, screenY, currentRadius, 0, Math.PI * 2);
    this.ctx.fill();
  }
  
  drawTrajectoryPreview(tank: TankState, terrain: number[]): void {
    // Only draw if tank has targeting computer
    const x = tank.x;
    const y = tank.y;
    const radians = (tank.aimAngle * Math.PI) / 180;
    const speed = tank.power * 8;
    let vx = Math.cos(radians) * speed;
    let vy = Math.sin(radians) * speed;
    
    let px = x;
    let py = y + 10;
    
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    this.ctx.setLineDash([5, 5]);
    this.ctx.beginPath();
    this.ctx.moveTo(px, GAME.CANVAS_HEIGHT - py);
    
    for (let t = 0; t < 100; t++) {
      vy -= PHYSICS.GRAVITY * 0.016;
      px += vx * 0.016;
      py += vy * 0.016;
      
      const terrainHeight = terrain[Math.floor(px)] || 0;
      if (py <= terrainHeight || px < 0 || px > GAME.CANVAS_WIDTH) {
        break;
      }
      
      this.ctx.lineTo(px, GAME.CANVAS_HEIGHT - py);
    }
    
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }
  
  drawHUD(
    players: PlayerInfo[],
    localTank: TankState | null,
    roundNumber: number,
    totalRounds: number,
    roundTime: number,
    isBlitz: boolean
  ): void {
    // Top bar with player health
    const barWidth = 100;
    const barHeight = 12;
    const padding = 20;
    
    players.forEach((player, i) => {
      const x = padding + i * (barWidth + 40);
      const y = 20;
      
      // Player name and color indicator
      this.ctx.fillStyle = this.TANK_COLORS[i % this.TANK_COLORS.length];
      this.ctx.beginPath();
      this.ctx.arc(x - 10, y + 6, 6, 0, Math.PI * 2);
      this.ctx.fill();
      
      // Health bar background
      this.ctx.fillStyle = '#333';
      this.ctx.fillRect(x, y, barWidth, barHeight);
      
      // Health bar (would need tank state for actual health)
      this.ctx.fillStyle = '#00ff00';
      this.ctx.fillRect(x, y, barWidth * 0.75, barHeight);
    });
    
    // Round info (top right)
    this.ctx.fillStyle = '#fff';
    this.ctx.font = '16px monospace';
    this.ctx.textAlign = 'right';
    this.ctx.fillText(`Round ${roundNumber}/${totalRounds}`, GAME.CANVAS_WIDTH - 20, 30);
    this.ctx.fillText(`Time: ${Math.floor(roundTime)}s`, GAME.CANVAS_WIDTH - 20, 50);
    
    if (isBlitz) {
      this.ctx.fillStyle = '#ff0';
      this.ctx.fillText('BLITZ!', GAME.CANVAS_WIDTH - 20, 70);
    }
    
    // Bottom HUD (local player info)
    if (localTank) {
      const hudY = GAME.CANVAS_HEIGHT - 60;
      
      // Current weapon
      this.ctx.fillStyle = '#fff';
      this.ctx.font = '14px monospace';
      this.ctx.textAlign = 'left';
      this.ctx.fillText(`[${localTank.currentWeapon.toUpperCase()}]`, 20, hudY);
      
      // Charge bar
      this.ctx.fillStyle = '#333';
      this.ctx.fillRect(20, hudY + 10, 150, 15);
      this.ctx.fillStyle = localTank.weaponChargePercent >= 100 ? '#0f0' : '#ff0';
      this.ctx.fillRect(20, hudY + 10, 150 * (localTank.weaponChargePercent / 100), 15);
      this.ctx.fillStyle = '#fff';
      this.ctx.fillText(`${Math.floor(localTank.weaponChargePercent)}%`, 180, hudY + 22);
      
      // Power
      this.ctx.fillText(`Power: ${localTank.power}%`, 250, hudY + 22);
      
      // Angle
      this.ctx.fillText(`Angle: ${localTank.aimAngle}°`, 380, hudY + 22);
      
      // Jet fuel (if applicable)
      if (localTank.jetFuel > 0) {
        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(500, hudY + 10, 80, 15);
        this.ctx.fillStyle = '#0ff';
        this.ctx.fillRect(500, hudY + 10, 80 * localTank.jetFuel, 15);
        this.ctx.fillStyle = '#fff';
        this.ctx.fillText('Jets', 590, hudY + 22);
      }
    }
  }
  
  drawBlitzAnnouncement(progress: number): void {
    // Bouncing "BLITZ" text
    this.ctx.font = 'bold 72px monospace';
    this.ctx.fillStyle = '#ff0';
    this.ctx.textAlign = 'center';
    
    const texts = 5;
    for (let i = 0; i < texts; i++) {
      const baseX = (GAME.CANVAS_WIDTH / (texts + 1)) * (i + 1);
      const baseY = GAME.CANVAS_HEIGHT / 2;
      const offsetX = Math.sin(progress * 10 + i * 2) * 50;
      const offsetY = Math.cos(progress * 8 + i * 3) * 30;
      
      this.ctx.fillText('BLITZ', baseX + offsetX, baseY + offsetY);
    }
  }
  
  drawGroovy(): void {
    this.ctx.font = 'bold 96px monospace';
    this.ctx.fillStyle = '#0f0';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('GROOVY!', GAME.CANVAS_WIDTH / 2, GAME.CANVAS_HEIGHT / 2);
  }
}
```

---

## Input Handling

```typescript
// InputHandler.ts

export class InputHandler {
  private keys: Set<string> = new Set();
  private gamepadIndex: number | null = null;
  
  aimAngle: number = 90;
  power: number = 50;
  selectedWeapon: number = 0;
  weaponCount: number = 1;
  
  constructor() {
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    
    window.addEventListener('gamepadconnected', (e) => {
      this.gamepadIndex = e.gamepad.index;
    });
  }
  
  update(deltaTime: number): InputState {
    // Check gamepad
    const gamepad = this.gamepadIndex !== null ? navigator.getGamepads()[this.gamepadIndex] : null;
    
    // Movement
    let moveDirection: -1 | 0 | 1 = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveDirection = -1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveDirection = 1;
    if (gamepad) {
      const leftStick = gamepad.axes[0];
      if (leftStick < -0.3) moveDirection = -1;
      if (leftStick > 0.3) moveDirection = 1;
    }
    
    // Aiming
    const aimSpeed = 90 * deltaTime;  // Degrees per second
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) {
      this.aimAngle = Math.min(180, this.aimAngle + aimSpeed);
    }
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) {
      this.aimAngle = Math.max(0, this.aimAngle - aimSpeed);
    }
    if (gamepad) {
      const rightStick = gamepad.axes[3];
      this.aimAngle = Math.max(0, Math.min(180, this.aimAngle - rightStick * aimSpeed));
    }
    
    // Power
    const powerSpeed = 50 * deltaTime;
    if (this.keys.has('KeyE') || (this.keys.has('ShiftLeft') && this.keys.has('ArrowUp'))) {
      this.power = Math.min(100, this.power + powerSpeed);
    }
    if (this.keys.has('KeyQ') || (this.keys.has('ShiftLeft') && this.keys.has('ArrowDown'))) {
      this.power = Math.max(10, this.power - powerSpeed);
    }
    if (gamepad) {
      if (gamepad.buttons[7].value > 0.1) this.power = Math.min(100, this.power + powerSpeed);
      if (gamepad.buttons[6].value > 0.1) this.power = Math.max(10, this.power - powerSpeed);
    }
    
    // Firing
    const firing = this.keys.has('Space') || (gamepad?.buttons[0].pressed ?? false);
    
    // Jumping
    const jumping = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || (gamepad?.buttons[1].pressed ?? false);
    
    // Weapon cycling (Tab / Shift+Tab)
    // Note: This should be handled as single presses, not continuous
    
    return {
      moveDirection,
      aimAngle: this.aimAngle,
      power: this.power,
      firing,
      jumping,
      selectedWeapon: this.selectedWeapon,
    };
  }
  
  cycleWeaponNext(): void {
    this.selectedWeapon = (this.selectedWeapon + 1) % this.weaponCount;
  }
  
  cycleWeaponPrev(): void {
    this.selectedWeapon = (this.selectedWeapon - 1 + this.weaponCount) % this.weaponCount;
  }
  
  setWeaponCount(count: number): void {
    this.weaponCount = count;
    if (this.selectedWeapon >= count) this.selectedWeapon = 0;
  }
}
```

---

## Audio

```typescript
// AudioManager.ts

export class AudioManager {
  private sounds: Map<string, HTMLAudioElement> = new Map();
  private musicVolume: number = 0.5;
  private sfxVolume: number = 0.7;
  
  async loadSounds(): Promise<void> {
    const soundFiles: Record<string, string> = {
      'fire_standard': '/assets/sounds/fire_standard.wav',
      'fire_machine_gun': '/assets/sounds/fire_machine_gun.wav',
      'explosion_small': '/assets/sounds/explosion_small.wav',
      'explosion_large': '/assets/sounds/explosion_large.wav',
      'explosion_nuke': '/assets/sounds/explosion_nuke.wav',
      'shield_hit': '/assets/sounds/shield_hit.wav',
      'tank_death': '/assets/sounds/tank_death.wav',
      'jump_jets': '/assets/sounds/jump_jets.wav',
      'purchase': '/assets/sounds/purchase.wav',
      'round_start': '/assets/sounds/round_start.wav',
      'blitz': '/assets/sounds/blitz.wav',
      'groovy': '/assets/sounds/groovy.wav',  // Child voice saying "Groovy!"
      'music_title': '/assets/sounds/music_title.mp3',
      'music_game': '/assets/sounds/music_game.mp3',
      'music_shop': '/assets/sounds/music_shop.mp3',
    };
    
    for (const [name, path] of Object.entries(soundFiles)) {
      const audio = new Audio(path);
      audio.preload = 'auto';
      this.sounds.set(name, audio);
    }
  }
  
  play(soundName: string, volume?: number): void {
    const sound = this.sounds.get(soundName);
    if (sound) {
      const clone = sound.cloneNode() as HTMLAudioElement;
      clone.volume = (volume ?? 1) * this.sfxVolume;
      clone.play().catch(() => {});  // Ignore autoplay errors
    }
  }
  
  playMusic(trackName: string): void {
    // Stop other music first
    for (const [name, audio] of this.sounds) {
      if (name.startsWith('music_')) {
        audio.pause();
        audio.currentTime = 0;
      }
    }
    
    const music = this.sounds.get(trackName);
    if (music) {
      music.volume = this.musicVolume;
      music.loop = true;
      music.play().catch(() => {});
    }
  }
  
  stopMusic(): void {
    for (const [name, audio] of this.sounds) {
      if (name.startsWith('music_')) {
        audio.pause();
        audio.currentTime = 0;
      }
    }
  }
}
```

---

## Server Room Management

```typescript
// Room.ts

export class Room {
  id: string;
  config: RoomConfig;
  players: Map<string, Player> = new Map();
  hostId: string;
  
  state: 'lobby' | 'playing' | 'shopping' | 'ended' = 'lobby';
  currentRound: number = 0;
  engine: GameEngine | null = null;
  terrain: Terrain | null = null;
  
  tick: number = 0;
  tickInterval: NodeJS.Timeout | null = null;
  shopTimer: NodeJS.Timeout | null = null;
  
  kills: Map<string, string[]> = new Map();  // killerId -> victimIds
  scores: Map<string, number> = new Map();
  
  constructor(id: string, hostId: string, config: RoomConfig) {
    this.id = id;
    this.hostId = hostId;
    this.config = config;
  }
  
  addPlayer(player: Player): boolean {
    if (this.players.size >= GAME.MAX_PLAYERS) return false;
    if (this.state !== 'lobby') return false;
    
    this.players.set(player.id, player);
    this.scores.set(player.id, 0);
    player.money = this.config.startingMoney;
    return true;
  }
  
  removePlayer(playerId: string): void {
    this.players.delete(playerId);
    this.scores.delete(playerId);
    
    if (playerId === this.hostId && this.players.size > 0) {
      this.hostId = this.players.keys().next().value;
    }
  }
  
  allPlayersReady(): boolean {
    if (this.players.size < GAME.MIN_PLAYERS) return false;
    for (const player of this.players.values()) {
      if (!player.ready) return false;
    }
    return true;
  }
  
  startGame(): void {
    this.currentRound = 0;
    this.scores.clear();
    for (const player of this.players.values()) {
      this.scores.set(player.id, 0);
      player.money = this.config.startingMoney;
    }
    this.startNextRound();
  }
  
  startNextRound(): void {
    this.currentRound++;
    this.kills.clear();
    
    // Generate terrain
    this.terrain = new Terrain(TERRAIN.RESOLUTION, this.config.mapType);
    this.engine = new GameEngine(this.terrain);
    
    // Determine if blitz round
    const isBlitz = Math.random() < GAME.BLITZ_CHANCE;
    
    // Position tanks
    const positions = this.calculateStartPositions();
    for (const [playerId, pos] of positions) {
      const tank = new Tank(playerId, pos.x, pos.y);
      
      // Apply purchased items
      const player = this.players.get(playerId);
      if (player) {
        if (player.hasItem(ItemType.JUMP_JETS)) {
          tank.hasJumpJets = true;
          tank.jetFuel = 1;
        }
        if (player.hasItem(ItemType.SHIELD)) {
          tank.maxShield = COMBAT.SHIELD_MAX + 50;
          tank.shield = tank.maxShield;
        }
        if (player.hasItem(ItemType.TARGETING_COMPUTER)) {
          tank.hasTargetingComputer = true;
        }
        if (player.hasItem(ItemType.HOVER_COIL)) {
          tank.hasHoverCoil = true;
        }
        if (player.hasItem(ItemType.CORBOMITE)) {
          tank.hasCorbomite = true;
        }
        
        // Load weapons
        for (const [weapon, ammo] of player.weapons) {
          tank.inventory.set(weapon, ammo);
          tank.weaponCharges.set(weapon, 0);
        }
      }
      
      this.engine.tanks.set(playerId, tank);
      this.kills.set(playerId, []);
    }
    
    this.engine.startRound(isBlitz);
    this.state = 'playing';
    this.tick = 0;
    
    // Broadcast game start
    this.broadcast({
      type: 'GAME_STARTING',
      payload: {
        terrain: Array.from(this.terrain.heightmap),
        tankPositions: Object.fromEntries(positions),
        roundNumber: this.currentRound,
        totalRounds: this.config.rounds,
        isBlitz,
      },
    });
    
    if (isBlitz) {
      this.broadcast({ type: 'BLITZ_ROUND', payload: { isBlitz: true } });
    }
    
    // Start game loop
    this.tickInterval = setInterval(() => this.gameTick(), 1000 / GAME.TICK_RATE);
  }
  
  calculateStartPositions(): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>();
    const playerIds = Array.from(this.players.keys());
    const spacing = GAME.CANVAS_WIDTH / (playerIds.length + 1);
    
    playerIds.forEach((id, i) => {
      const x = spacing * (i + 1);
      const y = this.terrain!.getHeightAt(x);
      positions.set(id, { x, y });
    });
    
    return positions;
  }
  
  gameTick(): void {
    if (!this.engine || this.state !== 'playing') return;
    
    const deltaTime = 1 / GAME.TICK_RATE;
    
    // Gather inputs
    const inputs = new Map<string, InputState>();
    for (const player of this.players.values()) {
      if (player.currentInput) {
        inputs.set(player.id, player.currentInput);
      }
    }
    
    // Update game
    const result = this.engine.update(deltaTime, inputs);
    
    // Process events
    for (const event of result.events) {
      if (event.type === 'DEATH') {
        if (event.killedBy) {
          const killerKills = this.kills.get(event.killedBy) || [];
          killerKills.push(event.playerId);
          this.kills.set(event.killedBy, killerKills);
        }
        
        this.broadcast({
          type: 'PLAYER_DEATH',
          payload: {
            playerId: event.playerId,
            killedBy: event.killedBy,
            corbomiteTriggered: false,
          },
        });
      }
      
      if (event.type === 'CORBOMITE') {
        this.broadcast({
          type: 'PLAYER_DEATH',
          payload: {
            playerId: event.playerId,
            killedBy: null,
            corbomiteTriggered: true,
          },
        });
      }
      
      if (event.type === 'ROUND_END') {
        this.endRound(event.winnerId);
        return;
      }
    }
    
    // Broadcast terrain updates
    if (result.terrainDestructions && result.terrainDestructions.length > 0) {
      this.broadcast({
        type: 'TERRAIN_UPDATE',
        payload: result.terrainDestructions,
      });
    }
    
    // Broadcast explosions
    if (result.explosions) {
      for (const explosion of result.explosions) {
        this.broadcast({ type: 'EXPLOSION', payload: explosion });
      }
    }
    
    // Broadcast game state
    this.tick++;
    const gameState = this.engine.getState();
    gameState.tick = this.tick;
    
    this.broadcast({ type: 'GAME_STATE', payload: gameState });
  }
  
  endRound(winnerId: string | null): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    
    this.state = 'shopping';
    
    // Calculate earnings
    const leaderId = determineLeader(this.scores);
    const earnings: { [playerId: string]: RoundEarnings } = {};
    let groovyPlayerId: string | undefined;
    
    for (const [playerId, player] of this.players) {
      const playerKills = this.kills.get(playerId) || [];
      const survived = playerId === winnerId;
      const allKilledByPlayer = playerKills.length === this.players.size - 1;
      
      const roundEarnings = calculateRoundEarnings(
        playerId,
        playerKills,
        leaderId,
        survived,
        this.players.size,
        allKilledByPlayer
      );
      
      earnings[playerId] = roundEarnings;
      player.money += roundEarnings.total;
      
      if (survived) {
        this.scores.set(playerId, (this.scores.get(playerId) || 0) + 1);
      }
      
      if (roundEarnings.groovyBonus > 0) {
        groovyPlayerId = playerId;
      }
    }
    
    const groovy = groovyPlayerId !== undefined;
    
    if (groovy) {
      this.broadcast({ type: 'GROOVY', payload: { playerId: groovyPlayerId! } });
    }
    
    this.broadcast({
      type: 'ROUND_END',
      payload: {
        winnerId,
        roundNumber: this.currentRound,
        earnings,
        scores: Object.fromEntries(this.scores),
        groovy,
        groovyPlayerId,
      },
    });
    
    // Check if game over
    if (this.currentRound >= this.config.rounds) {
      this.endGame();
      return;
    }
    
    // Open shop
    this.openShop();
  }
  
  openShop(): void {
    const money: { [playerId: string]: number } = {};
    const inventory: { [playerId: string]: InventoryState } = {};
    
    for (const [playerId, player] of this.players) {
      money[playerId] = player.money;
      inventory[playerId] = player.getInventoryState();
    }
    
    this.broadcast({
      type: 'SHOP_OPEN',
      payload: {
        money,
        inventory,
        timeRemaining: GAME.SHOP_DURATION,
      },
    });
    
    // Reset ready states
    for (const player of this.players.values()) {
      player.ready = false;
    }
    
    // Shop timer
    this.shopTimer = setTimeout(() => this.startNextRound(), GAME.SHOP_DURATION * 1000);
  }
  
  handlePurchase(playerId: string, itemType: WeaponType | ItemType): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;
    
    // Check if weapon or item
    const weaponDef = WEAPONS[itemType as WeaponType];
    const itemDef = ITEMS[itemType as ItemType];
    
    if (weaponDef) {
      if (player.money < weaponDef.cost) return false;
      player.money -= weaponDef.cost;
      player.addWeapon(weaponDef.type, weaponDef.ammoPerPurchase);
      return true;
    }
    
    if (itemDef) {
      if (player.money < itemDef.cost) return false;
      if (itemDef.duration === 'permanent' && player.hasItem(itemDef.type)) return false;
      player.money -= itemDef.cost;
      player.addItem(itemDef.type);
      return true;
    }
    
    return false;
  }
  
  endGame(): void {
    this.state = 'ended';
    
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.shopTimer) clearTimeout(this.shopTimer);
    
    // Calculate rankings
    const rankings = Array.from(this.players.entries())
      .map(([playerId, player]) => ({
        playerId,
        playerName: player.name,
        score: this.scores.get(playerId) || 0,
        kills: 0,  // Would need to track total kills across rounds
      }))
      .sort((a, b) => b.score - a.score);
    
    const winner = rankings[0];
    
    this.broadcast({
      type: 'GAME_OVER',
      payload: {
        rankings,
        winnerId: winner.playerId,
        winnerName: winner.playerName,
      },
    });
  }
  
  broadcast(message: ServerMessage): void {
    for (const player of this.players.values()) {
      player.send(message);
    }
  }
}
```

---

## Controls Reference (for UI display)

```
KEYBOARD:
  Movement:     A/D or ←/→
  Aim:          W/S or ↑/↓
  Power:        Q/E or Shift+↑/↓
  Fire:         Space
  Jump Jets:    Shift (hold)
  Next Weapon:  Tab
  Prev Weapon:  Shift+Tab

GAMEPAD:
  Movement:     Left Stick / D-Pad
  Aim:          Right Stick / D-Pad Vertical
  Power:        LT (down) / RT (up)
  Fire:         A
  Jump Jets:    B
  Cycle Weapon: LB / RB
```

---

## Implementation Notes for Claude Code

1. **Start with the server** - Get WebSocket connections working with basic room joining before adding game logic.

2. **Build terrain system early** - The heightmap is central to everything. Test destruction before adding tanks.

3. **Use delta time everywhere** - All physics and timing should be framerate-independent.

4. **Client prediction is optional** - Get authoritative server working first. Add prediction later for smoother feel.

5. **Test with 2 players minimum** - The game needs real-time competition to validate timing.

6. **Sound is important** - The "Groovy!" and "Blitz!" callouts are core to the experience.

7. **Keep weapon balance tweakable** - Use the constants file so values can be adjusted during testing.

8. **Terrain rendering performance** - Redraw only dirty regions after explosions, not the entire heightmap every frame.

9. **The shop UI needs to be clear** - Players have limited time. Make weapon costs and inventory obvious.

10. **Tank colors must be distinct** - Color-blind friendly palette recommended.
