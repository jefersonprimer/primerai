import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
}

export function Button({ label, onPress, variant = 'primary', disabled }: ButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && { backgroundColor: theme.text, borderColor: theme.text },
        variant === 'secondary' && { backgroundColor: 'transparent', borderColor: theme.textSecondary },
        variant === 'ghost' && { backgroundColor: 'transparent', borderColor: 'transparent' },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <ThemedText
        type="smallBold"
        themeColor={variant === 'primary' ? 'background' : 'text'}
        style={variant === 'primary' ? styles.onPrimary : undefined}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  onPrimary: {
    color: '#0d0f14',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
});