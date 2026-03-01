import {
  LobbyState, RoomState, ShopPayload, GameOverPayload,
  RoundEndPayload, WeaponType, ItemType, PlayerInfo,
} from '../../shared/protocol';

// Weapon/item display info
const WEAPON_INFO: { type: WeaponType; name: string; cost: number; ammo: number }[] = [
  { type: WeaponType.MACHINE_GUN, name: 'Machine Gun', cost: 25, ammo: 100 },
  { type: WeaponType.MISSILES, name: 'Missiles (x3)', cost: 50, ammo: 3 },
  { type: WeaponType.MIRV, name: 'MIRV', cost: 50, ammo: 1 },
  { type: WeaponType.NUKE, name: 'Nuke', cost: 50, ammo: 1 },
  { type: WeaponType.ROLLING_MINES, name: 'Rolling Mines (x3)', cost: 150, ammo: 3 },
  { type: WeaponType.AIR_STRIKE, name: 'Air Strike', cost: 200, ammo: 1 },
  { type: WeaponType.DEATHS_HEAD, name: "Death's Head", cost: 250, ammo: 1 },
];

const ITEM_INFO: { type: ItemType; name: string; cost: number; desc: string }[] = [
  { type: ItemType.CORBOMITE, name: 'Corbomite', cost: 25, desc: 'Death explosion (1x)' },
  { type: ItemType.JUMP_JETS, name: 'Jump Jets', cost: 50, desc: 'Enables flight' },
  { type: ItemType.TARGETING_COMPUTER, name: 'Target Computer', cost: 50, desc: 'Trajectory arc' },
  { type: ItemType.SHIELD, name: 'Shield Upgrade', cost: 100, desc: '+50 max shield' },
  { type: ItemType.HOVER_COIL, name: 'Hover Coil', cost: 125, desc: 'Fly 100px above terrain (1 round)' },
];

type Screen = 'connecting' | 'name' | 'lobby' | 'room' | 'shop' | 'gameover';

export class UI {
  private currentScreen: Screen = 'connecting';
  private shopTimerInterval: ReturnType<typeof setInterval> | null = null;
  private shopTimeRemaining: number = 30;

  // Callbacks
  onJoinLobby: ((name: string) => void) | null = null;
  onCreateRoom: ((config: { rounds: number; startingMoney: number; startingInventory: 'none' | 'missiles' | 'heavy' | 'everything' }) => void) | null = null;
  onJoinRoom: ((roomId: string) => void) | null = null;
  onLeaveRoom: (() => void) | null = null;
  onReady: (() => void) | null = null;
  onPurchase: ((itemType: WeaponType | ItemType) => void) | null = null;
  onShopReady: (() => void) | null = null;
  onPlayAgain: (() => void) | null = null;

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Name screen
    const joinBtn = document.getElementById('join-lobby-btn');
    const nameInput = document.getElementById('player-name-input') as HTMLInputElement;

    joinBtn?.addEventListener('click', () => {
      const name = nameInput?.value.trim() || 'Tank';
      this.onJoinLobby?.(name);
    });

    nameInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const name = nameInput.value.trim() || 'Tank';
        this.onJoinLobby?.(name);
      }
    });

    // Lobby screen
    document.getElementById('create-room-btn')?.addEventListener('click', () => {
      const rounds = parseInt((document.getElementById('config-rounds') as HTMLSelectElement).value);
      const money = parseInt((document.getElementById('config-money') as HTMLSelectElement).value);
      const startingInventory = (document.getElementById('config-inventory') as HTMLSelectElement).value as 'none' | 'missiles' | 'heavy' | 'everything';
      this.onCreateRoom?.({ rounds, startingMoney: money, startingInventory });
    });

    // Room screen
    document.getElementById('ready-btn')?.addEventListener('click', () => {
      this.onReady?.();
      const btn = document.getElementById('ready-btn') as HTMLButtonElement;
      if (btn) {
        btn.textContent = 'READY!';
        btn.disabled = true;
        btn.style.opacity = '0.5';
      }
    });

    document.getElementById('leave-room-btn')?.addEventListener('click', () => {
      this.onLeaveRoom?.();
    });

    // Shop screen
    document.getElementById('shop-ready-btn')?.addEventListener('click', () => {
      this.onShopReady?.();
    });

    // Game over screen
    document.getElementById('play-again-btn')?.addEventListener('click', () => {
      this.onPlayAgain?.();
    });
  }

  showScreen(screen: Screen): void {
    this.currentScreen = screen;

    const screens: Record<Screen, string> = {
      connecting: 'connecting-screen',
      name: 'name-screen',
      lobby: 'lobby-screen',
      room: 'room-screen',
      shop: 'shop-screen',
      gameover: 'gameover-screen',
    };

    for (const [key, id] of Object.entries(screens)) {
      const el = document.getElementById(id);
      if (el) {
        el.classList.toggle('active', key === screen);
      }
    }

    // Focus name input on name screen
    if (screen === 'name') {
      const input = document.getElementById('player-name-input') as HTMLInputElement;
      setTimeout(() => input?.focus(), 100);
    }
  }

  hideAllScreens(): void {
    const screenIds = [
      'connecting-screen', 'name-screen', 'lobby-screen',
      'room-screen', 'shop-screen', 'gameover-screen',
    ];
    for (const id of screenIds) {
      document.getElementById(id)?.classList.remove('active');
    }
    this.currentScreen = 'connecting';
  }

  updateLobbyState(state: LobbyState, localName: string): void {
    // Player count
    const countEl = document.getElementById('lobby-player-count');
    if (countEl) {
      countEl.textContent = `${state.playerCount} player${state.playerCount !== 1 ? 's' : ''} online`;
    }

    // Room list
    const listEl = document.getElementById('room-list');
    if (!listEl) return;

    if (state.rooms.length === 0) {
      listEl.innerHTML = '<div style="color:#666; text-align:center; padding:20px;">No rooms available</div>';
      return;
    }

    listEl.innerHTML = '';
    for (const room of state.rooms) {
      const div = document.createElement('div');
      div.className = 'room-item';

      const isFull = room.playerCount >= room.maxPlayers;
      const canJoin = !room.inProgress && !isFull;
      const statusColor = room.inProgress ? '#f80' : isFull ? '#f44' : '#0f0';
      const statusText  = room.inProgress ? 'IN PROGRESS' : isFull ? 'FULL' : 'WAITING';

      const joinHtml = canJoin
        ? `<button class="btn primary" style="font-size:12px; padding:6px 14px;">JOIN</button>`
        : `<span style="color:${statusColor}; font-size:12px;">${statusText}</span>`;

      div.innerHTML = `
        <div>
          <span style="color:#0ff; font-size:15px;">${room.hostName}'s Room</span>
          <div class="room-info">${room.playerCount}/${room.maxPlayers} players · ${room.config.rounds} rounds · $${room.config.startingMoney}${room.config.startingInventory && room.config.startingInventory !== 'none' ? ' · ' + room.config.startingInventory : ''}</div>
        </div>
        <div style="text-align:right;">
          ${joinHtml}
        </div>
      `;

      if (canJoin) {
        const btn = div.querySelector('button');
        btn?.addEventListener('click', () => {
          this.onJoinRoom?.(room.roomId);
        });
      } else {
        div.style.cursor = 'default';
        div.style.opacity = '0.6';
      }

      listEl.appendChild(div);
    }
  }

  updateRoomState(state: RoomState, localId: string): void {
    const titleEl = document.getElementById('room-title');
    if (titleEl) {
      const isHost = state.hostId === localId;
      titleEl.textContent = `ROOM ${state.roomId}${isHost ? ' (HOST)' : ''}`;
    }

    const listEl = document.getElementById('room-player-list');
    if (!listEl) return;

    listEl.innerHTML = '';
    const COLORS = ['#ff0000', '#0088ff', '#00ff00', '#ffff00', '#ff00ff', '#00ffff', '#ff8800'];

    state.players.forEach((player, i) => {
      const li = document.createElement('li');
      const isYou = player.id === localId;
      const isHost = player.id === state.hostId;

      li.innerHTML = `
        <span class="player-color-dot" style="background:${COLORS[i % COLORS.length]};"></span>
        <span>${player.name}${isYou ? ' (you)' : ''}${isHost ? ' 👑' : ''}</span>
        ${player.ready
          ? '<span class="ready-badge">✓ READY</span>'
          : '<span class="not-ready-badge">NOT READY</span>'}
      `;
      listEl.appendChild(li);
    });

    const statusEl = document.getElementById('room-status');
    if (statusEl) {
      const needed = Math.max(0, 2 - state.players.length);
      if (needed > 0) {
        statusEl.textContent = `Need ${needed} more player${needed !== 1 ? 's' : ''} to start`;
      } else if (!state.allReady) {
        statusEl.textContent = 'Waiting for all players to ready up...';
      } else {
        statusEl.textContent = 'Starting...';
      }
    }

    // Reset ready button if state changes
    const readyBtn = document.getElementById('ready-btn') as HTMLButtonElement;
    const localPlayer = state.players.find(p => p.id === localId);
    const isHost = state.hostId === localId;
    if (readyBtn && localPlayer) {
      if (isHost) {
        readyBtn.textContent = 'START GAME';
        const enoughPlayers = state.players.length >= 2;
        readyBtn.disabled = !enoughPlayers;
        readyBtn.style.opacity = enoughPlayers ? '1' : '0.5';
      } else if (localPlayer.ready) {
        readyBtn.textContent = 'READY!';
        readyBtn.disabled = true;
        readyBtn.style.opacity = '0.5';
      } else {
        readyBtn.textContent = 'READY';
        readyBtn.disabled = false;
        readyBtn.style.opacity = '1';
      }
    }
  }

  openShop(payload: ShopPayload, localId: string, ownedItems: ItemType[], ownedWeapons: { type: WeaponType; ammo: number }[]): void {
    this.shopTimeRemaining = payload.timeRemaining;
    const money = payload.money[localId] || 0;

    // Update money display
    const moneyEl = document.getElementById('money-display');
    if (moneyEl) moneyEl.textContent = `$${money}`;

    // Timer bar
    this.startShopTimer(payload.timeRemaining, money, localId, ownedItems);

    // Weapons list
    this.renderShopWeapons(money, ownedWeapons);

    // Items list
    this.renderShopItems(money, ownedItems);
  }

  private renderShopWeapons(
    money: number,
    currentWeapons: { type: WeaponType; ammo: number }[]
  ): void {
    const listEl = document.getElementById('weapons-list');
    if (!listEl) return;

    listEl.innerHTML = '';
    const currentWeaponTypes = currentWeapons.map(w => w.type);

    for (const w of WEAPON_INFO) {
      const div = document.createElement('div');
      const hasIt = currentWeaponTypes.includes(w.type);
      const canAfford = money >= w.cost;

      div.className = `shop-item${!canAfford ? ' cant-afford' : ''}`;
      div.innerHTML = `
        <span>${w.name}</span>
        <span style="display:flex;align-items:center;gap:8px;">
          <span class="item-cost">$${w.cost}</span>
          <button class="btn buy-btn" ${!canAfford ? 'disabled' : ''}>BUY</button>
        </span>
      `;

      if (hasIt) {
        const ammoInfo = currentWeapons.find(cw => cw.type === w.type);
        div.style.borderColor = '#0f0';
        const buyBtn = div.querySelector('.buy-btn') as HTMLButtonElement;
        if (buyBtn) buyBtn.textContent = ammoInfo?.ammo === -1 ? '∞' : `x${ammoInfo?.ammo}`;
      }

      const btn = div.querySelector('.buy-btn');
      btn?.addEventListener('click', () => {
        this.onPurchase?.(w.type);
      });

      listEl.appendChild(div);
    }
  }

  private renderShopItems(money: number, ownedItems: ItemType[]): void {
    const listEl = document.getElementById('items-list');
    if (!listEl) return;

    listEl.innerHTML = '';

    const jetPacks = ownedItems.filter(i => i === ItemType.JUMP_JETS).length;

    for (const item of ITEM_INFO) {
      const div = document.createElement('div');

      let hasIt: boolean;
      let btnLabel: string;
      let desc: string;

      if (item.type === ItemType.JUMP_JETS) {
        hasIt = jetPacks >= 3;
        const fuelSecs = jetPacks * 3;
        desc = jetPacks === 0 ? '3 sec of jet fuel (max 9 sec)' : `${fuelSecs}/9 sec fuel`;
        btnLabel = hasIt ? 'MAX' : 'BUY';
      } else {
        hasIt = ownedItems.includes(item.type);
        desc = item.desc;
        btnLabel = hasIt ? 'OWNED' : 'BUY';
      }

      const canAfford = money >= item.cost;
      const disabled = !canAfford || hasIt;

      div.className = `shop-item${disabled ? ' cant-afford' : ''}`;
      div.innerHTML = `
        <span>
          ${item.name}
          <div style="font-size:11px;color:#888;">${desc}</div>
        </span>
        <span style="display:flex;align-items:center;gap:8px;">
          <span class="item-cost">$${item.cost}</span>
          <button class="btn buy-btn" ${disabled ? 'disabled' : ''}>${btnLabel}</button>
        </span>
      `;

      if (item.type === ItemType.JUMP_JETS ? jetPacks > 0 : hasIt) {
        div.style.borderColor = '#0f0';
      }

      const btn = div.querySelector('.buy-btn');
      btn?.addEventListener('click', () => {
        if (!disabled) this.onPurchase?.(item.type);
      });

      listEl.appendChild(div);
    }
  }

  updateShopMoney(money: number, ownedWeapons: { type: WeaponType; ammo: number }[], ownedItems: ItemType[]): void {
    const moneyEl = document.getElementById('money-display');
    if (moneyEl) moneyEl.textContent = `$${money}`;

    this.renderShopWeapons(money, ownedWeapons);
    this.renderShopItems(money, ownedItems);
  }

  private startShopTimer(duration: number, money: number, localId: string, ownedItems: ItemType[]): void {
    if (this.shopTimerInterval) {
      clearInterval(this.shopTimerInterval);
    }

    const startTime = Date.now();
    const updateTimer = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = Math.max(0, duration - elapsed);

      const timerEl = document.getElementById('shop-timer');
      if (timerEl) {
        timerEl.textContent = `${Math.ceil(remaining)}s`;
        timerEl.style.color = remaining < 10 ? '#f00' : '#ff0';
      }

      const timerBar = document.getElementById('timer-bar');
      if (timerBar) {
        const pct = (remaining / duration) * 100;
        timerBar.style.width = `${pct}%`;
      }

      if (remaining <= 0) {
        clearInterval(this.shopTimerInterval!);
        this.shopTimerInterval = null;
      }
    };

    updateTimer();
    this.shopTimerInterval = setInterval(updateTimer, 100);
  }

  stopShopTimer(): void {
    if (this.shopTimerInterval) {
      clearInterval(this.shopTimerInterval);
      this.shopTimerInterval = null;
    }
  }

  showGameOver(payload: GameOverPayload): void {
    const winnerEl = document.getElementById('winner-text');
    if (winnerEl) winnerEl.textContent = `${payload.winnerName} WINS!`;

    const tbody = document.getElementById('rankings-body');
    if (tbody) {
      tbody.innerHTML = '';
      payload.rankings.forEach((r, i) => {
        const tr = document.createElement('tr');
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
        tr.innerHTML = `
          <td>${medal} ${i + 1}</td>
          <td>${r.playerName}</td>
          <td>${r.score}</td>
          <td>${r.kills}</td>
        `;
        tbody.appendChild(tr);
      });
    }
  }

  addKillFeedEntry(text: string): void {
    const feed = document.getElementById('kill-feed');
    if (!feed) return;

    const div = document.createElement('div');
    div.className = 'kill-msg';
    div.textContent = text;
    div.style.color = '#ff8800';
    feed.appendChild(div);

    setTimeout(() => div.remove(), 5000);
  }

  addChatMessage(playerName: string, message: string, color?: string): void {
    const chatBox = document.getElementById('chat-box');
    if (!chatBox) return;

    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.style.color = color || '#fff';

    const nameSpan = document.createElement('span');
    nameSpan.style.color = '#0ff';
    nameSpan.textContent = `${playerName}: `;

    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;

    div.appendChild(nameSpan);
    div.appendChild(msgSpan);
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;

    setTimeout(() => {
      div.classList.add('fading');
      setTimeout(() => div.remove(), 5000);
    }, 8000);
  }

  getPlayerName(): string {
    return (document.getElementById('player-name-input') as HTMLInputElement)?.value?.trim() || 'Tank';
  }
}
