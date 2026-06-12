import {
  a360TaskBotContentSchema,
  type A360TaskBotContent,
} from './control-room-schema.js';

export const DEFAULT_TASK_BOT_CONTENT: A360TaskBotContent = {
  triggers: [],
  nodes: [],
  variables: [],
  packages: [],
  properties: {
    botCodeVersion: '5',
    improvedNumberSupport: true,
    timeout: '0s',
    automationPriority: 'PRIORITY_MEDIUM',
    runInChildWindow: false,
    runInChildWindowMode: 'DESKTOP',
  },
  workItemTemplateName: null,
};

type DependencyReference = {
  id?: string | number | null;
};

type DependencyPayload =
  | string[]
  | {
      childFileIds?: Array<string | number>;
      dependencies?: DependencyReference[];
    };

type SaveBotBundleApi = {
  updateFileContent: (
    fileId: string,
    content: Record<string, unknown>,
    hasErrors?: boolean,
  ) => Promise<unknown>;
  updateFileDependencies: (fileId: string, childFileIds: string[]) => Promise<unknown>;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeLayoutNumber(layout: Record<string, unknown>, key: string) {
  const value = layout[key];
  if (typeof value === 'number') {
    layout[key] = Math.floor(value) || 0;
    return;
  }
  if (key in layout) {
    delete layout[key];
  }
}

function getObjectWithCapture(object: Record<string, unknown> | null) {
  const capture = asObject(object?.capture);
  if (!capture?.securelyRecorded) {
    return object;
  }
  return {
    ...(object ?? {}),
    capture: {
      securelyRecorded: true,
    },
  };
}

function getObjectWithCriteria(object: Record<string, unknown> | null) {
  const criteria = asObject(object?.criteria);
  if (!criteria) {
    return object;
  }

  const nextCriteria = Object.entries(criteria).reduce<Record<string, Record<string, unknown>>>(
    (result, [name, entryValue]) => {
    const entry = asObject(entryValue);
    if (!entry) {
      return result;
    }

    const nextEntry: Record<string, unknown> = {
      enabled: Boolean(entry.enabled),
    };

    if (!entry.securelyRecordedRemoveDisabled || nextEntry.enabled) {
      nextEntry.value = entry.value ?? { type: 'STRING', string: '' };
    }

    if (!('value' in nextEntry)) {
      nextEntry.value = { type: 'STRING', string: '' };
    }

    result[name] = nextEntry;
    return result;
  }, {});

  return {
    ...(object ?? {}),
    criteria: nextCriteria,
  };
}

function normalizeTypedValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeTypedValue);
  }

  const object = asObject(value);
  if (!object) {
    return value;
  }

  const nextValue: Record<string, unknown> = { ...object };

  switch (nextValue.type) {
    case 'REGION': {
      nextValue.region = getObjectWithCapture(asObject(nextValue.region));
      break;
    }
    case 'COORDINATE': {
      nextValue.coordinate = getObjectWithCapture(asObject(nextValue.coordinate));
      break;
    }
    case 'IMAGE': {
      if (nextValue.unsavedSecurelyRecorded) {
        nextValue.securelyRecorded = true;
        delete nextValue.unsavedSecurelyRecorded;
      }
      break;
    }
    case 'UIOBJECT': {
      const uiObject = getObjectWithCriteria(
        getObjectWithCapture(asObject(nextValue.uiObject)),
      );
      if (uiObject) {
        nextValue.uiObject = uiObject;
      }

      const anchor = asObject(nextValue.uiObjectAnchor);
      if (anchor?.uiObject) {
        nextValue.uiObjectAnchor = {
          ...anchor,
          uiObject: getObjectWithCriteria(
            getObjectWithCapture(asObject(anchor.uiObject)),
          ),
        };
      }
      break;
    }
    case 'DICTIONARY': {
      if (Array.isArray(nextValue.dictionary)) {
        nextValue.dictionary = nextValue.dictionary.map((entryValue) => {
          const entry = asObject(entryValue);
          if (!entry) {
            return entryValue;
          }
          return {
            ...entry,
            value: normalizeTypedValue(entry.value),
          };
        });
      }
      break;
    }
  }

  for (const [key, nestedValue] of Object.entries(nextValue)) {
    if (key === 'type') {
      continue;
    }
    if (Array.isArray(nestedValue)) {
      nextValue[key] = nestedValue.map(normalizeTypedValue);
      continue;
    }
    const nestedObject = asObject(nestedValue);
    if (nestedObject) {
      nextValue[key] = normalizeTypedValue(nestedObject);
    }
  }

  return nextValue;
}

function normalizeAttributes(attributes: unknown): unknown[] {
  if (!Array.isArray(attributes)) {
    return [];
  }

  return attributes.map((attributeValue) => {
    const attribute = asObject(attributeValue);
    if (!attribute) {
      return attributeValue;
    }

    const nextAttribute: Record<string, unknown> = { ...attribute };
    if ('value' in nextAttribute) {
      nextAttribute.value = normalizeTypedValue(nextAttribute.value);
    }
    if (Array.isArray(nextAttribute.attributes)) {
      nextAttribute.attributes = normalizeAttributes(nextAttribute.attributes);
    }
    if (nextAttribute.groupAttribute) {
      nextAttribute.groupAttribute = normalizeAttributes([nextAttribute.groupAttribute])[0];
    }
    if (nextAttribute.operatorAttribute) {
      nextAttribute.operatorAttribute = normalizeAttributes([nextAttribute.operatorAttribute])[0];
    }
    return nextAttribute;
  });
}

