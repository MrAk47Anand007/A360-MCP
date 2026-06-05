import { type A360Request } from './client.js';

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

export async function getFileContent(request: A360Request, fileId: string) {
  return request(`/v2/repository/files/${fileId}/content`, {
    method: 'GET',
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
