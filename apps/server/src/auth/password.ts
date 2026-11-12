import { hash, verify } from '@node-rs/argon2';
import type { AuthConfig } from '../config/auth.js';

/** @node-rs/argon2의 Algorithm.Argon2id 값 (const enum이라 직접 가져올 수 없어 숫자로 적는다) */
const ARGON2ID = 2;

/**
 * 비밀번호는 argon2id 해시로만 저장한다. 평문은 이 함수 밖으로 넘기거나 로그로 남기지 않는다.
 * 해시 문자열에 알고리즘·비용·솔트가 함께 들어 있어 나중에 비용을 바꿔도 기존 해시를 검증할 수 있다.
 */
export function hashPassword(password: string, config: Pick<AuthConfig, 'argon2'>): Promise<string> {
  return hash(password, { algorithm: ARGON2ID, ...config.argon2 });
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  if (!passwordHash) return false; // 탈퇴한 계정
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

const dummyHashes = new Map<string, Promise<string>>();

/**
 * 없는 아이디로 로그인할 때도 같은 시간만큼 해시 검증을 해서, 응답 시간으로 아이디 존재 여부가 드러나지 않게 한다.
 */
export async function verifyDummy(password: string, config: Pick<AuthConfig, 'argon2'>): Promise<false> {
  const key = JSON.stringify(config.argon2);
  let dummy = dummyHashes.get(key);
  if (!dummy) {
    dummy = hashPassword('dummy-password-for-timing-1', config);
    dummyHashes.set(key, dummy);
  }
  await verifyPassword(await dummy, password);
  return false;
}
