import { TankState, ProjectileState, PlayerInfo, WeaponType } from '../../shared/protocol';
import { ParticleSystem } from './ParticleSystem';
import { ActiveExplosion } from './types';

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const FLOOR_HEIGHT = Math.round(CANVAS_HEIGHT * 0.1);  // matches server TERRAIN.FLOOR_HEIGHT (72)
const TANK_HEALTH = 100;
const SHIELD_MAX = 50;

const TANK_COLORS = [
  '#ff0000', '#0088ff', '#00ff00', '#ffff00',
  '#ff00ff', '#00ffff', '#ff8800',
];

const WEAPON_NAMES: Partial<Record<WeaponType, string>> = {
  [WeaponType.STANDARD]: 'STD',
  [WeaponType.MACHINE_GUN]: 'MG',
  [WeaponType.MISSILES]: 'MSL',
  [WeaponType.MIRV]: 'MIRV',
  [WeaponType.NUKE]: 'NUKE',
  [WeaponType.DEATHS_HEAD]: "D'H",
  [WeaponType.ROLLING_MINES]: 'MINE',
  [WeaponType.AIR_STRIKE]: 'AIR',
};

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  particles: ParticleSystem;

  private screenShake: { x: number; y: number; duration: number } = { x: 0, y: 0, duration: 0 };

  // Terrain bitmap: column-major [x * CANVAS_HEIGHT + y], y=0 = game-world bottom
  private terrainBitmap: Uint8Array;
  private terrainDirty: Uint8Array;   // per-column dirty flag
  private terrainCanvas: HTMLCanvasElement;
  private terrainCtx: CanvasRenderingContext2D;
  private terrainImageData: ImageData;

  constructor(canvas: HTMLCanvasElement, particles: ParticleSystem) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.canvas.width = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;
    this.particles = particles;

    this.terrainBitmap = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
    this.terrainDirty  = new Uint8Array(CANVAS_WIDTH);
    this.terrainCanvas = document.createElement('canvas');
    this.terrainCanvas.width = CANVAS_WIDTH;
    this.terrainCanvas.height = CANVAS_HEIGHT;
    this.terrainCtx = this.terrainCanvas.getContext('2d')!;
    this.terrainImageData = this.terrainCtx.createImageData(CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  applyScreenShake(intensity: number, duration: number): void {
    this.screenShake = {
      x: (Math.random() - 0.5) * intensity,
      y: (Math.random() - 0.5) * intensity,
      duration,
    };
  }

  updateScreenShake(deltaTime: number): void {
    if (this.screenShake.duration > 0) {
      this.screenShake.duration -= deltaTime;
      this.screenShake.x = (Math.random() - 0.5) * 8;
      this.screenShake.y = (Math.random() - 0.5) * 8;
    } else {
      this.screenShake.x = 0;
      this.screenShake.y = 0;
    }
  }

  beginFrame(): void {
    this.ctx.save();
    if (this.screenShake.duration > 0) {
      this.ctx.translate(this.screenShake.x, this.screenShake.y);
    }
  }

  endFrame(): void {
    this.ctx.restore();
  }

  clear(): void {
    // Draw sky gradient
    const gradient = this.ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, '#000033');
    gradient.addColorStop(1, '#4a0080');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  initTerrain(heightmap: number[]): void {
    this.terrainBitmap.fill(0);
    for (let x = 0; x < heightmap.length; x++) {
      const h = Math.floor(heightmap[x]);
      const base = x * CANVAS_HEIGHT;
      for (let y = 0; y <= h && y < CANVAS_HEIGHT; y++) {
        this.terrainBitmap[base + y] = 1;
      }
    }
    this.terrainDirty.fill(1);
  }

  applyTerrainDestruction(cx: number, cy: number, radius: number): void {
    const r2 = radius * radius;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(CANVAS_WIDTH - 1, Math.ceil(cx + radius));
    const y0 = Math.max(FLOOR_HEIGHT, Math.floor(cy - radius));
    const y1 = Math.min(CANVAS_HEIGHT - 1, Math.ceil(cy + radius));

    for (let x = x0; x <= x1; x++) {
      const base = x * CANVAS_HEIGHT;
      const dx = x - cx;
      for (let y = y0; y <= y1; y++) {
        if (dx * dx + (y - cy) * (y - cy) <= r2) {
          this.terrainBitmap[base + y] = 0;
        }
      }
      this.terrainDirty[x] = 1;
    }

    // Settle affected columns + margin
    const sx0 = Math.max(0, x0 - 20);
    const sx1 = Math.min(CANVAS_WIDTH - 1, x1 + 20);
    for (let x = sx0; x <= sx1; x++) {
      this.settleTerrainColumn(x);
      this.terrainDirty[x] = 1;
    }
  }

  private settleTerrainColumn(x: number): void {
    const base = x * CANVAS_HEIGHT;
    const MIN_GAP = 10;

    let changed = true;
    while (changed) {
      changed = false;
      const segs: { bottom: number; top: number }[] = [];
      let inSolid = false;
      let segStart = 0;
      for (let y = 0; y < CANVAS_HEIGHT; y++) {
        const solid = this.terrainBitmap[base + y] === 1;
        if (solid && !inSolid)       { segStart = y; inSolid = true; }
        else if (!solid && inSolid)  { segs.push({ bottom: segStart, top: y - 1 }); inSolid = false; }
      }
      if (inSolid) segs.push({ bottom: segStart, top: CANVAS_HEIGHT - 1 });

      for (let i = 1; i < segs.length; i++) {
        const below = segs[i - 1];
        const seg   = segs[i];
        const gap   = seg.bottom - (below.top + 1);
        if (gap >= MIN_GAP) {
          const newBottom = below.top + 1;
          const newTop    = newBottom + (seg.top - seg.bottom);
          for (let y = seg.bottom; y <= seg.top; y++)                     this.terrainBitmap[base + y] = 0;
          for (let y = newBottom; y <= Math.min(newTop, CANVAS_HEIGHT - 1); y++) this.terrainBitmap[base + y] = 1;
          changed = true;
          break;
        }
      }
    }
  }

  flattenTerrain(amount: number): void {
    // Mirror server Terrain.flatten() — remove topmost solid pixels from each column
    for (let x = 0; x < CANVAS_WIDTH; x++) {
      const base = x * CANVAS_HEIGHT;
      let removed = 0;
      const pixels = Math.floor(amount);
      const frac   = amount - pixels;
      // Use the fractional part probabilistically so sub-pixel amounts stay accurate
      const toRemove = pixels + (Math.random() < frac ? 1 : 0);
      for (let y = CANVAS_HEIGHT - 1; y >= FLOOR_HEIGHT && removed < toRemove; y--) {
        if (this.terrainBitmap[base + y] === 1) {
          this.terrainBitmap[base + y] = 0;
          removed++;
          this.terrainDirty[x] = 1;
        }
      }
    }
  }

  drawTerrain(): void {
    const data = this.terrainImageData.data;

    for (let x = 0; x < CANVAS_WIDTH; x++) {
      if (!this.terrainDirty[x]) continue;
      this.terrainDirty[x] = 0;

      const bitmapBase = x * CANVAS_HEIGHT;
      for (let screenY = 0; screenY < CANVAS_HEIGHT; screenY++) {
        const gameY = CANVAS_HEIGHT - 1 - screenY;
        const idx   = (screenY * CANVAS_WIDTH + x) * 4;
        // Always render the indestructible floor strip as solid
        const solid = this.terrainBitmap[bitmapBase + gameY] === 1 || gameY < FLOOR_HEIGHT;
        if (solid) {
          data[idx]     = 200;  // #c8c800
          data[idx + 1] = 200;
          data[idx + 2] = 0;
          data[idx + 3] = 255;
        } else {
          data[idx + 3] = 0;    // transparent — lets sky show through
        }
      }
    }

    this.terrainCtx.putImageData(this.terrainImageData, 0, 0);
    this.ctx.drawImage(this.terrainCanvas, 0, 0);
  }

  drawTank(
    tank: TankState,
    playerIndex: number,
    playerName: string,
    isLocal: boolean,
    hasTargetingComputer: boolean,
    heightmap: number[],
    wobbleOffset: number = 0
  ): void {
    const x = tank.x + wobbleOffset;
    const y = CANVAS_HEIGHT - tank.y;
    const color = TANK_COLORS[playerIndex % TANK_COLORS.length];

    if (!tank.alive) {
      // Draw dark wreck
      this.ctx.save();

      this.ctx.fillStyle = '#111';
      this.ctx.fillRect(x - 17, y - 4, 34, 6);

      this.ctx.fillStyle = '#252525';
      this.ctx.fillRect(x - 14, y - 12, 28, 12);

      this.ctx.fillStyle = '#1e1e1e';
      this.ctx.beginPath();
      this.ctx.ellipse(x, y - 12, 8, 5, 0, Math.PI, 0);
      this.ctx.fill();

      // Flickering flames
      const t = Date.now() / 300;
      const tongues = [
        { ox: -5, baseH: 10, freq: 2.3, phase: 0 },
        { ox:  2, baseH: 14, freq: 1.7, phase: 1.1 },
        { ox:  8, baseH:  9, freq: 3.1, phase: 2.2 },
      ];
      for (const tongue of tongues) {
        const fh = tongue.baseH + Math.sin(t * tongue.freq + tongue.phase) * 4;
        const fx = x + tongue.ox;
        const fy = y - 13;
        const grad = this.ctx.createLinearGradient(fx, fy, fx, fy - fh);
        grad.addColorStop(0,   'rgba(255, 210, 60, 0.95)');
        grad.addColorStop(0.5, 'rgba(255, 80,  0,  0.8)');
        grad.addColorStop(1,   'rgba(180, 0,   0,  0)');
        this.ctx.fillStyle = grad;
        this.ctx.beginPath();
        this.ctx.ellipse(fx, fy - fh / 2, 5, fh / 2, 0, 0, Math.PI * 2);
        this.ctx.fill();
      }

      this.ctx.restore();
      return;
    }

    this.ctx.save();

    // Draw trajectory preview for local player with targeting computer
    if (isLocal && hasTargetingComputer) {
      this.drawTrajectoryPreview(tank, heightmap);
    }

    // Aim arrow — chunky, rotates from tank center, length scales with power
    // Drawn before tank body so body overlaps the shaft root
    {
      const arrowReady = tank.weaponChargePercent >= 100;
      const fillColor  = arrowReady ? '#00dd00' : '#cc1111';
      const darkColor  = arrowReady ? '#005500' : '#550000';

      const gap     = 35;  // invisible gap between tank and arrow base
      const minLen  = 36;
      const maxLen  = 88;
      const arrowLen = minLen + ((tank.power - 10) / 90) * (maxLen - minLen);
      const headLen   = 26;
      const headHalf  = 17;
      const shaftHalf = 7;
      const s  = gap;               // shaft start
      const se = gap + arrowLen - headLen;  // shaft end / head base
      const te = gap + arrowLen;    // tip

      this.ctx.save();
      // Rotate canvas so arrow always points along +X; canvas Y is flipped so negate angle
      this.ctx.translate(x, y - 8);
      this.ctx.rotate(-(tank.aimAngle * Math.PI) / 180);

      this.ctx.beginPath();
      this.ctx.moveTo(s,  -shaftHalf);
      this.ctx.lineTo(se, -shaftHalf);
      this.ctx.lineTo(se, -headHalf);
      this.ctx.lineTo(te,  0);
      this.ctx.lineTo(se,  headHalf);
      this.ctx.lineTo(se,  shaftHalf);
      this.ctx.lineTo(s,   shaftHalf);
      this.ctx.closePath();

      this.ctx.fillStyle   = fillColor;
      this.ctx.strokeStyle = darkColor;
      this.ctx.lineWidth   = 2;
      this.ctx.lineJoin    = 'round';
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.restore();
    }

    // Tank tracks
    this.ctx.fillStyle = '#333';
    this.ctx.fillRect(x - 17, y - 4, 34, 6);

    // Tank body
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x - 14, y - 12, 28, 12);

    // Tank turret dome
    this.ctx.beginPath();
    this.ctx.ellipse(x, y - 12, 10, 7, 0, Math.PI, 0);
    this.ctx.fill();

    // Barrel
    const barrelLength = 22;
    const radians = (tank.aimAngle * Math.PI) / 180;
    const barrelEndX = x + Math.cos(radians) * barrelLength;
    const barrelEndY = y - 12 - Math.sin(radians) * barrelLength;

    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 4;
    this.ctx.lineCap = 'round';
    this.ctx.beginPath();
    this.ctx.moveTo(x, y - 12);
    this.ctx.lineTo(barrelEndX, barrelEndY);
    this.ctx.stroke();

    // Shield bubble (if any)
    if (tank.shield > 0) {
      const shieldAlpha = (tank.shield / (SHIELD_MAX + 50)) * 0.3;
      this.ctx.strokeStyle = `rgba(0, 136, 255, ${shieldAlpha + 0.2})`;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(x, y - 8, 22, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    // Health bar background
    this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
    this.ctx.fillRect(x - 21, y - 34, 42, 7);

    // Health bar
    const healthPercent = tank.health / TANK_HEALTH;
    const hColor = healthPercent > 0.5 ? '#00ff00' : healthPercent > 0.25 ? '#ffff00' : '#ff0000';
    this.ctx.fillStyle = hColor;
    this.ctx.fillRect(x - 21, y - 34, 42 * healthPercent, 7);

    // Shield bar (if any)
    if (tank.shield > 0) {
      this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
      this.ctx.fillRect(x - 21, y - 42, 42, 5);
      this.ctx.fillStyle = '#0088ff';
      const shieldPercent = tank.shield / (SHIELD_MAX + 50);
      this.ctx.fillRect(x - 21, y - 42, 42 * shieldPercent, 5);
    }

    // Player name
    this.ctx.fillStyle = isLocal ? '#ffff00' : '#ffffff';
    this.ctx.font = `${isLocal ? 'bold ' : ''}11px monospace`;
    this.ctx.textAlign = 'center';
    this.ctx.fillText(playerName, x, y - 46);

    // Jet fuel indicator
    if (tank.jetFuel > 0) {
      this.ctx.fillStyle = '#00ffff';
      this.ctx.fillRect(x - 21, y - 48, 42 * tank.jetFuel, 3);
    }

    this.ctx.restore();
  }

  drawProjectile(projectile: ProjectileState): void {
    const x = projectile.x;
    const y = CANVAS_HEIGHT - projectile.y;

    this.ctx.save();

    if (projectile.type === WeaponType.ROLLING_MINES) {
      // Mine looks different
      this.ctx.fillStyle = '#f80';
      this.ctx.beginPath();
      this.ctx.arc(x, y, 5, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.strokeStyle = '#ff0';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
    } else if (projectile.type === WeaponType.AIR_STRIKE_MARKER) {
      // Flashing yellow target ball
      const flash = Math.sin(Date.now() / 60) > 0;
      if (flash) {
        this.ctx.fillStyle = '#ff0';
        this.ctx.beginPath();
        this.ctx.arc(x, y, 8, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = '#f80';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
      }
    } else if (projectile.type === WeaponType.MISSILES) {
      // Guided missile — elongated stick oriented along velocity vector
      const angle = Math.atan2(-projectile.vy, projectile.vx); // flip Y for screen
      this.ctx.translate(x, y);
      this.ctx.rotate(angle);

      const bodyLen = 20;
      const bodyW = 4;

      // Exhaust trail behind the missile
      const speed = Math.sqrt(projectile.vx ** 2 + projectile.vy ** 2);
      const trailLen = Math.min(speed * 0.06, 28);
      this.ctx.strokeStyle = 'rgba(255, 140, 0, 0.65)';
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.moveTo(-bodyLen / 2, 0);
      this.ctx.lineTo(-bodyLen / 2 - trailLen, 0);
      this.ctx.stroke();

      // Body (orange)
      this.ctx.fillStyle = '#f80';
      this.ctx.fillRect(-bodyLen / 2, -bodyW / 2, bodyLen, bodyW);

      // Nose tip (bright yellow)
      this.ctx.fillStyle = '#ffd080';
      this.ctx.fillRect(bodyLen / 2 - 5, -bodyW / 2, 5, bodyW);
    } else if (projectile.type === WeaponType.MACHINE_GUN) {
      // Small dot, no trail
      this.ctx.fillStyle = '#ff0';
      this.ctx.beginPath();
      this.ctx.arc(x, y, 2, 0, Math.PI * 2);
      this.ctx.fill();
    } else {
      // Standard projectile
      this.ctx.fillStyle = '#fff';
      this.ctx.beginPath();
      this.ctx.arc(x, y, 4, 0, Math.PI * 2);
      this.ctx.fill();

      // Trail
      const trailLen = Math.sqrt(projectile.vx ** 2 + projectile.vy ** 2) * 0.08;
      const angle = Math.atan2(-projectile.vy, projectile.vx);
      this.ctx.strokeStyle = 'rgba(255, 255, 200, 0.6)';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(x, y);
      this.ctx.lineTo(
        x - Math.cos(angle) * trailLen,
        y + Math.sin(angle) * trailLen
      );
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  drawExplosion(explosion: ActiveExplosion, now: number): void {
    const elapsed = (now - explosion.startTime) / 1000;
    const progress = Math.min(1, elapsed / explosion.duration);
    const { x } = explosion;
    const y = CANVAS_HEIGHT - explosion.y;
    const alpha = 1 - progress;
    const currentRadius = explosion.radius * (0.3 + progress * 0.7);

    const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, currentRadius);
    gradient.addColorStop(0, `rgba(255, 255, 200, ${alpha})`);
    gradient.addColorStop(0.3, `rgba(255, 150, 30, ${alpha * 0.8})`);
    gradient.addColorStop(0.7, `rgba(200, 50, 0, ${alpha * 0.4})`);
    gradient.addColorStop(1, 'rgba(100, 0, 0, 0)');

    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(x, y, currentRadius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  drawTrajectoryPreview(tank: TankState, terrain: number[]): void {
    const radians = (tank.aimAngle * Math.PI) / 180;
    const speed = tank.power * 9.2;
    let vx = Math.cos(radians) * speed;
    let vy = Math.sin(radians) * speed;

    let px = tank.x;
    let py = tank.y + 10;

    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    this.ctx.setLineDash([4, 6]);
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    this.ctx.moveTo(px, CANVAS_HEIGHT - py);

    const gravity = 480;
    const dt = 0.033;
    for (let t = 0; t < 120; t++) {
      vy -= gravity * dt;
      px += vx * dt;
      py += vy * dt;

      if (px < 0 || px >= terrain.length) break;
      const terrainH = terrain[Math.floor(px)] || 0;
      if (py <= terrainH) break;

      this.ctx.lineTo(px, CANVAS_HEIGHT - py);
    }

    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }

  drawHUD(
    players: PlayerInfo[],
    tankStates: { [id: string]: TankState },
    localId: string,
    roundNumber: number,
    totalRounds: number,
    roundTime: number,
    isBlitz: boolean
  ): void {
    const ctx = this.ctx;

    // Mini player status bars at top
    const barW = 80;
    const barH = 10;
    const spacing = 120;
    const startX = 10;
    const startY = 10;

    players.forEach((player, i) => {
      const bx = startX + i * spacing;
      const by = startY;
      const tank = tankStates[player.id];
      const color = TANK_COLORS[i % TANK_COLORS.length];

      // Color indicator
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(bx + 6, by + 6, 5, 0, Math.PI * 2);
      ctx.fill();

      // Name
      ctx.fillStyle = tank?.alive === false ? '#555' : (player.id === localId ? '#ff0' : '#fff');
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(player.name.slice(0, 8), bx + 14, by + 10);

      // Health bar bg
      ctx.fillStyle = '#333';
      ctx.fillRect(bx, by + 13, barW, barH);

      // Health bar
      if (tank?.alive !== false) {
        const hp = tank ? tank.health / 100 : 1;
        const hColor = hp > 0.5 ? '#0f0' : hp > 0.25 ? '#ff0' : '#f00';
        ctx.fillStyle = hColor;
        ctx.fillRect(bx, by + 13, barW * hp, barH);
      }

      // Score
      ctx.fillStyle = '#ff0';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${player.score}`, bx + barW, by + 10);
    });

    // Round info (top right)
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`Round ${roundNumber}/${totalRounds}`, CANVAS_WIDTH - 15, 20);

    const timeLeft = Math.max(0, 90 - roundTime);
    const timeColor = timeLeft < 15 ? '#f00' : timeLeft < 30 ? '#ff0' : '#fff';
    ctx.fillStyle = timeColor;
    ctx.fillText(`${Math.ceil(timeLeft)}s`, CANVAS_WIDTH - 15, 38);

    if (isBlitz) {
      ctx.fillStyle = '#ff0';
      ctx.font = 'bold 14px monospace';
      ctx.fillText('BLITZ!', CANVAS_WIDTH - 15, 56);
    }

    // Local player HUD (bottom)
    const localTank = tankStates[localId];
    if (localTank?.alive) {
      const localPlayer = players.find(p => p.id === localId);
      const hudY = CANVAS_HEIGHT - 55;

      // HUD background — tall enough for two rows
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(10, hudY - 5, 650, 65);

      // Current weapon
      const weaponName = WEAPON_NAMES[localTank.currentWeapon] || localTank.currentWeapon;
      ctx.fillStyle = '#0ff';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`[${weaponName}]`, 15, hudY + 12);

      // Charge bar bg
      ctx.fillStyle = '#333';
      ctx.fillRect(90, hudY + 2, 130, 14);

      // Charge bar
      const chargeColor = localTank.weaponChargePercent >= 100 ? '#0f0' : '#ff0';
      ctx.fillStyle = chargeColor;
      ctx.fillRect(90, hudY + 2, 130 * (localTank.weaponChargePercent / 100), 14);

      // Charge percent
      ctx.fillStyle = '#fff';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      if (localTank.weaponChargePercent >= 100) {
        ctx.fillText('FIRE!', 228, hudY + 13);
      } else {
        ctx.fillText(`${Math.floor(localTank.weaponChargePercent)}%`, 228, hudY + 13);
      }

      // Power
      ctx.fillStyle = '#aaa';
      ctx.fillText(`PWR: ${Math.round(localTank.power)}`, 280, hudY + 13);

      // Angle
      ctx.fillText(`ANG: ${Math.round(localTank.aimAngle)}°`, 370, hudY + 13);

      // Jet fuel
      if (localTank.jetFuel > 0) {
        ctx.fillStyle = '#333';
        ctx.fillRect(465, hudY + 2, 80, 14);
        ctx.fillStyle = '#0ff';
        ctx.fillRect(465, hudY + 2, 80 * localTank.jetFuel, 14);
        ctx.fillStyle = '#fff';
        ctx.fillText('JETS', 550, hudY + 13);
      }

      // Money
      if (localPlayer) {
        ctx.fillStyle = '#0f0';
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`$${localPlayer.money}`, CANVAS_WIDTH - 15, CANVAS_HEIGHT - 15);
      }

      // Controls reminder — second row inside HUD box
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('←→/AD:Aim  WS:Pwr  QE:Move  Space:Fire  Tab:Wpn  Shift:Jump', 15, hudY + 48);
    }
  }

  drawBlitzAnnouncement(progress: number): void {
    this.ctx.save();
    this.ctx.font = 'bold 80px monospace';
    this.ctx.textAlign = 'center';

    const texts = 4;
    for (let i = 0; i < texts; i++) {
      const baseX = (CANVAS_WIDTH / (texts + 1)) * (i + 1);
      const baseY = CANVAS_HEIGHT / 2;
      const offsetX = Math.sin(progress * 12 + i * 2.1) * 40;
      const offsetY = Math.cos(progress * 9 + i * 3.3) * 25;

      // Shadow
      this.ctx.fillStyle = 'rgba(200,0,0,0.8)';
      this.ctx.fillText('BLITZ', baseX + offsetX + 3, baseY + offsetY + 3);

      // Main text
      this.ctx.fillStyle = '#ffff00';
      this.ctx.fillText('BLITZ', baseX + offsetX, baseY + offsetY);
    }
    this.ctx.restore();
  }

  drawGroovy(): void {
    this.ctx.save();
    this.ctx.font = 'bold 96px monospace';
    this.ctx.textAlign = 'center';
    // Shadow
    this.ctx.fillStyle = 'rgba(0,100,0,0.8)';
    this.ctx.fillText('GROOVY!', CANVAS_WIDTH / 2 + 4, CANVAS_HEIGHT / 2 + 4);
    // Main
    this.ctx.fillStyle = '#00ff00';
    this.ctx.fillText('GROOVY!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    this.ctx.restore();
  }

  drawRoundResult(winnerId: string | null, winnerName: string): void {
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
    this.ctx.fillRect(0, CANVAS_HEIGHT / 2 - 60, CANVAS_WIDTH, 100);

    this.ctx.font = 'bold 48px monospace';
    this.ctx.textAlign = 'center';

    if (winnerId === null) {
      this.ctx.fillStyle = '#ff8800';
      this.ctx.fillText('DRAW!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 10);
    } else {
      this.ctx.fillStyle = '#ff0';
      this.ctx.fillText(`${winnerName} WINS!`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 10);
    }
    this.ctx.restore();
  }

  drawDeathAnnouncement(text: string, alpha: number): void {
    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.ctx.font = 'bold 36px monospace';
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#f00';
    this.ctx.fillText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 100);
    this.ctx.restore();
  }
}
