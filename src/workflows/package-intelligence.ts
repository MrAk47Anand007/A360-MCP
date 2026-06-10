import type { A360Request } from '../a360/client.js';
import {
  getPackageVersionDetails,
  getPackageVersionUsage,
  listPackages,
  type PackageFilterRequest,
  type PackageReference,
} from '../a360/packages.js';

type PackageListItem = {
  name?: string;
  label?: string;
  packageVersion?: string;
  description?: string;
  group?: string;
  artifactName?: string;
  codeVersion?: string;
  settingsAttributes?: unknown[];
  commands?: unknown[];
  iterators?: unknown[];
  conditionals?: unknown[];
  triggers?: unknown[];
  exceptions?: unknown[];
  [key: string]: unknown;
};

type CommandLike = {
  name?: string;
  label?: string;
  description?: string;
  nodeLabel?: string;
  nestable?: boolean;
  branchable?: boolean;
  branchOf?: string;
  returnType?: string;
  returnSubtype?: string;
  returnRequired?: boolean;
  returns?: unknown[];
  returnSchema?: unknown[];
  attributes?: unknown[];
};

type AttributeLike = {
  name?: string;
  label?: string;
  type?: string;
  description?: string;
  hidden?: boolean;
  readOnly?: boolean;
  defaultValue?: unknown;
  options?: Array<{ label?: string; value?: string; name?: string }>;
  rules?: Array<{ name?: string }>;
  attributes?: unknown[];
};

type ReturnLike = {
  name?: string;
  label?: string;
  type?: string;
  subtype?: string;
  description?: string;
  required?: boolean;
  direct?: boolean;
  schema?: unknown[];
};

export type NormalizedAttributeMetadata = {
  name: string;
  label: string;
  type: string;
  description?: string;
  required: boolean;
  hidden: boolean;
  readOnly: boolean;
  defaultValue?: unknown;
  rules: string[];
  availableOptions: string[];
  nestedAttributes: NormalizedAttributeMetadata[];
};

export type NormalizedReturnMetadata = {
  name: string;
  label: string;
  type: string;
  subtype: string;
  description?: string;
  required: boolean;
  direct: boolean;
  schemaCount: number;
};

export type NormalizedCommandMetadata = {
  packageName: string;
  packageVersion: string;
  name: string;
  label: string;
  description?: string;
  nodeLabel?: string;
  nestable: boolean;
  branchable: boolean;
  branchOf?: string;
  returnType: string;
  returnSubtype: string;
  returnRequired: boolean;
  attributes: NormalizedAttributeMetadata[];
  requiredFields: string[];
  returns: NormalizedReturnMetadata[];
};

