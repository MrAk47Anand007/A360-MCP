import { describe, expect, it } from 'vitest';
import { formatDoctorReport } from '../src/setup/doctor.js';

describe('doctor', () => {
  it('formats a doctor report', () => {
    expect(formatDoctorReport(true, 'ready')).toBe('OK: ready');
  });
});
