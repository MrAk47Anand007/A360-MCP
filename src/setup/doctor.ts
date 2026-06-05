export function formatDoctorReport(ok: boolean, details: string) {
  return `${ok ? 'OK' : 'FAIL'}: ${details}`;
}
