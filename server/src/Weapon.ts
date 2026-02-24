import { WeaponType } from '../../shared/protocol';


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
    blastRadius: 20,
    ammoPerPurchase: 100,       // Bullets
    special: 'rapid_fire',
  },
  [WeaponType.MISSILES]: {
    type: WeaponType.MISSILES,
    name: 'Missiles',
    cost: 50,
    chargeTime: 3.5,
    damage: 40,
    blastRadius: 45,
    ammoPerPurchase: 3,
  },
  [WeaponType.MIRV]: {
    type: WeaponType.MIRV,
    name: 'MIRV',
    cost: 50,
    chargeTime: 4.5,
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
    blastRadius: 180,
    ammoPerPurchase: 1,
    special: 'screen_shake',
  },
  [WeaponType.DEATHS_HEAD]: {
    type: WeaponType.DEATHS_HEAD,
    name: "Death's Head",
    cost: 250,
    chargeTime: 6.0,
    damage: 25,                 // Per bomblet
    blastRadius: 30,
    ammoPerPurchase: 1,
    special: 'split_30_120deg', // 30 bomblets, 120° cone
  },
  [WeaponType.ROLLING_MINES]: {
    type: WeaponType.ROLLING_MINES,
    name: 'Rolling Mines',
    cost: 150,
    chargeTime: 4.5,
    damage: 40,
    blastRadius: 110,
    ammoPerPurchase: 5,
    special: 'rolls_on_terrain',
  },
  [WeaponType.AIR_STRIKE]: {
    type: WeaponType.AIR_STRIKE,
    name: 'Air Strike',
    cost: 200,
    chargeTime: 4.8,
    damage: 35,                 // Per bomb
    blastRadius: 40,
    ammoPerPurchase: 1,
    special: 'drops_5_from_sky',
  },
  [WeaponType.AIR_STRIKE_MARKER]: {
    type: WeaponType.AIR_STRIKE_MARKER,
    name: 'Air Strike Marker',
    cost: 0,
    chargeTime: 0,
    damage: 0,
    blastRadius: 0,
    ammoPerPurchase: -1,
  },
  [WeaponType.CORBOMITE_BLAST]: {
    type: WeaponType.CORBOMITE_BLAST,
    name: 'Corbomite',
    cost: 0,
    chargeTime: 0,
    damage: 85,
    blastRadius: 40,
    ammoPerPurchase: -1,
  },
};
