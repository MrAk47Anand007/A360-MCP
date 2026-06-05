import type { A360Request } from '../a360/client.js';
import {
  getFileContent,
  getFileDependencies,
  listFolderChildren,
  listFolderItems,
  updateFileContent,
  updateFileDependencies,
} from '../a360/repository.js';

type BotContent = Record<string, unknown> & {
  nodes?: Array<Record<string, unknown>>;
};

function countLinesAccurately(node: Record<string, unknown>): number {
  let lineCount = 0;
  if (node.commandName) {
    lineCount += 1;
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      if (child && typeof child === 'object') {
        lineCount += countLinesAccurately(child as Record<string, unknown>);
      }
    }
  }

  if (Array.isArray(node.branches)) {
    for (const branch of node.branches) {
      if (branch && typeof branch === 'object') {
        lineCount += countLinesAccurately(branch as Record<string, unknown>);
      }
    }
  }

  return lineCount;
}

export function calculateTotalLines(botContent: BotContent) {
  let totalLines = 0;
  for (const node of botContent.nodes ?? []) {
    totalLines += countLinesAccurately(node);
  }
  return totalLines;
}

function getLogContent(attribute: Record<string, unknown>) {
  const value = attribute.value as Record<string, unknown> | undefined;
  if (!value) {
    return { key: null as string | null, content: null as string | null };
  }
  for (const key of ['expression', 'literal', 'value', 'string']) {
    if (typeof value[key] === 'string') {
      return { key, content: value[key] as string };
    }
  }
  return { key: null as string | null, content: null as string | null };
}

function setLogContent(attribute: Record<string, unknown>, key: string | null, content: string) {
  if (!key) {
    return;
  }
  const value = (attribute.value ?? {}) as Record<string, unknown>;
  value[key] = content;
  attribute.value = value;
}

export function updateLogMessages(botContent: BotContent, logStructure: string) {
  let totalLineNumber = 0;

  function applyPlaceholderReplacement(currentLogContent: string, lineNumber: number) {
    if (logStructure && logStructure.trim()) {
      let escaped = logStructure.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      escaped = escaped.replace(/\s+/g, '\\s*');
      const regex = new RegExp(escaped, 'gi');
      if (regex.test(currentLogContent)) {
        return currentLogContent.replace(regex, String(lineNumber));
      }
    }

    const pipeRegex = /\|\s*\d+\s*\|/;
    if (pipeRegex.test(currentLogContent)) {
      return currentLogContent.replace(pipeRegex, `| ${lineNumber} |`);
    }
    return currentLogContent.replace(/-\d+-/, `-${lineNumber}-`);
  }

  function processNode(node: Record<string, unknown>) {
    if (node.commandName) {
      totalLineNumber += 1;
      if (node.commandName === 'logToFile' && Array.isArray(node.attributes)) {
        for (const attribute of node.attributes) {
          if (!attribute || typeof attribute !== 'object') {
            continue;
          }
          if ((attribute as Record<string, unknown>).name !== 'logContent') {
            continue;
          }
          const logAttribute = attribute as Record<string, unknown>;
          const { key, content } = getLogContent(logAttribute);
          if (!content) {
            continue;
          }
          setLogContent(
            logAttribute,
            key,
            applyPlaceholderReplacement(content, totalLineNumber),
          );
        }
      }
    }

    for (const key of ['children', 'branches']) {
      const nested = node[key];
      if (Array.isArray(nested)) {
        for (const child of nested) {
          if (child && typeof child === 'object') {
            processNode(child as Record<string, unknown>);
          }
        }
      }
    }
  }

  for (const node of botContent.nodes ?? []) {
    processNode(node);
  }

  return botContent;
}

async function discoverBots(
  request: A360Request,
  folderId: string,
  recursive: boolean,
) {
  const seen = new Set<string>();
  const bots: Array<{ id: string; name: string; path?: string }> = [];

  async function visit(currentFolderId: string): Promise<void> {
    if (seen.has(currentFolderId)) {
      return;
    }
    seen.add(currentFolderId);
    const listing = await listFolderItems(request, currentFolderId);
    const items = Array.isArray(listing)
      ? listing
      : listing && typeof listing === 'object' && 'list' in listing && Array.isArray(listing.list)
        ? listing.list
        : [];

    for (const item of items as Array<Record<string, unknown>>) {
      if (item.type === 'application/vnd.aa.taskbot') {
        bots.push({
          id: String(item.id),
          name: String(item.name ?? item.id),
          path: typeof item.path === 'string' ? item.path : undefined,
        });
      }
    }

    if (!recursive) {
      return;
    }

    const children = await listFolderChildren(request, currentFolderId);
    const childItems = Array.isArray(children)
      ? children
      : children && typeof children === 'object' && 'list' in children && Array.isArray(children.list)
        ? children.list
        : [];
    for (const child of childItems as Array<Record<string, unknown>>) {
      if (child.id && (child.folder || child.type === 'application/vnd.aa.directory')) {
        await visit(String(child.id));
      }
    }
  }

  await visit(folderId);
  return bots;
}

export async function scanLogToFileIssues(
  request: A360Request,
  folderId: string,
  recursive = true,
  logStructure = '[linenumber]',
) {
  const bots = await discoverBots(request, folderId, recursive);
  const results = [];

  for (const bot of bots) {
    const content = (await getFileContent(request, bot.id)) as BotContent;
    const serializedBefore = JSON.stringify(content);
    const updated = updateLogMessages(
      JSON.parse(serializedBefore) as BotContent,
      logStructure,
    );
    const changed = JSON.stringify(updated) !== serializedBefore;
    results.push({
      ...bot,
      changed,
      totalLines: calculateTotalLines(content),
    });
  }

  return {
    folderId,
    recursive,
    scanned: results.length,
    issues: results.filter((item) => item.changed),
    results,
  };
}

export async function applyLogToFileFix(
  request: A360Request,
  folderId: string,
  recursive = true,
  logStructure = '[linenumber]',
  dryRun = true,
) {
  const scan = await scanLogToFileIssues(request, folderId, recursive, logStructure);
  const updated: string[] = [];

  if (!dryRun) {
    for (const item of scan.issues) {
      const content = (await getFileContent(request, item.id)) as BotContent;
      const updatedContent = updateLogMessages(content, logStructure);
      const dependencies = (await getFileDependencies(request, item.id)) as {
        dependencies?: Array<{ id?: string | number }>;
      };
      const childFileIds = (dependencies.dependencies ?? [])
        .map((dependency) => dependency.id)
        .filter((id): id is string | number => id !== undefined && id !== null)
        .map(String)
        .filter((id) => id !== item.id);

      await updateFileContent(request, item.id, updatedContent, false);
      await updateFileDependencies(request, item.id, childFileIds);
      updated.push(item.name);
    }
  }

  return {
    ...scan,
    dryRun,
    updated,
  };
}
