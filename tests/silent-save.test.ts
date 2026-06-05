import { describe, expect, it, vi } from 'vitest';
import { silentSaveBot } from '../src/workflows/silent-save.js';

describe('silent save workflow', () => {
  it('saves content and dependencies in sequence', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ content: 'ok' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response('"OK"', { status: 200 }),
      );

    vi.stubGlobal('fetch', fetchMock);

    const result = await silentSaveBot({
      baseUrl: 'https://example.com',
      token: 'token',
      fileId: '123',
      content: { nodes: [] },
      dependencies: ['123'],
      hasErrors: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      content: { content: 'ok' },
      dependencies: 'OK',
    });
  });
});