function normalizeNode(nodeValue: unknown): unknown {
  const node = asObject(nodeValue);
  if (!node) {
    return nodeValue;
  }

  const nextNode: Record<string, unknown> = { ...node };

  if ('disabled' in nextNode) {
    nextNode.disabled = Boolean(nextNode.disabled);
  }

  const layout = asObject(nextNode.layout);
  if (layout) {
    const nextLayout = { ...layout };
    normalizeLayoutNumber(nextLayout, 'x');
    normalizeLayoutNumber(nextLayout, 'y');
    normalizeLayoutNumber(nextLayout, 'width');
    normalizeLayoutNumber(nextLayout, 'height');
    nextNode.layout = nextLayout;
  }

  if (Array.isArray(nextNode.attributes)) {
    nextNode.attributes = normalizeAttributes(nextNode.attributes);
  }
  if (Array.isArray(nextNode.children)) {
    nextNode.children = nextNode.children.map(normalizeNode);
  }
  if (Array.isArray(nextNode.branches)) {
    nextNode.branches = nextNode.branches.map(normalizeNode);
  }

  if (nextNode.returnTo) {
    nextNode.returnTo = normalizeTypedValue(nextNode.returnTo);
  }
  if (asObject(nextNode.returns)) {
    nextNode.returns = Object.fromEntries(
      Object.entries(nextNode.returns as Record<string, unknown>).map(([key, value]) => [
        key,
        normalizeTypedValue(value),
      ]),
    );
  }

  return nextNode;
}

function normalizeTimeoutValue(timeout: unknown) {
  if (typeof timeout === 'number' && Number.isFinite(timeout)) {
    return `${Math.floor(timeout * 60)}s`;
  }
  if (typeof timeout === 'string' && /^\d+$/.test(timeout.trim())) {
    return `${Math.floor(Number(timeout) * 60)}s`;
  }
  return timeout;
}

export function normalizeTaskBotContentDraft(
  content: Record<string, unknown>,
) {
  const nextContent: Record<string, unknown> & {
    properties: Record<string, unknown>;
  } = {
    ...DEFAULT_TASK_BOT_CONTENT,
    ...content,
    properties: {
      ...DEFAULT_TASK_BOT_CONTENT.properties,
      ...(asObject(content.properties) ?? {}),
    },
  };

  nextContent.triggers = Array.isArray(nextContent.triggers)
    ? nextContent.triggers.map(normalizeNode)
    : [];
  nextContent.nodes = Array.isArray(nextContent.nodes)
    ? nextContent.nodes.map(normalizeNode)
    : [];
  nextContent.variables = Array.isArray(nextContent.variables)
    ? nextContent.variables.map((variableValue) => {
        const variable = asObject(variableValue);
        if (!variable) {
          return variableValue;
        }
        const { key: _key, ...nextVariable } = variable;
        if ('defaultValue' in nextVariable) {
          nextVariable.defaultValue = normalizeTypedValue(nextVariable.defaultValue);
        }
        return nextVariable;
      })
    : [];
  nextContent.packages = Array.isArray(nextContent.packages)
    ? nextContent.packages.map((packageValue) => {
        const pkg = asObject(packageValue);
        if (!pkg) {
          return packageValue;
        }
        return {
          ...pkg,
          settingsAttributes: normalizeAttributes(pkg.settingsAttributes),
        };
      })
    : [];
  nextContent.properties = {
    ...nextContent.properties,
    timeout: normalizeTimeoutValue(nextContent.properties.timeout),
  };

  return nextContent;
}

export function normalizeTaskBotContentForSave(
  content: Record<string, unknown>,
): A360TaskBotContent {
  return a360TaskBotContentSchema.parse(normalizeTaskBotContentDraft(content));
}

export function normalizeDependencyIdsForSave(
  dependencies: DependencyPayload | undefined,
  currentFileId?: string,
): string[] {
  const ids = Array.isArray(dependencies)
    ? dependencies
    : [
        ...(dependencies?.childFileIds ?? []),
        ...((dependencies?.dependencies ?? []).map((entry) => entry.id) ?? []),
      ];

  return Array.from(
    new Set(
      ids
        .filter((value) => value !== undefined && value !== null)
        .map(String)
        .filter((value) => value.length > 0 && value !== currentFileId),
    ),
  );
}

export async function saveBotBundle(
  repositoryApi: SaveBotBundleApi,
  input: {
    fileId: string;
    content: Record<string, unknown>;
    dependencies?: DependencyPayload;
    hasErrors?: boolean;
  },
) {
  const normalizedContent = normalizeTaskBotContentForSave(input.content);
  const childFileIds = normalizeDependencyIdsForSave(input.dependencies, input.fileId);

  const contentResult = await repositoryApi.updateFileContent(
    input.fileId,
    normalizedContent,
    input.hasErrors ?? false,
  );
  const dependencyResult = await repositoryApi.updateFileDependencies(
    input.fileId,
    childFileIds,
  );

  return {
    normalizedContent,
    childFileIds,
    contentResult,
    dependencyResult,
  };
}
