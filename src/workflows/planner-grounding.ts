import type { A360Request } from '../a360/client.js';
import type {
  NormalizedAttributeMetadata,
  NormalizedCommandMetadata,
  NormalizedPackageMetadata,
} from './package-intelligence.js';
import type { PlannedPackage, PlannedStep, PlannedValue, PlannedVariable } from './plan-model.js';
import {
  loadMigrationGrounding,
  scoreMigrationCommand,
  scoreMigrationPackage,
  type MigrationGroundingSnapshot,
} from './migration-grounding.js';
import {
  listAvailablePackagesForWorkflow,
  resolvePackageMetadataForWorkflow,
} from './package-intelligence.js';

type PromptPlanningInput = {
  prompt: string;
  preferredPackages?: string[];
};

type PackageCandidate = {
  name: string;
  label: string;
  version?: string;
  score: number;
  matchedTags: string[];
};

type GroundedCommand = {
  packageName: string;
  packageVersion: string;
  commandName: string;
  label: string;
  description?: string;
  semanticTags: string[];
  requiredFields: string[];
  attributes: NormalizedAttributeMetadata[];
  commandType: 'command' | 'iterator' | 'conditional' | 'trigger' | 'exception';
  branchable: boolean;
  nestable: boolean;
};

type InstructionMatch = {
  instruction: string;
  matchedIntent: string | null;
  command: GroundedCommand | null;
  score: number;
};

export type PromptGroundingResult = {
  packages: PlannedPackage[];
  variables: PlannedVariable[];
  steps: PlannedStep[];
  unsupportedInstructions: string[];
  candidatePackages: PackageCandidate[];
  commandContext: Array<{
    packageName: string;
    packageVersion: string;
    commandName: string;
    commandType: GroundedCommand['commandType'];
    semanticTags: string[];
    requiredFields: string[];
  }>;
  reasoning: string[];
};

type DomainLexicon = {
  packageTags: string[];
  commandTags: string[];
};

const PACKAGE_DOMAIN_LEXICON: Record<string, DomainLexicon> = {
  comment: {
    packageTags: ['comment', 'note', 'describe', 'documentation'],
    commandTags: ['comment', 'note', 'describe'],
  },
  logtofile: {
    packageTags: ['log', 'logging', 'audit', 'trace', 'file log'],
    commandTags: ['log', 'logging', 'audit', 'trace'],
  },
  errorhandler: {
    packageTags: ['error', 'exception', 'failure', 'retry', 'catch'],
    commandTags: ['try', 'catch', 'finally', 'throw', 'error', 'exception', 'retry'],
  },
  number: {
    packageTags: ['number', 'math', 'calculate', 'calculation', 'sum', 'add', 'subtract', 'multiply', 'divide'],
    commandTags: ['number', 'math', 'assign', 'increment', 'decrement', 'random', 'convert'],
  },
  string: {
    packageTags: ['string', 'text', 'message', 'content', 'replace', 'split', 'join', 'trim'],
    commandTags: ['string', 'text', 'replace', 'split', 'join', 'trim', 'convert'],
  },
  file: {
    packageTags: ['file', 'folder', 'directory', 'path', 'copy', 'move', 'delete', 'rename'],
    commandTags: ['file', 'folder', 'copy', 'move', 'delete', 'rename', 'read', 'write'],
  },
  excel: {
    packageTags: ['excel', 'spreadsheet', 'worksheet', 'workbook', 'row', 'column', 'cell', 'sheet'],
    commandTags: ['excel', 'worksheet', 'workbook', 'row', 'column', 'cell', 'sheet', 'table'],
  },
  email: {
    packageTags: ['email', 'mail', 'outlook', 'smtp', 'message', 'attachment'],
    commandTags: ['email', 'mail', 'message', 'attachment', 'send', 'read'],
  },
  browser: {
    packageTags: ['browser', 'web', 'url', 'page', 'click', 'type', 'javascript'],
    commandTags: ['browser', 'url', 'page', 'click', 'type', 'javascript', 'tab'],
  },
  recorder: {
    packageTags: ['recorder', 'application', 'window', 'ui', 'element', 'click', 'type', 'capture'],
    commandTags: ['recorder', 'application', 'window', 'ui', 'element', 'click', 'type', 'capture'],
  },
  application: {
    packageTags: ['application', 'window', 'desktop', 'ui', 'element'],
    commandTags: ['application', 'window', 'desktop', 'ui', 'element'],
  },
  loop: {
    packageTags: ['loop', 'iterate', 'each', 'foreach', 'repeat', 'rows', 'items'],
    commandTags: ['loop', 'iterate', 'repeat', 'break', 'continue'],
  },
  if: {
    packageTags: ['if', 'condition', 'compare', 'equals', 'greater', 'less', 'branch'],
    commandTags: ['if', 'condition', 'compare', 'equals', 'greater', 'less', 'branch'],
  },
  database: {
    packageTags: ['database', 'sql', 'query', 'table', 'record', 'row', 'insert', 'update', 'select'],
    commandTags: ['database', 'sql', 'query', 'table', 'record', 'row', 'insert', 'update', 'select'],
  },
  pdf: {
    packageTags: ['pdf', 'document', 'extract', 'merge', 'split', 'page'],
    commandTags: ['pdf', 'document', 'extract', 'merge', 'split', 'page'],
  },
};

