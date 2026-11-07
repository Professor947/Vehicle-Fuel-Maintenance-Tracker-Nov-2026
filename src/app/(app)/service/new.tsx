import { useLocalSearchParams } from 'expo-router';

import type { ServiceType } from '@/domain/types';
import { ServiceForm } from '@/ui/forms/ServiceForm';

export default function NewService() {
  const { vehicleId, type } = useLocalSearchParams<{ vehicleId: string; type?: ServiceType }>();
  return <ServiceForm vehicleId={vehicleId} initialType={type} />;
}
