import { randomUUID } from 'node:crypto';
import type { NormalizedCommandMetadata, NormalizedPackageMetadata } from './package-intelligence.js';
import type {
  PlannedAttribute,
  PlannedBot,
  PlannedPackage,
  PlannedStep,
  PlannedValue,
  PlannedVariable,
} from './plan-model.js';

type A360TypedValue = Record<string, unknown>;

type BuiltAttribute = {
  name: string;
  value: A360TypedValue;
};

type BuiltNode = {
  uid: string;
  commandName: string;
  packageName: string;
  disabled: boolean;
  attributes: BuiltAttribute[];
  returnTo?: A360TypedValue;
  returns?: Record<string, A360TypedValue>;
  children?: BuiltNode[];
  branches?: BuiltNode[];
};

type BuiltVariable = {
  name: string;
  description: string;
  type: string;
  readOnly: boolean;
  input: boolean;
  output: boolean;
  defaultValue: A360TypedValue;
};

type BuiltPackage = {
  name: string;
  version: string;
  settingsAttributes: Array<Record<string, unknown>>;
};

export type BuiltBot = {
  triggers: unknown[];
  nodes: BuiltNode[];
  variables: BuiltVariable[];
  packages: BuiltPackage[];
  properties: {
    botCodeVersion: string;
    improvedNumberSupport: boolean;
    timeout: string;
    automationPriority: string;
    runInChildWindow: boolean;
    runInChildWindowMode: string;
  };
  workItemTemplateName: null;
};

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function toTypedValue(value: PlannedValue): A360TypedValue {
  switch (value.type) {
    case 'STRING':
      return 'string' in value
        ? { type: 'STRING', string: value.string }
        : { type: 'STRING', expression: value.expression };
    case 'NUMBER':
      return 'number' in value
        ? { type: 'NUMBER', number: String(value.number) }
        : { type: 'NUMBER', expression: value.expression };
    case 'BOOLEAN':
      return { type: 'BOOLEAN', boolean: value.boolean };
    case 'FILE':
      return 'string' in value
        ? { type: 'FILE', string: value.string }
        : { type: 'FILE', expression: value.expression };
    case 'DATETIME':
      return { type: 'DATETIME', expression: value.expression };
    case 'VARIABLE':
      return { type: 'VARIABLE', variableName: value.variableName };
    case 'DICTIONARY':
      return {
        type: 'DICTIONARY',
        dictionary: value.dictionary.map((item) => ({
          key: item.key,
          value: toTypedValue(item.value),
        })),
      };
  }
}

function defaultValueForVariable(variable: PlannedVariable): A360TypedValue {
  if (variable.defaultValue) {
    return toTypedValue(variable.defaultValue);
  }

  switch (variable.type) {
    case 'NUMBER':
      return { type: 'NUMBER', number: '0' };
    case 'BOOLEAN':
      return { type: 'BOOLEAN', boolean: false };
    case 'FILE':
      return { type: 'FILE', string: '' };
    case 'DATETIME':
      return { type: 'DATETIME', expression: '' };
    case 'DICTIONARY':
      return { type: 'DICTIONARY', dictionary: [] };
    case 'VARIABLE':
      return { type: 'VARIABLE', variableName: '' };
    case 'STRING':
    default:
      return { type: 'STRING', string: '' };
  }
}

function buildVariable(variable: PlannedVariable): BuiltVariable {
  return {
    name: variable.name,
    description: variable.description ?? '',
    type: variable.type,
    readOnly: variable.readOnly ?? false,
    input: variable.input ?? false,
    output: variable.output ?? false,
    defaultValue: defaultValueForVariable(variable),
  };
}

function buildAttribute(attribute: PlannedAttribute): BuiltAttribute {
  return {
    name: attribute.name,
    value: toTypedValue(attribute.value),
  };
}

function findPackageMetadata(
  metadata: NormalizedPackageMetadata[],
  packageName: string,
) {
  return metadata.find((item) => normalizeName(item.packageName) === normalizeName(packageName));
}

