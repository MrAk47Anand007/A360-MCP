import { describe, expect, it } from 'vitest';
import {
  applyPackageVersionUpdate,
  planPackageVersionUpdate,
  scanPackageUsage,
} from '../src/workflows/package-governance.js';

describe('package governance workflow', () => {
  it('exports package governance entrypoints', () => {
    expect(typeof scanPackageUsage).toBe('function');
    expect(typeof planPackageVersionUpdate).toBe('function');
    expect(typeof applyPackageVersionUpdate).toBe('function');
  });
});
