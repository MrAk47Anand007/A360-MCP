import { type A360Request } from './client.js';

export function buildRecentActivityPayload(daysBack = 30, length = 20) {
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

  return {
    filter: {
      operator: 'or',
      operands: [
        { operator: 'ge', field: 'startDateTime', value: since },
        { operator: 'eq', field: 'status', value: 'QUEUED' },
        { operator: 'ge', field: 'createdOn', value: since },
      ],
    },
    sort: [{ field: 'modifiedOn', direction: 'desc' }],
    page: { offset: 0, length },
  };
}

export async function deployAutomation(
  request: A360Request,
  payload: Record<string, unknown>,
) {
  return request('/v3/automations/deploy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function listActivity(
  request: A360Request,
  payload: Record<string, unknown>,
) {
  return request('/v3/activity/list', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function getExecutionDetails(
  request: A360Request,
  executionId: string,
) {
  return request(`/v3/activity/execution/${executionId}`, {
    method: 'GET',
  });
}
