import { describe, expect, it, vi } from 'vitest';
import { normalizeBotJson } from '../src/workflows/validation.js';

function makeRequestStub() {
  return vi.fn().mockImplementation(async (path: string) => {
    if (path === '/v3/packages/package/list') {
      return {
        list: [
          { name: 'Comment', label: 'Comment', packageVersion: '2.17.0' },
        ],
      };
    }

    if (path === '/v3/packages/versions/details') {
      return {
        list: [
          {
            package: {
              name: 'Comment',
              label: 'Comment',
              packageVersion: '2.17.0',
              settingsAttributes: [
                {
                  name: 'retryCount',
                  label: 'Retry count',
                  type: 'NUMBER',
                  rules: [{ name: 'NOT_EMPTY' }],
                },
                {
                  name: 'mode',
                  label: 'Mode',
                  type: 'STRING',
                  rules: [],
                },
              ],
              commands: [
                {
                  name: 'Comment',
                  label: 'Comment',
                  returnType: 'UNDEFINED',
                  returns: [],
                  attributes: [
                    {
                      name: 'anchorData',
                      label: 'Anchor data',
                      type: 'ANCHOR',
                      rules: [],
                    },
                    {
                      name: 'level',
                      label: 'Level',
                      type: 'STRING',
                      rules: [],
                    },
                    {
                      name: 'comment',
                      label: 'Comment',
                      type: 'STRING',
                      rules: [{ name: 'NOT_EMPTY' }],
                    },
                    {
                      name: 'varRef',
                      label: 'Variable reference',
                      type: 'VARIABLE',
                      rules: [],
                    },
                    {
                      name: 'iteratorRef',
                      label: 'Iterator reference',
                      type: 'ITERATOR',
                      rules: [],
                    },
                    {
                      name: 'conditionalRef',
                      label: 'Conditional reference',
                      type: 'CONDITIONAL',
                      rules: [],
                    },
                    {
                      name: 'automationRef',
                      label: 'Automation reference',
                      type: 'AUTOMATION',
                      rules: [],
                    },
                  ],
                },
              ],
              iterators: [
                {
                  name: 'EachRow',
                  label: 'Each row',
                  attributes: [],
                  returns: [],
                },
              ],
              conditionals: [
                {
                  name: 'Equals',
                  label: 'Equals',
                  attributes: [],
                  returns: [],
                },
              ],
              triggers: [],
              exceptions: [],
            },
          },
        ],
      };
    }

    throw new Error(`Unexpected path: ${path}`);
  });
}

