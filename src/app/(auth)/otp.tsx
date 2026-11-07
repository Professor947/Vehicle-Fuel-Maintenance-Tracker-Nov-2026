import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';

import { db } from '@/db/client';
import { sendOtp, verifyOtp } from '@/services/auth';
import { onSignedIn } from '@/state/session';
import { Screen } from '@/ui/Screen';

const RESEND_SECONDS = 60;

export default function OtpScreen() {
  const { t } = useTranslation();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const verify = async (value = code) => {
    setBusy(true);
    setError(null);
    const r = await verifyOtp(phone, value);
    setBusy(false);
    if ('error' in r) {
      setError(typeof r.error === 'string' ? t(`errors.${r.error}`) : t('errors.generic', { message: r.error.message }));
      return;
    }
    onSignedIn(db, { id: r.userId, phone: r.phone });
  };

  const resend = async () => {
    setWait(RESEND_SECONDS);
    const r = await sendOtp(phone);
    if ('error' in r && typeof r.error !== 'string') setError(t('errors.generic', { message: r.error.message }));
  };

  return (
    <Screen>
      <Text variant="bodyLarge" style={{ marginBottom: 16 }}>
        {t('auth.otpSentTo', { phone })}
      </Text>
      <TextInput
        mode="outlined"
        label={t('auth.otpLabel')}
        value={code}
        onChangeText={(v) => {
          const digits = v.replace(/\D/g, '').slice(0, 6);
          setCode(digits);
          if (digits.length === 6) void verify(digits);
        }}
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        style={{ writingDirection: 'ltr', letterSpacing: 8 }}
        maxLength={6}
      />
      <HelperText type="error" visible={!!error}>
        {error}
      </HelperText>
      <Button mode="contained" onPress={() => void verify()} loading={busy} disabled={busy}>
        {t('auth.verify')}
      </Button>
      <Button mode="text" onPress={() => void resend()} disabled={wait > 0} style={{ marginTop: 8 }}>
        {wait > 0 ? t('auth.resendIn', { seconds: wait }) : t('auth.resend')}
      </Button>
      <Button mode="text" onPress={() => router.back()}>
        {t('auth.changeNumber')}
      </Button>
    </Screen>
  );
}
