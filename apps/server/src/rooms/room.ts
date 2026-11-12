import { randomUUID } from 'node:crypto';
import { botProfile, botQuickDelayMs, botThinkDelayMs, GameRuleError, type BotRandom, type PlayerInit, type RandomInt } from '@card-game/game-core';
import { ZodError } from 'zod';
import type { ServerLimits } from '../config/limits.js';
import type { HandParticipant, WalletPort } from '../wallet/service.js';
import { WalletError } from '../wallet/service.js';
import { ADAPTERS, type GameAdapter } from './adapters.js';
import { minBuyIn, type RoomSettings } from './settings.js';

/** 사용자에게 그대로 보여 줄 한국어 메시지를 가진 방 오류 */
export class RoomError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoomError';
  }
}

export interface Seat {
  index: number;
  /** 엔진에서 쓰는 참가자 id: 사람은 userId, 봇은 "bot:방id:번호" */
  id: string;
  name: string;
  isBot: boolean;
  /** 테이블 칩 (판 진행 중에는 판 시작 시점의 값, 판이 끝나면 갱신) */
  stack: number;
  /** 사람 자리: 소켓 연결 여부 */
  connected: boolean;
  /** 접속이 끊긴 지 reconnectGraceMs가 지나 봇이 대신 플레이하는 중 */
  botControlled: boolean;
  /** 나가기를 눌렀거나 강퇴됨: 이번 판은 자동 액션으로 마치고 판이 끝나면 일어난다 */
  leaving: boolean;
  disconnectedAt: number | null;
}

export interface RoomDeps {
  wallet: WalletPort;
  limits: ServerLimits;
  /** 셔플용 보안 난수 (crypto.randomInt) */
  randomInt: RandomInt;
  /** 봇 판단·생각 시간용 난수 */
  botRandom: BotRandom;
  /** 방 상태가 바뀔 때마다 호출 (소켓으로 스냅샷 전송) */
  onChange(room: GameRoom): void;
  /** 특정 사용자에게 안내 메시지 */
  onNotice(room: GameRoom, userId: string, message: string): void;
  /** 오류 기록 (비밀 정보는 넘기지 않는다) */
  logError(message: string, error: unknown): void;
}

export interface RoomSummary {
  id: string;
  gameType: RoomSettings['gameType'];
  gameName: string;
  title: string;
  isPrivate: boolean;
  status: 'waiting' | 'playing';
  players: number;
  humans: number;
  maxPlayers: number;
  spectators: number;
  stake: number;
  buyIn: number;
  turnSeconds: number;
}

export interface RoomSnapshot {
  seq: number;
  room: RoomSummary & {
    hostId: string;
    /** 비공개 방 입장 코드 (그 방 안에 있는 사람에게만 보낸다) */
    code: string | null;
    stakeLabel: string;
    minBuyIn: number;
    handNo: number;
    seats: Array<{
      index: number;
      id: string;
      name: string;
      isBot: boolean;
      stack: number;
      connected: boolean;
      botControlled: boolean;
      leaving: boolean;
      /** 이번 판에 참여 중인지 (중간에 앉은 사람은 다음 판부터) */
      inHand: boolean;
    } | null>;
    spectatorNames: string[];
  };
  me: { userId: string | null; seatIndex: number | null; isHost: boolean; isSpectator: boolean };
  /** 이 사람이 봐도 되는 게임 시야 (엔진의 getState). 판이 없으면 null */
  game: Record<string, unknown> | null;
  /** deadline은 서버 시각(밀리초). 클라이언트는 serverNow와의 차이로 남은 시간을 계산한다 */
  turn: { actorId: string; deadline: number | null } | null;
  nextHandAt: number | null;
  serverNow: number;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * 방 하나. 진행 중인 게임 상태는 이 객체(서버 메모리)에만 있다.
 * 모든 상태 변경은 run()으로 한 줄로 세워서, DB 저장을 기다리는 동안 다른 요청이 끼어들지 않게 한다.
 */
export class GameRoom {
  readonly id = randomUUID();
  readonly code: string;
  readonly adapter: GameAdapter;
  readonly seats: Array<Seat | null>;
  readonly spectators = new Map<string, { name: string; connected: boolean; disconnectedAt: number | null }>();
  hostId: string;
  title: string;
  status: 'waiting' | 'playing' | 'closed' = 'waiting';
  started = false;
  seq = 0;
  handNo = 0;
  private state: unknown = null;
  private gameId: string | null = null;
  private handSeatIds: string[] = [];
  private dealerSeat = -1;
  private turn: { actorId: string; deadline: number | null } | null = null;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private nextHandTimer: ReturnType<typeof setTimeout> | null = null;
  private nextHandAt: number | null = null;
  private readonly graceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private queue: Promise<unknown> = Promise.resolve();
  private botCounter = 0;

