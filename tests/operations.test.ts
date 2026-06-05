import { describe, expect, it } from 'vitest';
import * as operations from '../src/a360/operations.js';

describe('operations api signatures', () => {
  it('exports deploy and activity operations', async () => {
    expect(typeof operations.deployAutomation).toBe('function');
    expect(typeof operations.listActivity).toBe('function');
    expect(typeof operations.getExecutionDetails).toBe('function');
  });

  it('builds a default recent activity payload', () => {
    const payload = operations.buildRecentActivityPayload(7, 10) as {
      filter: { operator: string; operands: Array<{ field: string }> };
      sort: Array<{ field: string; direction: string }>;
      page: { offset: number; length: number };
    };

    expect(payload.filter.operator).toBe('or');
    expect(payload.filter.operands.map((item) => item.field)).toEqual(
      expect.arrayContaining(['startDateTime', 'status', 'createdOn']),
    );
    expect(payload.sort[0]).toEqual({ field: 'modifiedOn', direction: 'desc' });
    expect(payload.page).toEqual({ offset: 0, length: 10 });
  });
});
