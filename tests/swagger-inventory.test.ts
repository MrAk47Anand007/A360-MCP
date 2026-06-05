import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('a360 swagger inventory', () => {
  it('contains the first MCP endpoint slice', async () => {
    const file = join(process.cwd(), 'docs', 'a360-swagger-inventory.json');
    const inventory = JSON.parse(await readFile(file, 'utf8')) as {
      endpoints: Array<{ method: string; path: string; source: string }>;
    };

    expect(inventory.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'POST', path: '/v2/authentication' }),
        expect.objectContaining({ method: 'GET', path: '/v2/repository/files/{fileid}/content' }),
        expect.objectContaining({ method: 'GET', path: '/v2/repository/files/{fileid}/dependencies' }),
        expect.objectContaining({ method: 'POST', path: '/v3/automations/deploy' }),
        expect.objectContaining({ method: 'POST', path: '/v3/activity/list' }),
      ]),
    );
  });
});
