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
    expect(typeof deps.workflowApi.saveBotBundle).toBe('function');
    expect(typeof deps.workflowApi.normalizeBotJson).toBe('function');
    expect(typeof deps.captureApi.recordWebActions).toBe('function');
    expect(typeof deps.captureApi.captureUiTarget).toBe('function');
    expect(typeof deps.captureApi.insertRecorderSteps).toBe('function');
    expect(typeof deps.captureApi.patchStepTarget).toBe('function');
  });

  it('registers all expected tools including capture tools', () => {
    const deps = buildDependenciesFromConfig({
      baseUrl: 'https://community.cloud.automationanywhere.digital',
      authMode: 'token',
      accessToken: 'token',
      configPath: 'test-config.json',
    });
    const server = createServer(deps);
    // @ts-expect-error accessing internal tool registry
    const registeredNames: string[] = Object.keys(server._registeredTools ?? {});

    const expectedCaptureTools = [
      'a360_record_web_actions',
      'a360_capture_ui_target',
      'a360_insert_recorder_step',
      'a360_patch_step_target',
    ];
    for (const name of expectedCaptureTools) {
      expect(registeredNames, `expected tool "${name}" to be registered`).toContain(name);
    }
  });
});
