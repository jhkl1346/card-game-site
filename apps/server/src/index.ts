import { createServer } from 'node:http';
import { createDeck } from '@card-game/game-core';

/**
 * 1단계 골격: 상태 확인용 HTTP 서버만 띄운다.
 * 인증, 방 관리, Socket.IO는 5~6단계에서 추가한다.
 */
const port = Number(process.env.PORT ?? 3001);

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, deckSize: createDeck().length }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('찾을 수 없는 주소입니다.');
});

server.listen(port, () => {
  console.log(`서버가 시작되었습니다: http://localhost:${port}`);
});
