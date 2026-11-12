import type { BotRandom, RandomInt } from '@card-game/game-core';
import type { ServerLimits } from '../config/limits.js';
import type { GameType } from '../db/schema.js';
import type { WalletPort } from '../wallet/service.js';
import { GameRoom, RoomError, type RoomSnapshot, type RoomSummary } from './room.js';
import { defaultSettings, parseRoomSettings, type RoomSettings } from './settings.js';

export interface RoomUser {
  userId: string;
  nickname: string;
}

export interface RoomManagerEvents {
  /** 방 상태가 바뀜: 방에 있는 사람마다 snapshotFor(userId)를 보내야 한다 */
  roomChanged(room: GameRoom): void;
  /** 방이 닫힘 (남아 있던 사람들에게 알림) */
  roomClosed(room: GameRoom, memberIds: string[]): void;
  /** 공개 방 목록이 바뀜 */
  lobbyChanged(): void;
  /** 한 사람에게 안내 */
  notice(userId: string, message: string): void;
}

export interface RoomManagerDeps {
  wallet: WalletPort;
  limits: ServerLimits;
  randomInt: RandomInt;
  botRandom: BotRandom;
  events: RoomManagerEvents;
  logError(message: string, error: unknown): void;
}

/**
 * 메모리에 있는 방 목록 관리 (Map<roomId, GameRoom>).
 * 한 사람은 한 번에 한 방에만 있을 수 있다(참가 또는 관전).
 */
export class RoomManager {
  private readonly rooms = new Map<string, GameRoom>();
  private readonly userRoom = new Map<string, string>();

  constructor(private readonly deps: RoomManagerDeps) {}

  get size(): number {
    return this.rooms.size;
  }

  getRoom(roomId: string): GameRoom | undefined {
    return this.rooms.get(roomId);
  }

