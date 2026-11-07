import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme, View } from 'react-native';
import { MD3DarkTheme, MD3LightTheme, PaperProvider, Text } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import migrations from '../../drizzle/migrations';
import { db, drizzleDb } from '@/db/client';
import { applyDirection, detectLanguage, initI18n } from '@/i18n';
import { useApp } from '@/state/app';
import { useSession } from '@/state/session';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { success, error } = useMigrations(drizzleDb, migrations);
  const scheme = useColorScheme();
  const user = useSession((s) => s.user);
  const language = useApp((s) => s.language);
  const ready = useApp((s) => s.hydrated);

  useEffect(() => {
    if (!success) return;
    useSession.getState().hydrate(db);
    useApp.getState().hydrate(db, detectLanguage());
    const lang = useApp.getState().language;
    initI18n(lang);
    applyDirection(lang);
    void SplashScreen.hideAsync();
  }, [success]);

  useEffect(() => {
    if (ready) initI18n(language);
  }, [ready, language]);

  if (error) {
    void SplashScreen.hideAsync();
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Text>Database migration failed: {error.message}</Text>
      </View>
    );
  }
  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <PaperProvider
        theme={scheme === 'dark' ? MD3DarkTheme : MD3LightTheme}
        settings={{ icon: (props) => <MaterialCommunityIcons {...(props as object)} name={props.name as never} /> }}
      >
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={!!user}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
          <Stack.Protected guard={!user}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
        </Stack>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