  constructor(
    readonly settings: RoomSettings,
    host: { userId: string; name: string },
    private readonly deps: RoomDeps,
  ) {
    this.adapter = ADAPTERS[settings.gameType];
    this.seats = Array.from({ length: settings.maxPlayers }, () => null);
    this.hostId = host.userId;
    this.title = `${host.name}의 ${this.adapter.nameKo}`;
    this.code = settings.isPrivate
      ? Array.from({ length: 6 }, () => CODE_CHARS[deps.randomInt(CODE_CHARS.length)]).join('')
      : '';
  }

  /** 상태 변경 작업을 차례로 실행한다 */
  run<T>(task: () => Promise<T> | T): Promise<T> {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => undefined);
    return next;
  }

  // ───────────────────────── 조회 ─────────────────────────

  seatOf(userId: string): Seat | null {
    return this.seats.find((s) => s && !s.isBot && s.id === userId) ?? null;
  }

  hasMember(userId: string): boolean {
    return this.seatOf(userId) !== null || this.spectators.has(userId);
  }

  humanIds(): string[] {
    return [...this.seats.filter((s): s is Seat => !!s && !s.isBot).map((s) => s.id), ...this.spectators.keys()];
  }

  /** 사람이 아무도 없으면 방을 닫아도 된다 */
  isEmpty(): boolean {
    return this.humanIds().length === 0;
  }

  get handInProgress(): boolean {
    return this.state !== null && this.adapter.result(this.state) === null;
  }

  /** 지금 이 순간 이 사람의 테이블 칩 (판 진행 중이면 엔진 상태 기준) */
  tableChipsOf(userId: string): number {
    const seat = this.seatOf(userId);
    if (!seat) return 0;
    if (this.state && this.handSeatIds.includes(userId)) {
      const view = this.adapter.view(this.state, userId) as unknown as { players: Array<{ id: string; stack: number; totalBet?: number }> };
      const me = view.players.find((p) => p.id === userId);
      // 아직 팟에 들어가 결과가 정해지지 않은 칩도 테이블 칩으로 본다
      if (me) return me.stack + (this.handInProgress ? (me.totalBet ?? 0) : 0);
    }
    return seat.stack;
  }

  summary(): RoomSummary {
    const seated = this.seats.filter((s): s is Seat => !!s);
    return {
      id: this.id,
      gameType: this.settings.gameType,
      gameName: this.adapter.nameKo,
      title: this.title,
      isPrivate: this.settings.isPrivate,
      status: this.status === 'playing' ? 'playing' : 'waiting',
      players: seated.length,
      humans: seated.filter((s) => !s.isBot).length,
      maxPlayers: this.settings.maxPlayers,
      spectators: this.spectators.size,
      stake: this.settings.stake,
      buyIn: this.settings.buyIn,
      turnSeconds: this.settings.turnSeconds,
    };
  }

  /** userId(관전자·참가자) 또는 null(방 밖)에게 보낼 스냅샷. 게임 시야는 엔진이 비공개 정보를 지운 것만 쓴다 */
  snapshotFor(userId: string | null): RoomSnapshot {
    const seat = userId ? this.seatOf(userId) : null;
    const inHand = (id: string) => this.state !== null && this.handSeatIds.includes(id);
    return {
      seq: this.seq,
      room: {
        ...this.summary(),
        hostId: this.hostId,
        code: userId && this.hasMember(userId) && this.settings.isPrivate ? this.code : null,
        stakeLabel: this.adapter.stakeLabel,
        minBuyIn: minBuyIn(this.settings),
        handNo: this.handNo,
        seats: this.seats.map((s) =>
          s
            ? {
                index: s.index,
                id: s.id,
                name: s.name,
                isBot: s.isBot,
                stack: s.stack,
                connected: s.connected,
                botControlled: s.botControlled,
                leaving: s.leaving,
                inHand: inHand(s.id),
              }
            : null,
        ),
        spectatorNames: [...this.spectators.values()].map((s) => s.name),
      },
      me: {
        userId,
        seatIndex: seat?.index ?? null,
        isHost: userId === this.hostId,
        isSpectator: !!userId && this.spectators.has(userId),
      },
      game: this.state ? this.adapter.view(this.state, seat && inHand(seat.id) ? seat.id : null) : null,
      turn: this.turn,
      nextHandAt: this.nextHandAt,
      serverNow: Date.now(),
    };
  }

