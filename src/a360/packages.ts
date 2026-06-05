import type { A360Request } from './client.js';

export type PackageFilterRequest = {
  fields?: string[];
  filter?: Record<string, unknown> | null;
  sort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
  page?: { offset: number; length: number };
};

export type PackageReference = {
  name: string;
  version?: string;
};

export async function listPackages(
  request: A360Request,
  options?: {
    filterRequest?: PackageFilterRequest;
    includeDownloadUrls?: boolean;
  },
) {
  return request('/v3/packages/package/list', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filterRequest: options?.filterRequest ?? {
        fields: [],
        filter: null,
        sort: [{ field: 'label', direction: 'asc' }],
        page: { offset: 0, length: 150 },
      },
      includeDownloadUrls: options?.includeDownloadUrls ?? false,
    }),
  });
}

export async function getPackageVersionDetails(
  request: A360Request,
  packages: PackageReference[],
) {
  return request('/v3/packages/versions/details', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ packages }),
  });
}

export async function getPackageVersionUsage(
  request: A360Request,
  packageName: string,
  filterRequest?: PackageFilterRequest,
) {
  return request(`/v2/packages/${encodeURIComponent(packageName)}/versions/usage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(
      filterRequest ?? {
        page: { offset: 0, length: 1000 },
      },
    ),
  });
}
