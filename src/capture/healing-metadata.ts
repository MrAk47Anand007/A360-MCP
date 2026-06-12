type TypedValue = Record<string, unknown> & { type: string };

const METADATA_FIELD = 'a360Mcp';
const SCHEMA_VERSION = '1';

function stringValue(value: string): TypedValue {
  return { type: 'STRING', string: value };
}

export function attachHealingMetadata(
  value: Record<string, unknown>,
  input: {
    surroundingContext?: Record<string, unknown>;
  },
) {
  if (!input.surroundingContext) {
    return value;
  }

  return {
    ...value,
    [METADATA_FIELD]: {
      type: 'DICTIONARY',
      dictionary: [
        { key: 'schemaVersion', value: stringValue(SCHEMA_VERSION) },
        {
          key: 'surroundingContextJson',
          value: stringValue(JSON.stringify(input.surroundingContext)),
        },
      ],
    },
  };
}

export function extractHealingMetadata(value: Record<string, unknown> | null | undefined) {
  const metadata = value?.[METADATA_FIELD];
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  const dictionary = Array.isArray((metadata as Record<string, unknown>).dictionary)
    ? ((metadata as Record<string, unknown>).dictionary as Array<Record<string, unknown>>)
    : [];
  const contextEntry = dictionary.find((entry) => entry.key === 'surroundingContextJson');
  const rawJson =
    contextEntry &&
    typeof contextEntry === 'object' &&
    contextEntry.value &&
    typeof contextEntry.value === 'object' &&
    !Array.isArray(contextEntry.value) &&
    typeof (contextEntry.value as Record<string, unknown>).string === 'string'
      ? ((contextEntry.value as Record<string, unknown>).string as string)
      : '';

  if (!rawJson) {
    return {};
  }

  try {
    const surroundingContext = JSON.parse(rawJson) as Record<string, unknown>;
    return { surroundingContext };
  } catch {
    return {};
  }
}

export function getHealingMetadataFieldName() {
  return METADATA_FIELD;
}
