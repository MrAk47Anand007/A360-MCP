import type { A360Request } from '../a360/client.js';
import {
  createBot,
  updateFileContent,
  updateFileDependencies,
} from '../a360/repository.js';
import type { JsonObject } from '../types.js';

export async function importBots(
  request: A360Request,
  parentFolderId: string,
  bots: Array<{
    name: string;
    content: JsonObject;
    dependencies?: string[];
    description?: string;
  }>,
) {
  const results = [];

  for (const bot of bots) {
    const created = (await createBot(
      request,
      parentFolderId,
      bot.name,
      bot.description ?? '',
    )) as { id?: string; name?: string; path?: string };
    const createdId = created.id ? String(created.id) : '';
    const contentResult = createdId
      ? await updateFileContent(request, createdId, bot.content, false)
      : null;
    const dependencyResult = createdId
      ? await updateFileDependencies(request, createdId, bot.dependencies ?? [])
      : null;

    results.push({
      name: bot.name,
      created,
      contentResult,
      dependencyResult,
    });
  }

  return {
    parentFolderId,
    count: results.length,
    results,
  };
}
