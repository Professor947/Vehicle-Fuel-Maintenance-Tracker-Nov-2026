import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, ScrollView, View } from 'react-native';
import { ActivityIndicator, Button, Chip, Dialog, HelperText, IconButton, Portal, SegmentedButtons, Text, TextInput } from 'react-native-paper';

import { capturePhoto, deleteLocalPhoto } from '@/services/photos';

export interface ScanField {
  key: string;
  label: string;
  value: string;
  kind: 'text' | 'number' | 'choice';
  options?: { value: string; label: string }[];
  /** Other OCR readings the user can tap instead. */
  alternatives?: string[];
}

export interface ScanResult {
  fields: ScanField[];
  note?: string;
  warning?: string;
}

interface Props {
  label: string;
  icon: string;
  run(uri: string): Promise<ScanResult>;
  /** Called only after the user reviewed (and possibly edited) the values. */
  onConfirm(values: Record<string, string>, photoUri: string): void;
  /** Keep the photo after confirming (e.g. it becomes the vehicle/receipt photo). Otherwise it is deleted. */
  keepPhoto?: boolean;
}

/** Camera → OCR → editable confirm dialog. Cancel discards everything; nothing is saved here. */
export function ScanButton({ label, icon, run, onConfirm, keepPhoto }: Props) {
  const { t } = useTranslation();
  const [uri, setUri] = useState<string | null>(null);
  const [fields, setFields] = useState<ScanField[] | null>(null);
  const [meta, setMeta] = useState<{ note?: string; warning?: string }>({});

  const start = async (source: 'camera' | 'library') => {
    const photo = await capturePhoto(source);
    if (!photo) return;
    setUri(photo);
    setFields(null);
    setMeta({});
    const r = await run(photo).catch((): ScanResult => ({ fields: [] }));
    setFields(r.fields);
    setMeta({ note: r.note, warning: r.warning });
  };

  const close = (discardPhoto: boolean) => {
    if (discardPhoto && uri) deleteLocalPhoto(uri);
    setUri(null);
    setFields(null);
  };

  const setValue = (key: string, value: string) =>
    setFields((fs) => fs?.map((f) => (f.key === key ? { ...f, value } : f)) ?? null);

  const confirm = () => {
    if (!uri || !fields) return;
    onConfirm(Object.fromEntries(fields.map((f) => [f.key, f.value.trim()])), uri);
    close(!keepPhoto);
  };

  const found = fields?.some((f) => f.value.trim() !== '');

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Button mode="contained-tonal" icon={icon} onPress={() => void start('camera')} style={{ flex: 1 }}>
          {label}
        </Button>
        <IconButton icon="image" accessibilityLabel={t('scan.fromGallery')} onPress={() => void start('library')} />
      </View>
      <Portal>
        <Dialog visible={!!uri} onDismiss={() => close(true)}>
          <Dialog.Title>{t('scan.confirmTitle')}</Dialog.Title>
          <Dialog.ScrollArea style={{ maxHeight: 520, paddingHorizontal: 0 }}>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }} keyboardShouldPersistTaps="handled">
              {uri ? <Image source={{ uri }} style={{ width: '100%', height: 170, borderRadius: 8 }} resizeMode="contain" /> : null}
              {!fields ? (
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 16 }}>
                  <ActivityIndicator />
                  <Text>{t('scan.reading')}</Text>
                </View>
              ) : (
                <>
                  <Text variant="bodySmall">{found ? t('scan.confirmHint') : t('scan.nothingFound')}</Text>
                  {meta.note ? <Text variant="labelSmall">{meta.note}</Text> : null}
                  {fields.map((f) => (
                    <View key={f.key} style={{ gap: 4 }}>
                      {f.kind === 'choice' ? (
                        <>
                          <Text variant="labelMedium">{f.label}</Text>
                          <SegmentedButtons value={f.value} onValueChange={(v) => setValue(f.key, v)} buttons={f.options ?? []} />
                        </>
                      ) : (
                        <TextInput
                          mode="outlined"
                          dense
                          label={f.label}
                          value={f.value}
                          onChangeText={(v) => setValue(f.key, v)}
                          keyboardType={f.kind === 'number' ? 'decimal-pad' : 'default'}
                          autoCapitalize={f.kind === 'text' ? 'characters' : 'none'}
                          style={{ writingDirection: 'ltr' }}
                        />
                      )}
                      {f.alternatives?.length ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                          <Text variant="labelSmall">{t('scan.alternatives')}</Text>
                          {f.alternatives.map((a) => (
                            <Chip key={a} compact onPress={() => setValue(f.key, a)}>
                              {a}
                            </Chip>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ))}
                  {meta.warning ? <HelperText type="error">{meta.warning}</HelperText> : null}
                </>
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => close(true)}>{t('common.cancel')}</Button>
            <Button mode="contained" disabled={!fields} onPress={confirm}>
              {t('scan.useValues')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}
