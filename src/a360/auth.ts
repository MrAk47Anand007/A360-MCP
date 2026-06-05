export async function loginWithPassword(
  baseUrl: string,
  username: string,
  password: string,
) {
  const response = await fetch(`${baseUrl}/v2/authentication`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password,
      multipleLogin: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Authentication failed with ${response.status}`);
  }

  const payload = (await response.json()) as { token?: string };
  if (!payload.token) {
    throw new Error('Authentication response did not include a token.');
  }

  return payload.token;
}

export async function loginWithApiKey(
  baseUrl: string,
  username: string,
  apiKey: string,
) {
  const response = await fetch(`${baseUrl}/v2/authentication`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      apiKey,
      multipleLogin: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Authentication failed with ${response.status}`);
  }

  const payload = (await response.json()) as { token?: string };
  if (!payload.token) {
    throw new Error('Authentication response did not include a token.');
  }

  return payload.token;
}
