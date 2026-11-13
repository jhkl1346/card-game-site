import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { RecordsConfig } from '../config/records.js';
import type { Db } from '../db/client.js';
import { getMyStats, getRanking } from './service.js';

export interface StatsRouteOptions {
  db: Db;
  config: RecordsConfig;
  requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

export async function statsRoutes(app: FastifyInstance, { db, config, requireAuth }: StatsRouteOptions): Promise<void> {
  /** 내 전적: 게임별 누적, 합계, 최근 판 */
  app.get('/api/stats/me', { preHandler: requireAuth }, async (request) => getMyStats(db, request.auth!.userId, config));

  /** 칩 랭킹 (상위 N명 + 그 밖이면 내 순위) */
  app.get('/api/ranking', { preHandler: requireAuth }, async (request) => getRanking(db, request.auth!.userId, config.rankingSize));
}
