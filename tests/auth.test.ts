import { describe, expect, it } from 'vitest';
import nock from 'nock';
import { loginWithPassword } from '../src/a360/auth.js';
import { createA360Client } from '../src/a360/client.js';

describe('A360 auth', () => {
  it('logs in with POST /v2/authentication and returns the token', async () => {
    nock('https://community.cloud.automationanywhere.digital')
      .post('/v2/authentication', {
        username: 'user',
        password: 'pass',
        multipleLogin: true,
      })
      .reply(200, { token: 'abc123' });

    const token = await loginWithPassword(
      'https://community.cloud.automationanywhere.digital',
      'user',
      'pass',
    );

    expect(token).toBe('abc123');
  });

  it('retries once with a refreshed token after a 401 response', async () => {
    nock('https://community.cloud.automationanywhere.digital')
      .get('/v2/repository/files/42/content')
      .matchHeader('X-Authorization', 'stale-token')
      .reply(401, { message: 'expired' })
      .get('/v2/repository/files/42/content')
      .matchHeader('X-Authorization', 'fresh-token')
      .reply(200, { ok: true });

    let currentToken = 'stale-token';
    const client = createA360Client('https://community.cloud.automationanywhere.digital', {
      getToken: () => currentToken,
      onUnauthorized: async () => {
        currentToken = 'fresh-token';
        return currentToken;
      },
    });

    const result = await client('/v2/repository/files/42/content', { method: 'GET' });
    expect(result).toEqual({ ok: true });
  });
});
