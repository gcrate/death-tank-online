import {
  ServerMessage, GameState, PlayerInfo, RoomState, ShopPayload,
  ItemType, WeaponType, TankState, RoomConfig, RoundEarnings,
} from '../../shared/protocol';
import { NetworkClient } from './NetworkClient';
import { Renderer } from './Renderer';
import { InputHandler } from './InputHandler';
import { ParticleSystem } from './ParticleSystem';
import { AudioManager } from './AudioManager';
import { UI } from './UI';
import { ActiveExplosion } from './types';

type GamePhase = 'lobby' | 'room' | 'playing' | 'score_screen' | 'shop' | 'gameover';

export class Game {
  private network: NetworkClient;
  private renderer: Renderer;
  private input: InputHandler;
  private particles: ParticleSystem;
  private audio: AudioManager;
  private ui: UI;

  private localId: string = '';
  private localName: string = '';
  private phase: GamePhase = 'lobby';

  // Game state
  private heightmap: number[] = [];
  private gameState: GameState | null = null;
  private players: PlayerInfo[] = [];
  private localRoom: RoomState | null = null;
  private shopPayload: ShopPayload | null = null;
  private localInventory: { weapons: { type: WeaponType; ammo: number }[]; items: ItemType[] } = {
    weapons: [], items: [],
  };

  // Round state
  private roundNumber: number = 0;
  private totalRounds: number = 10;
  private isBlitz: boolean = false;

  // Visual state
  private explosions: ActiveExplosion[] = [];
  private wobbleUntil: number = 0;
  private lastTankX: number | null = null;
  private lastMoveDirection: -1 | 0 | 1 = 0;
  private blitzAnimStart: number = 0;
  private showBlitz: boolean = false;
  private groovyTime: number = 0;
  private showGroovy: boolean = false;
  private roundResultTime: number = 0;
  private roundResultWinner: string | null = null;
  private roundResultName: string = '';
  private showRoundResult: boolean = false;
  private firedProjectileIds: Set<string> = new Set();

  // Score screen
  private scoreScreen: {
    active: boolean;
    winnerId: string | null;
    kills: { [killerId: string]: string[] };
    earnings: { [playerId: string]: RoundEarnings };
    roundNumber: number;
    startTime: number;
    mySkipped: boolean;
  } = { active: false, winnerId: null, kills: {}, earnings: {}, roundNumber: 0, startTime: 0, mySkipped: false };

  // Timings
  private lastTime: number = 0;
  private inputSendRate: number = 0;
  private animFrame: number = 0;

  // Chat
  private chatOpen: boolean = false;
  private chatInput: HTMLInputElement | null = null;

  constructor() {
    const wsUrl = `ws://${window.location.hostname}:8080`;
    this.network = new NetworkClient(wsUrl);

    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.particles = new ParticleSystem();
    this.renderer = new Renderer(canvas, this.particles);
    this.input = new InputHandler();
    this.audio = new AudioManager();
    this.ui = new UI();

    this.setupNetworkHandlers();
    this.setupUICallbacks();
    this.setupChatHandlers();
  }

