import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

type MigrationPackageListItem = {
  name?: string;
  version?: string;
};

type MigrationCommandRecord = {
  name?: string;
  label?: string;
  description?: string;
  packageName?: string;
};

type MigrationMappingData = {
  packageMap?: Record<string, { name?: string; label?: string; commands?: MigrationCommandRecord[] }>;
  commandMap?: Record<string, MigrationCommandRecord>;
};

export type MigrationCommandHint = {
  packageName: string;
  commandName: string;
  label: string;
  description: string;
  tags: string[];
};

export type MigrationGroundingSnapshot = {
  root: string;
  packageNames: string[];
  iteratorPackageNames: string[];
  conditionalPackageNames: string[];
  packageTags: Record<string, string[]>;
  commandHints: MigrationCommandHint[];
};

const cache = new Map<string, MigrationGroundingSnapshot | null>();

function normalizeName(value: string) {
  return value.trim().toLowerCase();
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

function safeReadJson<T>(filePath: string): T | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function isTestRuntime() {
  return process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
}

function candidateRoots() {
  const explicitRoot = process.env.A360_MIGRATION_PROJECT_ROOT?.trim();
  if (explicitRoot) {
    return [path.resolve(explicitRoot)];
  }

  if (isTestRuntime()) {
    return [];
  }

  return [
    path.resolve(process.cwd(), '..', '..', 'A360_BotKit', 'UiPath-to-A360-Migration-development', 'UiPath-to-A360-Migration'),
    path.resolve(process.cwd(), '..', 'UiPath-to-A360-Migration'),
  ];
}

function buildPackageTags(
  packageName: string,
  commandHints: MigrationCommandHint[],
  iteratorPackageNames: string[],
  conditionalPackageNames: string[],
) {
  const tags = new Set<string>(tokenize(packageName));
  for (const hint of commandHints) {
    if (normalizeName(hint.packageName) !== normalizeName(packageName)) {
      continue;
    }
    for (const tag of hint.tags) {
      tags.add(tag);
    }
  }

  if (iteratorPackageNames.some((name) => normalizeName(name) === normalizeName(packageName))) {
    ['loop', 'iterate', 'foreach', 'repeat', 'items', 'rows'].forEach((tag) => tags.add(tag));
  }

  if (conditionalPackageNames.some((name) => normalizeName(name) === normalizeName(packageName))) {
    ['if', 'condition', 'branch', 'compare', 'equals'].forEach((tag) => tags.add(tag));
  }

  return Array.from(tags);
}

function loadFromRoot(root: string): MigrationGroundingSnapshot | null {
  if (cache.has(root)) {
    return cache.get(root) ?? null;
  }

  const mappingData = safeReadJson<MigrationMappingData>(path.join(root, 'output', 'mapping_data.json'));
  const iteratorPackages =
    safeReadJson<MigrationPackageListItem[]>(path.join(root, 'output', 'iteratorPackagesList.json')) ?? [];
  const conditionalPackages =
    safeReadJson<MigrationPackageListItem[]>(path.join(root, 'output', 'conditionalMapList.json')) ?? [];

  if (!mappingData?.commandMap && !mappingData?.packageMap) {
    cache.set(root, null);
    return null;
  }

  const packageNames = new Set<string>();
  const commandHints: MigrationCommandHint[] = [];

  for (const [commandKey, command] of Object.entries(mappingData.commandMap ?? {})) {
    const [packagePart] = commandKey.split('#');
    const fallbackPackageName = packagePart?.trim() ?? '';
    const packageName = command.packageName?.trim() || fallbackPackageName;
    const commandName = command.name?.trim() ?? '';
    if (!packageName || !commandName) {
      continue;
    }

    packageNames.add(packageName);
    commandHints.push({
      packageName,
      commandName,
      label: command.label?.trim() ?? commandName,
      description: command.description?.trim() ?? '',
      tags: tokenize([packageName, commandName, command.label ?? '', command.description ?? ''].join(' ')),
    });
  }

  for (const packageEntry of Object.values(mappingData.packageMap ?? {})) {
    const packageName = packageEntry.name?.trim();
    if (!packageName) {
      continue;
    }
    packageNames.add(packageName);
    for (const command of packageEntry.commands ?? []) {
      const commandName = command.name?.trim();
      if (!commandName) {
        continue;
      }
      commandHints.push({
        packageName,
        commandName,
        label: command.label?.trim() ?? commandName,
        description: command.description?.trim() ?? '',
        tags: tokenize([packageName, commandName, command.label ?? '', command.description ?? ''].join(' ')),
      });
    }
  }

  const uniqueCommandHints = Array.from(
    new Map(
      commandHints.map((hint) => [
        `${normalizeName(hint.packageName)}#${normalizeName(hint.commandName)}`,
        hint,
      ]),
    ).values(),
  );

  const iteratorPackageNames = iteratorPackages
    .map((item) => item.name?.trim() ?? '')
    .filter(Boolean);
  const conditionalPackageNames = conditionalPackages
    .map((item) => item.name?.trim() ?? '')
    .filter(Boolean);

  const snapshot: MigrationGroundingSnapshot = {
    root,
    packageNames: Array.from(packageNames).sort((left, right) => left.localeCompare(right)),
    iteratorPackageNames,
    conditionalPackageNames,
    packageTags: Object.fromEntries(
      Array.from(packageNames).map((packageName) => [
        normalizeName(packageName),
        buildPackageTags(packageName, uniqueCommandHints, iteratorPackageNames, conditionalPackageNames),
      ]),
    ),
    commandHints: uniqueCommandHints,
  };

  cache.set(root, snapshot);
  return snapshot;
}

export function clearMigrationGroundingCache() {
  cache.clear();
}

export function loadMigrationGrounding(): MigrationGroundingSnapshot | null {
  for (const root of candidateRoots()) {
    const snapshot = loadFromRoot(root);
    if (snapshot) {
      return snapshot;
    }
  }

  return null;
}

export function scoreMigrationPackage(promptTokens: string[], packageName: string, snapshot: MigrationGroundingSnapshot) {
  const tags = snapshot.packageTags[normalizeName(packageName)] ?? [];
  return tags.filter((tag) => promptTokens.includes(tag)).length;
}

export function scoreMigrationCommand(
  promptTokens: string[],
  packageName: string,
  commandName: string,
  snapshot: MigrationGroundingSnapshot,
) {
  const hint = snapshot.commandHints.find(
    (item) =>
      normalizeName(item.packageName) === normalizeName(packageName) &&
      normalizeName(item.commandName) === normalizeName(commandName),
  );

  if (!hint) {
    return 0;
  }

  return hint.tags.filter((tag) => promptTokens.includes(tag)).length;
}
