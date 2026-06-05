import { describe, expect, it } from 'vitest';
import { buildBotFromPlan } from '../src/workflows/builder.js';
import type { NormalizedPackageMetadata } from '../src/workflows/package-intelligence.js';
import type { PlannedBot } from '../src/workflows/plan-model.js';

const metadata: NormalizedPackageMetadata[] = [
  {
    packageName: 'Comment',
    packageLabel: 'Comment',
    packageVersion: '2.17.0',
    commandCount: 1,
    iteratorCount: 0,
    conditionalCount: 0,
    triggerCount: 0,
    exceptionCount: 0,
    commands: [
      {
        packageName: 'Comment',
        packageVersion: '2.17.0',
        name: 'Comment',
        label: 'Comment',
        nestable: false,
        branchable: false,
        returnType: 'UNDEFINED',
        returnSubtype: 'UNDEFINED',
        returnRequired: false,
        attributes: [
          {
            name: 'comment',
            label: 'Comment',
            type: 'STRING',
            required: true,
            hidden: false,
            readOnly: false,
            rules: ['NOT_EMPTY'],
            availableOptions: [],
            nestedAttributes: [],
          },
        ],
        requiredFields: ['comment'],
        returns: [],
      },
    ],
    iterators: [],
    conditionals: [],
    triggers: [],
    exceptions: [],
  },
  {
    packageName: 'LogToFile',
    packageLabel: 'Log To File',
    packageVersion: '3.11.1',
    commandCount: 1,
    iteratorCount: 0,
    conditionalCount: 0,
    triggerCount: 0,
    exceptionCount: 0,
    commands: [
      {
        packageName: 'LogToFile',
        packageVersion: '3.11.1',
        name: 'logToFile',
        label: 'Log to file',
        nestable: false,
        branchable: false,
        returnType: 'UNDEFINED',
        returnSubtype: 'UNDEFINED',
        returnRequired: false,
        attributes: [
          {
            name: 'filePath',
            label: 'File path',
            type: 'FILE',
            required: true,
            hidden: false,
            readOnly: false,
            rules: ['NOT_EMPTY'],
            availableOptions: [],
            nestedAttributes: [],
          },
          {
            name: 'logContent',
            label: 'Content',
            type: 'STRING',
            required: true,
            hidden: false,
            readOnly: false,
            rules: ['NOT_EMPTY'],
            availableOptions: [],
            nestedAttributes: [],
          },
        ],
        requiredFields: ['filePath', 'logContent'],
        returns: [],
      },
    ],
    iterators: [],
    conditionals: [],
    triggers: [],
    exceptions: [],
  },
  {
    packageName: 'ErrorHandler',
    packageLabel: 'ErrorHandler',
    packageVersion: '2.12.1',
    commandCount: 1,
    iteratorCount: 0,
    conditionalCount: 0,
    triggerCount: 0,
    exceptionCount: 0,
    commands: [
      {
        packageName: 'ErrorHandler',
        packageVersion: '2.12.1',
        name: 'try',
        label: 'Try',
        nestable: true,
        branchable: true,
        returnType: 'UNDEFINED',
        returnSubtype: 'UNDEFINED',
        returnRequired: false,
        attributes: [],
        requiredFields: [],
        returns: [],
      },
    ],
    iterators: [],
    conditionals: [],
    triggers: [],
    exceptions: [],
  },
];

describe('builder', () => {
  it('builds a valid A360 bot payload from a planned bot', () => {
    const plan: PlannedBot = {
      botName: 'LoggingBot',
      goal: 'Write logs',
      variables: [
        {
          name: 'logFile',
          type: 'STRING',
          input: true,
          defaultValue: { type: 'STRING', string: '' },
        },
      ],
      packages: [{ name: 'Comment' }, { name: 'LogToFile' }, { name: 'ErrorHandler' }],
      steps: [
        {
          packageName: 'ErrorHandler',
          commandName: 'try',
          children: [
            {
              packageName: 'Comment',
              commandName: 'Comment',
              attributes: [
                {
                  name: 'comment',
                  value: { type: 'STRING', string: 'Start bot' },
                },
              ],
            },
            {
              packageName: 'LogToFile',
              commandName: 'logToFile',
              attributes: [
                {
                  name: 'filePath',
                  value: { type: 'FILE', expression: 'file://$logFile$' },
                },
                {
                  name: 'logContent',
                  value: { type: 'STRING', string: 'Hello from MCP builder' },
                },
              ],
            },
          ],
        },
      ],
    };

    const built = buildBotFromPlan(plan, metadata);

    expect(built.nodes).toHaveLength(1);
    expect(built.nodes[0]?.packageName).toBe('ErrorHandler');
    expect(built.nodes[0]?.children).toHaveLength(2);
    expect(built.packages.map((pkg) => pkg.name)).toEqual([
      'Comment',
      'ErrorHandler',
      'LogToFile',
    ]);
    expect(built.variables[0]?.defaultValue).toEqual({ type: 'STRING', string: '' });
    expect(built.properties.botCodeVersion).toBe('5');
  });

  it('throws when a required attribute is missing', () => {
    const badPlan: PlannedBot = {
      botName: 'BrokenBot',
      goal: 'Trigger validation',
      variables: [],
      packages: [{ name: 'LogToFile' }],
      steps: [
        {
          packageName: 'LogToFile',
          commandName: 'logToFile',
          attributes: [
            {
              name: 'filePath',
              value: { type: 'FILE', expression: 'file://$path$' },
            },
          ],
        },
      ],
    };

    expect(() => buildBotFromPlan(badPlan, metadata)).toThrow(
      'Missing required attributes for LogToFile.logToFile: logContent',
    );
  });

  it('preserves provided returnTo and typed values', () => {
    const plan: PlannedBot = {
      botName: 'ReturnBot',
      goal: 'Exercise returnTo',
      variables: [{ name: 'message', type: 'STRING' }],
      packages: [{ name: 'Comment' }],
      steps: [
        {
          packageName: 'Comment',
          commandName: 'Comment',
          returnTo: { type: 'VARIABLE', variableName: 'message' },
          attributes: [
            {
              name: 'comment',
              value: { type: 'STRING', expression: '$message$' },
            },
          ],
        },
      ],
    };

    const built = buildBotFromPlan(plan, metadata);
    expect(built.nodes[0]?.returnTo).toEqual({
      type: 'VARIABLE',
      variableName: 'message',
    });
    expect(built.nodes[0]?.attributes[0]?.value).toEqual({
      type: 'STRING',
      expression: '$message$',
    });
  });
});
