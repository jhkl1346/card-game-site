/**
 * 닉네임 금칙어. 욕설과 운영자 사칭 단어를 막는다.
 * 비교 전에 소문자로 바꾸고 한글·영문·숫자 외 문자를 지워서 "시_발", "F.U.C.K" 같은 우회를 줄인다.
 * 목록을 늘릴 때는 소문자, 공백 없이 적는다.
 */
/** 욕설·비하 (닉네임에서만 금지. 채팅은 지인끼리 쓰는 용도라 거르지 않는다) */
export const PROFANITY: readonly string[] = [
  '시발',
  '씨발',
  'ㅅㅂ',
  'ㅆㅂ',
  '병신',
  'ㅂㅅ',
  '개새끼',
  '개새',
  '새끼',
  '좆',
  '존나',
  '졸라',
  '지랄',
  '미친놈',
  '미친년',
  '닥쳐',
  '꺼져',
  '애미',
  '느금',
  '썅',
  'fuck',
  'shit',
  'bitch',
  'asshole',
];

/** 운영자 사칭 (닉네임에서만 금지) */
const IMPERSONATION: readonly string[] = [
  '운영자',
  '관리자',
  '운영진',
  'admin',
  'operator',
];

export const BANNED_WORDS: readonly string[] = [...PROFANITY, ...IMPERSONATION];

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^가-힣ㄱ-ㅎㅏ-ㅣa-z0-9]/g, '');
}

export function containsBannedWord(text: string): boolean {
  const normalized = normalize(text);
  return BANNED_WORDS.some((word) => normalized.includes(word));
}
