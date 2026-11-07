import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function AuthLayout() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen name="phone" options={{ title: t('app.name') }} />
      <Stack.Screen name="otp" options={{ title: t('auth.otpTitle') }} />
    </Stack>
  );
}
