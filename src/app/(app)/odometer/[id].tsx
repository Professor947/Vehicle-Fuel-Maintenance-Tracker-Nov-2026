import { useLocalSearchParams } from 'expo-router';

import { OdometerForm } from '@/ui/forms/OdometerForm';

export default function EditOdometer() {
  const { id, vehicleId } = useLocalSearchParams<{ id: string; vehicleId: string }>();
  return <OdometerForm vehicleId={vehicleId} id={id} />;
}
