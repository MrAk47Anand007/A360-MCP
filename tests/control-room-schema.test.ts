import { describe, expect, it } from 'vitest';
import {
  a360EditorDraftSchema,
  a360TaskBotContentSchema,
} from '../src/workflows/control-room-schema.js';
import { buildBotFromPlan } from '../src/workflows/builder.js';
import type { NormalizedPackageMetadata } from '../src/workflows/package-intelligence.js';
import type { PlannedBot } from '../src/workflows/plan-model.js';

const metadata: NormalizedPackageMetadata[] = [
  {
    packageName: 'Comment',
    packageLabel: 'Comment',
    packageVersion: '2.17.0',
    settingsAttributes: [],
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
];

describe('control room schema', () => {
  it('accepts task bot content built by the deterministic builder', () => {
    const plan: PlannedBot = {
      botName: 'SchemaBot',
      goal: 'Validate shape',
      variables: [
        {
          name: 'message',
          type: 'STRING',
          defaultValue: { type: 'STRING', string: '' },
        },
      ],
      packages: [{ name: 'Comment' }],
      steps: [
        {
          packageName: 'Comment',
          commandName: 'Comment',
          attributes: [
            {
              name: 'comment',
              value: { type: 'STRING', string: 'Hello schema' },
            },
          ],
        },
      ],
    };

    const built = buildBotFromPlan(plan, metadata);
    expect(() => a360TaskBotContentSchema.parse(built)).not.toThrow();
  });

  it('accepts the confirmed editor draft shape', () => {
    const draft = {
      triggers: [],
      nodes: [],
      orphans: [],
      swimlanes: [],
      swimlaneStacking: 'LEFT_TO_RIGHT',
      variables: [],
      breakpoints: [],
      packages: [],
      packageSettings: {},
      dependencies: [],
      workItemTemplateName: null,
      properties: {
        botCodeVersion: '5',
        processCodeVersion: '0',
      },
      hasContent: false,
    };

    expect(() => a360EditorDraftSchema.parse(draft)).not.toThrow();
  });
});
