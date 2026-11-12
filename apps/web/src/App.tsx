import { HAND_CATEGORY_NAMES_KO, HandCategory } from '@card-game/game-core';

/** 1단계 골격 화면. 실제 화면(로그인, 로비, 테이블)은 7단계에서 만든다. */
export function App() {
  const categories = Object.values(HandCategory)
    .filter((v): v is HandCategory => typeof v === 'number')
    .sort((a, b) => b - a);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <h1>카드 게임</h1>
      <p>준비 중입니다. 족보 순위(높은 순):</p>
      <ol>
        {categories.map((c) => (
          <li key={c}>{HAND_CATEGORY_NAMES_KO[c]}</li>
        ))}
      </ol>
    </main>
  );
}