  private changed(): void {
    this.seq++;
    this.deps.onChange(this);
  }

  // ───────────────────────── 자리·관전 ─────────────────────────

  /** 빈자리에 앉는다 (지갑에서 바이인). 판 진행 중이면 다음 판부터 참여 */
  sit(userId: string, name: string): Promise<Seat> {
    return this.run(async () => {
      this.assertOpen();
      if (this.seatOf(userId)) throw new RoomError('이미 자리에 앉아 있습니다.');
      const index = this.seats.findIndex((s) => s === null);
      if (index < 0) throw new RoomError('빈자리가 없습니다. 관전으로 입장해 보세요.');
      // 바이인을 기다리는 동안 다른 사람이 같은 자리에 앉지 못하게 미리 잡아 둔다
      const seat: Seat = { index, id: userId, name, isBot: false, stack: 0, connected: true, botControlled: false, leaving: false, disconnectedAt: null };
      this.seats[index] = seat;
      try {
        seat.stack = await this.deps.wallet.buyIn(userId, this.id, this.settings.buyIn, minBuyIn(this.settings));
      } catch (error) {
        this.seats[index] = null;
        throw error instanceof WalletError ? new RoomError(error.message) : error;
      }
      this.spectators.delete(userId);
      this.changed();
      this.maybeScheduleNextHand();
      return seat;
    });
  }

  addSpectator(userId: string, name: string): Promise<void> {
    return this.run(() => {
      this.assertOpen();
      if (this.seatOf(userId)) throw new RoomError('이미 자리에 앉아 있습니다.');
      if (!this.spectators.has(userId) && this.spectators.size >= this.deps.limits.maxSpectatorsPerRoom) {
        throw new RoomError('관전자가 가득 찼습니다.');
      }
      this.spectators.set(userId, { name, connected: true, disconnectedAt: null });
      this.changed();
    });
  }

  /** 봇을 빈자리에 채운다 (봇 칩은 지갑과 무관한 가상 칩) */
  addBots(count: number): Promise<void> {
    return this.run(() => {
      for (let i = 0; i < count; i++) {
        const index = this.seats.findIndex((s) => s === null);
        if (index < 0) break;
        const n = this.botCounter++;
        this.seats[index] = {
          index,
          id: `bot:${this.id}:${n}`,
          name: botProfile(n).name,
          isBot: true,
          stack: this.settings.buyIn,
          connected: true,
          botControlled: true,
          leaving: false,
          disconnectedAt: null,
        };
      }
      this.changed();
    });
  }

  /**
   * 방에서 나간다. 관전자는 바로, 판에 참여 중인 사람은 이번 판을 자동 액션(체크/다이, 훌라는 자동 버리기)으로 마치고
   * 판이 끝날 때 일어나며 테이블 칩이 지갑으로 돌아간다. 돌려준 칩 수(판 진행 중이면 null)를 돌려준다.
   */
  leave(userId: string): Promise<number | null> {
    return this.run(async () => {
      if (this.spectators.delete(userId)) {
        this.clearGrace(userId);
        this.changed();
        return 0;
      }
      const seat = this.seatOf(userId);
      if (!seat) return 0;
      if (this.handInProgress && this.handSeatIds.includes(userId)) {
        seat.leaving = true;
        this.passHostIfNeeded(userId);
        if (this.turn?.actorId === userId) this.scheduleTurn(true);
        this.changed();
        return null;
      }
      return this.standUp(seat);
    });
  }