const BASELINE_PACKAGES = ['Comment', 'ErrorHandler'];

type ArithmeticIntent = {
  operator: '+' | '-' | '*' | '/';
  operationLabel: 'addition' | 'subtraction' | 'multiplication' | 'division';
};

type AutomationIntent = {
  includeMessageInput: boolean;
};

function normalizePrompt(prompt: string) {
  return prompt.replace(/\s+/g, ' ').trim();
}

function extractQuotedText(prompt: string) {
  const match = prompt.match(/"([^"]+)"|'([^']+)'/);
  return (match?.[1] ?? match?.[2] ?? '').trim() || null;
}

function splitInstructions(prompt: string) {
  return prompt
    .split(/[\n.]+| then | and then /i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function tokenize(text: string) {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length > 1),
    ),
  );
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function ensureArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function scoreTokens(tokens: string[], expected: string[]) {
  const matched = expected.filter((token) => tokens.includes(token));
  return {
    score: matched.length,
    matched,
  };
}

function derivePackageTags(name: string, label: string) {
  const combined = `${name} ${label}`.toLowerCase();
  const tags = new Set<string>(tokenize(combined));
  const canonicalKey = slugify(name);
  const canonicalLexicon = PACKAGE_DOMAIN_LEXICON[canonicalKey];
  if (canonicalLexicon) {
    for (const tag of canonicalLexicon.packageTags) {
      tags.add(tag);
    }
  }
  for (const [key, lexicon] of Object.entries(PACKAGE_DOMAIN_LEXICON)) {
    if (combined.includes(key)) {
      for (const tag of lexicon.packageTags) {
        tags.add(tag);
      }
    }
  }
  return Array.from(tags);
}

function deriveCommandTags(command: NormalizedCommandMetadata, commandType: GroundedCommand['commandType']) {
  const combined = [
    command.packageName,
    command.name,
    command.label,
    command.description ?? '',
    command.nodeLabel ?? '',
    commandType,
  ]
    .join(' ')
    .toLowerCase();

  const tags = new Set<string>(tokenize(combined));
  for (const [key, lexicon] of Object.entries(PACKAGE_DOMAIN_LEXICON)) {
    if (combined.includes(key)) {
      for (const tag of [...lexicon.packageTags, ...lexicon.commandTags]) {
        tags.add(tag);
      }
    }
  }

  for (const attribute of command.attributes) {
    tags.add(attribute.name.toLowerCase());
    if (attribute.label) {
      for (const token of tokenize(attribute.label)) {
        tags.add(token);
      }
    }
  }

  return Array.from(tags);
}

function buildCommandCatalog(packages: NormalizedPackageMetadata[]) {
  const commands: GroundedCommand[] = [];
  const addCommands = (
    commandType: GroundedCommand['commandType'],
    items: NormalizedCommandMetadata[],
  ) => {
    for (const command of items) {
      commands.push({
        packageName: command.packageName,
        packageVersion: command.packageVersion,
        commandName: command.name,
        label: command.label,
        description: command.description,
        semanticTags: deriveCommandTags(command, commandType),
        requiredFields: command.requiredFields,
        attributes: command.attributes,
        commandType,
        branchable: command.branchable,
        nestable: command.nestable,
      });
    }
  };

  for (const metadata of packages) {
    addCommands('command', metadata.commands);
    addCommands('iterator', metadata.iterators);
    addCommands('conditional', metadata.conditionals);
    addCommands('trigger', metadata.triggers);
    addCommands('exception', metadata.exceptions);
  }

  return commands;
}

function findBestCommand(
  catalog: GroundedCommand[],
  instruction: string,
  intentTags: string[],
  migrationGrounding: MigrationGroundingSnapshot | null,
) {
  const tokens = tokenize(instruction);
  let best: InstructionMatch = {
    instruction,
    matchedIntent: null,
    command: null,
    score: 0,
  };

  for (const intentTag of intentTags) {
    for (const command of catalog) {
      const matchedTags = command.semanticTags.filter(
        (tag) => tokens.includes(tag) || intentTags.includes(tag),
      );
      const migrationBoost = migrationGrounding
        ? scoreMigrationCommand(tokens, command.packageName, command.commandName, migrationGrounding)
        : 0;
      const score =
        matchedTags.length * 2 +
        migrationBoost * 2 +
        (command.requiredFields.length === 0 ? 1 : 0) +
        (command.commandType === 'command' ? 1 : 0);

      if (score > best.score) {
        best = {
          instruction,
          matchedIntent: intentTag,
          command,
          score,
        };
      }
    }
  }

  return best.command ? best : null;
}

