import { ItemType } from '../../shared/protocol';


export interface ItemDefinition {
  type: ItemType;
  name: string;
  cost: number;
  effect: string;
  duration: 'permanent' | 'per_round' | 'single_use';
}

export const ITEMS: Record<ItemType, ItemDefinition> = {
  [ItemType.JUMP_JETS]: {
    type: ItemType.JUMP_JETS,
    name: 'Jump Jets',
    cost: 50,
    effect: 'Adds 3 seconds of jet fuel. Max 9 seconds (3 purchases).',
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
    effect: 'Shows predicted trajectory arc when aiming. Lasts one round only.',
    duration: 'per_round',
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
    effect: 'Fly 100px above terrain on jump. Overrides jump jets for this round only.',
    duration: 'per_round',
  },
};
