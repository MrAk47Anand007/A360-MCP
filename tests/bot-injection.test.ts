import { describe, expect, it, vi } from 'vitest';
import { insertRecorderSteps, patchStepTarget } from '../src/workflows/bot-injection.js';

const EXISTING_CONTENT = {
  triggers: [],
  nodes: [
    {
      uid: 'existing-1',
      packageName: 'MessageBox',
      commandName: 'messageBox',
      disabled: false,
      attributes: [
        { name: 'message', value: { type: 'STRING', string: 'hello' } },
      ],
    },
  ],
  variables: [],
  packages: [{ name: 'MessageBox', version: '1.0.0', settingsAttributes: [] }],
  properties: {
    botCodeVersion: '5',
    improvedNumberSupport: true,
    timeout: '0s',
    automationPriority: 'PRIORITY_MEDIUM',
    runInChildWindow: false,
    runInChildWindowMode: 'DESKTOP',
  },
  workItemTemplateName: null,
};

const RECORDER_NODE = {
  uid: 'rec-1',
  packageName: 'Recorder',
  commandName: 'Capture',
  disabled: false,
  attributes: [
    {
      name: 'objectProps',
      value: {
        type: 'UIOBJECT',
        uiObject: {
          capture: { securelyRecorded: true },
          criteria: {
            title: { enabled: true, value: { type: 'STRING', string: 'Login' } },
          },
        },
      },
    },
    { name: 'action', value: { type: 'STRING', string: 'CLICK' } },
  ],
};

function fakeApi(content: Record<string, unknown> = EXISTING_CONTENT) {
  return {
    getFileContent: vi.fn().mockResolvedValue(structuredClone(content)),
    getFileDependencies: vi.fn().mockResolvedValue({ dependencies: [] }),
    updateFileContent: vi.fn().mockResolvedValue({ ok: true }),
    updateFileDependencies: vi.fn().mockResolvedValue('OK'),
  };
}

describe('insertRecorderSteps', () => {
  it('appends nodes, adds the Recorder package, and saves via the bundle flow', async () => {
    const api = fakeApi();

    const result = await insertRecorderSteps(api, {
      fileId: '42',
      nodes: [RECORDER_NODE],
      recorderPackage: { name: 'Recorder', version: '2.5.0' },
    });

    expect(api.getFileContent).toHaveBeenCalledWith('42');
    expect(api.updateFileContent).toHaveBeenCalledTimes(1);

    const saved = api.updateFileContent.mock.calls[0][1] as Record<string, any>;
    expect(saved.nodes).toHaveLength(2);
    expect(saved.nodes[1].uid).toBe('rec-1');
    expect(saved.packages.map((p: any) => p.name)).toContain('Recorder');
    expect(result.insertedUids).toEqual(['rec-1']);
  });

  it('inserts after a given node uid', async () => {
    const api = fakeApi();

    await insertRecorderSteps(api, {
      fileId: '42',
      nodes: [RECORDER_NODE],
      afterUid: 'existing-1',
      recorderPackage: { name: 'Recorder', version: '2.5.0' },
    });

    const saved = api.updateFileContent.mock.calls[0][1] as Record<string, any>;
    expect(saved.nodes.map((n: any) => n.uid)).toEqual(['existing-1', 'rec-1']);
  });

  it('fails when afterUid does not exist', async () => {
    const api = fakeApi();

    await expect(
      insertRecorderSteps(api, {
        fileId: '42',
        nodes: [RECORDER_NODE],
        afterUid: 'missing',
        recorderPackage: { name: 'Recorder', version: '2.5.0' },
      }),
    ).rejects.toThrow(/afterUid "missing" not found/);
  });

  it('does not duplicate an existing Recorder package entry', async () => {
    const content = structuredClone(EXISTING_CONTENT) as Record<string, any>;
    content.packages.push({ name: 'Recorder', version: '2.4.0', settingsAttributes: [] });
    const api = fakeApi(content);

    await insertRecorderSteps(api, {
      fileId: '42',
      nodes: [RECORDER_NODE],
      recorderPackage: { name: 'Recorder', version: '2.5.0' },
    });

    const saved = api.updateFileContent.mock.calls[0][1] as Record<string, any>;
    const recorderEntries = saved.packages.filter((p: any) => p.name === 'Recorder');
    expect(recorderEntries).toHaveLength(1);
    expect(recorderEntries[0].version).toBe('2.4.0');
  });

  it('requires recorderPackage when the bot lacks a Recorder entry', async () => {
    const api = fakeApi();

    await expect(
      insertRecorderSteps(api, { fileId: '42', nodes: [RECORDER_NODE] }),
    ).rejects.toThrow(/recorderPackage/);
  });

  it('passes normalized content to saveBotBundle when normalizeContent hook is provided', async () => {
    const api = fakeApi();

    const normalizeContent = vi.fn(async (content: Record<string, unknown>) => ({
      ...content,
      normalizedMarker: true,
    }));

    await insertRecorderSteps(api, {
      fileId: '42',
      nodes: [RECORDER_NODE],
      recorderPackage: { name: 'Recorder', version: '2.5.0' },
      normalizeContent,
    });

    // The hook should have been called exactly once with the modified content (2 nodes)
    expect(normalizeContent).toHaveBeenCalledTimes(1);
    const hookArg = normalizeContent.mock.calls[0][0] as Record<string, any>;
    expect((hookArg.nodes as unknown[]).length).toBe(2);

    // The normalized content (with the extra marker key) should reach updateFileContent
    const savedContent = api.updateFileContent.mock.calls[0][1] as Record<string, any>;
    expect(savedContent.normalizedMarker).toBe(true);
  });
});

describe('patchStepTarget', () => {
  it('replaces the named attribute value on the target node and saves', async () => {
    const content = structuredClone(EXISTING_CONTENT) as Record<string, any>;
    content.nodes.push(structuredClone(RECORDER_NODE));
    const api = fakeApi(content);

    const newTarget = {
      type: 'UIOBJECT',
      uiObject: {
        capture: { securelyRecorded: true },
        criteria: {
          title: { enabled: true, value: { type: 'STRING', string: 'Submit' } },
        },
      },
    };

    await patchStepTarget(api, {
      fileId: '42',
      nodeUid: 'rec-1',
      attributeName: 'objectProps',
      value: newTarget,
    });

    const saved = api.updateFileContent.mock.calls[0][1] as Record<string, any>;
    const node = saved.nodes.find((n: any) => n.uid === 'rec-1');
    const attribute = node.attributes.find((a: any) => a.name === 'objectProps');
    const criteria = attribute.value.uiObject.criteria;
    expect(criteria[0].value.value.string).toBe('Submit');
  });

  it('fails when the node uid is missing', async () => {
    const api = fakeApi();

    await expect(
      patchStepTarget(api, {
        fileId: '42',
        nodeUid: 'missing',
        attributeName: 'objectProps',
        value: { type: 'UIOBJECT' },
      }),
    ).rejects.toThrow(/node uid "missing" not found/);
  });

  it('fails when the attribute is missing on the node', async () => {
    const api = fakeApi();

    await expect(
      patchStepTarget(api, {
        fileId: '42',
        nodeUid: 'existing-1',
        attributeName: 'objectProps',
        value: { type: 'UIOBJECT' },
      }),
    ).rejects.toThrow(/attribute "objectProps" not found/);
  });
});
