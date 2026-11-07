import { useLocalSearchParams } from 'expo-router';

import { OdometerForm } from '@/ui/forms/OdometerForm';

export default function NewOdometer() {
  const { vehicleId } = useLocalSearchParams<{ vehicleId: string }>();
  return <OdometerForm vehicleId={vehicleId} />;
}
