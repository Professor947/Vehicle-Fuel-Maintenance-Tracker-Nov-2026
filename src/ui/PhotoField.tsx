import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { capturePhoto } from '@/services/photos';
import { supabase } from '@/services/supabase';
import { signedPhotoUrl } from '@/services/supabaseRemote';

interface Props {
  label: string;
  localUri: string | null;
  remotePath?: string | null;
  onChange(uri: string | null): void;
}

/** Shows the on-device photo, or the synced copy via a signed URL; take / choose / remove. */
export function PhotoField({ label, localUri, remotePath, onChange }: Props) {
  const { t } = useTranslation();
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!localUri && remotePath) void signedPhotoUrl(supabase, remotePath).then((u) => alive && setRemoteUrl(u));
    return () => {
      alive = false;
    };
  }, [localUri, remotePath]);

  const uri = localUri ?? remoteUrl;
  const take = async (src: 'camera' | 'library') => {
    const u = await capturePhoto(src);
    if (u) onChange(u);
  };

  return (
    <View style={{ marginBottom: 12, gap: 8 }}>
      <Text variant="labelMedium">{label}</Text>
      {uri ? <Image source={{ uri }} style={{ width: '100%', height: 180, borderRadius: 8 }} resizeMode="cover" /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button mode="outlined" icon="camera" onPress={() => void take('camera')}>
          {t('common.takePhoto')}
        </Button>
        <Button mode="text" icon="image" onPress={() => void take('library')}>
          {t('common.choosePhoto')}
        </Button>
        {uri || remotePath ? (
          <Button mode="text" icon="delete" onPress={() => onChange(null)}>
            {t('common.removePhoto')}
          </Button>
        ) : null}
      </View>
    </View>
  );
}
