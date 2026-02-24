import { WeaponType, TankState } from '../../shared/protocol';
import { COMBAT, PHYSICS, GAME } from './constants';
import { WEAPONS } from './Weapon';
import { Terrain } from './Terrain';

export class Tank {
  id: string;
  x: number;
  y: number;
  vy: number = 0;             // Vertical velocity for physics
  vx: number = 0;             // Horizontal velocity (for airborne momentum from jets)
  aimAngle: number = 90;      // Degrees, 90 = straight up
  bodyAngle: number = 0;      // Degrees, 0 = upright, positive = CCW (top-left), range -90..90
  power: number = 50;
  health: number = COMBAT.TANK_HEALTH;
  shield: number = 0;
  maxShield: number = 0;
  alive: boolean = true;
  jetFuelSeconds: number = 0;  // Actual seconds of fuel remaining
  hasJumpJets: boolean = false;
  hasTargetingComputer: boolean = false;
  hasHoverCoil: boolean = false;
  hasCorbomite: boolean = false;
  isJumping: boolean = false;
  isGrounded: boolean = true;
  isMovementBlocked: boolean = false;

  // How far below the tank terrain can drop before the tank goes airborne.
  // Small slopes stay grounded; sudden craters trigger freefall.
  static readonly AIRBORNE_THRESHOLD = 16;
  // Degrees per second the tank body rotates when airborne with jump jets
  static readonly JET_ROTATION_SPEED = 90;

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
    if (newIndex === this.currentWeaponIndex) return;

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

    if (currentCharge >= 100) return; // Already fully charged

    let chargeTime = weaponDef.chargeTime;
    if (isBlitz) {
      chargeTime *= (1 - 0.75); // 75% reduction
    }

    const chargePerSecond = 100 / chargeTime;
    const newCharge = Math.min(100, currentCharge + chargePerSecond * deltaTime);
    this.weaponCharges.set(weapon, newCharge);
  }

  canFire(): boolean {
    const weapon = this.getCurrentWeapon();
    const charge = this.weaponCharges.get(weapon) || 0;
    const ammo = this.inventory.get(weapon) ?? 0;
    return charge >= 100 && (ammo === -1 || ammo > 0);
  }

  fire(): { canFire: boolean; weapon: WeaponType } | null {
    if (!this.canFire()) return null;

    const weapon = this.getCurrentWeapon();
    const ammo = this.inventory.get(weapon) ?? 0;

    if (ammo !== -1) {
      this.inventory.set(weapon, ammo - 1);
      if (ammo - 1 <= 0) {
        this.inventory.delete(weapon);
        // Remove charge entry too
        this.weaponCharges.delete(weapon);
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

  move(direction: -1 | 0 | 1, terrain: Terrain, deltaTime: number): void {
    this.isMovementBlocked = false;
    if (!this.alive || direction === 0) return;

    // When airborne with jump jets: Q/E rotates the tank body instead of moving
    if (!this.isGrounded && this.hasJumpJets) {
      this.bodyAngle = Math.max(-90, Math.min(90,
        this.bodyAngle - direction * Tank.JET_ROTATION_SPEED * deltaTime
      ));
      return;
    }

    const slope = terrain.getSlopeAt(this.x);
    let speed = PHYSICS.TANK_SPEED;

    // Grounded tanks have slope-dependent speed
    if (this.isGrounded) {
      const goingUphill   = (direction > 0 && slope > 0.1)  || (direction < 0 && slope < -0.1);
      const goingDownhill = (direction > 0 && slope < -0.1) || (direction < 0 && slope > 0.1);
      if (goingUphill) {
        // Block movement on slopes steeper than 70°
        if (Math.abs(slope) > 70 * Math.PI / 180) {
          this.isMovementBlocked = true;
          return;
        }
        speed *= PHYSICS.TANK_UPHILL_MODIFIER;
      } else if (goingDownhill) {
        speed *= PHYSICS.TANK_DOWNHILL_MODIFIER;
      }
    }

    this.x += direction * speed * deltaTime;
    this.x = Math.max(20, Math.min(GAME.CANVAS_WIDTH - 20, this.x));
  }

  applyPhysics(deltaTime: number, jumping: boolean, terrain: Terrain): void {
    if (!this.alive) return;

    this.isJumping = jumping;
    const terrainHeight = terrain.getHeightAt(this.x);

    // --- Jump jets override grounded behaviour ---
    if (this.hasJumpJets && jumping && this.jetFuelSeconds > 0) {
      this.isGrounded = false;
      // Thrust in the direction the top of the tank is pointing
      const bodyRad = (this.bodyAngle * Math.PI) / 180;
      this.vx = -Math.sin(bodyRad) * PHYSICS.JUMP_JET_THRUST;
      this.vy = Math.cos(bodyRad) * PHYSICS.JUMP_JET_THRUST;
      this.jetFuelSeconds = Math.max(0, this.jetFuelSeconds - deltaTime);
    } else if (this.isGrounded) {
      // --- Grounded: snap to terrain surface ---
      // If terrain has been blasted away or we drove over a crater edge,
      // the surface is now more than AIRBORNE_THRESHOLD below us → go airborne.
      if (terrainHeight < this.y - Tank.AIRBORNE_THRESHOLD) {
        this.isGrounded = false;
        this.vy = 0;                    // Start freefall from rest
      } else {
        // Normal terrain-following: snap Y to surface, zero vertical velocity
        this.y = terrainHeight;
        this.vy = 0;
      }
    }

    // --- Airborne: gravity + horizontal momentum ---
    if (!this.isGrounded) {
      let gravity = PHYSICS.GRAVITY;
      if (this.hasHoverCoil) gravity *= 0.4;
      this.vy -= gravity * deltaTime;
      this.y  += this.vy * deltaTime;
      this.x  += this.vx * deltaTime;
      this.x   = Math.max(20, Math.min(GAME.CANVAS_WIDTH - 20, this.x));

      // Landed?
      if (this.y <= terrainHeight) {
        this.y          = terrainHeight;
        this.vy         = 0;
        this.vx         = 0;
        this.isGrounded = true;
        this.bodyAngle  = 0;  // Snap upright on landing
      }
    }

  }

  getState(): TankState {
    const weaponAmmo: { [weapon: string]: number } = {};
    for (const [weapon, ammo] of this.inventory) {
      weaponAmmo[weapon] = ammo;
    }
    return {
      x: this.x,
      y: this.y,
      aimAngle: this.aimAngle,
      power: this.power,
      health: this.health,
      shield: this.shield,
      alive: this.alive,
      jetFuel: this.jetFuelSeconds / PHYSICS.JUMP_JET_FUEL_MAX,
      bodyAngle: this.bodyAngle,
      isJumping: this.hasJumpJets && this.isJumping && this.jetFuelSeconds > 0,
      currentWeapon: this.getCurrentWeapon(),
      weaponChargePercent: this.weaponCharges.get(this.getCurrentWeapon()) || 0,
      weaponAmmo,
      isMovementBlocked: this.isMovementBlocked,
    };
  }
}
