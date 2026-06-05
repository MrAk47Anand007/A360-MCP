import { type PersistedConfig } from '../config.js';

export function createSecureStorage() {
  return {
    async saveToken(config: PersistedConfig, token: string) {
      return {
        ...config,
        A360_ACCESS_TOKEN: token,
      };
    },
    async clearToken(config: PersistedConfig) {
      const next = { ...config };
      delete next.A360_ACCESS_TOKEN;
      return next;
    },
  };
}
