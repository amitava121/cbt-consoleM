import type { WebSocket } from "ws";

const MAX_BUFFERED_AMOUNT = 1024 * 1024; // 1MB backpressure limit

export interface ClientMetadata {
  userId: string;
  role: string;
  deviceId?: string;
  examBatchId?: string;
  attemptId?: string;
  lastPongAt: number;
  connectedAt: number;
  lastSeqId: number;
}

export class RoomManager {
  private rooms = new Map<string, Set<WebSocket>>();
  private clientMeta = new Map<WebSocket, ClientMetadata>();

  join(room: string, socket: WebSocket, meta: ClientMetadata) {
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room)!.add(socket);
    this.clientMeta.set(socket, meta);
  }

  leave(socket: WebSocket) {
    const meta = this.clientMeta.get(socket);
    if (meta) {
      for (const room of this.getRoomsForSocket(socket, meta)) {
        this.rooms.get(room)?.delete(socket);
        if (this.rooms.get(room)?.size === 0) {
          this.rooms.delete(room);
        }
      }
      this.clientMeta.delete(socket);
    }
  }

  /**
   * Broadcast to a room with backpressure protection.
   * Drops slow consumers that exceed MAX_BUFFERED_AMOUNT.
   */
  broadcast(room: string, payload: unknown): number {
    const message = JSON.stringify(payload);
    const sockets = this.rooms.get(room);
    if (!sockets) return 0;
    let sent = 0;
    for (const socket of sockets) {
      if (socket.readyState === 1) {
        if (socket.bufferedAmount > MAX_BUFFERED_AMOUNT) {
          // Slow consumer — terminate to protect server memory
          socket.terminate();
          this.leave(socket);
          continue;
        }
        socket.send(message);
        sent++;
      }
    }
    return sent;
  }

  /**
   * Send to a single socket with backpressure check.
   * Accepts pre-serialized string or object (will be serialized).
   */
  sendTo(socket: WebSocket, payload: unknown | string): boolean {
    if (socket.readyState !== 1) return false;
    if (socket.bufferedAmount > MAX_BUFFERED_AMOUNT) {
      socket.terminate();
      this.leave(socket);
      return false;
    }
    const message = typeof payload === "string" ? payload : JSON.stringify(payload);
    socket.send(message);
    return true;
  }

  getMeta(socket: WebSocket): ClientMetadata | undefined {
    return this.clientMeta.get(socket);
  }

  updateMeta(socket: WebSocket, meta: Partial<ClientMetadata>) {
    const existing = this.clientMeta.get(socket);
    if (existing) {
      this.clientMeta.set(socket, { ...existing, ...meta });
    }
  }

  getRoomsForSocket(_socket: WebSocket, meta: ClientMetadata): string[] {
    const rooms: string[] = [];
    if (
      meta.role === "super_admin" ||
      meta.role === "exam_admin" ||
      meta.role === "proctor"
    ) {
      rooms.push("admin");
    }
    if (meta.examBatchId) {
      rooms.push(`examBatch:${meta.examBatchId}`);
    }
    if (meta.attemptId) {
      rooms.push(`attempt:${meta.attemptId}`);
    }
    rooms.push(`user:${meta.userId}`);
    return rooms;
  }

  allSockets(): WebSocket[] {
    return Array.from(this.clientMeta.keys());
  }

  /**
   * Get all sockets in a specific room.
   */
  getRoomSockets(room: string): WebSocket[] {
    const sockets = this.rooms.get(room);
    return sockets ? Array.from(sockets) : [];
  }

  /**
   * Get room member count.
   */
  getRoomSize(room: string): number {
    return this.rooms.get(room)?.size ?? 0;
  }

  /**
   * Get all active room names.
   */
  getActiveRooms(): string[] {
    return Array.from(this.rooms.keys());
  }

  /**
   * Get total connected client count.
   */
  getClientCount(): number {
    return this.clientMeta.size;
  }
}

export const roomManager = new RoomManager();
