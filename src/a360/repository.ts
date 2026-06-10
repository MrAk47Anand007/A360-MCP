import { type A360Request } from './client.js';

export async function createBot(
  request: A360Request,
  parentFolderId: string,
  name: string,
  description = '',
) {
  return request('/v2/repository/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contentType: 'application/vnd.aa.taskbot',
      name,
      description,
      parentFolderId,
      tags: [{ namespace: 'INTENDED_TARGET', value: 'WINDOWS' }],
    }),
  });
}

export async function listFolderItems(request: A360Request, folderId: string) {
  return request(`/v2/repository/folders/${folderId}/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: [],
      filter: null,
      sort: [],
      page: { offset: 0, length: 100 },
    }),
  });
}

export async function listFolderChildren(request: A360Request, folderId: string) {
  return request(`/v2/repository/folders/${folderId}/children`, {
    method: 'GET',
  });
}

export async function getFileContent(request: A360Request, fileId: string) {
  return request(`/v2/repository/files/${fileId}/content`, {
    method: 'GET',
  });
}

export async function updateFileContent(
  request: A360Request,
  fileId: string,
  content: Record<string, unknown>,
  hasErrors = false,
) {
  return request(`/v2/repository/files/${fileId}/content?hasErrors=${String(hasErrors)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/vnd.aa.taskbot' },
    body: JSON.stringify(content),
  });
}

export async function getFileDependencies(request: A360Request, fileId: string) {
  return request(`/v2/repository/files/${fileId}/dependencies`, {
    method: 'GET',
  });
}

export async function updateFileDependencies(
  request: A360Request,
  fileId: string,
  childFileIds: string[],
) {
  return request(`/v2/repository/files/${fileId}/dependencies`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ childFileIds }),
  });
}

export async function deleteFile(request: A360Request, fileId: string) {
  return request(`/v2/repository/files/${fileId}`, {
    method: 'DELETE',
  });
}
