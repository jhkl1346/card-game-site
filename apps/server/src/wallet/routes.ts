import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AuthError } from '../auth/service.js';
import type { ReliefChipConfig } from '../config/auth.js';
import { WalletError, type WalletService } from './service.js';

export interface WalletRouteOptions {
  wallet: WalletService;
  relief: ReliefChipConfig;
  requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  /** 지금 이 사람이 테이블에 가지고 있는 칩 (방 관리자에서) */
  tableChipsOf(userId: string): number;
}

export async function walletRoutes(app: FastifyInstance, options: WalletRouteOptions): Promise<void> {
  const { wallet, relief, requireAuth } = options;

  /** 내 칩: 지갑 잔액, 테이블 칩, 구제 칩을 받을 수 있는지 (버튼 표시용. 실제 지급 때 서버가 다시 확인한다) */
  app.get('/api/wallet', { preHandler: requireAuth }, async (request) => {
    const userId = request.auth!.userId;
    const balance = await wallet.getBalance(userId);
    const tableChips = options.tableChipsOf(userId);
    return {
      balance,
      tableChips,
      canClaimRelief: balance === relief.requiredBalance && tableChips === 0,
      reliefAmount: relief.amount,
    };
  });

  /** 구제 칩 받기: 잔액이 정확히 0이고 테이블 칩도 없을 때만. 횟수 제한 없음 */
  app.post('/api/wallet/relief', { preHandler: requireAuth }, async (request) => {
    const userId = request.auth!.userId;
    try {
      const amount = await wallet.claimRelief(userId, options.tableChipsOf(userId), relief);
      return { amount, balance: await wallet.getBalance(userId) };
    } catch (error) {
      if (error instanceof WalletError) throw new AuthError(409, error.message);
      throw error;
    }
  });
}
