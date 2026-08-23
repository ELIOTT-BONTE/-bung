/**
 * React view of the inference layer's load state.
 *
 * The download that matters here can take minutes, and it is usually not the
 * screen that started it that the user is looking at when it lands, so the
 * state lives in the inference module and every component just subscribes.
 */

import { useSyncExternalStore } from 'react';
import { getLoadState, subscribeToLoadProgress, type LoadState } from '../inference';

export function useModelStatus(): LoadState {
  return useSyncExternalStore(subscribeToLoadProgress, getLoadState, getLoadState);
}
