import { normalizePkMobile } from '@/domain/phone';

import { supabase } from './supabase';

export type AuthError = 'phone_invalid' | 'otp_invalid' | { message: string };

export async function sendOtp(rawPhone: string): Promise<{ phone: string } | { error: AuthError }> {
  const phone = normalizePkMobile(rawPhone);
  if (!phone) return { error: 'phone_invalid' };
  const { error } = await supabase.auth.signInWithOtp({ phone, options: { channel: 'sms' } });
  if (error) return { error: { message: error.message } };
  return { phone };
}

export async function verifyOtp(
  phone: string,
  code: string,
): Promise<{ userId: string; phone: string } | { error: AuthError }> {
  const token = code.replace(/\D/g, '');
  if (token.length !== 6) return { error: 'otp_invalid' };
  const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error || !data.user) return { error: { message: error?.message ?? 'No user returned' } };
  return { userId: data.user.id, phone };
}

export async function signOutRemote() {
  // Local sign-out works offline; the refresh token is revoked server-side when reachable.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
}
