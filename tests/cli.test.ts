import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nock from 'nock';
import { getBrowserOpenCommand, runInitCommand, runLoginCommand } from '../src/cli.js';

describe('package CLI shape', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    nock.cleanAll();
  });

  afterEach(() => {
    delete process.env.A360_ACCESS_TOKEN;
    delete process.env.A360_USERNAME;
    delete process.env.A360_PASSWORD;
    delete process.env.A360_API_KEY;
  });
  it('exposes the expected npm scripts', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(pkg.scripts.init).toBeTruthy();
    expect(pkg.scripts.doctor).toBeTruthy();
    expect(pkg.scripts.login).toBeTruthy();
    expect(pkg.scripts.whoami).toBeTruthy();
    expect(pkg.scripts.serve).toBeTruthy();
    expect(pkg.scripts.logout).toBeTruthy();
  });

  it('uses the Windows URL handler shape', () => {
    const command = getBrowserOpenCommand(
      'win32',
      'https://community.cloud.automationanywhere.digital/swagger/',
    );

    expect(command.command).toBe('rundll32.exe');
    expect(command.args).toEqual([
      'url.dll,FileProtocolHandler',
      'https://community.cloud.automationanywhere.digital/swagger/',
    ]);
  });

  it('writes onboarding values to package config storage', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'a360-mcp-cli-'));
    const configPath = join(dir, 'config.json');
    const answers = [
      'https://community.cloud.automationanywhere.digital',
      'password',
      'anand',
      'root-folder-id',
    ];

    await runInitCommand({
      configPath,
      prompt: async (_question, defaultValue) => answers.shift() ?? defaultValue ?? '',
    });

    const saved = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, string>;
    expect(saved.A360_BASE_URL).toBe('https://community.cloud.automationanywhere.digital');
    expect(saved.A360_AUTH_MODE).toBe('password');
    expect(saved.A360_USERNAME).toBe('anand');
    expect(saved.A360_DEFAULT_FOLDER_ID).toBe('root-folder-id');
  });

  it('prompts for missing password-mode credentials during login and saves the token', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'a360-mcp-login-'));
    const configPath = join(dir, 'config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        A360_BASE_URL: 'https://community.cloud.automationanywhere.digital',
        A360_AUTH_MODE: 'password',
      }),
      'utf8',
    );

    const answers = ['prompt-user', 'prompt-pass'];
    nock('https://community.cloud.automationanywhere.digital')
      .post('/v2/authentication', {
        username: 'prompt-user',
        password: 'prompt-pass',
        multipleLogin: true,
      })
      .reply(200, { token: 'captured-token' });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runLoginCommand({
      configPath,
      prompt: async (_question, defaultValue) => answers.shift() ?? defaultValue ?? '',
    });

    const saved = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, string>;
    expect(saved.A360_USERNAME).toBe('prompt-user');
    expect(saved.A360_ACCESS_TOKEN).toBe('captured-token');
    expect(logSpy).toHaveBeenCalledWith('A360 login successful.');
  });

  it('prompts for token in token auth mode when no persisted token exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'a360-mcp-token-login-'));
    const configPath = join(dir, 'config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        A360_BASE_URL: 'https://community.cloud.automationanywhere.digital',
        A360_AUTH_MODE: 'token',
      }),
      'utf8',
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runLoginCommand({
      configPath,
      prompt: async () => 'manual-token',
    });

    const saved = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, string>;
    expect(saved.A360_ACCESS_TOKEN).toBe('manual-token');
    expect(logSpy).toHaveBeenCalledWith('A360 login successful.');
  });
});
