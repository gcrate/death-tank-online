import {
  RoomConfig, RoomState, PlayerInfo,
  ServerMessage, WeaponType, ItemType, InventoryState,
  ShopPayload, InputState,
} from '../../shared/protocol';
import { GAME, TERRAIN, COMBAT, PHYSICS } from './constants';
import { WEAPONS } from './Weapon';
import { ITEMS } from './Items';
import { Terrain } from './Terrain';
import { Tank } from './Tank';
import { GameEngine } from './GameEngine';
import { Player } from './Player';
import { calculateRoundEarnings, determineLeader } from './Economy';

const TANK_COLORS = [
  '#ff0000', '#0088ff', '#00ff00', '#ffff00',
  '#ff00ff', '#00ffff', '#ff8800',
];

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
  tickInterval: ReturnType<typeof setInterval> | null = null;
  shopTimer: ReturnType<typeof setTimeout> | null = null;
  shopReadyCount: number = 0;

  kills: Map<string, string[]> = new Map();       // killerId -> victimIds
  scores: Map<string, number> = new Map();
  totalKills: Map<string, number> = new Map();    // cumulative across rounds
  playerColors: Map<string, string> = new Map();
  playerOrder: string[] = [];                     // For color assignment

  constructor(id: string, hostId: string, config: RoomConfig) {
    this.id = id;
    this.hostId = hostId;
    this.config = config;
  }

  addPlayer(player: Player): boolean {
    if (this.players.size >= GAME.MAX_PLAYERS) return false;
    if (this.state !== 'lobby') return false;

    const colorIndex = this.playerOrder.length;
    this.playerColors.set(player.id, TANK_COLORS[colorIndex % TANK_COLORS.length]);
    this.playerOrder.push(player.id);
    this.players.set(player.id, player);
    this.scores.set(player.id, 0);
    this.totalKills.set(player.id, 0);
    player.money = this.config.startingMoney;
    return true;
  }

  removePlayer(playerId: string): void {
    this.players.delete(playerId);
    this.scores.delete(playerId);
    this.playerColors.delete(playerId);
    const idx = this.playerOrder.indexOf(playerId);
    if (idx >= 0) this.playerOrder.splice(idx, 1);

    if (playerId === this.hostId && this.players.size > 0) {
      this.hostId = this.players.keys().next().value!;
    }
  }

  allPlayersReady(): boolean {
    if (this.players.size < GAME.MIN_PLAYERS) return false;
    for (const player of this.players.values()) {
      if (!player.ready) return false;
    }
    return true;
  }

  getRoomState(): RoomState {
    const players: PlayerInfo[] = [];
    for (const [id, player] of this.players) {
      players.push({
        id,
        name: player.name,
        color: this.playerColors.get(id) || '#ffffff',
        ready: player.ready,
        score: this.scores.get(id) || 0,
        money: player.money,
      });
    }
    return {
      roomId: this.id,
      players,
      config: this.config,
      hostId: this.hostId,
      allReady: this.allPlayersReady(),
    };
  }

  startGame(): void {
    this.currentRound = 0;
    this.scores.clear();
    this.totalKills.clear();
    for (const player of this.players.values()) {
      this.scores.set(player.id, 0);
      this.totalKills.set(player.id, 0);
      player.money = this.config.startingMoney;
      // Reset inventory to default
      player.weapons.clear();
      player.weapons.set(WeaponType.STANDARD, -1);
      player.items.clear();
      player.jetFuelSeconds = 0;
      // Apply chosen starting loadout
      this.applyStartingInventory(player);
    }
    this.startNextRound();
  }

  private applyStartingInventory(player: Player): void {
    switch (this.config.startingInventory) {
      case 'missiles':
        player.addWeapon(WeaponType.MISSILES, 3);
        break;
      case 'heavy':
        player.addWeapon(WeaponType.NUKE, 1);
        player.addWeapon(WeaponType.AIR_STRIKE, 1);
        player.addWeapon(WeaponType.ROLLING_MINES, 3);
        break;
      case 'everything':
        player.addWeapon(WeaponType.MACHINE_GUN, 100);
        player.addWeapon(WeaponType.MISSILES, 3);
        player.addWeapon(WeaponType.MIRV, 1);
        player.addWeapon(WeaponType.NUKE, 1);
        player.addWeapon(WeaponType.DEATHS_HEAD, 1);
        player.addWeapon(WeaponType.ROLLING_MINES, 3);
        player.addWeapon(WeaponType.AIR_STRIKE, 1);
        player.addItem(ItemType.JUMP_JETS);
        break;
      // 'none': no extra weapons
    }
  }

  startNextRound(): void {
    this.currentRound++;
    this.kills.clear();
    this.shopReadyCount = 0;

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
        if (player.jetFuelSeconds > 0) {
          tank.hasJumpJets = true;
          tank.jetFuelSeconds = player.jetFuelSeconds;
        }
        if (player.hasItem(ItemType.SHIELD)) {
          tank.maxShield = COMBAT.SHIELD_MAX;
          tank.shield = COMBAT.SHIELD_MAX;
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
    const tankPositions: { [playerId: string]: { x: number; y: number } } = {};
    for (const [id, pos] of positions) {
      tankPositions[id] = pos;
    }

    const inventory: { [playerId: string]: InventoryState } = {};
    for (const [id, player] of this.players) {
      inventory[id] = player.getInventoryState();
    }

    this.broadcast({
      type: 'GAME_STARTING',
      payload: {
        terrain: Array.from(this.terrain.heightmap),
        tankPositions,
        roundNumber: this.currentRound,
        totalRounds: this.config.rounds,
        isBlitz,
        inventory,
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
    let roundEnded = false;
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

      if (event.type === 'ROUND_END' && !roundEnded) {
        roundEnded = true;
        if (this.tickInterval) {
          clearInterval(this.tickInterval);
          this.tickInterval = null;
        }
        // Broadcast the final game state before ending the round so clients
        // receive up-to-date weaponAmmo counts before SHOP_OPEN arrives
        this.tick++;
        const finalState = this.engine.getState();
        finalState.tick = this.tick;
        this.broadcast({ type: 'GAME_STATE', payload: finalState });
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

      // Track total kills
      const prevKills = this.totalKills.get(playerId) || 0;
      this.totalKills.set(playerId, prevKills + playerKills.length);

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
      setTimeout(() => this.endGame(), 3000);
      return;
    }

    // Save tank state back to player so it persists into the next round
    for (const [playerId, player] of this.players) {
      const tank = this.engine.tanks.get(playerId);
      if (!tank) continue;

      // Carry forward remaining weapon ammo (so starting inventory only applies to round 1)
      player.weapons.clear();
      for (const [weapon, ammo] of tank.inventory) {
        if (ammo === -1 || ammo > 0) {
          player.weapons.set(weapon, ammo);
        }
      }

      // Carry forward remaining jet fuel
      player.jetFuelSeconds = tank.jetFuelSeconds;
    }

    // Strip per-round items so players must re-purchase each shop phase
    for (const player of this.players.values()) {
      player.items.delete(ItemType.TARGETING_COMPUTER);
    }

    // Open shop
    this.openShop();
  }

  openShop(): void {
    const money: { [playerId: string]: number } = {};

    for (const [playerId, player] of this.players) {
      money[playerId] = player.money;
    }

    this.broadcast({
      type: 'SHOP_OPEN',
      payload: {
        money,
        timeRemaining: GAME.SHOP_DURATION,
      },
    });

    // Reset ready states
    this.shopReadyCount = 0;
    for (const player of this.players.values()) {
      player.ready = false;
    }

    // Shop timer - start next round after duration
    this.shopTimer = setTimeout(() => {
      if (this.state === 'shopping') {
        this.startNextRound();
      }
    }, GAME.SHOP_DURATION * 1000);
  }

  handleShopReady(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player || player.ready) return;
    player.ready = true;
    this.shopReadyCount++;

    // If all players are ready, start next round early
    if (this.shopReadyCount >= this.players.size) {
      if (this.shopTimer) {
        clearTimeout(this.shopTimer);
        this.shopTimer = null;
      }
      if (this.state === 'shopping') {
        this.startNextRound();
      }
    }
  }

  handlePurchase(playerId: string, itemType: WeaponType | ItemType): boolean {
    const player = this.players.get(playerId);
    if (!player || this.state !== 'shopping') return false;

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
      if (itemDef.type === ItemType.JUMP_JETS && player.jetFuelSeconds >= PHYSICS.JUMP_JET_FUEL_MAX) return false;
      if (itemDef.duration === 'permanent' && itemDef.type !== ItemType.JUMP_JETS && player.hasItem(itemDef.type)) return false;
      if (itemDef.duration === 'per_round' && player.hasItem(itemDef.type)) return false;
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
        kills: this.totalKills.get(playerId) || 0,
      }))
      .sort((a, b) => b.score - a.score || b.kills - a.kills);

    const winner = rankings[0];

    this.broadcast({
      type: 'GAME_OVER',
      payload: {
        rankings,
        winnerId: winner?.playerId || '',
        winnerName: winner?.playerName || '',
      },
    });
  }

  broadcast(message: ServerMessage): void {
    for (const player of this.players.values()) {
      player.send(message);
    }
  }

  cleanup(): void {
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.shopTimer) clearTimeout(this.shopTimer);
  }
}
