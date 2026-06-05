export type A360Request = (path: string, init?: RequestInit) => Promise<unknown>;

export function createA360Client(baseUrl: string, token: string): A360Request {
  return async function request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'X-Authorization': token,
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      throw new Error(`A360 request failed with ${response.status}: ${path}`);
    }

    const text = await response.text();
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  };
}
