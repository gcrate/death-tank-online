import WebSocket, { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import {
  ClientMessage, ServerMessage, LobbyState, RoomSummary, RoomConfig,
  WeaponType, ItemType,
} from '../../shared/protocol';
import { GAME } from './constants';
import { Room } from './Room';
import { Player } from './Player';

export class GameServer {
  private wss: WebSocketServer;
  private players: Map<string, Player> = new Map();    // playerId -> Player
  private rooms: Map<string, Room> = new Map();         // roomId -> Room
  private playerRooms: Map<string, string> = new Map(); // playerId -> roomId

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });
    this.wss.on('connection', (ws) => this.handleConnection(ws));
    console.log(`Death Tank server running on ws://localhost:${port}`);
  }

  private handleConnection(ws: WebSocket): void {
    const playerId = uuidv4();
    console.log(`Player connected: ${playerId}`);

    ws.on('message', (data) => {
      try {
        const message: ClientMessage = JSON.parse(data.toString());
        this.handleMessage(playerId, message);
      } catch (err) {
        console.error('Failed to parse message:', err);
      }
    });

    ws.on('close', () => {
      this.handleDisconnect(playerId);
    });

    ws.on('error', (err) => {
      console.error(`WebSocket error for player ${playerId}:`, err);
    });

    // Send welcome
    const welcomeMsg: ServerMessage = {
      type: 'WELCOME',
      payload: { playerId, serverTime: Date.now() },
    };
    ws.send(JSON.stringify(welcomeMsg));

    // Store temporary player reference (without name yet)
    // Will be replaced when JOIN_LOBBY is received
    const tempPlayer = new Player(playerId, '', ws);
    this.players.set(playerId, tempPlayer);
  }

  private handleMessage(playerId: string, message: ClientMessage): void {
    const player = this.players.get(playerId);

    switch (message.type) {
      case 'JOIN_LOBBY': {
        const name = message.payload.playerName.trim().slice(0, 20) || 'Tank';
        if (player) {
          player.name = name;
        } else {
          // Should not happen but handle gracefully
          break;
        }
        // Send current lobby state
        player.send({ type: 'LOBBY_STATE', payload: this.getLobbyState() });
        break;
      }

      case 'CREATE_ROOM': {
        if (!player || !player.name) {
          player?.send({ type: 'ERROR', payload: { message: 'Must join lobby first' } });
          break;
        }
        if (this.playerRooms.has(playerId)) {
          player.send({ type: 'ERROR', payload: { message: 'Already in a room' } });
          break;
        }

        const validInventories = ['none', 'missiles', 'heavy', 'everything'] as const;
        const config: RoomConfig = {
          rounds: [5, 10, 15, 20, 30].includes(message.payload.config.rounds)
            ? message.payload.config.rounds : 10,
          startingMoney: [100, 200, 500].includes(message.payload.config.startingMoney)
            ? message.payload.config.startingMoney : 200,
          mapType: 'mountainous',
          startingInventory: validInventories.includes(message.payload.config.startingInventory)
            ? message.payload.config.startingInventory : 'none',
        };

        const roomId = uuidv4().slice(0, 8).toUpperCase();
        const room = new Room(roomId, playerId, config);

        if (!room.addPlayer(player)) {
          player.send({ type: 'ERROR', payload: { message: 'Failed to create room' } });
          break;
        }

        this.rooms.set(roomId, room);
        this.playerRooms.set(playerId, roomId);

        player.send({
          type: 'ROOM_JOINED',
          payload: { roomId, roomState: room.getRoomState() },
        });

        this.broadcastLobbyState();
        break;
      }

      case 'JOIN_ROOM': {
        if (!player || !player.name) {
          player?.send({ type: 'ERROR', payload: { message: 'Must join lobby first' } });
          break;
        }
        if (this.playerRooms.has(playerId)) {
          player.send({ type: 'ERROR', payload: { message: 'Already in a room' } });
          break;
        }

        const room = this.rooms.get(message.payload.roomId);
        if (!room) {
          player.send({ type: 'ERROR', payload: { message: 'Room not found' } });
          break;
        }

        if (!room.addPlayer(player)) {
          player.send({ type: 'ERROR', payload: { message: 'Room is full or in progress' } });
          break;
        }

        this.playerRooms.set(playerId, room.id);

        player.send({
          type: 'ROOM_JOINED',
          payload: { roomId: room.id, roomState: room.getRoomState() },
        });

        // Notify other players
        room.broadcast({ type: 'ROOM_STATE', payload: room.getRoomState() });

        this.broadcastLobbyState();
        break;
      }

      case 'LEAVE_ROOM': {
        this.leaveRoom(playerId);
        break;
      }

      case 'PLAYER_READY': {
        const roomId = this.playerRooms.get(playerId);
        if (!roomId) break;
        const room = this.rooms.get(roomId);
        if (!room) break;

        if (!player) break;
        player.ready = true;

        // Notify all players in room
        room.broadcast({ type: 'ROOM_STATE', payload: room.getRoomState() });

        // Start game if all ready
        if (room.allPlayersReady() && room.state === 'lobby') {
          room.startGame();
        }
        break;
      }

      case 'INPUT': {
        if (!player) break;
        // Validate and clamp input
        const input = message.payload;
        player.currentInput = {
          moveDirection: ([-1, 0, 1].includes(input.moveDirection) ? input.moveDirection : 0) as -1 | 0 | 1,
          aimAngle: Math.max(-20, Math.min(200, input.aimAngle)),
          power: Math.max(10, Math.min(100, input.power)),
          firing: Boolean(input.firing),
          jumping: Boolean(input.jumping),
          selectedWeapon: Math.max(0, Math.floor(input.selectedWeapon)),
        };
        break;
      }

      case 'PURCHASE': {
        const roomId = this.playerRooms.get(playerId);
        if (!roomId) break;
        const room = this.rooms.get(roomId);
        if (!room) break;

        const success = room.handlePurchase(playerId, message.payload.itemType);
        if (success && player) {
          // Broadcast updated money to all players
          const shopPayload = {
            money: Object.fromEntries(
              Array.from(room.players.entries()).map(([id, p]) => [id, p.money])
            ),
            timeRemaining: GAME.SHOP_DURATION,
          };
          room.broadcast({ type: 'SHOP_OPEN', payload: shopPayload });
        } else if (!success && player) {
          player.send({ type: 'ERROR', payload: { message: 'Purchase failed' } });
        }
        break;
      }

      case 'SHOP_READY': {
        const roomId = this.playerRooms.get(playerId);
        if (!roomId) break;
        const room = this.rooms.get(roomId);
        if (!room) break;
        room.handleShopReady(playerId);
        break;
      }

      case 'CHAT': {
        if (!player) break;
        const roomId = this.playerRooms.get(playerId);
        if (!roomId) break;
        const room = this.rooms.get(roomId);
        if (!room) break;

        const msg = message.payload.message.trim().slice(0, 200);
        if (msg) {
          room.broadcast({
            type: 'CHAT',
            payload: { playerId, playerName: player.name, message: msg },
          });
        }
        break;
      }

      default:
        console.warn('Unknown message type:', (message as { type: string }).type);
    }
  }

  private handleDisconnect(playerId: string): void {
    console.log(`Player disconnected: ${playerId}`);
    this.leaveRoom(playerId);
    this.players.delete(playerId);
    this.broadcastLobbyState();
  }

  private leaveRoom(playerId: string): void {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    room.removePlayer(playerId);
    this.playerRooms.delete(playerId);

    if (room.players.size === 0) {
      room.cleanup();
      this.rooms.delete(roomId);
    } else {
      room.broadcast({ type: 'ROOM_STATE', payload: room.getRoomState() });
    }

    this.broadcastLobbyState();
  }

  private getLobbyState(): LobbyState {
    const rooms: RoomSummary[] = [];
    for (const [, room] of this.rooms) {
      if (room.state === 'ended') continue;
      const hostPlayer = room.players.get(room.hostId);
      rooms.push({
        roomId: room.id,
        hostName: hostPlayer?.name || 'Unknown',
        playerCount: room.players.size,
        maxPlayers: GAME.MAX_PLAYERS,
        config: room.config,
        inProgress: room.state !== 'lobby',
      });
    }
    return {
      rooms,
      playerCount: this.players.size,
    };
  }

  private broadcastLobbyState(): void {
    const lobbyState = this.getLobbyState();
    // Broadcast to players not in a room
    for (const [playerId, player] of this.players) {
      if (!this.playerRooms.has(playerId) && player.name) {
        player.send({ type: 'LOBBY_STATE', payload: lobbyState });
      }
    }
  }
}
