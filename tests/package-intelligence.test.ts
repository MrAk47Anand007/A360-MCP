import { describe, expect, it, vi } from 'vitest';
import {
  createPackageIntelligenceGateway,
  normalizePackageMetadata,
} from '../src/workflows/package-intelligence.js';

describe('package intelligence', () => {
  it('normalizes package metadata into reusable command objects', () => {
    const normalized = normalizePackageMetadata({
      name: 'Database',
      label: 'Database',
      packageVersion: '5.5.3',
      settingsAttributes: [
        {
          name: 'retryCount',
          label: 'Retry count',
          type: 'NUMBER',
          rules: [{ name: 'NOT_EMPTY' }],
        },
      ],
      commands: [
        {
          name: 'connect',
          label: 'Connect',
          description: 'Connect to a database',
          returnType: 'SESSION',
          returnSubtype: 'DATABASE',
          returnRequired: true,
          attributes: [
            {
              name: 'server',
              label: 'Server',
              type: 'TEXT',
              rules: [{ name: 'NOT_EMPTY' }],
            },
            {
              name: 'mode',
              label: 'Mode',
              type: 'SELECT',
              options: [{ label: 'Default', value: 'DEFAULT' }],
            },
          ],
          returns: [
            {
              name: 'session',
              label: 'Database session',
              type: 'SESSION',
              subtype: 'DATABASE',
              required: true,
            },
          ],
        },
      ],
      iterators: [],
      conditionals: [],
      triggers: [],
      exceptions: [],
    });

    expect(normalized.packageName).toBe('Database');
    expect(normalized.commandCount).toBe(1);
    expect(normalized.settingsAttributes[0]?.name).toBe('retryCount');
    expect(normalized.commands[0]?.requiredFields).toEqual(['server']);
    expect(normalized.commands[0]?.attributes[1]?.availableOptions).toEqual(['Default']);
    expect(normalized.commands[0]?.returns[0]?.type).toBe('SESSION');
  });

  it('memoizes repeated package detail resolution inside one gateway', async () => {
    const request = vi.fn().mockImplementation(async (path: string) => {
      if (path === '/v3/packages/package/list') {
        return {
          list: [
            {
              name: 'Database',
              label: 'Database',
              packageVersion: '5.5.3',
            },
          ],
        };
      }

      if (path === '/v3/packages/versions/details') {
        return {
          list: [
            {
              package: {
                name: 'Database',
                label: 'Database',
                packageVersion: '5.5.3',
                commands: [],
                iterators: [],
                conditionals: [],
                triggers: [],
                exceptions: [],
              },
            },
          ],
        };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    const gateway = createPackageIntelligenceGateway(request);
    const result = await gateway.resolvePackageMetadata([
      { name: 'Database' },
      { name: 'Database', version: '5.5.3' },
    ]);

    expect(result.resolvedCount).toBe(1);
    expect(request).toHaveBeenCalledWith('/v3/packages/package/list', expect.any(Object));
    expect(
      request.mock.calls.filter(([path]) => path === '/v3/packages/versions/details'),
    ).toHaveLength(1);
  });

  it('returns a specific normalized command schema', async () => {
    const request = vi.fn().mockImplementation(async (path: string) => {
      if (path === '/v3/packages/package/list') {
        return {
          list: [
            {
              name: 'LogToFile',
              label: 'Log To File',
              packageVersion: '3.8.0',
            },
          ],
        };
      }

      if (path === '/v3/packages/versions/details') {
        return {
          list: [
            {
              package: {
                name: 'LogToFile',
                label: 'Log To File',
                packageVersion: '3.8.0',
                commands: [
                  {
                    name: 'logToFile',
                    label: 'Log to file',
                    attributes: [
                      {
                        name: 'message',
                        label: 'Message',
                        type: 'TEXT',
                        rules: [{ name: 'NOT_EMPTY' }],
                      },
                    ],
                    returns: [],
                  },
                ],
                iterators: [],
                conditionals: [],
                triggers: [],
                exceptions: [],
              },
            },
          ],
        };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    const gateway = createPackageIntelligenceGateway(request);
    const command = await gateway.getPackageCommandSchema({
      packageName: 'LogToFile',
      commandName: 'logToFile',
    });

    expect(command?.packageName).toBe('LogToFile');
    expect(command?.requiredFields).toEqual(['message']);
  });
});
