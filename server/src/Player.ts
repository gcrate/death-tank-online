import WebSocket from 'ws';
import { WeaponType, ItemType, InputState, InventoryState, ServerMessage } from '../../shared/protocol';
import { PHYSICS } from './constants';

export class Player {
  id: string;
  name: string;
  ws: WebSocket;
  ready: boolean = false;
  money: number = 200;
  currentInput: InputState | null = null;

  // Persistent inventory across rounds
  weapons: Map<WeaponType, number> = new Map();  // weapon -> ammo
  items: Set<ItemType> = new Set();
  jetFuelSeconds: number = 0;  // Actual seconds of fuel remaining; persists between rounds

  // Total kills across all rounds (for game over screen)
  totalKills: number = 0;

  constructor(id: string, name: string, ws: WebSocket) {
    this.id = id;
    this.name = name;
    this.ws = ws;
    // Start with standard missile (infinite)
    this.weapons.set(WeaponType.STANDARD, -1);
  }

  send(message: ServerMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch {
        // Ignore send errors
      }
    }
  }

  hasItem(itemType: ItemType): boolean {
    if (itemType === ItemType.JUMP_JETS) return this.jetFuelSeconds > 0;
    return this.items.has(itemType);
  }

  addWeapon(type: WeaponType, ammo: number): void {
    if (ammo === -1) {
      // Infinite ammo weapons just get set
      this.weapons.set(type, -1);
    } else {
      const current = this.weapons.get(type) || 0;
      const newAmmo = current === -1 ? -1 : current + ammo;
      this.weapons.set(type, newAmmo);
    }
  }

  addItem(type: ItemType): void {
    if (type === ItemType.JUMP_JETS) {
      this.jetFuelSeconds = Math.min(
        PHYSICS.JUMP_JET_FUEL_MAX,
        this.jetFuelSeconds + PHYSICS.JUMP_JET_FUEL_PER_PURCHASE
      );
    } else {
      this.items.add(type);
    }
  }

  getInventoryState(): InventoryState {
    const weapons: { type: WeaponType; ammo: number }[] = [];
    for (const [type, ammo] of this.weapons) {
      weapons.push({ type, ammo });
    }

    const items: ItemType[] = Array.from(this.items);
    // Push JUMP_JETS once per purchased pack so the client can count them
    const packs = Math.min(3, Math.ceil(this.jetFuelSeconds / PHYSICS.JUMP_JET_FUEL_PER_PURCHASE));
    for (let i = 0; i < packs; i++) items.push(ItemType.JUMP_JETS);

    return {
      weapons,
      items,
    };
  }

  // Reset for next round (keep inventory, reset ready state)
  resetForRound(): void {
    this.ready = false;
    this.currentInput = null;
  }
}
