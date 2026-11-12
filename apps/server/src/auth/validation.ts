import { z } from 'zod';
import { containsBannedWord } from './banned-words.js';

/** 아이디: 영문 소문자/숫자 4~20자 */
export const usernameSchema = z
  .string({ error: '아이디를 입력해 주세요.' })
  .regex(/^[a-z0-9]{4,20}$/, '아이디는 영문 소문자와 숫자 4~20자로 입력해 주세요.');

/** 비밀번호: 8자 이상, 영문과 숫자 포함 (너무 긴 입력은 해시 비용 때문에 128자로 제한) */
export const passwordSchema = z
  .string({ error: '비밀번호를 입력해 주세요.' })
  .min(8, '비밀번호는 8자 이상이어야 합니다.')
  .max(128, '비밀번호는 128자 이하로 입력해 주세요.')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), '비밀번호에는 영문과 숫자가 모두 들어가야 합니다.');

/** 닉네임: 앞뒤 공백 제거 후 2~12자, 한글·영문·숫자·밑줄만, 금칙어 불가 */
export const nicknameSchema = z
  .string({ error: '닉네임을 입력해 주세요.' })
  .trim()
  .refine((v) => {
    const length = Array.from(v).length;
    return length >= 2 && length <= 12;
  }, '닉네임은 2~12자로 입력해 주세요.')
  .refine((v) => /^[가-힣a-zA-Z0-9_]+$/.test(v), '닉네임에는 한글, 영문, 숫자, 밑줄(_)만 쓸 수 있습니다.')
  .refine((v) => !containsBannedWord(v), '사용할 수 없는 단어가 들어 있습니다.');

export const signupSchema = z
  .object({
    username: usernameSchema,
    password: passwordSchema,
    passwordConfirm: z.string({ error: '비밀번호 확인을 입력해 주세요.' }),
    nickname: nicknameSchema,
    remember: z.boolean().optional(),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    message: '비밀번호 확인이 일치하지 않습니다.',
    path: ['passwordConfirm'],
  });

/** 로그인은 형식 검사를 느슨하게 한다 (형식 오류로 아이디 존재 여부를 흘리지 않도록 같은 실패 메시지를 쓴다) */
export const loginSchema = z.object({
  username: z.string().max(100),
  password: z.string().max(200),
  remember: z.boolean().optional(),
});

export const changeNicknameSchema = z.object({ nickname: nicknameSchema });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string({ error: '현재 비밀번호를 입력해 주세요.' }).max(200),
    newPassword: passwordSchema,
    newPasswordConfirm: z.string({ error: '새 비밀번호 확인을 입력해 주세요.' }),
  })
  .refine((v) => v.newPassword === v.newPasswordConfirm, {
    message: '새 비밀번호 확인이 일치하지 않습니다.',
    path: ['newPasswordConfirm'],
  });

export const deleteAccountSchema = z.object({
  password: z.string({ error: '비밀번호를 입력해 주세요.' }).max(200),
});
