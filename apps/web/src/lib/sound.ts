import { useSyncExternalStore } from 'react';

/**
 * 효과음. 음원 파일 없이 Web Audio로 짧은 소리를 만든다 (라이선스 걱정 없음).
 * 켜기/끄기는 이 브라우저에만 저장한다 (localStorage, 실패해도 기본값으로 동작).
 */
export type SoundName = 'deal' | 'chip' | 'turn' | 'win' | 'chat';

const KEY = 'card-game:sound';
let enabled = read();
const listeners = new Set<() => void>();
let ctx: AudioContext | null = null;

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* 저장하지 못해도 이번 접속 동안은 유지된다 */
  }
  if (on) void audio()?.resume();
  listeners.forEach((l) => l());
}

export function useSoundEnabled(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => enabled,
  );
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  ctx ??= new AudioContext();
  return ctx;
}

/** 음 하나: 주파수(Hz), 시작(초), 길이(초), 파형, 크기 */
type Note = [freq: number, at: number, dur: number, type?: OscillatorType, gain?: number];

const SOUNDS: Record<SoundName, Note[]> = {
  // 카드가 테이블을 스치는 짧은 소리
  deal: [[1800, 0, 0.035, 'triangle', 0.05]],
  // 칩끼리 부딪히는 소리
  chip: [
    [2400, 0, 0.04, 'square', 0.025],
    [3100, 0.045, 0.04, 'square', 0.02],
  ],
  // 내 차례 (낮은 두 음)
  turn: [
    [660, 0, 0.12, 'sine', 0.09],
    [880, 0.13, 0.16, 'sine', 0.08],
  ],
  // 이김 (올라가는 세 음)
  win: [
    [523, 0, 0.14, 'triangle', 0.09],
    [659, 0.12, 0.14, 'triangle', 0.09],
    [784, 0.24, 0.3, 'triangle', 0.09],
  ],
  chat: [[1200, 0, 0.06, 'sine', 0.05]],
};

export function playSound(name: SoundName): void {
  if (!enabled) return;
  const ac = audio();
  if (!ac) return;
  if (ac.state === 'suspended') void ac.resume();
  const t0 = ac.currentTime + 0.01;
  for (const [freq, at, dur, type = 'sine', gain = 0.08] of SOUNDS[name]) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, t0 + at);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(t0 + at);
    osc.stop(t0 + at + dur + 0.02);
  }
}