function findCommandMetadata(
  metadata: NormalizedPackageMetadata[],
  step: PlannedStep,
): NormalizedCommandMetadata {
  const packageMetadata = findPackageMetadata(metadata, step.packageName);
  if (!packageMetadata) {
    throw new Error(`Unknown package in builder plan: ${step.packageName}`);
  }

  const command = [
    ...packageMetadata.commands,
    ...packageMetadata.iterators,
    ...packageMetadata.conditionals,
    ...packageMetadata.triggers,
    ...packageMetadata.exceptions,
  ].find((item) => normalizeName(item.name) === normalizeName(step.commandName));

  if (!command) {
    throw new Error(
      `Unknown command in builder plan: ${step.packageName}.${step.commandName}`,
    );
  }

  return command;
}

function validateRequiredFields(step: PlannedStep, command: NormalizedCommandMetadata) {
  const provided = new Set((step.attributes ?? []).map((attribute) => attribute.name));
  const missing = command.requiredFields.filter((field) => !provided.has(field));

  if (missing.length > 0) {
    throw new Error(
      `Missing required attributes for ${step.packageName}.${step.commandName}: ${missing.join(', ')}`,
    );
  }
}

function buildNode(step: PlannedStep, metadata: NormalizedPackageMetadata[]): BuiltNode {
  const command = findCommandMetadata(metadata, step);
  validateRequiredFields(step, command);

  const node: BuiltNode = {
    uid: step.uid ?? randomUUID(),
    commandName: command.name,
    packageName: command.packageName,
    disabled: step.disabled ?? false,
    attributes: (step.attributes ?? []).map(buildAttribute),
  };

  if (step.returnTo) {
    node.returnTo = toTypedValue(step.returnTo);
  }

  if (step.returns) {
    node.returns = Object.fromEntries(
      Object.entries(step.returns).map(([key, value]) => [key, toTypedValue(value)]),
    );
  }

  if (step.children?.length) {
    node.children = step.children.map((child) => buildNode(child, metadata));
  }

  if (step.branches?.length) {
    node.branches = step.branches.map((branch) => buildNode(branch, metadata));
  }

  return node;
}

function collectUsedPackages(steps: PlannedStep[], bucket = new Set<string>()) {
  for (const step of steps) {
    bucket.add(step.packageName);
    if (step.children?.length) {
      collectUsedPackages(step.children, bucket);
    }
    if (step.branches?.length) {
      collectUsedPackages(step.branches, bucket);
    }
  }

  return bucket;
}

function buildPackages(
  plannedPackages: PlannedPackage[],
  metadata: NormalizedPackageMetadata[],
  usedPackageNames: Set<string>,
): BuiltPackage[] {
  const explicitPackages = new Map(
    plannedPackages.map((pkg) => [normalizeName(pkg.name), pkg] as const),
  );

  return Array.from(usedPackageNames)
    .map((usedName) => {
      const explicit = explicitPackages.get(normalizeName(usedName));
      const packageMetadata = findPackageMetadata(metadata, usedName);

      if (!packageMetadata && !explicit?.version) {
        throw new Error(`No package version metadata available for ${usedName}`);
      }

      return {
        name: explicit?.name ?? packageMetadata?.packageName ?? usedName,
        version: explicit?.version ?? packageMetadata?.packageVersion ?? '',
        settingsAttributes: explicit?.settingsAttributes ?? [],
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function buildBotFromPlan(
  plan: PlannedBot,
  packageMetadata: NormalizedPackageMetadata[],
): BuiltBot {
  const usedPackageNames = collectUsedPackages(plan.steps);

  return {
    triggers: [],
    nodes: plan.steps.map((step) => buildNode(step, packageMetadata)),
    variables: plan.variables.map(buildVariable),
    packages: buildPackages(plan.packages, packageMetadata, usedPackageNames),
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
}
