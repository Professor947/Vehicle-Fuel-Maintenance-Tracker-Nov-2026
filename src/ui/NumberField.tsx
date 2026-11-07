import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { HelperText, TextInput } from 'react-native-paper';

interface Props {
  label: string;
  value: string;
  onChangeText(v: string): void;
  error?: string;
  integer?: boolean;
  hint?: string;
  testID?: string;
  autoFocus?: boolean;
}

/** Numeric input; `error` is an i18n key under errors.*. Digits stay LTR even in Urdu. */
export function NumberField({ label, value, onChangeText, error, integer, hint, testID, autoFocus }: Props) {
  const { t } = useTranslation();
  return (
    <View>
      <TextInput
        mode="outlined"
        label={label}
        value={value}
        onChangeText={onChangeText}
        keyboardType={integer ? 'number-pad' : 'decimal-pad'}
        error={!!error}
        testID={testID}
        autoFocus={autoFocus}
        style={{ writingDirection: 'ltr' }}
      />
      <HelperText type={error ? 'error' : 'info'} visible={!!error || !!hint}>
        {error ? t(`errors.${error}`) : hint}
      </HelperText>
    </View>
  );
}
