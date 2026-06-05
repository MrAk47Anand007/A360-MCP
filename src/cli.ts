import { readFile } from 'node:fs/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loginWithApiKey, loginWithPassword } from './a360/auth.js';
import { buildConfig } from './config.js';
import { readPersistedConfig, writePersistedConfig } from './setup/config-file.js';
import { formatDoctorReport } from './setup/doctor.js';
import { createSecureStorage } from './setup/secure-storage.js';
import { createServer } from './server.js';

type PromptFn = (question: string, defaultValue?: string) => Promise<string>;

function createPrompt(prompt: PromptFn = async (question, defaultValue) => {
  const readline = createInterface({ input, output });
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  const answer = await readline.question(`${question}${suffix}: `);
  readline.close();
  return answer.trim() || defaultValue || '';
}) {
  return prompt;
}

export function getBrowserOpenCommand(platformName: NodeJS.Platform, urlText: string) {
  if (platformName === 'win32') {
    return {
      command: 'rundll32.exe',
      args: ['url.dll,FileProtocolHandler', urlText],
    };
  }

  if (platformName === 'darwin') {
    return {
      command: 'open',
      args: [urlText],
    };
  }

  return {
    command: 'xdg-open',
    args: [urlText],
  };
}

export async function runInitCommand(options?: {
  configPath?: string;
  prompt?: PromptFn;
}) {
  const prompt = createPrompt(options?.prompt);
  const current = buildConfig({});
  const configPath = options?.configPath ?? current.configPath;
  const baseUrl = await prompt('Control Room base URL', current.baseUrl);
  const authMode = (await prompt('Auth mode (password, apikey, token)', current.authMode)) as
    | 'password'
    | 'apikey'
    | 'token';
  const username = await prompt('Username', current.username);
  const defaultFolderId = await prompt('Default folder id', current.defaultFolderId);

  await writePersistedConfig(configPath, {
    A360_BASE_URL: baseUrl,
    A360_AUTH_MODE: authMode,
    A360_USERNAME: username,
    A360_DEFAULT_FOLDER_ID: defaultFolderId,
  });

  console.log(`Saved A360 MCP config to ${configPath}`);
}

export async function runLoginCommand(options?: {
  configPath?: string;
}) {
  const configPath = options?.configPath ?? buildConfig({}).configPath;
  const persisted = await readPersistedConfig(configPath);
  const config = buildConfig(persisted);
  const username = process.env.A360_USERNAME ?? persisted.A360_USERNAME;

  if (!username && config.authMode !== 'token') {
    throw new Error('A360_USERNAME is required for password or apikey login.');
  }

  let token = process.env.A360_ACCESS_TOKEN ?? persisted.A360_ACCESS_TOKEN;
  if (!token) {
    if (config.authMode === 'apikey') {
      const apiKey = process.env.A360_API_KEY;
      if (!apiKey || !username) {
        throw new Error('A360_API_KEY and A360_USERNAME are required for apikey login.');
      }
      token = await loginWithApiKey(config.baseUrl, username, apiKey);
    } else if (config.authMode === 'password') {
      const password = process.env.A360_PASSWORD;
      if (!password || !username) {
        throw new Error('A360_PASSWORD and A360_USERNAME are required for password login.');
      }
      token = await loginWithPassword(config.baseUrl, username, password);
    } else {
      throw new Error('A360_ACCESS_TOKEN is required for token auth mode.');
    }
  }

  const storage = createSecureStorage();
  const saved = await storage.saveToken(persisted, token);
  await writePersistedConfig(configPath, saved);
  console.log('A360 login successful.');
}

export async function runWhoAmICommand(options?: { configPath?: string }) {
  const configPath = options?.configPath ?? buildConfig({}).configPath;
  const persisted = await readPersistedConfig(configPath);
  const config = buildConfig(persisted);
  console.log(
    JSON.stringify(
      {
        baseUrl: config.baseUrl,
        authMode: config.authMode,
        username: config.username ?? null,
        hasToken: Boolean(config.accessToken),
        defaultFolderId: config.defaultFolderId ?? null,
      },
      null,
      2,
    ),
  );
}

export async function runDoctorCommand(options?: { configPath?: string }) {
  const configPath = options?.configPath ?? buildConfig({}).configPath;
  const persisted = await readPersistedConfig(configPath);
  const config = buildConfig(persisted);
  const report = formatDoctorReport(
    Boolean(config.baseUrl && config.authMode),
    `baseUrl=${config.baseUrl}, authMode=${config.authMode}, hasToken=${Boolean(config.accessToken)}`,
  );
  console.log(report);
}

export async function runServeCommand() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export async function runLogoutCommand(options?: { configPath?: string }) {
  const configPath = options?.configPath ?? buildConfig({}).configPath;
  const persisted = await readPersistedConfig(configPath);
  const storage = createSecureStorage();
  const cleared = await storage.clearToken(persisted);
  await writePersistedConfig(configPath, cleared);
  console.log('A360 login removed.');
}

export async function readJsonFile(path: string) {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}
