import { describe, expect, it } from 'vitest';
import { buildDependenciesFromConfig, createServer } from '../src/server.js';

describe('server module', () => {
  it('exports a createServer function', () => {
    expect(typeof createServer).toBe('function');
  });

  it('builds dependencies from config', () => {
    const deps = buildDependenciesFromConfig({
      baseUrl: 'https://community.cloud.automationanywhere.digital',
      authMode: 'token',
      accessToken: 'token',
      configPath: 'test-config.json',
    });

    expect(typeof deps.repositoryApi.listFolderItems).toBe('function');
    expect(typeof deps.repositoryApi.listFolderChildren).toBe('function');
    expect(typeof deps.operationsApi.listActivity).toBe('function');
    expect(typeof deps.workflowApi.listAvailablePackages).toBe('function');
    expect(typeof deps.workflowApi.getPackageCommandSchema).toBe('function');
  });
});
