import { randomUUID } from 'node:crypto';
import type { CaptureAction, ElementFacts } from './types.js';

type TypedValue = Record<string, unknown> & { type: string };

export type CapturedTargetPayload = {
  uiObject: TypedValue;
  image?: TypedValue;
  anchor?: TypedValue;
  sourceFacts: ElementFacts;
};

export type BuildPayloadOptions = {
  screenshotBase64?: string;
  includeAnchor?: boolean;
};

export type RecorderNodeOptions = {
  action: Exclude<CaptureAction, 'navigate'>;
  text?: string;
  uid?: string;
  /** Recorder command identity. Defaults assume the Recorder package Capture
   *  command; verify with a360_get_package_command_schema and override if the
   *  Control Room schema differs. */
  packageName?: string;
  commandName?: string;
  targetAttributeName?: string;
  actionAttributeName?: string;
  actionValueAttributeName?: string;
};

const ACTION_NAMES: Record<Exclude<CaptureAction, 'navigate'>, string> = {
  click: 'CLICK',
  type: 'SET_TEXT',
  select: 'SELECT_ITEM_BY_TEXT',
};

function stringValue(value: string): TypedValue {
  return { type: 'STRING', string: value };
}

function criterion(value: string) {
  return {
    enabled: true,
    value: stringValue(value),
  };
}

export function buildCapturedTargetPayload(
  facts: ElementFacts,
  options: BuildPayloadOptions = {},
): CapturedTargetPayload {
  const title = facts.name || facts.text;

  const criteria: Record<string, unknown> = {
    domPath: criterion(facts.domPath),
    tag: criterion(facts.tag),
    role: criterion(facts.role),
  };
  if (title) {
    criteria.title = criterion(title);
  }
  if (facts.attributes.id) {
    criteria.id = criterion(facts.attributes.id);
  }
  if (facts.attributes.name) {
    criteria.name = criterion(facts.attributes.name);
  }

  const payload: CapturedTargetPayload = {
    uiObject: {
      type: 'UIOBJECT',
      uiObject: {
        capture: { securelyRecorded: true },
        criteria,
      },
    },
    sourceFacts: facts,
  };

  if (options.screenshotBase64) {
    payload.image = {
      type: 'IMAGE',
      image: options.screenshotBase64,
      securelyRecorded: true,
    };
  }

  if (options.includeAnchor) {
    payload.anchor = {
      type: 'DICTIONARY',
      dictionary: [{ key: 'name', value: stringValue(title || facts.tag) }],
    };
  }

  return payload;
}

export function buildRecorderNode(
  payload: CapturedTargetPayload,
  options: RecorderNodeOptions,
): Record<string, unknown> {
  const targetAttributeName = options.targetAttributeName ?? 'objectProps';
  const actionAttributeName = options.actionAttributeName ?? 'action';
  const actionValueAttributeName = options.actionValueAttributeName ?? 'actionValue';

  const attributes: Array<{ name: string; value: unknown }> = [
    { name: targetAttributeName, value: payload.uiObject },
    { name: actionAttributeName, value: stringValue(ACTION_NAMES[options.action]) },
  ];

  if (options.action === 'type' || options.action === 'select') {
    attributes.push({
      name: actionValueAttributeName,
      value: stringValue(options.text ?? ''),
    });
  }
  if (payload.image) {
    attributes.push({ name: 'image', value: payload.image });
  }
  if (payload.anchor) {
    attributes.push({ name: 'anchor', value: payload.anchor });
  }

  return {
    uid: options.uid ?? randomUUID(),
    packageName: options.packageName ?? 'Recorder',
    commandName: options.commandName ?? 'Capture',
    disabled: false,
    attributes,
  };
}
