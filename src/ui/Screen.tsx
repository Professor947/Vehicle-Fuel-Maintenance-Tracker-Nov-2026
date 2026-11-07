import type { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView } from 'react-native';
import { useTheme } from 'react-native-paper';

export function Screen({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.colors.background }} behavior="height">
      <ScrollView contentContainerStyle={{ padding: 16, gap: 4, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
