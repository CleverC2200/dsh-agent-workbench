import { useSyncExternalStore } from 'react';
import { configuredQueryIdentity, subscribeQueryIdentity } from './query-cache';

export const useQueryIdentity = () =>
  useSyncExternalStore(subscribeQueryIdentity, configuredQueryIdentity, configuredQueryIdentity);
