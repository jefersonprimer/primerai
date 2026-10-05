import { Image } from 'expo-image';

type GoogleIconProps = {
  size?: number;
};

export function GoogleIcon({ size = 20 }: GoogleIconProps) {
  return (
    <Image
      accessibilityElementsHidden
      contentFit="contain"
      source={require('@/assets/images/google-icon.png')}
      style={{ width: size, height: size }}
    />
  );
}
