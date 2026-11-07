import { Alert } from 'react-native';

import { i18n } from '@/i18n';

export function confirmDestructive(message: string, onConfirm: () => void) {
  Alert.alert('', message, [
    { text: i18n.t('common.cancel'), style: 'cancel' },
    { text: i18n.t('common.delete'), style: 'destructive', onPress: onConfirm },
  ]);
}
