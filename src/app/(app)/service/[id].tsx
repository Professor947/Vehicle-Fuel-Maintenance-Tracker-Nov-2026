import { useLocalSearchParams } from 'expo-router';

import { ServiceForm } from '@/ui/forms/ServiceForm';

export default function EditService() {
  const { id, vehicleId } = useLocalSearchParams<{ id: string; vehicleId: string }>();
  return <ServiceForm vehicleId={vehicleId} id={id} />;
}