  roomOf(userId: string): GameRoom | undefined {
    const roomId = this.userRoom.get(userId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  /** 구제 칩 판단용: 지금 테이블에 있는 칩 */
  tableChipsOf(userId: string): number {
    return this.roomOf(userId)?.tableChipsOf(userId) ?? 0;
  }

  listPublic(): RoomSummary[] {
    return [...this.rooms.values()]
      .filter((r) => !r.settings.isPrivate && r.status !== 'closed')
      .map((r) => r.summary());
  }

  snapshotFor(userId: string): RoomSnapshot | null {
    return this.roomOf(userId)?.snapshotFor(userId) ?? null;
  }

  private newRoom(settings: RoomSettings, host: RoomUser): GameRoom {
    if (this.rooms.size >= this.deps.limits.maxRooms) {
      throw new RoomError('지금은 방이 너무 많아 새 방을 만들 수 없습니다. 잠시 후 다시 시도하거나 다른 방에 입장해 주세요.');
    }
    const room = new GameRoom(settings, { userId: host.userId, name: host.nickname }, {
      wallet: this.deps.wallet,
      limits: this.deps.limits,
      randomInt: this.deps.randomInt,
      botRandom: this.deps.botRandom,
      onChange: (r) => this.onRoomChange(r),
      onNotice: (_r, userId, message) => this.deps.events.notice(userId, message),
      logError: this.deps.logError,
    });
    this.rooms.set(room.id, room);
    return room;
  }

  private onRoomChange(room: GameRoom): void {
    // 방에서 빠진 사람의 연결 정보 정리
    for (const [userId, roomId] of this.userRoom) {
      if (roomId === room.id && !room.hasMember(userId)) this.userRoom.delete(userId);
    }
    this.deps.events.roomChanged(room);
    this.deps.events.lobbyChanged();
    // 판이 끝나 마지막 사람이 일어났으면 방을 닫는다 (지금 실행 중인 작업이 끝난 뒤)
    if (room.isEmpty() && room.status !== 'closed' && this.rooms.has(room.id)) {
      setTimeout(() => void this.closeIfEmpty(room).catch((e) => this.deps.logError('빈 방 닫기 실패', e)), 0);
    }
  }

  private assertFree(userId: string): void {
    if (this.userRoom.has(userId)) throw new RoomError('이미 다른 방에 있습니다. 먼저 그 방에서 나와 주세요.');
  }

  /**
   * 방 만들기. 만든 사람이 방장이 되어 자리에 앉고(바이인), 설정한 수만큼 봇을 채운다.
   * autoStart면 바로 시작한다 (혼자 하기, 빠른 입장).
   */
  async create(user: RoomUser, rawSettings: unknown, options: { autoStart?: boolean } = {}): Promise<GameRoom> {
    this.assertFree(user.userId);
    const settings = parseRoomSettings(rawSettings, this.deps.limits);
    const room = this.newRoom(settings, user);
    this.userRoom.set(user.userId, room.id);
    try {
      await room.sit(user.userId, user.nickname);
    } catch (error) {
      this.userRoom.delete(user.userId);
      this.rooms.delete(room.id);
      await room.close();
      throw error;
    }
    await room.addBots(settings.botCount);
    if (options.autoStart) await room.start(null);
    this.deps.events.lobbyChanged();
    return room;
  }

  /** 혼자 하기: 비공개 방에 봇만 채워 바로 시작 */
  createSingle(user: RoomUser, gameType: unknown, overrides: Record<string, unknown> = {}): Promise<GameRoom> {
    const type = parseRoomSettings({ gameType }, this.deps.limits).gameType;
    const d = defaultSettings(type, this.deps.limits);
    return this.create(user, { ...d, ...overrides, gameType: type, isPrivate: true, botCount: (Number(overrides.maxPlayers) || d.maxPlayers) - 1 }, { autoStart: true });
  }

  /** 방 id 또는 비공개 방 코드로 입장한다. 자리가 있으면 앉고, 없거나 asSpectator면 관전 */
  async join(user: RoomUser, target: { roomId?: string; code?: string }, asSpectator = false): Promise<GameRoom> {
    this.assertFree(user.userId);
    const room = target.code
      ? [...this.rooms.values()].find((r) => r.settings.isPrivate && r.code === target.code!.toUpperCase())
      : target.roomId
        ? this.rooms.get(target.roomId)
        : undefined;
    if (!room || room.status === 'closed') throw new RoomError(target.code ? '입장 코드가 맞는 방이 없습니다.' : '방을 찾을 수 없습니다.');
    if (room.settings.isPrivate && !target.code) throw new RoomError('비공개 방은 입장 코드로만 들어갈 수 있습니다.');
    this.userRoom.set(user.userId, room.id);
    try {
      if (asSpectator) await room.addSpectator(user.userId, user.nickname);
      else await room.sit(user.userId, user.nickname);
    } catch (error) {
      this.userRoom.delete(user.userId);
      throw error;
    }
    return room;
  }

  /** 빠른 입장: 빈자리가 있는 공개 방에 앉고, 없으면 기본 설정으로 봇과 함께 새 방을 만든다 */
  async quickJoin(user: RoomUser, gameType: unknown): Promise<GameRoom> {
    const type: GameType = parseRoomSettings({ gameType }, this.deps.limits).gameType;
    const candidates = [...this.rooms.values()]
      .filter((r) => r.settings.gameType === type && !r.settings.isPrivate && r.status !== 'closed')
      .filter((r) => r.seats.some((s) => s === null))
      .sort((a, b) => b.summary().humans - a.summary().humans);
    for (const room of candidates) {
      try {
        return await this.join(user, { roomId: room.id });
      } catch (error) {
        if (!(error instanceof RoomError) || error.message.startsWith('칩이 부족')) throw error;
      }
    }
    return this.create(user, defaultSettings(type, this.deps.limits), { autoStart: true });
  }

  async leave(userId: string): Promise<number | null> {
    const room = this.roomOf(userId);
    if (!room) return 0;
    const returned = await room.leave(userId);
    if (returned !== null && !room.hasMember(userId)) this.userRoom.delete(userId);
    await this.closeIfEmpty(room);
    return returned;
  }

  /** 판 진행 중 나간 사람이 판이 끝나 실제로 일어난 뒤 빈 방을 정리한다 */
  async closeIfEmpty(room: GameRoom): Promise<void> {
    if (!room.isEmpty() || room.status === 'closed') return;
    this.rooms.delete(room.id);
    await room.close();
    this.deps.events.roomClosed(room, []);
    this.deps.events.lobbyChanged();
  }

  async kick(hostId: string, targetId: string): Promise<void> {
    const room = this.roomOf(hostId);
    if (!room) throw new RoomError('방에 있지 않습니다.');
    await room.kick(hostId, targetId);
    if (!room.hasMember(targetId)) this.userRoom.delete(targetId);
  }

  async transferHost(hostId: string, targetId: string): Promise<void> {
    const room = this.roomOf(hostId);
    if (!room) throw new RoomError('방에 있지 않습니다.');
    await room.transferHost(hostId, targetId);
  }

  async start(userId: string): Promise<void> {
    const room = this.roomOf(userId);
    if (!room) throw new RoomError('방에 있지 않습니다.');
    await room.start(userId);
  }

  /** 관전자가 빈자리에 앉기 */
  async sit(user: RoomUser): Promise<void> {
    const room = this.roomOf(user.userId);
    if (!room) throw new RoomError('방에 있지 않습니다.');
    await room.sit(user.userId, user.nickname);
  }

  async act(userId: string, action: unknown): Promise<void> {
    const room = this.roomOf(userId);
    if (!room) throw new RoomError('방에 있지 않습니다.');
    await room.act(userId, action);
  }

  async setConnected(userId: string, connected: boolean): Promise<void> {
    const room = this.roomOf(userId);
    if (room) await room.setConnected(userId, connected);
  }

  /** 서버 종료: 모든 방을 닫는다 (진행 중이던 판은 무효, 판 시작 전 칩으로 돌려준다) */
  async shutdown(): Promise<void> {
    const rooms = [...this.rooms.values()];
    this.rooms.clear();
    this.userRoom.clear();
    for (const room of rooms) await room.close();
  }
}
