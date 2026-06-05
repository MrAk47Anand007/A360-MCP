import type { A360Request } from '../a360/client.js';
import type {
  NormalizedAttributeMetadata,
  NormalizedCommandMetadata,
  NormalizedPackageMetadata,
} from './package-intelligence.js';
import type { PlannedPackage, PlannedStep, PlannedVariable } from './plan-model.js';
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

function normalizePrompt(prompt: string) {
  return prompt.replace(/\s+/g, ' ').trim();
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

function findBestCommand(catalog: GroundedCommand[], instruction: string, intentTags: string[]) {
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
      const score =
        matchedTags.length * 2 +
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

function createAttributeValue(attribute: NormalizedAttributeMetadata, instruction: string) {
  switch (attribute.type) {
    case 'BOOLEAN':
      return { type: 'BOOLEAN' as const, boolean: true };
    case 'NUMBER':
      return { type: 'NUMBER' as const, number: '0' };
    case 'FILE':
      if (attribute.name.toLowerCase().includes('path')) {
        return { type: 'FILE' as const, expression: 'file://$logFilePath$' };
      }
      return { type: 'FILE' as const, string: '' };
    default:
      if (attribute.name.toLowerCase().includes('comment')) {
        return { type: 'STRING' as const, string: instruction };
      }
      if (attribute.name.toLowerCase().includes('logcontent')) {
        return { type: 'STRING' as const, string: instruction };
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
      value: createAttributeValue(attribute, instruction),
    }));

  return {
    packageName: command.packageName,
    commandName: command.commandName,
    attributes,
  };
}

function inferVariables(prompt: string, commands: GroundedCommand[]) {
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

    if (command.packageName.toLowerCase() === 'excel') {
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

async function shortlistPackageMetadata(
  request: A360Request,
  input: PromptPlanningInput,
): Promise<{
  candidatePackages: PackageCandidate[];
  metadata: NormalizedPackageMetadata[];
}> {
  const normalizedPrompt = normalizePrompt(input.prompt);
  const tokens = tokenize(normalizedPrompt);
  const packageList = await listAvailablePackagesForWorkflow(request);
  const rawPackages = ensureArray(
    (packageList as { packages?: Array<{ name: string; label: string; versions?: string[] }> }).packages,
  );

  const preferred = new Set(
    (input.preferredPackages ?? []).map((name) => name.trim().toLowerCase()).filter(Boolean),
  );

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

      return {
        name: item.name,
        label: item.label,
        version: item.versions?.[0],
        score: matched.length + preferredBoost + baselineBoost,
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
  };
}

export async function groundPromptToPlan(
  request: A360Request,
  input: PromptPlanningInput,
): Promise<PromptGroundingResult> {
  const normalizedPrompt = normalizePrompt(input.prompt);
  const instructions = splitInstructions(normalizedPrompt);
  const { candidatePackages, metadata } = await shortlistPackageMetadata(request, input);
  const commandCatalog = buildCommandCatalog(metadata);
  const reasoning: string[] = [
    `Ranked ${candidatePackages.length} candidate packages from live Control Room package metadata.`,
    `Built command context with ${commandCatalog.length} grounded commands, iterators, conditionals, triggers, and exceptions.`,
  ];

  const intentMap: Record<string, string[]> = {
    log: ['log', 'logging', 'audit', 'trace'],
    comment: ['comment', 'note', 'describe', 'documentation'],
    math: ['calculate', 'calculation', 'add', 'sum', 'subtract', 'multiply', 'divide', 'number', 'math'],
    email: ['email', 'mail', 'outlook', 'message', 'attachment'],
    excel: ['excel', 'worksheet', 'sheet', 'spreadsheet', 'row', 'column', 'cell'],
    file: ['file', 'folder', 'directory', 'copy', 'move', 'delete', 'rename', 'read', 'write'],
    browser: ['browser', 'page', 'url', 'click', 'type', 'javascript'],
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
        ? findBestCommand(commandCatalog, instruction, candidateIntentTags)
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
    variables: inferVariables(normalizedPrompt, matchedCommands),
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