function inferVariableTypeFromName(name: string): PlannedVariable['type'] {
  const normalized = name.toLowerCase();
  if (normalized.includes('path') || normalized.includes('file')) {
    return 'FILE';
  }
  if (normalized.includes('count') || normalized.includes('number') || normalized.includes('index') || normalized.includes('row')) {
    return 'NUMBER';
  }
  if (normalized.startsWith('is') || normalized.startsWith('has') || normalized.includes('flag')) {
    return 'BOOLEAN';
  }
  return 'STRING';
}

function toFileExpression(variableName: string) {
  return `file://$${variableName}$`;
}

function buildUiObjectValue(instruction: string): PlannedValue {
  const quotedTarget = extractQuotedText(instruction);

  return {
    type: 'UIOBJECT',
    uiObject: {
      capture: {
        securelyRecorded: true,
      },
      criteria: {
        title: {
          enabled: true,
          value: quotedTarget
            ? { type: 'STRING', string: quotedTarget }
            : { type: 'STRING', expression: '$uiTargetTitle$' },
        },
        role: {
          enabled: false,
          securelyRecordedRemoveDisabled: true,
          value: { type: 'STRING', string: '' },
        },
      },
    },
  };
}

function buildAnchorDictionaryValue(instruction: string): PlannedValue {
  const quotedTarget = extractQuotedText(instruction) ?? 'UiTarget';
  return {
    type: 'DICTIONARY',
    dictionary: [
      {
        key: 'name',
        value: { type: 'STRING', string: quotedTarget.replace(/\s+/g, '') },
      },
    ],
  };
}

function chooseStringVariableName(command: GroundedCommand, attribute: NormalizedAttributeMetadata) {
  const packageName = command.packageName.toLowerCase();
  const commandName = command.commandName.toLowerCase();
  const attributeName = attribute.name.toLowerCase();
  const attributeLabel = attribute.label.toLowerCase();
  const combined = `${attributeName} ${attributeLabel}`;

  if (packageName === 'email') {
    if (combined.includes('recipient') || combined.includes('to')) {
      return 'emailRecipient';
    }
    if (combined.includes('subject')) {
      return 'emailSubject';
    }
    if (combined.includes('body') || combined.includes('message') || combined.includes('content')) {
      return 'emailBody';
    }
  }

  if (packageName.includes('excel')) {
    if (combined.includes('worksheet') || combined.includes('sheet')) {
      return 'worksheetName';
    }
    if (combined.includes('cell')) {
      return 'cellReference';
    }
  }

  if (packageName === 'browser' || packageName === 'recorder') {
    if (combined.includes('url') || combined.includes('website') || combined.includes('address')) {
      return 'targetUrl';
    }
    if (combined.includes('text') || combined.includes('value') || combined.includes('content')) {
      return 'inputText';
    }
  }

  if (combined.includes('message') || combined.includes('content') || combined.includes('body')) {
    return commandName.includes('log') ? 'logMessage' : 'inputMessage';
  }

  if (combined.includes('subject')) {
    return 'subjectText';
  }

  if (combined.includes('name')) {
    return attribute.name;
  }

  return attribute.name;
}

function chooseFileVariableName(command: GroundedCommand, attribute: NormalizedAttributeMetadata) {
  const packageName = command.packageName.toLowerCase();
  const attributeName = attribute.name.toLowerCase();
  const attributeLabel = attribute.label.toLowerCase();
  const combined = `${attributeName} ${attributeLabel}`;

  if (packageName === 'logtofile') {
    return 'logFilePath';
  }

  if (packageName.includes('excel')) {
    return 'excelFilePath';
  }

  if (combined.includes('destination') || combined.includes('target') || combined.includes('output')) {
    return 'targetFilePath';
  }

  if (combined.includes('source') || combined.includes('input')) {
    return 'sourceFilePath';
  }

  return 'filePath';
}

