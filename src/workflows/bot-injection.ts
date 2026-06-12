import { saveBotBundle } from './repository-save.js';

type BotInjectionApi = {
  getFileContent: (fileId: string) => Promise<unknown>;
  getFileDependencies: (fileId: string) => Promise<unknown>;
  updateFileContent: (
    fileId: string,
    content: Record<string, unknown>,
    hasErrors?: boolean,
  ) => Promise<unknown>;
  updateFileDependencies: (fileId: string, childFileIds: string[]) => Promise<unknown>;
};

type BotNode = Record<string, unknown> & { uid?: unknown };

function asContent(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Bot content payload is not an object.');
  }
  return value as Record<string, unknown>;
}

function getNodes(content: Record<string, unknown>): BotNode[] {
  return Array.isArray(content.nodes) ? (content.nodes as BotNode[]) : [];
}

function mergeVariables(
  content: Record<string, unknown>,
  incoming: Array<Record<string, unknown>> | undefined,
) {
  const variables = Array.isArray(content.variables)
    ? ([...content.variables] as Array<Record<string, unknown>>)
    : [];
  for (const variable of incoming ?? []) {
    const name = typeof variable.name === 'string' ? variable.name : '';
    if (!name || variables.some((entry) => entry.name === name)) {
      continue;
    }
    variables.push(variable);
  }
  content.variables = variables;
}

export type InsertRecorderStepsInput = {
  fileId: string;
  nodes: Array<Record<string, unknown>>;
  variables?: Array<Record<string, unknown>>;
  /** Insert after this node uid; appends to the end when omitted. */
  afterUid?: string;
  /** Required when the bot does not already reference the recorder package. */
  recorderPackage?: { name: string; version: string };
  hasErrors?: boolean;
  /** Optional hook to run package-aware normalization before saving. */
  normalizeContent?: (content: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

export async function insertRecorderSteps(
  api: BotInjectionApi,
  input: InsertRecorderStepsInput,
) {
  const content = asContent(await api.getFileContent(input.fileId));
  const nodes = [...getNodes(content)];

  let insertAt = nodes.length;
  if (input.afterUid !== undefined) {
    const index = nodes.findIndex((node) => node.uid === input.afterUid);
    if (index === -1) {
      throw new Error(`afterUid "${input.afterUid}" not found in bot ${input.fileId}.`);
    }
    insertAt = index + 1;
  }
  nodes.splice(insertAt, 0, ...input.nodes);
  content.nodes = nodes;

  mergeVariables(content, input.variables);

  const packages = Array.isArray(content.packages)
    ? ([...content.packages] as Array<Record<string, unknown>>)
    : [];
  const recorderPackageNames = new Set(
    input.nodes
      .map((node) => node.packageName)
      .filter((name): name is string => typeof name === 'string'),
  );

  for (const packageName of recorderPackageNames) {
    const exists = packages.some((entry) => entry.name === packageName);
    if (exists) {
      continue;
    }
    if (!input.recorderPackage || input.recorderPackage.name !== packageName) {
      throw new Error(
        `Bot ${input.fileId} does not reference package "${packageName}". ` +
          `Pass recorderPackage {name: "${packageName}", version} so the dependency can be added.`,
      );
    }
    packages.push({
      name: input.recorderPackage.name,
      version: input.recorderPackage.version,
      settingsAttributes: [],
    });
  }
  content.packages = packages;

  const dependencies = (await api.getFileDependencies(input.fileId)) as {
    dependencies?: Array<{ id?: string | number | null }>;
  };
  const finalContent = input.normalizeContent ? await input.normalizeContent(content) : content;
  const saveResult = await saveBotBundle(api, {
    fileId: input.fileId,
    content: finalContent,
    dependencies,
    hasErrors: input.hasErrors,
  });

  return {
    insertedUids: input.nodes.map((node) => String(node.uid ?? '')),
    insertedVariables: (input.variables ?? [])
      .map((variable) => (typeof variable.name === 'string' ? variable.name : ''))
      .filter(Boolean),
    nodeCount: nodes.length,
    saveResult,
  };
}

export type PatchStepTargetInput = {
  fileId: string;
  nodeUid: string;
  attributeName: string;
  value: Record<string, unknown>;
  variables?: Array<Record<string, unknown>>;
  hasErrors?: boolean;
  /** Optional hook to run package-aware normalization before saving. */
  normalizeContent?: (content: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

export async function patchStepTarget(api: BotInjectionApi, input: PatchStepTargetInput) {
  const content = asContent(await api.getFileContent(input.fileId));
  const nodes = getNodes(content);

  const node = nodes.find((candidate) => candidate.uid === input.nodeUid);
  if (!node) {
    throw new Error(`node uid "${input.nodeUid}" not found in bot ${input.fileId}.`);
  }

  const attributes = Array.isArray(node.attributes)
    ? (node.attributes as Array<Record<string, unknown>>)
    : [];
  const attribute = attributes.find((candidate) => candidate.name === input.attributeName);
  if (!attribute) {
    throw new Error(
      `attribute "${input.attributeName}" not found on node "${input.nodeUid}".`,
    );
  }

  const newAttributes = attributes.map((attr) =>
    attr === attribute ? { ...attr, value: input.value } : attr,
  );
  const newNode = { ...node, attributes: newAttributes };
  const newNodes = nodes.map((n) => (n === node ? newNode : n));
  content.nodes = newNodes;
  mergeVariables(content, input.variables);

  const dependencies = (await api.getFileDependencies(input.fileId)) as {
    dependencies?: Array<{ id?: string | number | null }>;
  };
  const finalContent = input.normalizeContent ? await input.normalizeContent(content) : content;
  const saveResult = await saveBotBundle(api, {
    fileId: input.fileId,
    content: finalContent,
    dependencies,
    hasErrors: input.hasErrors,
  });

  return {
    patchedUid: input.nodeUid,
    insertedVariables: (input.variables ?? [])
      .map((variable) => (typeof variable.name === 'string' ? variable.name : ''))
      .filter(Boolean),
    saveResult,
  };
}
