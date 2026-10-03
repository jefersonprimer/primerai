import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const noopSubscribe = () => () => {};

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web.
 * useSyncExternalStore evita o setState-dentro-de-effect que a regra react-hooks proíbe.
 */
export function useColorScheme() {
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const colorScheme = useRNColorScheme();

  if (hydrated) {
    return colorScheme;
  }

  return 'light';
}