  private async standUp(seat: Seat): Promise<number> {
    this.seats[seat.index] = null;
    this.clearGrace(seat.id);
    this.passHostIfNeeded(seat.id);
    let returned = 0;
    try {
      returned = await this.deps.wallet.cashOut(seat.id, this.id);
    } catch (error) {
      // DB 오류여도 table_stakes가 남아 있으므로 서버 재시작 때 환불된다
      this.deps.logError('칩 반환 실패', error);
    }
    this.changed();
    this.maybeScheduleNextHand();
    return returned;
  }

  private passHostIfNeeded(userId: string): void {
    if (this.hostId !== userId) return;
    const next = this.seats.find((s) => s && !s.isBot && !s.leaving && s.id !== userId) ?? null;
    if (next) this.hostId = next.id;
    else {
      const spectator = [...this.spectators.keys()].find((id) => id !== userId);
      if (spectator) this.hostId = spectator;
    }
  }

  kick(hostId: string, targetId: string): Promise<void> {
    return this.run(() => {
      if (hostId !== this.hostId) throw new RoomError('방장만 강퇴할 수 있습니다.');
      if (targetId === hostId) throw new RoomError('자기 자신은 강퇴할 수 없습니다.');
      if (!this.hasMember(targetId)) throw new RoomError('방에 없는 사람입니다.');
    }).then(async () => {
      await this.leave(targetId);
      this.deps.onNotice(this, targetId, '방장이 나를 강퇴했습니다.');
    });
  }

  transferHost(hostId: string, targetId: string): Promise<void> {
    return this.run(() => {
      if (hostId !== this.hostId) throw new RoomError('방장만 방장을 넘길 수 있습니다.');
      const seat = this.seatOf(targetId);
      if (!seat && !this.spectators.has(targetId)) throw new RoomError('방에 있는 사람에게만 넘길 수 있습니다.');
      this.hostId = targetId;
      this.changed();
    });
  }

  // ───────────────────────── 접속·재접속 ─────────────────────────

  setConnected(userId: string, connected: boolean): Promise<void> {
    return this.run(() => {
      const seat = this.seatOf(userId);
      const spectator = this.spectators.get(userId);
      if (!seat && !spectator) return;
      const now = Date.now();
      if (spectator) {
        spectator.connected = connected;
        spectator.disconnectedAt = connected ? null : now;
      }
      if (connected) {
        this.clearGrace(userId);
        if (seat) {
          const wasBot = seat.botControlled;
          seat.connected = true;
          seat.botControlled = false;
          seat.disconnectedAt = null;
          // 봇이 대신하던 차례면 사람에게 새 제한 시간으로 돌려준다
          if (wasBot && this.turn?.actorId === userId) this.scheduleTurn(true);
        }
      } else {
        if (seat) {
          seat.connected = false;
          seat.disconnectedAt = now;
        }
        this.graceTimers.set(
          userId,
          setTimeout(() => void this.run(() => this.onGraceExpired(userId)), this.deps.limits.reconnectGraceMs),
        );
      }
      this.changed();
    });
  }

  private async onGraceExpired(userId: string): Promise<void> {
    this.graceTimers.delete(userId);
    if (this.spectators.get(userId)?.connected === false) {
      this.spectators.delete(userId);
      this.changed();
      return;
    }
    const seat = this.seatOf(userId);
    if (!seat || seat.connected) return;
    if (!this.handInProgress || !this.handSeatIds.includes(userId)) {
      // 판에 참여하지 않는 중이면 바로 일어나 칩을 돌려준다
      await this.standUp(seat);
      return;
    }
    seat.botControlled = true;
    if (this.turn?.actorId === userId) this.scheduleTurn(true);
    this.changed();
  }

  private clearGrace(userId: string): void {
    const timer = this.graceTimers.get(userId);
    if (timer) clearTimeout(timer);
    this.graceTimers.delete(userId);
  }

  // ───────────────────────── 판 진행 ─────────────────────────

  /** 방장이 게임을 시작한다. 이후 조건이 맞으면 판이 자동으로 이어진다 */
  start(userId: string | null): Promise<void> {
    return this.run(() => {
      if (userId !== null && userId !== this.hostId) throw new RoomError('방장만 게임을 시작할 수 있습니다.');
      if (this.started) throw new RoomError('이미 시작한 방입니다.');
      if (this.eligibleSeats().length < this.adapter.minPlayers) {
        throw new RoomError(`${this.adapter.nameKo}는 최소 ${this.adapter.minPlayers}명이 있어야 시작할 수 있습니다.`);
      }
      this.started = true;
      this.startHand();
    });
  }

