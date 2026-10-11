import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

export type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  name: IconName;
  color: string;
  size?: number;
  style?: ComponentProps<typeof Ionicons>['style'];
};

// Cross-platform icons (the prototype used iOS-only SF Symbols).
export function Icon({ name, color, size = 20, style }: Props) {
  return <Ionicons name={name} size={size} color={color} style={style} />;
}
