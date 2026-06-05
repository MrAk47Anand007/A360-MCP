import { describe, expect, it } from 'vitest';
import { createServer } from '../src/server.js';

describe('server module', () => {
  it('exports a createServer function', () => {
    expect(typeof createServer).toBe('function');
  });
});