  private eligibleSeats(): Seat[] {
    return this.seats.filter((s): s is Seat => !!s && s.stack > 0 && !s.leaving);
  }

  private canStartHand(): boolean {
    const seats = this.eligibleSeats();
    return this.started && this.status !== 'closed' && seats.length >= this.adapter.minPlayers && seats.some((s) => !s.isBot);
  }

  private maybeScheduleNextHand(): void {
    if (this.handInProgress || this.nextHandTimer || !this.canStartHand()) return;
    this.nextHandAt = Date.now() + this.deps.limits.nextHandDelayMs;
    this.nextHandTimer = setTimeout(() => {
      void this.run(() => {
        this.nextHandTimer = null;
        this.nextHandAt = null;
        if (this.canStartHand() && !this.handInProgress) this.startHand();
        else {
          this.status = 'waiting';
          this.changed();
        }
      });
    }, this.deps.limits.nextHandDelayMs);
  }

  private startHand(): void {
    const seats = this.eligibleSeats();
    // 딜러(버튼)는 판마다 다음 자리로
    const order = seats.map((s) => s.index);
    const nextDealer = order.find((i) => i > this.dealerSeat) ?? order[0]!;
    this.dealerSeat = nextDealer;
    const players: PlayerInit[] = seats.map((s) => ({ id: s.id, name: s.name, chips: s.stack, isBot: s.isBot }));
    this.state = this.adapter.create(players, this.settings.stake, order.indexOf(nextDealer), this.deps.randomInt);
    this.gameId = randomUUID();
    this.handSeatIds = seats.map((s) => s.id);
    this.handNo++;
    this.status = 'playing';
    this.turn = null;
    this.scheduleTurn(true);
  }

  /** 다음 차례를 정하고 타이머를 건다. 사람은 제한 시간, 봇(또는 봇이 대신하는 자리)은 생각 시간 */
  private scheduleTurn(freshDeadline = false): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
    if (!this.state) return;
    if (this.adapter.result(this.state)) {
      this.turn = null;
      this.changed();
      void this.run(() => this.finishHand());
      return;
    }
    const actorId = this.adapter.toActId(this.state);
    if (!actorId) return;
    const seat = this.seats.find((s) => s?.id === actorId) ?? null;
    const now = Date.now();
    const automatic = !seat || seat.isBot || seat.botControlled || seat.leaving;
    // 훌라처럼 한 차례에 여러 액션을 하는 경우 같은 사람이면 제한 시간을 이어 간다
    const keep = !freshDeadline && this.turn?.actorId === actorId && this.turn.deadline !== null;
    const deadline = automatic ? null : keep ? this.turn!.deadline! : now + this.settings.turnSeconds * 1000;
    this.turn = { actorId, deadline };
    this.changed();

