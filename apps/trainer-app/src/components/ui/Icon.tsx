import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, color, size = 20 }: { name: IconName; color: string; size?: number }) {
  return <Ionicons name={name} size={size} color={color} />;
}
