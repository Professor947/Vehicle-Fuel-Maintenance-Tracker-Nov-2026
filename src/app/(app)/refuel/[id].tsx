import { useLocalSearchParams } from 'expo-router';

import { RefuelForm } from '@/ui/forms/RefuelForm';

export default function EditRefuel() {
  const { id, vehicleId } = useLocalSearchParams<{ id: string; vehicleId: string }>();
  return <RefuelForm vehicleId={vehicleId} id={id} />;
}
