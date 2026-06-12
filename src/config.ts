import { homedir, platform } from 'node:os';
import { join } from 'node:path';

export type A360AuthMode = 'password' | 'apikey' | 'token';

export type PersistedConfig = {
  A360_BASE_URL?: string;
  A360_AUTH_MODE?: A360AuthMode;
  A360_USERNAME?: string;
  A360_DEFAULT_FOLDER_ID?: string;
  A360_ACCESS_TOKEN?: string;
};

export type AppConfig = {
  baseUrl: string;
  authMode: A360AuthMode;
  username?: string;
  password?: string;
  apiKey?: string;
  defaultFolderId?: string;
  accessToken?: string;
  configPath: string;
};

export function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '');
}

export function resolveDefaultConfigPath() {
  if (platform() === 'win32') {
    const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
    return join(appData, 'a360-mcp', 'config.json');
  }

  return join(homedir(), '.config', 'a360-mcp', 'config.json');
}

export function buildConfig(
  persisted: PersistedConfig,
  env: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const baseUrl = normalizeBaseUrl(
    env.A360_BASE_URL ?? persisted.A360_BASE_URL ?? 'https://community.cloud.automationanywhere.digital',
  );
  const authMode = (env.A360_AUTH_MODE ?? persisted.A360_AUTH_MODE ?? 'password') as A360AuthMode;

  return {
    baseUrl,
    authMode,
    username: env.A360_USERNAME ?? persisted.A360_USERNAME,
    password: env.A360_PASSWORD,
    apiKey: env.A360_API_KEY,
    defaultFolderId: env.A360_DEFAULT_FOLDER_ID ?? persisted.A360_DEFAULT_FOLDER_ID,
    accessToken: env.A360_ACCESS_TOKEN ?? persisted.A360_ACCESS_TOKEN,
    configPath: env.A360_CONFIG_PATH ?? resolveDefaultConfigPath(),
  };
}
