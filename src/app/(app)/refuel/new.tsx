import { useLocalSearchParams } from 'expo-router';

import { RefuelForm } from '@/ui/forms/RefuelForm';

export default function NewRefuel() {
  const { vehicleId } = useLocalSearchParams<{ vehicleId: string }>();
  return <RefuelForm vehicleId={vehicleId} />;
}