function createAttributeValue(
  command: GroundedCommand,
  attribute: NormalizedAttributeMetadata,
  instruction: string,
) {
  const normalizedAttributeName = attribute.name.toLowerCase();
  const normalizedAttributeLabel = attribute.label.toLowerCase();
  const combined = `${normalizedAttributeName} ${normalizedAttributeLabel}`;

  switch (attribute.type) {
    case 'BOOLEAN':
      return { type: 'BOOLEAN' as const, boolean: true };
    case 'NUMBER':
      if (combined.includes('row')) {
        return { type: 'NUMBER' as const, expression: '$rowNumber$' };
      }
      return { type: 'NUMBER' as const, number: '0' };
    case 'FILE':
      if (normalizedAttributeName.includes('path') || normalizedAttributeName.includes('file')) {
        return {
          type: 'FILE' as const,
          expression: toFileExpression(chooseFileVariableName(command, attribute)),
        };
      }
      return { type: 'FILE' as const, string: '' };
    case 'IMAGE':
      return { type: 'IMAGE' as const, unsavedSecurelyRecorded: true };
    case 'UIOBJECT':
      return buildUiObjectValue(instruction);
    case 'ANCHOR':
      return buildAnchorDictionaryValue(instruction);
    case 'AUTOMATION':
      return {
        type: 'AUTOMATION' as const,
        automation: {
          filePath: {
            type: 'FILE' as const,
            expression: '$childAutomationPath$',
          },
        },
      };
    default:
      if (normalizedAttributeName.includes('comment')) {
        return { type: 'STRING' as const, string: instruction };
      }
      if (normalizedAttributeName.includes('logcontent')) {
        return { type: 'STRING' as const, string: instruction };
      }
      if (combined.includes('url') || combined.includes('website') || combined.includes('address')) {
        return { type: 'STRING' as const, expression: '$targetUrl$' };
      }
      if (combined.includes('worksheet') || combined.includes('sheet')) {
        return { type: 'STRING' as const, expression: '$worksheetName$' };
      }
      if (combined.includes('subject')) {
        return { type: 'STRING' as const, expression: '$emailSubject$' };
      }
      if (combined.includes('recipient') || combined.includes('to')) {
        return { type: 'STRING' as const, expression: '$emailRecipient$' };
      }
      if (combined.includes('body') || combined.includes('message') || combined.includes('content')) {
        return {
          type: 'STRING' as const,
          expression: `$${chooseStringVariableName(command, attribute)}$`,
        };
      }
      if (combined.includes('session')) {
        return { type: 'STRING' as const, string: 'Default' };
      }
      if (combined.includes('cell')) {
        return { type: 'STRING' as const, expression: '$cellReference$' };
      }
      if (attribute.availableOptions.length > 0) {
        return {
          type: 'STRING' as const,
          string: attribute.availableOptions[0] ?? '',
        };
      }
      return { type: 'STRING' as const, string: '' };
  }
}

function buildStepFromCommand(command: GroundedCommand, instruction: string): PlannedStep {
  const attributes = command.attributes
    .filter((attribute) => attribute.required)
    .map((attribute) => ({
      name: attribute.name,
      value: createAttributeValue(command, attribute, instruction),
    }));

  return {
    packageName: command.packageName,
    commandName: command.commandName,
    attributes,
  };
}

function detectArithmeticIntent(prompt: string): ArithmeticIntent | null {
  const normalized = prompt.toLowerCase();
  const calculatorContext =
    normalized.includes('calculator') ||
    normalized.includes('calculate') ||
    normalized.includes('math') ||
    normalized.includes('number');

  if (
    calculatorContext &&
    (normalized.includes('subtract') || normalized.includes('difference') || normalized.includes('minus'))
  ) {
    return { operator: '-', operationLabel: 'subtraction' };
  }

  if (
    calculatorContext &&
    (normalized.includes('multiply') || normalized.includes('product') || normalized.includes('times'))
  ) {
    return { operator: '*', operationLabel: 'multiplication' };
  }

  if (calculatorContext && (normalized.includes('divide') || normalized.includes('quotient'))) {
    return { operator: '/', operationLabel: 'division' };
  }

  if (
    normalized.includes('calculator') ||
    normalized.includes('calculate') ||
    normalized.includes('sum two numbers') ||
    normalized.includes('add two numbers') ||
    normalized.includes('sum of two numbers')
  ) {
    return { operator: '+', operationLabel: 'addition' };
  }

  return null;
}

function detectAutomationIntent(prompt: string): AutomationIntent | null {
  const normalized = prompt.toLowerCase();
  const actionMatch =
    normalized.includes('run ') ||
    normalized.includes('call ') ||
    normalized.includes('invoke ') ||
    normalized.includes('execute ') ||
    normalized.includes('launch ') ||
    normalized.includes('trigger ') ||
    normalized.includes('reuse ');
  const targetMatch =
    normalized.includes('bot') ||
    normalized.includes('automation') ||
    normalized.includes('task bot') ||
    normalized.includes('workflow') ||
    normalized.includes('subtask') ||
    normalized.includes('child');

  if (!actionMatch || !targetMatch) {
    return null;
  }

  return {
    includeMessageInput:
      normalized.includes('message') ||
      normalized.includes('input') ||
      normalized.includes('parameter') ||
      normalized.includes('pass'),
  };
}

