import { describe, expect, it, vi } from 'vitest';
import {
  normalizeDependencyIdsForSave,
  normalizeTaskBotContentForSave,
  saveBotBundle,
} from '../src/workflows/repository-save.js';

describe('repository save workflow', () => {
  it('fills taskbot defaults before save normalization', () => {
    const normalized = normalizeTaskBotContentForSave({
      nodes: [],
      properties: {
        botCodeVersion: '5',
      },
    });

    expect(normalized.triggers).toEqual([]);
    expect(normalized.variables).toEqual([]);
    expect(normalized.packages).toEqual([]);
    expect(normalized.properties.runInChildWindowMode).toBe('DESKTOP');
  });

  it('applies control-room-style value and layout normalization', () => {
    const normalized = normalizeTaskBotContentForSave({
      nodes: [
        {
          uid: 'n1',
          packageName: 'Browser',
          commandName: 'click',
          disabled: 0,
          layout: {
            x: 10.8,
            y: 20.2,
            width: 'bad',
          },
          attributes: [
            {
              name: 'image',
              value: {
                type: 'IMAGE',
                unsavedSecurelyRecorded: true,
              },
            },
            {
              name: 'target',
              value: {
                type: 'UIOBJECT',
                uiObject: {
                  capture: { securelyRecorded: true, extra: 'drop-me' },
                  criteria: {
                    title: {
                      enabled: true,
                      value: { type: 'STRING', string: 'Calculator' },
                    },
                    role: {
                      enabled: false,
                      securelyRecordedRemoveDisabled: true,
                      value: { type: 'STRING', string: 'Button' },
                    },
                  },
                },
              },
            },
          ],
        },
      ],
      variables: [
        {
          key: 'message',
          name: 'message',
          description: '',
          type: 'STRING',
          readOnly: false,
          input: false,
          output: false,
          defaultValue: { type: 'STRING', string: '' },
        },
      ],
      properties: {
        botCodeVersion: '5',
        timeout: '5',
      },
    });

    const firstNode = normalized.nodes[0] as Record<string, unknown>;
    const layout = firstNode.layout as Record<string, unknown>;
    const imageValue = (firstNode.attributes as Array<Record<string, unknown>>)[0]?.value as Record<
      string,
      unknown
    >;
    const uiObjectValue = (firstNode.attributes as Array<Record<string, unknown>>)[1]?.value as Record<
      string,
      unknown
    >;
    const uiObject = uiObjectValue.uiObject as Record<string, unknown>;
    const criteria = uiObject.criteria as Array<Record<string, unknown>>;

    expect(firstNode.disabled).toBe(false);
    expect(layout).toEqual({ x: 10, y: 20 });
    expect(imageValue).toEqual({
      type: 'IMAGE',
      securelyRecorded: true,
    });
    expect((uiObject.capture as Record<string, unknown>)).toEqual({
      securelyRecorded: true,
    });
    expect(criteria).toHaveLength(2);
    expect(criteria[0]).toEqual({
      key: 'title',
      value: {
        enabled: true,
        value: { type: 'STRING', string: 'Calculator' },
      },
    });
    expect(criteria[1]).toEqual({
      key: 'role',
      value: {
        enabled: false,
        value: { type: 'STRING', string: '' },
      },
    });
    expect(normalized.variables[0]).not.toHaveProperty('key');
    expect(normalized.properties.timeout).toBe('300s');
  });

  it('normalizes dependency ids from mixed payloads', () => {
    const childFileIds = normalizeDependencyIdsForSave(
      {
        childFileIds: ['1', '2'],
        dependencies: [{ id: '2' }, { id: 3 }, { id: null }],
      },
      '2',
    );

    expect(childFileIds).toEqual(['1', '3']);
  });

  it('saves normalized content and split dependencies in sequence', async () => {
    const repositoryApi = {
      updateFileContent: vi.fn().mockResolvedValue({ ok: true }),
      updateFileDependencies: vi.fn().mockResolvedValue('OK'),
    };

    const result = await saveBotBundle(repositoryApi, {
      fileId: '123',
      content: {
        nodes: [],
        properties: {
          botCodeVersion: '5',
        },
      },
      dependencies: {
        dependencies: [{ id: '123' }, { id: '456' }],
      },
      hasErrors: false,
    });

    expect(repositoryApi.updateFileContent).toHaveBeenCalledTimes(1);
    expect(repositoryApi.updateFileDependencies).toHaveBeenCalledWith('123', ['456']);
    expect(result.childFileIds).toEqual(['456']);
  });
});
