import type { A360Request } from '../a360/client.js';
import {
  getFileContent,
  getFileDependencies,
  listFolderChildren,
  listFolderItems,
  updateFileContent,
  updateFileDependencies,
} from '../a360/repository.js';
import { saveBotBundle } from './repository-save.js';

type RepositoryItem = {
  id: string;
  name: string;
  path?: string;
  type: string;
  folder?: boolean;
};

type BotSnapshot = {
  fileId: string;
  name: string;
  path?: string;
  packages: Record<string, string>;
};

function normalizeList(payload: unknown): RepositoryItem[] {
  if (Array.isArray(payload)) {
    return payload as RepositoryItem[];
  }
  if (payload && typeof payload === 'object' && 'list' in payload && Array.isArray(payload.list)) {
    return payload.list as RepositoryItem[];
  }
  return [];
}

async function discoverBots(
  request: A360Request,
  folderId: string,
  recursive: boolean,
): Promise<Array<{ id: string; name: string; path?: string }>> {
  const seen = new Set<string>();
  const bots: Array<{ id: string; name: string; path?: string }> = [];

  async function visit(currentFolderId: string): Promise<void> {
    if (seen.has(currentFolderId)) {
      return;
    }
    seen.add(currentFolderId);

    const items = normalizeList(await listFolderItems(request, currentFolderId));
    for (const item of items) {
      if (item.type === 'application/vnd.aa.taskbot') {
        bots.push({ id: item.id, name: item.name, path: item.path });
      }
    }

    if (!recursive) {
      return;
    }

    const children = normalizeList(await listFolderChildren(request, currentFolderId));
    for (const child of children) {
      if (child.id && (child.folder || child.type === 'application/vnd.aa.directory')) {
        await visit(String(child.id));
      }
    }
  }

  await visit(folderId);
  return bots;
}

export async function scanPackageUsage(
  request: A360Request,
  folderId: string,
  recursive = true,
) {
  const bots = await discoverBots(request, folderId, recursive);
  const snapshots: BotSnapshot[] = [];
  const summary: Record<string, Record<string, number>> = {};

  for (const bot of bots) {
    const content = (await getFileContent(request, bot.id)) as ({
      packages?: Array<{ name?: string; version?: string }>;
    } | null);
    if (!content || typeof content !== 'object') {
      snapshots.push({
        fileId: bot.id,
        name: bot.name,
        path: bot.path,
        packages: {},
      });
      continue;
    }
    const packageMap: Record<string, string> = {};
    for (const pkg of content.packages ?? []) {
      if (!pkg.name || !pkg.version) {
        continue;
      }
      packageMap[String(pkg.name)] = String(pkg.version);
      summary[String(pkg.name)] ??= {};
      summary[String(pkg.name)][String(pkg.version)] =
        (summary[String(pkg.name)][String(pkg.version)] ?? 0) + 1;
    }
    snapshots.push({
      fileId: bot.id,
      name: bot.name,
      path: bot.path,
      packages: packageMap,
    });
  }

  return {
    folderId,
    recursive,
    botCount: snapshots.length,
    summary,
    snapshots,
  };
}

export async function planPackageVersionUpdate(
  request: A360Request,
  folderId: string,
  targets: Record<string, string>,
  recursive = true,
) {
  const scan = await scanPackageUsage(request, folderId, recursive);
  const plan = scan.snapshots
    .map((snapshot) => {
      const packageChanges: Record<string, { before: string; after: string }> = {};
      for (const [packageName, currentVersion] of Object.entries(snapshot.packages)) {
        const targetVersion = targets[packageName];
        if (targetVersion && targetVersion !== currentVersion) {
          packageChanges[packageName] = {
            before: currentVersion,
            after: targetVersion,
          };
        }
      }
      return {
        ...snapshot,
        packageChanges,
      };
    })
    .filter((snapshot) => Object.keys(snapshot.packageChanges).length > 0);

  return {
    folderId,
    recursive,
    targets,
    botCount: scan.botCount,
    updateCount: plan.length,
    plan,
  };
}

export async function applyPackageVersionUpdate(
  request: A360Request,
  folderId: string,
  targets: Record<string, string>,
  options?: {
    recursive?: boolean;
    dryRun?: boolean;
    selectedBotIds?: string[];
  },
) {
  const recursive = options?.recursive ?? true;
  const dryRun = options?.dryRun ?? false;
  const selectedBotIds = new Set(options?.selectedBotIds ?? []);
  const plan = await planPackageVersionUpdate(request, folderId, targets, recursive);
  const updated: string[] = [];
  const skipped: string[] = [];

  for (const item of plan.plan) {
    if (selectedBotIds.size > 0 && !selectedBotIds.has(item.fileId)) {
      skipped.push(item.name);
      continue;
    }

    if (dryRun) {
      updated.push(item.name);
      continue;
    }

    const content = (await getFileContent(request, item.fileId)) as {
      packages?: Array<{ name?: string; version?: string }>;
    } & Record<string, unknown>;
    const nextPackages = (content.packages ?? []).map((pkg) => {
      const name = String(pkg.name ?? '');
      return targets[name]
        ? { ...pkg, version: targets[name] }
        : pkg;
    });
    content.packages = nextPackages;

    const dependencies = (await getFileDependencies(request, item.fileId)) as {
      dependencies?: Array<{ id?: string | number }>;
    };
    const childFileIds = (dependencies.dependencies ?? [])
      .map((dependency) => dependency.id)
      .filter((id): id is string | number => id !== undefined && id !== null)
      .map(String)
      .filter((id) => id !== item.fileId);

    await saveBotBundle(
      {
        updateFileContent: (fileId, nextContent, hasErrors) =>
          updateFileContent(request, fileId, nextContent, hasErrors),
        updateFileDependencies: (fileId, nextChildFileIds) =>
          updateFileDependencies(request, fileId, nextChildFileIds),
      },
      {
        fileId: item.fileId,
        content,
        dependencies: childFileIds,
        hasErrors: false,
      },
    );
    updated.push(item.name);
  }

  return {
    folderId,
    recursive,
    dryRun,
    targets,
    planned: plan.updateCount,
    updated,
    skipped,
  };
}