function extractVariableNamesFromValue(value: PlannedValue, bucket = new Set<string>()) {
  if ('expression' in value && typeof value.expression === 'string') {
    for (const match of value.expression.matchAll(/\$([A-Za-z0-9_]+)\$/g)) {
      if (match[1]) {
        bucket.add(match[1]);
      }
    }
  }

  if (value.type === 'VARIABLE') {
    bucket.add(value.variableName);
  }

  if (value.type === 'AUTOMATION') {
    if (value.automation.file) {
      extractVariableNamesFromValue(value.automation.file, bucket);
    }
    if (value.automation.filePath) {
      extractVariableNamesFromValue(value.automation.filePath, bucket);
    }
    for (const collection of [
      value.automation.inputVariables,
      value.automation.inputOptions,
      value.automation.inputData,
    ]) {
      for (const entry of collection ?? []) {
        extractVariableNamesFromValue(entry.value, bucket);
      }
    }
  }

  if (value.type === 'UIOBJECT') {
    for (const criteria of [
      value.uiObject?.criteria,
      value.uiObjectAnchor?.uiObject?.criteria,
    ]) {
      for (const entry of Object.values(criteria ?? {})) {
        extractVariableNamesFromValue(entry.value, bucket);
      }
    }
  }

  if (value.type === 'DICTIONARY') {
    for (const entry of value.dictionary) {
      extractVariableNamesFromValue(entry.value, bucket);
    }
  }

  return bucket;
}

function inferVariables(prompt: string, commands: GroundedCommand[], steps: PlannedStep[]) {
  const variables = new Map<string, PlannedVariable>();
  const normalizedPrompt = prompt.toLowerCase();

  const ensureVariable = (variable: PlannedVariable) => {
    if (!variables.has(variable.name)) {
      variables.set(variable.name, variable);
    }
  };

  for (const command of commands) {
    if (command.packageName.toLowerCase() === 'logtofile') {
      ensureVariable({
        name: 'logFilePath',
        type: 'STRING',
        input: true,
        description: 'Log output file path',
        defaultValue: { type: 'STRING', string: '' },
      });
    }

    if (command.packageName.toLowerCase() === 'number') {
      ensureVariable({
        name: 'numberInputA',
        type: 'NUMBER',
        input: true,
      });
      ensureVariable({
        name: 'numberInputB',
        type: 'NUMBER',
        input: true,
      });
      ensureVariable({
        name: 'numberResult',
        type: 'NUMBER',
        output: true,
      });
    }

    if (command.packageName.toLowerCase() === 'email') {
      ensureVariable({
        name: 'emailRecipient',
        type: 'STRING',
        input: true,
      });
      ensureVariable({
        name: 'emailSubject',
        type: 'STRING',
        input: true,
      });
      ensureVariable({
        name: 'emailBody',
        type: 'STRING',
        input: true,
      });
    }

    if (command.packageName.toLowerCase().includes('excel')) {
      ensureVariable({
        name: 'excelFilePath',
        type: 'FILE',
        input: true,
      });
      ensureVariable({
        name: 'worksheetName',
        type: 'STRING',
        input: true,
      });
    }
  }

  for (const step of steps) {
    for (const attribute of step.attributes ?? []) {
      const referencedVariables = extractVariableNamesFromValue(attribute.value);
      for (const variableName of referencedVariables) {
        if (variables.has(variableName)) {
          continue;
        }
        ensureVariable({
          name: variableName,
          type: inferVariableTypeFromName(variableName),
          input: true,
        });
      }
    }
  }

  if (normalizedPrompt.includes('result')) {
    ensureVariable({
      name: 'resultMessage',
      type: 'STRING',
      output: true,
    });
  }

  return Array.from(variables.values());
}

function makeCommentFallback(text: string): PlannedStep {
  return {
    packageName: 'Comment',
    commandName: 'Comment',
    attributes: [
      {
        name: 'comment',
        value: { type: 'STRING', string: text },
      },
    ],
  };
}

function buildCalculatorPlan(
  metadata: NormalizedPackageMetadata[],
  prompt: string,
  arithmeticIntent: ArithmeticIntent,
) {
  const commentPackage = metadata.find((item) => item.packageName.toLowerCase() === 'comment');
  const numberPackage = metadata.find((item) => item.packageName.toLowerCase() === 'number');
  const logToFilePackage = metadata.find((item) => item.packageName.toLowerCase() === 'logtofile');

  if (!numberPackage) {
    return null;
  }

  const steps: PlannedStep[] = [];
  steps.push(
    makeCommentFallback(
      `Generated calculator bot for ${arithmeticIntent.operationLabel} from prompt: ${prompt}`,
    ),
  );
  steps.push({
    packageName: 'Number',
    commandName: 'assignToNumber',
    returnTo: { type: 'VARIABLE', variableName: 'numberResult' },
    attributes: [
      {
        name: 'input',
        value: {
          type: 'NUMBER',
          expression: `$numberInputA$ ${arithmeticIntent.operator} $numberInputB$`,
        },
      },
    ],
  });

  if (logToFilePackage) {
    steps.push({
      packageName: 'LogToFile',
      commandName: 'logToFile',
      attributes: [
        {
          name: 'filePath',
          value: { type: 'FILE', expression: 'file://$logFilePath$' },
        },
        {
          name: 'logContent',
          value: { type: 'STRING', expression: '$numberResult$' },
        },
        {
          name: 'appendTimestamp',
          value: { type: 'BOOLEAN', boolean: true },
        },
        {
          name: 'logOption',
          value: { type: 'STRING', string: 'APPEND_FILE' },
        },
        {
          name: 'encodingValue',
          value: { type: 'STRING', string: 'ANSI' },
        },
      ],
    });
  }

  const packages: PlannedPackage[] = [
    { name: numberPackage.packageName, version: numberPackage.packageVersion, settingsAttributes: [] },
  ];

  if (commentPackage) {
    packages.push({
      name: commentPackage.packageName,
      version: commentPackage.packageVersion,
      settingsAttributes: [],
    });
  }

  if (logToFilePackage) {
    packages.push({
      name: logToFilePackage.packageName,
      version: logToFilePackage.packageVersion,
      settingsAttributes: [],
    });
  }

  const variables: PlannedVariable[] = [
    { name: 'numberInputA', type: 'NUMBER', input: true, description: 'First numeric input' },
    { name: 'numberInputB', type: 'NUMBER', input: true, description: 'Second numeric input' },
    { name: 'numberResult', type: 'NUMBER', output: true, description: 'Calculated result' },
  ];

  if (logToFilePackage) {
    variables.push({
      name: 'logFilePath',
      type: 'STRING',
      input: true,
      description: 'Log output file path',
      defaultValue: { type: 'STRING', string: '' },
    });
  }

  return {
    steps,
    packages,
    variables,
    unsupportedInstructions: [] as string[],
    reasoning: [
      `Applied dedicated calculator planner using Number.assignToNumber for ${arithmeticIntent.operationLabel}.`,
    ],
  };
}

