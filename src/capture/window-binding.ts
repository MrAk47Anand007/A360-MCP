type A360Variable = {
  name: string;
  description: string;
  type: string;
  readOnly: boolean;
  input: boolean;
  output: boolean;
  defaultValue: Record<string, unknown>;
};

export type WindowBinding = {
  variableName: string;
  expression: string;
  variable: A360Variable;
  windowValue: Record<string, unknown>;
};

function sanitizeToken(value: string) {
  return value.replace(/[^A-Za-z0-9]+/g, '').toUpperCase();
}

function deriveWindowLabel(pageUrl?: string, pageTitle?: string) {
  const title = pageTitle?.trim();
  if (title) {
    return title;
  }

  if (!pageUrl) {
    return 'Browser';
  }

  try {
    const url = new URL(pageUrl);
    const path = url.pathname.replace(/^\/+|\/+$/g, '').replace(/\//g, ' ');
    return [url.hostname, path].filter(Boolean).join(' ').trim() || url.hostname;
  } catch {
    return pageUrl;
  }
}

export function inferWindowVariableName(pageUrl?: string, pageTitle?: string) {
  const tokens: string[] = [];

  if (pageUrl) {
    try {
      const url = new URL(pageUrl);
      tokens.push(...url.hostname.split('.'));
      tokens.push(...url.pathname.split('/'));
    } catch {
      tokens.push(pageUrl);
    }
  }

  if (tokens.length === 0 && pageTitle) {
    tokens.push(...pageTitle.split(/\s+/));
  }

  const normalized = tokens.map(sanitizeToken).filter(Boolean).join('');
  return `pWin${normalized || 'BROWSER'}`;
}

export function buildWindowVariable(variableName: string, pageUrl?: string, pageTitle?: string): A360Variable {
  const windowValue = buildWindowValue(pageUrl, pageTitle);

  return {
    name: variableName,
    description: `Window binding for ${deriveWindowLabel(pageUrl, pageTitle)}`,
    type: 'WINDOW',
    readOnly: false,
    input: false,
    output: false,
    defaultValue: windowValue,
  };
}

export function buildWindowValue(pageUrl?: string, pageTitle?: string) {
  const label = deriveWindowLabel(pageUrl, pageTitle);

  return {
    type: 'WINDOW',
    mode: 'browser',
    presetType: 'NONE',
    window: {
      type: 'WINDOW',
      presetType: 'NONE',
      name: '',
      nameCaseInsensitive: true,
    },
    browserTab: {
      presetType: 'NONE',
      browserTabOpenNewWindow: false,
      name: label,
      nameCaseInsensitive: true,
    },
    browserTabTitleMode: 'string',
    browserTabTitleString: label,
    browserTabTitleCaseInsensitive: true,
    windowTitleMode: 'string',
    windowTitleString: '',
    windowTitleCaseInsensitive: true,
    expression: '',
  };
}

export function buildWindowBinding(pageUrl?: string, pageTitle?: string): WindowBinding {
  const variableName = inferWindowVariableName(pageUrl, pageTitle);
  return {
    variableName,
    expression: `$${variableName}$`,
    variable: buildWindowVariable(variableName, pageUrl, pageTitle),
    windowValue: buildWindowValue(pageUrl, pageTitle),
  };
}
