import { ClientMessage, ServerMessage } from '../../shared/protocol';

type MessageHandler = (message: ServerMessage) => void;

export class NetworkClient {
  private ws: WebSocket | null = null;
  private handlers: Map<string, MessageHandler[]> = new Map();
  private onConnectCallback: (() => void) | null = null;
  private onDisconnectCallback: (() => void) | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string;
  private shouldReconnect: boolean = true;

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    this.shouldReconnect = true;
    this.tryConnect();
  }

  private tryConnect(): void {
    if (this.ws) {
      this.ws.close();
    }

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('Connected to server');
      this.onConnectCallback?.();
    };

    this.ws.onmessage = (event) => {
      try {
        const message: ServerMessage = JSON.parse(event.data);
        const handlers = this.handlers.get(message.type) || [];
        for (const handler of handlers) {
          handler(message);
        }
      } catch (err) {
        console.error('Failed to parse server message:', err);
      }
    };

    this.ws.onclose = () => {
      console.log('Disconnected from server');
      this.onDisconnectCallback?.();
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => this.tryConnect(), 2000);
      }
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  on<T extends ServerMessage['type']>(
    type: T,
    handler: (message: Extract<ServerMessage, { type: T }>) => void
  ): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler as MessageHandler);
  }

  onConnect(callback: () => void): void {
    this.onConnectCallback = callback;
  }

  onDisconnect(callback: () => void): void {
    this.onDisconnectCallback = callback;
  }
}