export type NormalizedPackageMetadata = {
  packageName: string;
  packageLabel: string;
  packageVersion: string;
  description?: string;
  group?: string;
  artifactName?: string;
  codeVersion?: string;
  settingsAttributes: NormalizedAttributeMetadata[];
  commandCount: number;
  iteratorCount: number;
  conditionalCount: number;
  triggerCount: number;
  exceptionCount: number;
  commands: NormalizedCommandMetadata[];
  iterators: NormalizedCommandMetadata[];
  conditionals: NormalizedCommandMetadata[];
  triggers: NormalizedCommandMetadata[];
  exceptions: NormalizedCommandMetadata[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizePackageList(payload: unknown): PackageListItem[] {
  const record = asRecord(payload);
  const list = record?.list;
  return Array.isArray(list) ? (list as PackageListItem[]) : [];
}

function normalizePackageDetails(payload: unknown): PackageListItem[] {
  const record = asRecord(payload);
  const list = record?.list;
  if (!Array.isArray(list)) {
    return [];
  }

  return list
    .map((item) => {
      const entry = asRecord(item);
      const innerPackage = asRecord(entry?.package);
      return (innerPackage ?? entry) as PackageListItem;
    })
    .filter((item) => !!item.name);
}

function normalizeAttribute(attribute: AttributeLike): NormalizedAttributeMetadata {
  const nestedAttributes = Array.isArray(attribute.attributes)
    ? attribute.attributes
        .map((item) => asRecord(item) as AttributeLike | null)
        .filter((item): item is AttributeLike => item !== null)
        .map(normalizeAttribute)
    : [];

  const rules = Array.isArray(attribute.rules)
    ? attribute.rules
        .map((rule) => asRecord(rule)?.name)
        .filter((name): name is string => typeof name === 'string' && name.length > 0)
    : [];

  const availableOptions = Array.isArray(attribute.options)
    ? attribute.options
        .map((option) => option.label ?? option.value ?? option.name)
        .filter((option): option is string => typeof option === 'string' && option.length > 0)
    : [];

  return {
    name: String(attribute.name ?? ''),
    label: String(attribute.label ?? attribute.name ?? ''),
    type: String(attribute.type ?? 'UNDEFINED'),
    description:
      typeof attribute.description === 'string' && attribute.description.length > 0
        ? attribute.description
        : undefined,
    required: rules.includes('NOT_EMPTY'),
    hidden: Boolean(attribute.hidden),
    readOnly: Boolean(attribute.readOnly),
    defaultValue: attribute.defaultValue,
    rules,
    availableOptions,
    nestedAttributes,
  };
}

function normalizeReturns(returnsValue: unknown): NormalizedReturnMetadata[] {
  if (!Array.isArray(returnsValue)) {
    return [];
  }

  return returnsValue
    .map((item) => asRecord(item) as ReturnLike | null)
    .filter((item): item is ReturnLike => item !== null)
    .map((item) => ({
      name: String(item.name ?? ''),
      label: String(item.label ?? ''),
      type: String(item.type ?? 'UNDEFINED'),
      subtype: String(item.subtype ?? 'ANY'),
      description:
        typeof item.description === 'string' && item.description.length > 0
          ? item.description
          : undefined,
      required: Boolean(item.required),
      direct: Boolean(item.direct),
      schemaCount: Array.isArray(item.schema) ? item.schema.length : 0,
    }));
}

function normalizeCommand(
  value: CommandLike,
  packageName: string,
  packageVersion: string,
): NormalizedCommandMetadata {
  const attributes = Array.isArray(value.attributes)
    ? value.attributes
        .map((item) => asRecord(item) as AttributeLike | null)
        .filter((item): item is AttributeLike => item !== null)
        .map(normalizeAttribute)
    : [];

  return {
    packageName,
    packageVersion,
    name: String(value.name ?? ''),
    label: String(value.label ?? value.name ?? ''),
    description:
      typeof value.description === 'string' && value.description.length > 0
        ? value.description
        : undefined,
    nodeLabel:
      typeof value.nodeLabel === 'string' && value.nodeLabel.length > 0
        ? value.nodeLabel
        : undefined,
    nestable: Boolean(value.nestable),
    branchable: Boolean(value.branchable),
    branchOf:
      typeof value.branchOf === 'string' && value.branchOf.length > 0
        ? value.branchOf
        : undefined,
    returnType: String(value.returnType ?? 'UNDEFINED'),
    returnSubtype: String(value.returnSubtype ?? 'UNDEFINED'),
    returnRequired: Boolean(value.returnRequired),
    attributes,
    requiredFields: attributes.filter((attribute) => attribute.required).map((attribute) => attribute.name),
    returns: normalizeReturns(value.returns ?? value.returnSchema),
  };
}

export function normalizePackageMetadata(packageValue: PackageListItem): NormalizedPackageMetadata {
  const packageName = String(packageValue.name ?? '').trim();
  const packageVersion = String(packageValue.packageVersion ?? '');

  const normalizeCommandGroup = (value: unknown) =>
    Array.isArray(value)
      ? value
          .map((item) => asRecord(item) as CommandLike | null)
          .filter((item): item is CommandLike => item !== null)
          .map((item) => normalizeCommand(item, packageName, packageVersion))
      : [];

  const commands = normalizeCommandGroup(packageValue.commands);
  const iterators = normalizeCommandGroup(packageValue.iterators);
  const conditionals = normalizeCommandGroup(packageValue.conditionals);
  const triggers = normalizeCommandGroup(packageValue.triggers);
  const exceptions = normalizeCommandGroup(packageValue.exceptions);
  const settingsAttributes = Array.isArray(packageValue.settingsAttributes)
    ? packageValue.settingsAttributes
        .map((item) => asRecord(item) as AttributeLike | null)
        .filter((item): item is AttributeLike => item !== null)
        .map(normalizeAttribute)
    : [];

  return {
    packageName,
    packageLabel: String(packageValue.label ?? packageName),
    packageVersion,
    description:
      typeof packageValue.description === 'string' && packageValue.description.length > 0
        ? packageValue.description
        : undefined,
    group: typeof packageValue.group === 'string' ? packageValue.group : undefined,
    artifactName:
      typeof packageValue.artifactName === 'string' ? packageValue.artifactName : undefined,
    codeVersion:
      typeof packageValue.codeVersion === 'string' ? packageValue.codeVersion : undefined,
    settingsAttributes,
    commandCount: commands.length,
    iteratorCount: iterators.length,
    conditionalCount: conditionals.length,
    triggerCount: triggers.length,
    exceptionCount: exceptions.length,
    commands,
    iterators,
    conditionals,
    triggers,
    exceptions,
  };
}

function makePackageCacheKey(reference: PackageReference): string {
  return `${reference.name.trim().toLowerCase()}@${(reference.version ?? '').trim().toLowerCase()}`;
}

export function createPackageIntelligenceGateway(request: A360Request) {
  const listCache = new Map<string, Promise<unknown>>();
  const detailCache = new Map<string, Promise<NormalizedPackageMetadata | null>>();

  async function listAvailablePackages(options?: {
    filterRequest?: PackageFilterRequest;
    includeDownloadUrls?: boolean;
    search?: string;
  }) {
    const listKey = JSON.stringify({
      filterRequest: options?.filterRequest ?? null,
      includeDownloadUrls: options?.includeDownloadUrls ?? false,
    });

    if (!listCache.has(listKey)) {
      listCache.set(
        listKey,
        listPackages(request, {
          filterRequest: options?.filterRequest,
          includeDownloadUrls: options?.includeDownloadUrls,
        }),
      );
    }

    const payload = await listCache.get(listKey)!;
    const search = options?.search?.trim().toLowerCase();
    const list = normalizePackageList(payload).filter((item) => {
      if (!search) {
        return true;
      }
      const haystack = `${item.name ?? ''} ${item.label ?? ''} ${item.description ?? ''}`.toLowerCase();
      return haystack.includes(search);
    });

    const byName = new Map<string, { name: string; label: string; versions: Set<string> }>();
    for (const item of list) {
      const name = String(item.name ?? '').trim();
      if (!name) {
        continue;
      }

      const current = byName.get(name) ?? {
        name,
        label: String(item.label ?? name),
        versions: new Set<string>(),
      };
      if (item.packageVersion) {
        current.versions.add(String(item.packageVersion));
      }
      byName.set(name, current);
    }

    return {
      count: byName.size,
      packages: Array.from(byName.values()).map((item) => ({
        name: item.name,
        label: item.label,
        versions: Array.from(item.versions),
      })),
      rawCount: list.length,
    };
  }

  async function resolveReference(reference: PackageReference): Promise<PackageReference> {
    if (reference.version && reference.version.trim().length > 0) {
      return {
        name: reference.name.trim(),
        version: reference.version.trim(),
      };
    }

    const packageList = await listAvailablePackages();
    const matches = packageList.packages.filter(
      (item) => item.name.trim().toLowerCase() === reference.name.trim().toLowerCase(),
    );

    return {
      name: reference.name.trim(),
      version: matches[0]?.versions[0],
    };
  }

  async function getNormalizedPackage(reference: PackageReference): Promise<NormalizedPackageMetadata | null> {
    const resolvedReference = await resolveReference(reference);
    const cacheKey = makePackageCacheKey(resolvedReference);

    if (!detailCache.has(cacheKey)) {
      detailCache.set(
        cacheKey,
        (async () => {
          const payload = await getPackageVersionDetails(request, [resolvedReference]);
          const packages = normalizePackageDetails(payload);
          const match = packages.find((item) => {
            const sameName =
              String(item.name ?? '').trim().toLowerCase() ===
              resolvedReference.name.trim().toLowerCase();
            const sameVersion =
              !resolvedReference.version ||
              String(item.packageVersion ?? '').trim().toLowerCase() ===
                resolvedReference.version.trim().toLowerCase();
            return sameName && sameVersion;
          });
          return match ? normalizePackageMetadata(match) : null;
        })(),
      );
    }

    return detailCache.get(cacheKey)!;
  }

  async function getPackageVersions(packageName: string) {
    const list = await listAvailablePackages({ search: packageName });
    const match = list.packages.find(
      (item) => item.name.trim().toLowerCase() === packageName.trim().toLowerCase(),
    );
    let usage: unknown = null;
    let usageError: string | null = null;

    try {
      usage = await getPackageVersionUsage(request, packageName);
    } catch (error) {
      usageError = error instanceof Error ? error.message : String(error);
    }

    return {
      packageName,
      versions: match?.versions ?? [],
      usage,
      usageError,
    };
  }

  async function getPackageCommandSchema(input: {
    packageName: string;
    packageVersion?: string;
    commandName: string;
  }) {
    const metadata = await getNormalizedPackage({
      name: input.packageName,
      version: input.packageVersion,
    });

    if (!metadata) {
      return null;
    }

    const commandName = input.commandName.trim().toLowerCase();
    return (
      metadata.commands.find((command) => command.name.trim().toLowerCase() === commandName) ??
      metadata.iterators.find((command) => command.name.trim().toLowerCase() === commandName) ??
      metadata.conditionals.find((command) => command.name.trim().toLowerCase() === commandName) ??
      metadata.triggers.find((command) => command.name.trim().toLowerCase() === commandName) ??
      metadata.exceptions.find((command) => command.name.trim().toLowerCase() === commandName) ??
      null
    );
  }

  async function resolvePackageMetadata(references: PackageReference[]) {
    const uniqueReferences = new Map<string, PackageReference>();
    for (const reference of references) {
      const resolved = await resolveReference(reference);
      uniqueReferences.set(makePackageCacheKey(resolved), resolved);
    }

    const resolvedPackages = await Promise.all(
      Array.from(uniqueReferences.values()).map((reference) => getNormalizedPackage(reference)),
    );

    return {
      requestedCount: references.length,
      resolvedCount: resolvedPackages.filter((item) => item !== null).length,
      packages: resolvedPackages.filter((item): item is NormalizedPackageMetadata => item !== null),
    };
  }

  return {
    listAvailablePackages,
    getPackageVersions,
    getPackageCommandSchema,
    resolvePackageMetadata,
  };
}

export async function listAvailablePackagesForWorkflow(
  request: A360Request,
  options?: {
    filterRequest?: PackageFilterRequest;
    includeDownloadUrls?: boolean;
    search?: string;
  },
) {
  return createPackageIntelligenceGateway(request).listAvailablePackages(options);
}

export async function getPackageVersionsForWorkflow(
  request: A360Request,
  packageName: string,
) {
  return createPackageIntelligenceGateway(request).getPackageVersions(packageName);
}

export async function getPackageCommandSchemaForWorkflow(
  request: A360Request,
  input: {
    packageName: string;
    packageVersion?: string;
    commandName: string;
  },
) {
  return createPackageIntelligenceGateway(request).getPackageCommandSchema(input);
}

export async function resolvePackageMetadataForWorkflow(
  request: A360Request,
  references: PackageReference[],
) {
  return createPackageIntelligenceGateway(request).resolvePackageMetadata(references);
}