describe('normalize bot json', () => {
  it('canonicalizes package names, command names, attribute names, returns, and package versions', async () => {
    const request = makeRequestStub();

    const result = await normalizeBotJson(request, {
      nodes: [
        {
          uid: '1',
          packageName: 'comment',
          commandName: 'comment',
          disabled: false,
          attributes: [
            {
              name: 'Comment',
              value: { type: 'STRING', string: 'Hello' },
            },
            {
              name: 'anchordata',
              value: {
                type: 'DICTIONARY',
                dictionary: [
                  {
                    key: 'types',
                    value: {
                      type: 'DICTIONARY',
                      dictionary: [{ key: 'city', value: { type: 'STRING', string: 'STRING' } }],
                    },
                  },
                  {
                    key: 'name',
                    value: { type: 'STRING', string: 'AddressAlias' },
                  },
                  {
                    key: 'options',
                    value: {
                      type: 'DICTIONARY',
                      dictionary: [{ key: 'city', value: { type: 'BOOLEAN', boolean: true } }],
                    },
                  },
                ],
              },
            },
            {
              name: 'LEVEL',
              value: { type: 'STRING', string: 'INFO' },
            },
            {
              name: 'VARREF',
              value: { type: 'VARIABLE', variableName: 'messagevar' },
            },
            {
              name: 'iteratorref',
              value: { type: 'ITERATOR', iteratorName: 'eachrow', packageName: 'comment' },
            },
            {
              name: 'conditionalref',
              value: {
                type: 'CONDITIONAL',
                conditionalName: 'equals',
                packageName: 'comment',
              },
            },
            {
              name: 'automationref',
              value: {
                type: 'AUTOMATION',
                automation: {
                  filePath: { type: 'FILE', string: 'repository://private/path/bot' },
                  inputVariables: [
                    {
                      name: 'message',
                      value: { type: 'VARIABLE', variableName: 'messagevar' },
                    },
                  ],
                },
              },
            },
          ],
          returnTo: {
            type: 'VARIABLE',
            variableName: 'message',
          },
        },
      ],
      variables: [
        {
          name: 'MessageVar',
          description: '',
          type: 'STRING',
          readOnly: false,
          input: false,
          output: false,
          defaultValue: { type: 'VARIABLE', variableName: 'messagevar' },
        },
      ],
      packages: [
        {
          name: 'comment',
          version: '',
          settingsAttributes: [
            {
              name: 'MODE',
              value: { type: 'STRING', string: 'SAFE' },
            },
            {
              name: 'retrycount',
              value: { type: 'NUMBER', number: '3' },
            },
          ],
        },
        {
          name: 'Unused',
          version: '1.0.0',
          settingsAttributes: [],
        },
      ],
      properties: {
        botCodeVersion: '5',
      },
    });

    expect(result.changed).toBe(true);
    expect(result.botJson.packages).toEqual([
      {
        name: 'Comment',
        version: '2.17.0',
        settingsAttributes: [
          {
            name: 'retryCount',
            value: { type: 'NUMBER', number: '3' },
          },
          {
            name: 'mode',
            value: { type: 'STRING', string: 'SAFE' },
          },
        ],
      },
    ]);

    const firstNode = (result.botJson.nodes as Array<Record<string, unknown>>)[0];
    expect(firstNode?.packageName).toBe('Comment');
    expect(firstNode?.commandName).toBe('Comment');
    expect(firstNode?.returnTo).toBeUndefined();
    expect((firstNode?.attributes as Array<Record<string, unknown>>).map((item) => item.name)).toEqual([
      'anchorData',
      'level',
      'comment',
      'varRef',
      'iteratorRef',
      'conditionalRef',
      'automationRef',
    ]);
    expect(
      (((firstNode?.attributes as Array<Record<string, unknown>>)[0]?.value as Record<string, unknown>)
        .dictionary as Array<Record<string, unknown>>).map((item) => item.key),
    ).toEqual(['name', 'options', 'types']);
    expect(((firstNode?.attributes as Array<Record<string, unknown>>)[3]?.value as Record<string, unknown>).variableName).toBe('MessageVar');
    expect(((firstNode?.attributes as Array<Record<string, unknown>>)[4]?.value as Record<string, unknown>).iteratorName).toBe('EachRow');
    expect(((firstNode?.attributes as Array<Record<string, unknown>>)[4]?.value as Record<string, unknown>).packageName).toBe('Comment');
    expect(((firstNode?.attributes as Array<Record<string, unknown>>)[5]?.value as Record<string, unknown>).conditionalName).toBe('Equals');
    expect(
      ((((firstNode?.attributes as Array<Record<string, unknown>>)[6]?.value as Record<string, unknown>)
        .automation as Record<string, unknown>).inputVariables as Array<Record<string, unknown>>)[0]?.value as Record<string, unknown>,
    ).toEqual({
      type: 'VARIABLE',
      variableName: 'MessageVar',
    });
    expect(
      ((result.botJson.variables as Array<Record<string, unknown>>)[0]?.defaultValue as Record<string, unknown>).variableName,
    ).toBe('MessageVar');
    expect(result.resolvedPackages).toEqual([
      {
        packageName: 'Comment',
        packageVersion: '2.17.0',
        commandCount: 1,
      },
    ]);
  });
});
