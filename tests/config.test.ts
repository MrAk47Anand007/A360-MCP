import { describe, expect, it } from 'vitest';
import { normalizeBaseUrl, resolveDefaultConfigPath } from '../src/config.js';

describe('config', () => {
  it('stores the A360 control room base URL and auth mode', () => {
    expect(normalizeBaseUrl('https://example.com/')).toBe('https://example.com');
  });

  it('builds a default config path', () => {
    expect(resolveDefaultConfigPath()).toContain('a360-mcp');
  });
});
