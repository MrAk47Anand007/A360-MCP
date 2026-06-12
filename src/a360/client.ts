export type A360Request = (path: string, init?: RequestInit) => Promise<unknown>;

type TokenProvider = string | (() => string | Promise<string>);

type A360ClientOptions = {
  getToken: TokenProvider;
  onUnauthorized?: () => Promise<string | null>;
};

export class A360RequestError extends Error {
  status: number;
  path: string;
  body: string;

  constructor(status: number, path: string, body: string) {
    super(`A360 request failed with ${status}: ${path}`);
    this.name = 'A360RequestError';
    this.status = status;
    this.path = path;
    this.body = body;
  }
}

async function resolveToken(provider: TokenProvider) {
  if (typeof provider === 'function') {
    return await provider();
  }

  return provider;
}

function normalizeOptions(tokenOrOptions: string | A360ClientOptions): A360ClientOptions {
  if (typeof tokenOrOptions === 'string') {
    return { getToken: tokenOrOptions };
  }

  return tokenOrOptions;
}

export function createA360Client(
  baseUrl: string,
  tokenOrOptions: string | A360ClientOptions,
): A360Request {
  const options = normalizeOptions(tokenOrOptions);

  return async function request(path: string, init: RequestInit = {}) {
    let refreshed = false;

    while (true) {
      const token = await resolveToken(options.getToken);
      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          'X-Authorization': token,
          ...(init.headers ?? {}),
        },
      });

      if (response.ok) {
        const text = await response.text();
        if (!text) {
          return null;
        }

        try {
          return JSON.parse(text) as unknown;
        } catch {
          return text;
        }
      }

      const body = await response.text();
      if (response.status === 401 && options.onUnauthorized && !refreshed) {
        refreshed = true;
        const nextToken = await options.onUnauthorized();
        if (nextToken) {
          continue;
        }
      }

      throw new A360RequestError(response.status, path, body);
    }
  };
}
