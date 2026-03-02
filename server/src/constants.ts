export const GAME = {
  CANVAS_WIDTH: 1280,
  CANVAS_HEIGHT: 720,
  TICK_RATE: 30,                    // Server ticks per second
  MAX_PLAYERS: 7,
  MIN_PLAYERS: 2,
  DEFAULT_ROUNDS: 10,
  ROUND_TIME_LIMIT: 200,            // Seconds
  WORLD_LEVELING_START: 90,         // Seconds into round
  SHOP_DURATION: 30,                // Seconds
  BLITZ_CHANCE: 0.10,               // 10% chance per round
  BLITZ_COOLDOWN_REDUCTION: 0.75,   // 75% reduction
};

export const PHYSICS = {
  GRAVITY: 480,                     // Pixels per second squared
  TANK_SPEED: 60,                   // Pixels per second
  TANK_UPHILL_MODIFIER: 0.6,
  TANK_DOWNHILL_MODIFIER: 1.4,
  JUMP_JET_THRUST: 300,             // Pixels per second
  JUMP_JET_FUEL_PER_PURCHASE: 3,    // Seconds of fuel added per shop purchase
  JUMP_JET_FUEL_MAX: 9,             // Maximum seconds storable (3 purchases)
  HOVER_COIL_HEIGHT: 100,           // Pixels above terrain to hover
  HOVER_COIL_RISE_SPEED: 400,       // Pixels per second to rise/drop toward hover height
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

export const SERVER = {
  MAX_CONNECTIONS: 25,   // Max simultaneous connected players
  MAX_ROOMS: 6,          // Max concurrent game rooms
};

export const TERRAIN = {
  RESOLUTION: 1280,                 // One height value per pixel width
  MIN_HEIGHT: Math.round(GAME.CANVAS_HEIGHT * 0.1),  // Mountains peak at 95% of play area height from bottom
  MAX_HEIGHT: 550,
  FLOOR_HEIGHT: Math.round(GAME.CANVAS_HEIGHT * 0.1),  // = MIN_HEIGHT; terrain cannot be destroyed below the valley floor
};
