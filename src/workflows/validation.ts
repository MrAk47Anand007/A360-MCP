import { randomUUID } from 'node:crypto';
import type { A360Request } from '../a360/client.js';
import type { NormalizedCommandMetadata, NormalizedPackageMetadata } from './package-intelligence.js';
import { resolvePackageMetadataForWorkflow } from './package-intelligence.js';

type ValidationIssue = {
  severity: 'error' | 'warning';
  path: string;
  message: string;
};

type ValidationSummary = {
  nodeCount: number;
  variableCount: number;
  packageCount: number;
  maxDepth: number;
};

type BotJsonValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
  summary: ValidationSummary;
  resolvedPackages: Array<{
    packageName: string;
    packageVersion: string;
    commandCount: number;
  }>;
};

type PreviewBotResult = {
  summary: ValidationSummary;
  packageNames: string[];
  topLevelCommands: string[];
  variables: string[];
  validation: BotJsonValidationResult;
};

type FixBotResult = {
  changed: boolean;
  changes: string[];
  botJson: Record<string, unknown>;
  validation: BotJsonValidationResult;
};

type NodeLike = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function buildSummary(botJson: Record<string, unknown>): ValidationSummary {
  const nodes = asArray(botJson.nodes);
  const variables = asArray(botJson.variables);
  const packages = asArray(botJson.packages);

  function walk(inputNodes: unknown[], depth: number): { count: number; maxDepth: number } {
    let count = 0;
    let maxDepth = depth;
    for (const nodeValue of inputNodes) {
      const node = asRecord(nodeValue);
      if (!node) {
        continue;
      }
      count += 1;
      const children = asArray(node.children);
      const branches = asArray(node.branches);
      const childResult = walk(children, depth + 1);
      const branchResult = walk(branches, depth + 1);
      count += childResult.count + branchResult.count;
      maxDepth = Math.max(maxDepth, childResult.maxDepth, branchResult.maxDepth);
    }
    return { count, maxDepth };
  }

  const walked = walk(nodes, 1);
  return {
    nodeCount: walked.count,
    variableCount: variables.length,
    packageCount: packages.length,
    maxDepth: walked.count === 0 ? 0 : walked.maxDepth,
  };
}

function findCommandMetadata(
  packageMetadata: NormalizedPackageMetadata[],
  packageName: string,
  commandName: string,
): NormalizedCommandMetadata | undefined {
  const foundPackage = packageMetadata.find(
    (item) => normalizeName(item.packageName) === normalizeName(packageName),
  );
  if (!foundPackage) {
    return undefined;
  }

  return [
    ...foundPackage.commands,
    ...foundPackage.iterators,
    ...foundPackage.conditionals,
    ...foundPackage.triggers,
    ...foundPackage.exceptions,
  ].find((item) => normalizeName(item.name) === normalizeName(commandName));
}

function collectNodePackages(nodes: unknown[], bucket = new Set<string>()) {
  for (const nodeValue of nodes) {
    const node = asRecord(nodeValue);
    if (!node) {
      continue;
    }
    const packageName = typeof node.packageName === 'string' ? node.packageName : '';
    if (packageName) {
      bucket.add(packageName);
    }
    collectNodePackages(asArray(node.children), bucket);
    collectNodePackages(asArray(node.branches), bucket);
  }
  return bucket;
}

