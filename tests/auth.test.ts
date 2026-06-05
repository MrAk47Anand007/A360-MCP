import { describe, expect, it } from 'vitest';
import nock from 'nock';
import { loginWithPassword } from '../src/a360/auth.js';

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
});
