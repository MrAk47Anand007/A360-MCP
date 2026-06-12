import { describe, expect, it } from 'vitest';
import {
  attachHealingMetadata,
  extractHealingMetadata,
  getHealingMetadataFieldName,
} from '../src/capture/healing-metadata.js';

describe('healing metadata helpers', () => {
  it('attaches surrounding-context metadata to a typed value', () => {
    const value = attachHealingMetadata(
      { type: 'UIOBJECT', uiObject: { blob: 'abc' } },
      {
        surroundingContext: {
          target: { id: 'email', tag: 'input' },
        },
      },
    );

    expect(value[getHealingMetadataFieldName()]).toMatchObject({
      type: 'DICTIONARY',
    });
  });

  it('extracts stored surrounding-context metadata from a typed value', () => {
    const value = attachHealingMetadata(
      { type: 'UIOBJECT', uiObject: { blob: 'abc' } },
      {
        surroundingContext: {
          target: { id: 'email', tag: 'input' },
        },
      },
    );

    expect(extractHealingMetadata(value).surroundingContext).toMatchObject({
      target: { id: 'email', tag: 'input' },
    });
  });

  it('returns empty metadata for invalid payloads', () => {
    expect(extractHealingMetadata({ type: 'UIOBJECT' })).toEqual({});
  });
});