    if (seat?.leaving) {
      this.turnTimer = setTimeout(() => void this.run(() => this.autoAct(actorId, 'timeout')), 0);
    } else if (automatic) {
      const delay = this.adapter.quickTurn?.(this.state) ? botQuickDelayMs(this.deps.botRandom) : botThinkDelayMs(this.deps.botRandom);
      this.turnTimer = setTimeout(() => void this.run(() => this.autoAct(actorId, 'bot')), delay);
    } else {
      this.turnTimer = setTimeout(() => void this.run(() => this.autoAct(actorId, 'timeout')), Math.max(0, deadline! - now));
    }
  }

  private autoAct(actorId: string, kind: 'bot' | 'timeout'): void {
    if (!this.state || this.turn?.actorId !== actorId || !this.handInProgress) return;
    let action: unknown;
    try {
      action = kind === 'bot' ? this.adapter.botAction(this.state, actorId, this.deps.botRandom) : this.adapter.timeoutAction(this.state, actorId);
      this.state = this.adapter.apply(this.state, actorId, action);
    } catch (error) {
      // 봇 판단이 잘못돼도 판이 멈추지 않게 시간 초과 액션으로 대신한다
      this.deps.logError('자동 액션 실패', error);
      this.state = this.adapter.apply(this.state, actorId, this.adapter.timeoutAction(this.state, actorId));
    }
    this.scheduleTurn();
  }

  /** 사람이 보낸 액션. 차례가 아니거나 규칙에 맞지 않으면 RoomError */
  act(userId: string, rawAction: unknown): Promise<void> {
    return this.run(() => {
      if (!this.state || !this.handInProgress) throw new RoomError('진행 중인 판이 없습니다.');
      if (this.turn?.actorId !== userId) throw new RoomError('내 차례가 아닙니다.');
      const seat = this.seatOf(userId);
      if (!seat || seat.leaving) throw new RoomError('이 판에서 액션할 수 없습니다.');
      let action: unknown;
      try {
        action = this.adapter.parseAction(rawAction);
        this.state = this.adapter.apply(this.state, userId, action);
      } catch (error) {
        if (error instanceof GameRuleError) throw new RoomError(error.message);
        if (error instanceof ZodError) throw new RoomError('액션 형식이 올바르지 않습니다.');
        throw error;
      }
      this.scheduleTurn();
    });
  }

  /** 판 종료: 결과를 한 트랜잭션으로 기록하고, 나가는 사람·칩이 없는 사람을 정리한 뒤 다음 판을 예약한다 */
  private async finishHand(): Promise<void> {
    if (!this.state || !this.gameId) return;
    const result = this.adapter.result(this.state);
    if (!result) return;
    const gameId = this.gameId;
    this.gameId = null; // 같은 판을 두 번 정산하지 않도록 먼저 지운다

    const participants: HandParticipant[] = [];
    for (const id of this.handSeatIds) {
      const seat = this.seats.find((s) => s?.id === id);
      if (!seat) continue;
      seat.stack = result.finalChips[id] ?? seat.stack;
      participants.push({ id, name: seat.name, isBot: seat.isBot, chipDelta: result.chipDeltas[id] ?? 0, finalChips: seat.stack });
    }
    try {
      await this.deps.wallet.recordHand({ gameId, gameType: this.settings.gameType, roomId: this.id, participants });
    } catch (error) {
      this.deps.logError('판 결과 저장 실패', error);
    }

    const now = Date.now();
    for (const seat of [...this.seats]) {
      if (!seat) continue;
      if (seat.isBot) {
        if (seat.stack <= 0) seat.stack = this.settings.buyIn; // 봇은 칩이 떨어지면 다시 채운다
        continue;
      }
      const absent = !seat.connected && seat.disconnectedAt !== null && now - seat.disconnectedAt >= this.deps.limits.absentStandMs;
      if (seat.leaving || absent) {
        await this.standUp(seat);
      } else if (seat.stack <= 0) {
        await this.standUp(seat);
        this.spectators.set(seat.id, { name: seat.name, connected: seat.connected, disconnectedAt: seat.disconnectedAt });
        this.deps.onNotice(this, seat.id, '칩을 모두 잃어 자리에서 일어났습니다. 관전 중입니다.');
      }
    }
    this.changed();
    if (this.canStartHand()) this.maybeScheduleNextHand();
    else {
      this.status = 'waiting';
      this.changed();
    }
  }

  // ───────────────────────── 닫기 ─────────────────────────

  private assertOpen(): void {
    if (this.status === 'closed') throw new RoomError('이미 닫힌 방입니다.');
  }

  /**
   * 방을 닫는다. 판 진행 중이면 그 판은 무효로 하고, 앉아 있던 사람은 판 시작 전 칩(table_stakes)으로 돌려받는다.
   */
  close(): Promise<void> {
    return this.run(async () => {
      if (this.status === 'closed') return;
      this.status = 'closed';
      for (const t of [this.turnTimer, this.nextHandTimer, ...this.graceTimers.values()]) if (t) clearTimeout(t);
      this.graceTimers.clear();
      this.state = null;
      this.gameId = null;
      for (const seat of this.seats) {
        if (seat && !seat.isBot) {
          try {
            await this.deps.wallet.cashOut(seat.id, this.id);
          } catch (error) {
            this.deps.logError('방 닫기 중 칩 반환 실패', error);
          }
        }
      }
      this.seats.fill(null);
      this.spectators.clear();
    });
  }
}