function buildAutomationPlan(
  metadata: NormalizedPackageMetadata[],
  prompt: string,
  commandCatalog: GroundedCommand[],
  automationIntent: AutomationIntent,
) {
  const automationCommand = commandCatalog
    .filter((command) =>
      command.attributes.some((attribute) => attribute.type === 'AUTOMATION' && attribute.required),
    )
    .sort((left, right) => {
      const leftScore =
        left.semanticTags.filter((tag) =>
          ['automation', 'bot', 'run', 'call', 'invoke', 'execute', 'workflow'].includes(tag),
        ).length + (left.commandType === 'command' ? 2 : 0);
      const rightScore =
        right.semanticTags.filter((tag) =>
          ['automation', 'bot', 'run', 'call', 'invoke', 'execute', 'workflow'].includes(tag),
        ).length + (right.commandType === 'command' ? 2 : 0);
      return rightScore - leftScore;
    })[0];

  if (!automationCommand) {
    return null;
  }

  const commentPackage = metadata.find((item) => item.packageName.toLowerCase() === 'comment');
  const automationAttribute = automationCommand.attributes.find(
    (attribute) => attribute.type === 'AUTOMATION' && attribute.required,
  );
  if (!automationAttribute) {
    return null;
  }

  const automationValue: PlannedValue = {
    type: 'AUTOMATION',
    automation: {
      filePath: {
        type: 'FILE',
        expression: '$childAutomationPath$',
      },
      ...(automationIntent.includeMessageInput
        ? {
            inputVariables: [
              {
                name: 'message',
                value: { type: 'VARIABLE', variableName: 'automationInputMessage' },
              },
            ],
          }
        : {}),
    },
  };

  const attributes = automationCommand.attributes
    .filter((attribute) => attribute.required)
    .map((attribute) => ({
      name: attribute.name,
      value:
        attribute.name === automationAttribute.name
          ? automationValue
          : createAttributeValue(automationCommand, attribute, prompt),
    }));

  const steps: PlannedStep[] = [
    makeCommentFallback(`Generated child automation call from prompt: ${prompt}`),
    {
      packageName: automationCommand.packageName,
      commandName: automationCommand.commandName,
      attributes,
    },
  ];

  const packages: PlannedPackage[] = [
    {
      name: automationCommand.packageName,
      version: automationCommand.packageVersion,
      settingsAttributes: [],
    },
  ];

  if (commentPackage) {
    packages.push({
      name: commentPackage.packageName,
      version: commentPackage.packageVersion,
      settingsAttributes: [],
    });
  }

  const variables: PlannedVariable[] = [
    {
      name: 'childAutomationPath',
      type: 'FILE',
      input: true,
      description: 'Repository path for the child automation to run',
      defaultValue: { type: 'FILE', string: '' },
    },
  ];

  if (automationIntent.includeMessageInput) {
    variables.push({
      name: 'automationInputMessage',
      type: 'STRING',
      input: true,
      description: 'Input message passed into the child automation',
      defaultValue: { type: 'STRING', string: '' },
    });
  }

  return {
    steps,
    packages,
    variables,
    unsupportedInstructions: [] as string[],
    reasoning: [
      `Applied child automation planner using ${automationCommand.packageName}.${automationCommand.commandName}.`,
    ],
  };
}

