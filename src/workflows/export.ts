import {
  getFileContent,
  listFolderChildren,
  listFolderItems,
} from '../a360/repository.js';
import type { A360Request } from '../a360/client.js';
import type { JsonObject } from '../types.js';

type RepositoryItem = {
  id: string;
  name: string;
  path?: string;
  type: string;
  folder?: boolean;
};

const BOT_TYPE = 'application/vnd.aa.taskbot';
const ASSET_TYPES = new Set([
  'application/vnd.aa.taskbot',
  'application/vnd.aa.form',
  'application/vnd.aa.workflow',
]);

function normalizeList(payload: unknown): RepositoryItem[] {
  if (Array.isArray(payload)) {
    return payload as RepositoryItem[];
  }
  if (payload && typeof payload === 'object' && 'list' in payload && Array.isArray(payload.list)) {
    return payload.list as RepositoryItem[];
  }
  return [];
}

async function walkFolders(
  request: A360Request,
  folderId: string,
  recursive: boolean,
  onFolder: (folderId: string, items: RepositoryItem[]) => Promise<void>,
) {
  const seen = new Set<string>();

  async function visit(currentFolderId: string): Promise<void> {
    if (seen.has(currentFolderId)) {
      return;
    }
    seen.add(currentFolderId);
    const items = normalizeList(await listFolderItems(request, currentFolderId));
    await onFolder(currentFolderId, items);

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
}

export async function exportBots(
  request: A360Request,
  folderId: string,
  recursive = true,
) {
  const bots: Array<{
    id: string;
    name: string;
    path?: string;
    content: JsonObject;
  }> = [];

  await walkFolders(request, folderId, recursive, async (_currentFolderId, items) => {
    for (const item of items) {
      if (item.type !== BOT_TYPE) {
        continue;
      }
      const content = (await getFileContent(request, item.id)) as JsonObject | null;
      if (!content || typeof content !== 'object') {
        continue;
      }
      bots.push({
        id: item.id,
        name: item.name,
        path: item.path,
        content,
      });
    }
  });

  return {
    folderId,
    recursive,
    count: bots.length,
    bots,
  };
}

export async function exportAssets(
  request: A360Request,
  folderId: string,
  recursive = true,
) {
  const assets: Array<{
    id: string;
    name: string;
    path?: string;
    type: string;
    content: JsonObject;
  }> = [];

  await walkFolders(request, folderId, recursive, async (_currentFolderId, items) => {
    for (const item of items) {
      if (!ASSET_TYPES.has(item.type)) {
        continue;
      }
      const content = (await getFileContent(request, item.id)) as JsonObject | null;
      if (!content || typeof content !== 'object') {
        continue;
      }
      assets.push({
        id: item.id,
        name: item.name,
        path: item.path,
        type: item.type,
        content,
      });
    }
  });

  return {
    folderId,
    recursive,
    count: assets.length,
    assets,
  };
}
