// shared/protocol.ts

export const WeaponType = {
  STANDARD: 'standard',
  MACHINE_GUN: 'machine_gun',
  MISSILES: 'missiles',
  MIRV: 'mirv',
  NUKE: 'nuke',
  DEATHS_HEAD: 'deaths_head',
  ROLLING_MINES: 'rolling_mines',
  AIR_STRIKE: 'air_strike',
  AIR_STRIKE_MARKER: 'air_strike_marker',
  CORBOMITE_BLAST: 'corbomite_blast',
} as const;
export type WeaponType = typeof WeaponType[keyof typeof WeaponType];

export const ItemType = {
  JUMP_JETS: 'jump_jets',
  SHIELD: 'shield',
  TARGETING_COMPUTER: 'targeting_computer',
  CORBOMITE: 'corbomite',
  HOVER_COIL: 'hover_coil',
} as const;
export type ItemType = typeof ItemType[keyof typeof ItemType];

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
  | { type: 'SKIP_SCORE' }
  | { type: 'CHAT'; payload: { message: string } };

export interface RoomConfig {
  rounds: number;           // 5, 10, 15, 20, 30
  startingMoney: number;    // 100, 200, 500
  mapType: 'mountainous';
  startingInventory: 'none' | 'missiles' | 'heavy' | 'everything';
}

export interface InputState {
  moveDirection: -1 | 0 | 1;  // Left, None, Right
  aimAngle: number;           // -20 to 200 degrees (0 = right, 180 = left, ±20 below horizon)
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
  inventory: { [playerId: string]: InventoryState };
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
  bodyAngle: number;                         // Degrees, 0 = upright, positive = CCW (top-left)
  isJumping: boolean;                        // True when jet thrust is actively firing
  currentWeapon: WeaponType;
  weaponChargePercent: number;  // 0-100, can fire at 100
  weaponAmmo: { [weapon: string]: number };  // Live ammo counts from server
  isMovementBlocked?: boolean;               // True this tick if steep slope prevented movement
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
  kills: { [killerId: string]: string[] };  // killerId -> victimIds this round
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
  timeRemaining: number;
  jetFuelPacks: { [playerId: string]: number };  // 0–3, authoritative pack count per player
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