async function shortlistPackageMetadata(
  request: A360Request,
  input: PromptPlanningInput,
): Promise<{
  candidatePackages: PackageCandidate[];
  metadata: NormalizedPackageMetadata[];
  migrationGrounding: MigrationGroundingSnapshot | null;
}> {
  const normalizedPrompt = normalizePrompt(input.prompt);
  const tokens = tokenize(normalizedPrompt);
  const packageList = await listAvailablePackagesForWorkflow(request);
  const migrationGrounding = loadMigrationGrounding();
  const rawPackages = ensureArray(
    (packageList as { packages?: Array<{ name: string; label: string; versions?: string[] }> }).packages,
  );

  const preferred = new Set(
    (input.preferredPackages ?? []).map((name) => name.trim().toLowerCase()).filter(Boolean),
  );
  const arithmeticIntent = detectArithmeticIntent(normalizedPrompt);
  const automationIntent = detectAutomationIntent(normalizedPrompt);
  if (arithmeticIntent) {
    preferred.add('number');
    preferred.add('comment');
    preferred.add('logtofile');
  }

  const candidates: PackageCandidate[] = rawPackages
    .map((item) => {
      const tags = derivePackageTags(item.name, item.label);
      const matched = tags.filter((tag) => tokens.includes(tag));
      const preferredBoost = preferred.has(item.name.trim().toLowerCase()) ? 10 : 0;
      const baselineBoost = BASELINE_PACKAGES.some(
        (name) => name.toLowerCase() === item.name.trim().toLowerCase(),
      )
        ? 2
        : 0;
      const automationBoost =
        automationIntent && /(flow|automation|bot|workflow|task)/i.test(`${item.name} ${item.label}`)
          ? 3
          : 0;
      const migrationBoost = migrationGrounding
        ? scoreMigrationPackage(tokens, item.name, migrationGrounding)
        : 0;

      return {
        name: item.name,
        label: item.label,
        version: item.versions?.[0],
        score: matched.length + preferredBoost + baselineBoost + automationBoost + migrationBoost,
        matchedTags: matched,
      };
    })
    .filter((item) => item.score > 0 || preferred.has(item.name.toLowerCase()))
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));

  for (const baseline of BASELINE_PACKAGES) {
    if (!candidates.some((candidate) => slugify(candidate.name) === slugify(baseline))) {
      const match = rawPackages.find((item) => slugify(item.name) === slugify(baseline));
      if (match) {
        candidates.push({
          name: match.name,
          label: match.label,
          version: match.versions?.[0],
          score: 1,
          matchedTags: [],
        });
      }
    }
  }

  const selected = candidates.slice(0, 8);
  const references = selected.map((item) => ({
    name: item.name,
    version: item.version,
  }));

  const resolved = await resolvePackageMetadataForWorkflow(request, references);
  return {
    candidatePackages: selected,
    metadata: resolved.packages,
    migrationGrounding,
  };
}

