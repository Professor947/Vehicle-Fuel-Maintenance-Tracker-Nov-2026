import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';

import { sendOtp } from '@/services/auth';
import { isSupabaseConfigured } from '@/services/supabase';
import { Screen } from '@/ui/Screen';

export default function PhoneScreen() {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const r = await sendOtp(phone);
    setBusy(false);
    if ('error' in r) {
      setError(typeof r.error === 'string' ? t(`errors.${r.error}`) : t('errors.generic', { message: r.error.message }));
      return;
    }
    router.push({ pathname: '/otp', params: { phone: r.phone } });
  };

  return (
    <Screen>
      <Text variant="headlineSmall" style={{ marginBottom: 16 }}>
        {t('auth.title')}
      </Text>
      {!isSupabaseConfigured ? <HelperText type="error">{t('auth.notConfigured')}</HelperText> : null}
      <TextInput
        mode="outlined"
        label={t('auth.phoneLabel')}
        placeholder={t('auth.phoneHint')}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        style={{ writingDirection: 'ltr' }}
        left={<TextInput.Affix text="🇵🇰" />}
      />
      <HelperText type="error" visible={!!error}>
        {error}
      </HelperText>
      <Button mode="contained" onPress={() => void submit()} loading={busy} disabled={busy || !isSupabaseConfigured}>
        {t('auth.sendCode')}
      </Button>
    </Screen>
  );
}
