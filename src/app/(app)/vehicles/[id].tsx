import { useLocalSearchParams } from 'expo-router';

import { VehicleForm } from '@/ui/forms/VehicleForm';

export default function EditVehicle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VehicleForm id={id} />;
}
