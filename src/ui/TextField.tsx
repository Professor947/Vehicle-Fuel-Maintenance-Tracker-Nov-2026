import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { HelperText, TextInput } from 'react-native-paper';

interface Props {
  label: string;
  value: string;
  onChangeText(v: string): void;
  error?: string;
  hint?: string;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'characters' | 'words' | 'sentences';
}

export function TextField({ label, value, onChangeText, error, hint, multiline, autoCapitalize }: Props) {
  const { t } = useTranslation();
  return (
    <View>
      <TextInput
        mode="outlined"
        label={label}
        value={value}
        onChangeText={onChangeText}
        error={!!error}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
      />
      <HelperText type={error ? 'error' : 'info'} visible={!!error || !!hint}>
        {error ? t(`errors.${error}`) : hint}
      </HelperText>
    </View>
  );
}
