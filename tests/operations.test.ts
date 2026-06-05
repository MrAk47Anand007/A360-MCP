import { describe, expect, it } from 'vitest';
import * as operations from '../src/a360/operations.js';

describe('operations api signatures', () => {
  it('exports deploy and activity operations', async () => {
    expect(typeof operations.deployAutomation).toBe('function');
    expect(typeof operations.listActivity).toBe('function');
    expect(typeof operations.getExecutionDetails).toBe('function');
  });
});