function validateNodeTree(
  nodes: unknown[],
  packageMetadata: NormalizedPackageMetadata[],
  issues: ValidationIssue[],
  pathPrefix: string,
) {
  nodes.forEach((nodeValue, index) => {
    const nodePath = `${pathPrefix}[${index}]`;
    const node = asRecord(nodeValue);
    if (!node) {
      issues.push({
        severity: 'error',
        path: nodePath,
        message: 'Node is not an object.',
      });
      return;
    }

    const packageName = typeof node.packageName === 'string' ? node.packageName : '';
    const commandName = typeof node.commandName === 'string' ? node.commandName : '';
    const uid = typeof node.uid === 'string' ? node.uid : '';
    const disabled = typeof node.disabled === 'boolean' ? node.disabled : null;
    const attributes = asArray(node.attributes);

    if (!uid) {
      issues.push({
        severity: 'error',
        path: `${nodePath}.uid`,
        message: 'Missing uid.',
      });
    }

    if (!packageName) {
      issues.push({
        severity: 'error',
        path: `${nodePath}.packageName`,
        message: 'Missing packageName.',
      });
    }

    if (!commandName) {
      issues.push({
        severity: 'error',
        path: `${nodePath}.commandName`,
        message: 'Missing commandName.',
      });
    }

    if (disabled === null) {
      issues.push({
        severity: 'warning',
        path: `${nodePath}.disabled`,
        message: 'Missing disabled flag.',
      });
    }

    const commandMetadata =
      packageName && commandName
        ? findCommandMetadata(packageMetadata, packageName, commandName)
        : undefined;

    if (packageName && !packageMetadata.some((item) => normalizeName(item.packageName) === normalizeName(packageName))) {
      issues.push({
        severity: 'error',
        path: `${nodePath}.packageName`,
        message: `Unknown package: ${packageName}`,
      });
    } else if (packageName && commandName && !commandMetadata) {
      issues.push({
        severity: 'error',
        path: `${nodePath}.commandName`,
        message: `Unknown command ${commandName} for package ${packageName}`,
      });
    }

    const providedAttributes = new Set<string>();
    attributes.forEach((attributeValue, attributeIndex) => {
      const attributePath = `${nodePath}.attributes[${attributeIndex}]`;
      const attribute = asRecord(attributeValue);
      if (!attribute) {
        issues.push({
          severity: 'error',
          path: attributePath,
          message: 'Attribute is not an object.',
        });
        return;
      }

      const attributeName = typeof attribute.name === 'string' ? attribute.name : '';
      if (!attributeName) {
        issues.push({
          severity: 'error',
          path: `${attributePath}.name`,
          message: 'Attribute name is missing.',
        });
      } else {
        providedAttributes.add(attributeName);
      }

      if (!('value' in attribute)) {
        issues.push({
          severity: 'error',
          path: `${attributePath}.value`,
          message: 'Attribute value is missing.',
        });
      }
    });

    if (commandMetadata) {
      const missingRequiredFields = commandMetadata.requiredFields.filter(
        (field) => !providedAttributes.has(field),
      );
      for (const field of missingRequiredFields) {
        issues.push({
          severity: 'error',
          path: `${nodePath}.attributes`,
          message: `Missing required attribute ${field} for ${packageName}.${commandName}`,
        });
      }
    }

    validateNodeTree(asArray(node.children), packageMetadata, issues, `${nodePath}.children`);
    validateNodeTree(asArray(node.branches), packageMetadata, issues, `${nodePath}.branches`);
  });
}

async function resolveBotPackages(
  request: A360Request,
  botJson: Record<string, unknown>,
) {
  const packageEntries = asArray(botJson.packages)
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => item !== null)
    .map((item) => ({
      name: String(item.name ?? ''),
      version:
        typeof item.version === 'string' && item.version.length > 0
          ? item.version
          : undefined,
    }))
    .filter((item) => item.name.length > 0);

  const nodePackages = Array.from(collectNodePackages(asArray(botJson.nodes))).filter(
    (packageName) =>
      !packageEntries.some(
        (entry) => normalizeName(entry.name) === normalizeName(packageName),
      ),
  );

  const combined = [
    ...packageEntries,
    ...nodePackages.map((name) => ({ name })),
  ];

  return resolvePackageMetadataForWorkflow(request, combined);
}

export async function validateBotJson(
  request: A360Request,
  botJson: Record<string, unknown>,
): Promise<BotJsonValidationResult> {
  const issues: ValidationIssue[] = [];
  const summary = buildSummary(botJson);

  if (!Array.isArray(botJson.nodes)) {
    issues.push({
      severity: 'error',
      path: 'nodes',
      message: 'Bot JSON must include a nodes array.',
    });
  }

  const resolved = await resolveBotPackages(request, botJson);
  const packageMetadata = resolved.packages as NormalizedPackageMetadata[];
  const resolvedPackages = packageMetadata.map((item) => ({
    packageName: item.packageName,
    packageVersion: item.packageVersion,
    commandCount: item.commandCount,
  }));

  const declaredPackages = asArray(botJson.packages)
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => item !== null);

  for (const packageEntry of declaredPackages) {
    const name = String(packageEntry.name ?? '');
    const version = typeof packageEntry.version === 'string' ? packageEntry.version : '';
    if (!name) {
      issues.push({
        severity: 'error',
        path: 'packages',
        message: 'Package entry is missing name.',
      });
      continue;
    }
    const found = packageMetadata.find(
      (item) => normalizeName(item.packageName) === normalizeName(name),
    );
    if (!found) {
      issues.push({
        severity: 'error',
        path: 'packages',
        message: `Package ${name} could not be resolved.`,
      });
      continue;
    }
    if (!version) {
      issues.push({
        severity: 'warning',
        path: 'packages',
        message: `Package ${name} is missing version.`,
      });
    } else if (version !== found.packageVersion) {
      issues.push({
        severity: 'warning',
        path: 'packages',
        message: `Package ${name} version ${version} differs from resolved version ${found.packageVersion}.`,
      });
    }
  }

  validateNodeTree(asArray(botJson.nodes), packageMetadata, issues, 'nodes');

  const valid = issues.every((issue) => issue.severity !== 'error');
  return {
    valid,
    issues,
    summary,
    resolvedPackages,
  };
}

