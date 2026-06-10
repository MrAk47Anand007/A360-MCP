import type { JsonObject } from '../types.js';
import { normalizeDependencyIdsForSave, normalizeTaskBotContentForSave } from './repository-save.js';

async function parseResponseBody(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function silentSaveBot(input: {
  baseUrl: string;
  token: string;
  fileId: string;
  content: JsonObject;
  dependencies: string[] | JsonObject;
  hasErrors?: boolean;
}) {
  const normalizedContent = normalizeTaskBotContentForSave(input.content);
  const childFileIds = normalizeDependencyIdsForSave(input.dependencies, input.fileId);
  const contentUrl = `${input.baseUrl}/v2/repository/files/${input.fileId}/content?hasErrors=${String(
    input.hasErrors ?? false,
  )}`;

  const contentResponse = await fetch(contentUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/vnd.aa.taskbot',
      Accept: '*/*',
      'X-Authorization': input.token,
    },
    body: JSON.stringify(normalizedContent),
  });

  const contentPayload = await parseResponseBody(contentResponse);
  if (!contentResponse.ok) {
    throw new Error(`Silent content save failed with ${contentResponse.status}`);
  }

  const dependencyResponse = await fetch(
    `${input.baseUrl}/v2/repository/files/${input.fileId}/dependencies`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Authorization': input.token,
      },
      body: JSON.stringify({ childFileIds }),
    },
  );

  const dependencyResult = await parseResponseBody(dependencyResponse);
  if (!dependencyResponse.ok) {
    throw new Error(`Silent dependency save failed with ${dependencyResponse.status}`);
  }

  return {
    childFileIds,
    content: contentPayload,
    dependencies: dependencyResult,
  };
}
