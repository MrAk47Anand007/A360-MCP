import type { A360Request } from '../a360/client.js';
import {
  createBot,
  updateFileContent,
  updateFileDependencies,
} from '../a360/repository.js';
import type { JsonObject } from '../types.js';
import { saveBotBundle } from './repository-save.js';

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
    const saveResult = createdId
      ? await saveBotBundle(
          {
            updateFileContent: (fileId, content, hasErrors) =>
              updateFileContent(request, fileId, content, hasErrors),
            updateFileDependencies: (fileId, childFileIds) =>
              updateFileDependencies(request, fileId, childFileIds),
          },
          {
            fileId: createdId,
            content: bot.content,
            dependencies: bot.dependencies ?? [],
            hasErrors: false,
          },
        )
      : null;

    results.push({
      name: bot.name,
      created,
      contentResult: saveResult?.contentResult ?? null,
      dependencyResult: saveResult?.dependencyResult ?? null,
      childFileIds: saveResult?.childFileIds ?? [],
    });
  }

  return {
    parentFolderId,
    count: results.length,
    results,
  };
}
