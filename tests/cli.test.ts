import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getBrowserOpenCommand, runInitCommand } from '../src/cli.js';

describe('package CLI shape', () => {
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
});
