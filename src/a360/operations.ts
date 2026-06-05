import { type A360Request } from './client.js';

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