export async function groundPromptToPlan(
  request: A360Request,
  input: PromptPlanningInput,
): Promise<PromptGroundingResult> {
  const normalizedPrompt = normalizePrompt(input.prompt);
  const instructions = splitInstructions(normalizedPrompt);
  const { candidatePackages, metadata, migrationGrounding } = await shortlistPackageMetadata(request, input);
  const commandCatalog = buildCommandCatalog(metadata);
  const reasoning: string[] = [
    `Ranked ${candidatePackages.length} candidate packages from live Control Room package metadata.`,
    `Built command context with ${commandCatalog.length} grounded commands, iterators, conditionals, triggers, and exceptions.`,
  ];
  if (migrationGrounding) {
    reasoning.push(
      `Applied nearby migration grounding from ${migrationGrounding.commandHints.length} local command hints.`,
    );
  }

  const arithmeticIntent = detectArithmeticIntent(normalizedPrompt);
  if (arithmeticIntent) {
    const calculatorPlan = buildCalculatorPlan(metadata, normalizedPrompt, arithmeticIntent);
    if (calculatorPlan) {
      const usedPackageNames = new Set(calculatorPlan.packages.map((item) => item.name.toLowerCase()));
      const errorHandlerPackage = metadata.find(
        (item) => item.packageName.toLowerCase() === 'errorhandler',
      );
      if (errorHandlerPackage && !usedPackageNames.has('errorhandler')) {
        calculatorPlan.packages.push({
          name: errorHandlerPackage.packageName,
          version: errorHandlerPackage.packageVersion,
          settingsAttributes: [],
        });
      }

      return {
        packages: calculatorPlan.packages,
        variables: calculatorPlan.variables,
        steps: calculatorPlan.steps,
        unsupportedInstructions: calculatorPlan.unsupportedInstructions,
        candidatePackages,
        commandContext: commandCatalog.map((command) => ({
          packageName: command.packageName,
          packageVersion: command.packageVersion,
          commandName: command.commandName,
          commandType: command.commandType,
          semanticTags: command.semanticTags,
          requiredFields: command.requiredFields,
        })),
        reasoning: [...reasoning, ...calculatorPlan.reasoning],
      };
    }
  }

  const automationIntent = detectAutomationIntent(normalizedPrompt);
  if (automationIntent) {
    const automationPlan = buildAutomationPlan(
      metadata,
      normalizedPrompt,
      commandCatalog,
      automationIntent,
    );
    if (automationPlan) {
      const usedPackageNames = new Set(automationPlan.packages.map((item) => item.name.toLowerCase()));
      const errorHandlerPackage = metadata.find(
        (item) => item.packageName.toLowerCase() === 'errorhandler',
      );
      if (errorHandlerPackage && !usedPackageNames.has('errorhandler')) {
        automationPlan.packages.push({
          name: errorHandlerPackage.packageName,
          version: errorHandlerPackage.packageVersion,
          settingsAttributes: [],
        });
      }

      return {
        packages: automationPlan.packages,
        variables: automationPlan.variables,
        steps: automationPlan.steps,
        unsupportedInstructions: automationPlan.unsupportedInstructions,
        candidatePackages,
        commandContext: commandCatalog.map((command) => ({
          packageName: command.packageName,
          packageVersion: command.packageVersion,
          commandName: command.commandName,
          commandType: command.commandType,
          semanticTags: command.semanticTags,
          requiredFields: command.requiredFields,
        })),
        reasoning: [...reasoning, ...automationPlan.reasoning],
      };
    }
  }

  const intentMap: Record<string, string[]> = {
    log: ['log', 'logging', 'audit', 'trace'],
    comment: ['comment', 'note', 'describe', 'documentation'],
    automation: ['automation', 'bot', 'workflow', 'run', 'call', 'invoke', 'execute'],
    math: ['calculate', 'calculation', 'add', 'sum', 'subtract', 'multiply', 'divide', 'number', 'math'],
    email: ['email', 'mail', 'outlook', 'message', 'attachment'],
    excel: ['excel', 'worksheet', 'sheet', 'spreadsheet', 'row', 'column', 'cell'],
    file: ['file', 'folder', 'directory', 'copy', 'move', 'delete', 'rename', 'read', 'write'],
    browser: ['browser', 'page', 'url', 'click', 'type', 'javascript', 'application', 'window', 'ui', 'element'],
  };

  const steps: PlannedStep[] = [];
  const usedPackages = new Map<string, PlannedPackage>();
  const matchedCommands: GroundedCommand[] = [];
  const unsupportedInstructions: string[] = [];

  for (const instruction of instructions) {
    const instructionTokens = tokenize(instruction);
    const candidateIntentTags = Object.values(intentMap)
      .flat()
      .filter((tag) => instructionTokens.includes(tag));
    const bestMatch =
      candidateIntentTags.length > 0
        ? findBestCommand(commandCatalog, instruction, candidateIntentTags, migrationGrounding)
        : null;

    if (!bestMatch?.command) {
      unsupportedInstructions.push(instruction);
      continue;
    }

    matchedCommands.push(bestMatch.command);
    steps.push(buildStepFromCommand(bestMatch.command, instruction));
    usedPackages.set(bestMatch.command.packageName.toLowerCase(), {
      name: bestMatch.command.packageName,
      version: bestMatch.command.packageVersion,
      settingsAttributes: [],
    });
  }

  if (!usedPackages.has('comment')) {
    const commentPackage = metadata.find((item) => item.packageName.toLowerCase() === 'comment');
    if (commentPackage) {
      usedPackages.set('comment', {
        name: commentPackage.packageName,
        version: commentPackage.packageVersion,
        settingsAttributes: [],
      });
    }
  }

  if (!usedPackages.has('errorhandler')) {
    const errorHandlerPackage = metadata.find(
      (item) => item.packageName.toLowerCase() === 'errorhandler',
    );
    if (errorHandlerPackage) {
      usedPackages.set('errorhandler', {
        name: errorHandlerPackage.packageName,
        version: errorHandlerPackage.packageVersion,
        settingsAttributes: [],
      });
    }
  }

  if (steps.length === 0) {
    steps.push(makeCommentFallback(`Planner fallback: ${instructions.join(' | ')}`));
    reasoning.push('No grounded executable command matched all instructions, so the planner returned a comment fallback.');
  } else if (!steps.some((step) => step.packageName.toLowerCase() === 'comment')) {
    steps.unshift(makeCommentFallback('Generated from migration-style grounded prompt planning.'));
  }

  if (unsupportedInstructions.length > 0) {
    reasoning.push(
      `${unsupportedInstructions.length} instruction(s) remain unsupported after grounding and need additional planner coverage.`,
    );
  }

  return {
    packages: Array.from(usedPackages.values()),
    variables: inferVariables(normalizedPrompt, matchedCommands, steps),
    steps,
    unsupportedInstructions,
    candidatePackages,
    commandContext: commandCatalog.map((command) => ({
      packageName: command.packageName,
      packageVersion: command.packageVersion,
      commandName: command.commandName,
      commandType: command.commandType,
      semanticTags: command.semanticTags,
      requiredFields: command.requiredFields,
    })),
    reasoning,
  };
}