export async function previewBotJson(
  request: A360Request,
  botJson: Record<string, unknown>,
): Promise<PreviewBotResult> {
  const validation = await validateBotJson(request, botJson);
  const topLevelNodes = asArray(botJson.nodes)
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => item !== null);

  return {
    summary: validation.summary,
    packageNames: validation.resolvedPackages.map((item) => item.packageName),
    topLevelCommands: topLevelNodes
      .map((node) => String(node.commandName ?? ''))
      .filter((value) => value.length > 0),
    variables: asArray(botJson.variables)
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => item !== null)
      .map((variable) => String(variable.name ?? ''))
      .filter((value) => value.length > 0),
    validation,
  };
}

function fixNodeTree(
  nodes: unknown[],
  packageMetadata: NormalizedPackageMetadata[],
  changes: string[],
  pathPrefix: string,
) {
  nodes.forEach((nodeValue, index) => {
    const nodePath = `${pathPrefix}[${index}]`;
    const node = asRecord(nodeValue);
    if (!node) {
      return;
    }

    if (typeof node.uid !== 'string' || node.uid.length === 0) {
      node.uid = randomUUID();
      changes.push(`Added uid at ${nodePath}`);
    }

    if (typeof node.disabled !== 'boolean') {
      node.disabled = false;
      changes.push(`Defaulted disabled=false at ${nodePath}`);
    }

    if (!Array.isArray(node.attributes)) {
      node.attributes = [];
      changes.push(`Normalized attributes array at ${nodePath}`);
    }

    const packageName = typeof node.packageName === 'string' ? node.packageName : '';
    const commandName = typeof node.commandName === 'string' ? node.commandName : '';
    const commandMetadata =
      packageName && commandName
        ? findCommandMetadata(packageMetadata, packageName, commandName)
        : undefined;

    if (commandMetadata) {
      const attributes = asArray(node.attributes)
        .map((item) => asRecord(item))
        .filter((item): item is Record<string, unknown> => item !== null);
      const provided = new Set(attributes.map((attribute) => String(attribute.name ?? '')));
      for (const field of commandMetadata.requiredFields) {
        if (!provided.has(field)) {
          node.attributes = [
            ...attributes,
            {
              name: field,
              value: { type: 'STRING', string: '' },
            },
          ];
          changes.push(`Added placeholder attribute ${field} at ${nodePath}`);
        }
      }
    }

    fixNodeTree(asArray(node.children), packageMetadata, changes, `${nodePath}.children`);
    fixNodeTree(asArray(node.branches), packageMetadata, changes, `${nodePath}.branches`);
  });
}

export async function fixBotJson(
  request: A360Request,
  botJson: Record<string, unknown>,
): Promise<FixBotResult> {
  const workingCopy = structuredClone(botJson);
  const changes: string[] = [];

  if (!Array.isArray(workingCopy.nodes)) {
    workingCopy.nodes = [];
    changes.push('Added empty nodes array.');
  }

  if (!Array.isArray(workingCopy.variables)) {
    workingCopy.variables = [];
    changes.push('Added empty variables array.');
  }

  if (!Array.isArray(workingCopy.packages)) {
    workingCopy.packages = [];
    changes.push('Added empty packages array.');
  }

  const resolved = await resolveBotPackages(request, workingCopy);
  const packageMetadata = resolved.packages as NormalizedPackageMetadata[];
  const packageEntries = asArray(workingCopy.packages)
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => item !== null);

  const nodePackages = Array.from(collectNodePackages(asArray(workingCopy.nodes)));
  for (const packageName of nodePackages) {
    const existing = packageEntries.find(
      (entry) => normalizeName(String(entry.name ?? '')) === normalizeName(packageName),
    );
    const foundMetadata = packageMetadata.find(
      (item) => normalizeName(item.packageName) === normalizeName(packageName),
    );

    if (!existing) {
      packageEntries.push({
        name: foundMetadata?.packageName ?? packageName,
        version: foundMetadata?.packageVersion ?? '',
        settingsAttributes: [],
      });
      changes.push(`Added package entry for ${packageName}.`);
      continue;
    }

    if (typeof existing.version !== 'string' || existing.version.length === 0) {
      existing.version = foundMetadata?.packageVersion ?? '';
      changes.push(`Filled package version for ${packageName}.`);
    }

    if (!Array.isArray(existing.settingsAttributes)) {
      existing.settingsAttributes = [];
      changes.push(`Normalized settingsAttributes for ${packageName}.`);
    }
  }
  workingCopy.packages = packageEntries;

  fixNodeTree(asArray(workingCopy.nodes), packageMetadata, changes, 'nodes');

  const validation = await validateBotJson(request, workingCopy);
  return {
    changed: changes.length > 0,
    changes,
    botJson: workingCopy,
    validation,
  };
}
