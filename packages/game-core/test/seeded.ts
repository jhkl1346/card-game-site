/**
 * 테스트 전용 시드 난수 (mulberry32). 확률에 기대는 테스트를 항상 같은 결과로 만들기 위해 쓴다.
 * 실제 게임 셔플에는 절대 쓰지 않는다 (서버는 crypto.randomInt 사용).
 */
export function seeded(seed: number): { random: () => number; randomInt: (max: number) => number } {
  let a = seed >>> 0;
  const random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  return { random, randomInt: (max: number) => Math.floor(random() * max) };
}