  async init(): Promise<void> {
    await this.audio.loadSounds();
    this.ui.showScreen('connecting');
    this.network.connect();

    this.network.onConnect(() => {
      this.ui.showScreen('name');
    });

    this.network.onDisconnect(() => {
      this.ui.showScreen('connecting');
      this.phase = 'lobby';
    });

    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  private setupUICallbacks(): void {
    this.ui.onJoinLobby = (name) => {
      this.localName = name;
      this.network.send({ type: 'JOIN_LOBBY', payload: { playerName: name } });
      this.ui.showScreen('lobby');
    };

    this.ui.onCreateRoom = (config) => {
      this.network.send({ type: 'CREATE_ROOM', payload: { config: { ...config, mapType: 'mountainous' } } });
    };

    this.ui.onJoinRoom = (roomId) => {
      this.network.send({ type: 'JOIN_ROOM', payload: { roomId } });
    };

    this.ui.onLeaveRoom = () => {
      this.network.send({ type: 'LEAVE_ROOM' });
      this.localRoom = null;
      this.ui.showScreen('lobby');
      this.phase = 'lobby';
    };

    this.ui.onReady = () => {
      this.network.send({ type: 'PLAYER_READY' });
    };

    this.ui.onPurchase = (itemType) => {
      this.network.send({ type: 'PURCHASE', payload: { itemType } });

      // Optimistically update local inventory so the shop reflects the purchase immediately
      const weaponAmmo: Partial<Record<WeaponType, number>> = {
        [WeaponType.MACHINE_GUN]: 100,
        [WeaponType.MISSILES]: 3,
        [WeaponType.MIRV]: 1,
        [WeaponType.NUKE]: 1,
        [WeaponType.DEATHS_HEAD]: 1,
        [WeaponType.ROLLING_MINES]: 3,
        [WeaponType.AIR_STRIKE]: 1,
      };
      const ammo = weaponAmmo[itemType as WeaponType];
      if (ammo !== undefined) {
        const existing = this.localInventory.weapons.find(w => w.type === itemType);
        if (existing) {
          existing.ammo += ammo;
        } else {
          this.localInventory.weapons.push({ type: itemType as WeaponType, ammo });
        }
        this.updateWeaponCount();
      } else {
        // It's an item — jump jets are stackable, all others are one-time
        if (itemType === ItemType.JUMP_JETS) {
          this.localInventory.items.push(itemType as ItemType);
        } else if (!this.localInventory.items.includes(itemType as ItemType)) {
          this.localInventory.items.push(itemType as ItemType);
        }
      }
    };

    this.ui.onShopReady = () => {
      this.network.send({ type: 'SHOP_READY' });
    };

    this.ui.onPlayAgain = () => {
      this.ui.showScreen('lobby');
      this.phase = 'lobby';
      this.network.send({ type: 'LEAVE_ROOM' });
    };
  }

  private setupChatHandlers(): void {
    this.chatInput = document.getElementById('chat-input') as HTMLInputElement;
    const chatRow = document.getElementById('chat-input-row');

    document.addEventListener('keydown', (e) => {
      if (this.phase === 'score_screen' && e.key === ' ' && !this.scoreScreen.mySkipped) {
        e.preventDefault();
        this.scoreScreen.mySkipped = true;
        this.network.send({ type: 'SKIP_SCORE' });
      }
    });

    this.input.onChatOpen = () => {
      if (this.phase !== 'playing') return;
      this.chatOpen = true;
      if (chatRow) chatRow.style.display = 'flex';
      this.chatInput?.focus();
    };

    this.chatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const msg = this.chatInput!.value.trim();
        if (msg) {
          this.network.send({ type: 'CHAT', payload: { message: msg } });
        }
        this.chatInput!.value = '';
        this.chatOpen = false;
        if (chatRow) chatRow.style.display = 'none';
        this.chatInput!.blur();
        e.stopPropagation();
      }
      if (e.key === 'Escape') {
        this.chatOpen = false;
        if (chatRow) chatRow.style.display = 'none';
        this.chatInput!.blur();
      }
    });
  }

  private setupNetworkHandlers(): void {
    this.network.on('WELCOME', (msg) => {
      this.localId = msg.payload.playerId;
    });

    this.network.on('LOBBY_STATE', (msg) => {
      this.ui.updateLobbyState(msg.payload, this.localName);
    });

    this.network.on('ROOM_JOINED', (msg) => {
      this.localRoom = msg.payload.roomState;
      this.ui.showScreen('room');
      this.ui.updateRoomState(msg.payload.roomState, this.localId);
      this.phase = 'room';
    });

    this.network.on('ROOM_STATE', (msg) => {
      this.localRoom = msg.payload;
      if (this.phase === 'room') {
        this.ui.updateRoomState(msg.payload, this.localId);
      }
    });

    this.network.on('GAME_STARTING', (msg) => {
      const { terrain, tankPositions, roundNumber, totalRounds, isBlitz } = msg.payload;
      this.heightmap = terrain;
      this.renderer.initTerrain(terrain);
      this.roundNumber = roundNumber;
      this.totalRounds = totalRounds;
      this.isBlitz = isBlitz;
      this.explosions = [];
      this.particles.clear();
      this.showRoundResult = false;
      this.showGroovy = false;
      this.gameState = null;
      this.lastTankX = null;
      this.wobbleUntil = 0;
      this.firedProjectileIds.clear();

      // Set player list from room state
      if (this.localRoom) {
        this.players = this.localRoom.players;
      }

      // Sync local inventory so weapon switching works from round 1
      const inv = msg.payload.inventory[this.localId];
      if (inv) {
        this.localInventory = { weapons: inv.weapons, items: inv.items };
      }

      // Update weapon count for input handler
      this.updateWeaponCount();

      this.ui.hideAllScreens();
      this.phase = 'playing';

      this.audio.playMusic('music_game');
      this.audio.play('round_start');

      if (isBlitz) {
        this.showBlitz = true;
        this.blitzAnimStart = performance.now() / 1000;
        this.audio.play('blitz');
        setTimeout(() => { this.showBlitz = false; }, 3000);
      }
    });

    this.network.on('BLITZ_ROUND', (_msg) => {
      this.isBlitz = true;
      this.showBlitz = true;
      this.blitzAnimStart = performance.now() / 1000;
      this.audio.play('blitz');
      setTimeout(() => { this.showBlitz = false; }, 3000);
    });

    this.network.on('GAME_STATE', (msg) => {
      // Sync weapon ammo from authoritative server state
      const tank = msg.payload.tanks[this.localId];
      if (tank?.weaponAmmo) {
        for (const w of this.localInventory.weapons) {
          if (w.ammo !== -1) {
            w.ammo = tank.weaponAmmo[w.type] ?? 0;
          }
        }
      }

      // Detect blocked movement: pressing a direction but x didn't change
      if (tank && this.lastMoveDirection !== 0 && this.lastTankX !== null) {
        if (Math.abs(tank.x - this.lastTankX) < 0.5) {
          this.wobbleUntil = performance.now() + 400;
        }
      }
      this.lastTankX = tank?.x ?? null;

      // Detect new projectiles and play firing sound
      for (const proj of msg.payload.projectiles) {
        if (!this.firedProjectileIds.has(proj.id)) {
          this.firedProjectileIds.add(proj.id);
          this.audio.play('fire_standard');
        }
      }

      this.gameState = msg.payload;
    });

    this.network.on('TERRAIN_UPDATE', (msg) => {
      for (const { x, y, radius } of msg.payload) {
        // Update visual terrain (authoritative — supports overhangs)
        this.renderer.applyTerrainDestruction(x, y, radius);
        // Update local heightmap for trajectory preview (approximate)
        for (let px = Math.floor(x - radius); px <= Math.ceil(x + radius); px++) {
          if (px < 0 || px >= this.heightmap.length) continue;
          const dx = px - x;
          if (dx * dx > radius * radius) continue;
          const depth = Math.sqrt(radius * radius - dx * dx);
          const newH = y - depth;
          if (newH < this.heightmap[px]) {
            this.heightmap[px] = Math.max(0, newH);
          }
        }
      }
    });

    this.network.on('EXPLOSION', (msg) => {
      const { x, y, radius, weaponType } = msg.payload;
      const screenY = 720 - y;

      this.explosions.push({
        x,
        y,
        radius,
        startTime: performance.now(),
        duration: 0.6,
      });

      this.particles.emitExplosion(x, screenY, radius);

      // Audio
      if (weaponType === WeaponType.NUKE) {
        this.audio.play('explosion_nuke');
        this.renderer.applyScreenShake(15, 0.5);
      } else if (radius > 50) {
        this.audio.play('explosion_large');
        this.renderer.applyScreenShake(6, 0.2);
      } else {
        this.audio.play('explosion_small');
        this.renderer.applyScreenShake(3, 0.1);
      }
    });

    this.network.on('PLAYER_DEATH', (msg) => {
      const { playerId, killedBy, corbomiteTriggered } = msg.payload;

      // Corbomite is single-use — remove it locally when it fires
      if (corbomiteTriggered && playerId === this.localId) {
        this.localInventory.items = this.localInventory.items.filter(i => i !== ItemType.CORBOMITE);
      }
      const deadPlayer = this.players.find(p => p.id === playerId);
      const killerPlayer = killedBy ? this.players.find(p => p.id === killedBy) : null;

      let feedText = '';
      if (corbomiteTriggered) {
        feedText = `💥 ${deadPlayer?.name || 'Someone'} activated CORBOMITE!`;
      } else if (killedBy === null) {
        feedText = `💀 ${deadPlayer?.name || 'Someone'} self-destructed`;
      } else {
        feedText = `🔴 ${killerPlayer?.name || 'Someone'} killed ${deadPlayer?.name || 'someone'}`;
      }

      this.ui.addKillFeedEntry(feedText);
      this.audio.play('tank_death');
    });

    this.network.on('GROOVY', (_msg) => {
      this.showGroovy = true;
      this.groovyTime = performance.now() / 1000;
      this.audio.play('groovy');
      setTimeout(() => { this.showGroovy = false; }, 3000);
    });

    this.network.on('ROUND_END', (msg) => {
      const { winnerId, scores, kills, earnings } = msg.payload;

      // Update player scores
      if (this.localRoom) {
        for (const player of this.localRoom.players) {
          if (scores[player.id] !== undefined) {
            player.score = scores[player.id];
          }
        }
      }

      // Enter score screen phase
      this.phase = 'score_screen';
      this.showRoundResult = false;
      this.scoreScreen = {
        active: true,
        winnerId,
        kills: kills ?? {},
        earnings: earnings ?? {},
        roundNumber: this.roundNumber,
        startTime: performance.now(),
        mySkipped: false,
      };
    });

    this.network.on('SHOP_OPEN', (msg) => {
      this.shopPayload = msg.payload;
      this.phase = 'shop';
      this.showRoundResult = false;
      this.scoreScreen.active = false;

      // Strip depleted weapons and per-round items (mirrors server endRound cleanup)
      this.localInventory.weapons = this.localInventory.weapons.filter(w => w.ammo === -1 || w.ammo > 0);
      this.localInventory.items = this.localInventory.items.filter(
        i => i !== ItemType.TARGETING_COMPUTER && i !== ItemType.HOVER_COIL
      );

      // Sync jet fuel packs from authoritative server count (corrects fuel burned in-round)
      const myPacks = msg.payload.jetFuelPacks?.[this.localId] ?? 0;
      this.localInventory.items = this.localInventory.items.filter(i => i !== ItemType.JUMP_JETS);
      for (let i = 0; i < myPacks; i++) this.localInventory.items.push(ItemType.JUMP_JETS);
      this.updateWeaponCount();

      // Update player money
      if (this.localRoom) {
        for (const player of this.localRoom.players) {
          if (msg.payload.money[player.id] !== undefined) {
            player.money = msg.payload.money[player.id];
          }
        }
      }

      this.ui.showScreen('shop');
      this.ui.openShop(msg.payload, this.localId, this.localInventory.items, this.localInventory.weapons);
      this.audio.playMusic('music_shop');
    });

    this.network.on('GAME_OVER', (msg) => {
      this.phase = 'gameover';
      this.ui.stopShopTimer();
      this.ui.showScreen('gameover');
      this.ui.showGameOver(msg.payload);
      this.audio.stopMusic();
    });

    this.network.on('CHAT', (msg) => {
      this.ui.addChatMessage(msg.payload.playerName, msg.payload.message);
    });

    this.network.on('ERROR', (msg) => {
      console.error('Server error:', msg.payload.message);
    });
  }

  private updateWeaponCount(): void {
    const count = this.localInventory.weapons.length || 1;
    this.input.setWeaponCount(count);
  }

  private loop(now: number): void {
    const deltaTime = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    this.update(deltaTime, now);
    this.render(now);

    this.animFrame = requestAnimationFrame((t) => this.loop(t));
  }

  private update(deltaTime: number, now: number): void {
    this.renderer.updateScreenShake(deltaTime);
    this.particles.update(deltaTime);

    // Mirror server-side world leveling so the client terrain stays in sync with tank positions
    if (this.phase === 'playing' && this.gameState) {
      const roundTime = this.gameState.roundTime;
      if (roundTime >= 90) {
        this.renderer.flattenTerrain(5 * deltaTime);
      }
    }

    // Remove old explosions
    const nowSec = now / 1000;
    this.explosions = this.explosions.filter(e => (nowSec - e.startTime / 1000) < e.duration);

    if (this.phase === 'playing' && !this.chatOpen) {
      const inputState = this.input.update(deltaTime);
      this.lastMoveDirection = inputState.moveDirection;

      // Send input at ~20 Hz
      this.inputSendRate += deltaTime;
      if (this.inputSendRate >= 0.05) {
        this.inputSendRate = 0;
        this.network.send({ type: 'INPUT', payload: inputState });
      }
    }
  }

  private render(now: number): void {
    const nowSec = now / 1000;

    if (this.phase === 'playing' || this.phase === 'score_screen' || this.phase === 'shop') {
      this.renderer.beginFrame();
      this.renderer.clear();

      this.renderer.drawTerrain();

      // Draw explosions
      for (const explosion of this.explosions) {
        this.renderer.drawExplosion(explosion, now);
      }

      if (this.gameState) {
        const gs = this.gameState;

        // Draw tanks
        const wobbleOffset = now < this.wobbleUntil ? Math.sin(now / 40) * 3 : 0;

        this.players.forEach((player, i) => {
          const tank = gs.tanks[player.id];
          if (tank) {
            const isLocal = player.id === this.localId;
            const hasTc = this.localInventory.items.includes(ItemType.TARGETING_COMPUTER) && isLocal;
            this.renderer.drawTank(tank, i, player.name, isLocal, hasTc, this.heightmap, isLocal ? wobbleOffset : 0);
          }
        });

        // Draw projectiles + emit smoke trails (not for machine gun rounds)
        for (const proj of gs.projectiles) {
          this.renderer.drawProjectile(proj);
          const isGroundedMine = proj.type === WeaponType.ROLLING_MINES && proj.vy === 0;
          if (proj.type !== WeaponType.MACHINE_GUN && proj.type !== WeaponType.AIR_STRIKE_MARKER && !isGroundedMine) {
            this.particles.emitSmokeTrail(proj.x, 720 - proj.y);
          }
        }

        // Draw HUD
        if (this.phase === 'playing') {
          this.renderer.drawHUD(
            this.players,
            gs.tanks,
            this.localId,
            this.roundNumber,
            this.totalRounds,
            gs.roundTime,
            this.isBlitz
          );
        }
      }

      // Draw particles
      this.particles.draw(this.renderer.ctx);

      // Overlays
      if (this.showBlitz) {
        const progress = nowSec - this.blitzAnimStart;
        this.renderer.drawBlitzAnnouncement(progress);
      }

      if (this.showGroovy) {
        this.renderer.drawGroovy();
      }

      if (this.showRoundResult && (nowSec - this.roundResultTime) < 4) {
        this.renderer.drawRoundResult(this.roundResultWinner, this.roundResultName);
      }

      // Score screen overlay
      if (this.phase === 'score_screen' && this.scoreScreen.active) {
        const elapsed = (now - this.scoreScreen.startTime) / 1000;
        const timeRemaining = Math.max(0, 10 - elapsed);
        this.renderer.drawScoreScreen(
          this.players,
          this.scoreScreen.kills,
          this.scoreScreen.earnings,
          this.scoreScreen.roundNumber,
          timeRemaining,
          this.localId,
          this.scoreScreen.mySkipped
        );
      }

      this.renderer.endFrame();
    }
  }
}
