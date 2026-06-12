import { randomUUID } from 'node:crypto';
import type { CaptureAction, ElementFacts } from './types.js';
import { buildWindowBinding, type WindowBinding } from './window-binding.js';
import { attachHealingMetadata } from './healing-metadata.js';

type TypedValue = Record<string, unknown> & { type: string };

export type CapturedTargetPayload = {
  uiObject: TypedValue;
  image?: TypedValue;
  anchor?: TypedValue;
  windowBinding: WindowBinding;
  surroundingContext?: Record<string, unknown>;
  suggestedVariables: Array<Record<string, unknown>>;
  sourceFacts: ElementFacts;
};

export type BuildPayloadOptions = {
  screenshotBase64?: string;
  includeAnchor?: boolean;
  windowExpression?: string;
};

export type RecorderNodeOptions = {
  action: Exclude<CaptureAction, 'navigate'>;
  text?: string;
  uid?: string;
  packageName?: string;
  commandName?: string;
  targetAttributeName?: string;
  actionAttributeName?: string;
  actionValueAttributeName?: string;
};

type A360ControlShape = {
  controlType: string;
  roleLabel: string;
  roleCode: number;
  searchCriteria: number[];
};

const ACTION_NAMES: Record<Exclude<CaptureAction, 'navigate'>, string> = {
  click: 'CLICK',
  type: 'SETTEXT',
  select: 'SELECTITEMBYTEXT',
};

function stringValue(value: string): TypedValue {
  return { type: 'STRING', string: value };
}

function numberValue(value: string | number): TypedValue {
  return { type: 'NUMBER', number: String(value) };
}

function booleanValue(value: boolean): TypedValue {
  return { type: 'BOOLEAN', boolean: value };
}

function criterion(value: string, enabled = true) {
  return {
    enabled,
    value: stringValue(value),
  };
}

function roundCoordinate(value: number) {
  return String(Math.max(0, Math.round(value)));
}

function toA360ControlShape(facts: ElementFacts): A360ControlShape {
  const inputType = (facts.attributes.type ?? '').toLowerCase();
  const role = facts.role.toLowerCase();
  const tag = facts.tag.toLowerCase();

  if (tag === 'input' && inputType === 'password') {
    return {
      controlType: 'PASSWORD_TEXT',
      roleLabel: 'TextBox',
      roleCode: 5,
      searchCriteria: [7, 61, 67, 59, 58, 80],
    };
  }

  if (role === 'textbox' || tag === 'input' || tag === 'textarea') {
    return {
      controlType: 'TEXTBOX',
      roleLabel: 'TextBox',
      roleCode: 5,
      searchCriteria: [7, 61, 67, 59, 58, 80],
    };
  }

  if (role === 'link' || tag === 'a') {
    return {
      controlType: 'LINK',
      roleLabel: 'Link',
      roleCode: 31,
      searchCriteria: [7, 61, 63, 80],
    };
  }

  if (role === 'combobox' || tag === 'select') {
    return {
      controlType: 'COMBOBOX',
      roleLabel: 'ComboBox',
      roleCode: 35,
      searchCriteria: [7, 61, 67, 80],
    };
  }

  return {
    controlType: 'BUTTON',
    roleLabel: 'PushButton',
    roleCode: 1,
    searchCriteria: [7, 61, 67, 80],
  };
}

function buildDomXPath(facts: ElementFacts) {
  if (facts.attributes.id) {
    return `//${facts.tag}[@id='${facts.attributes.id}']`;
  }
  if (facts.attributes.name) {
    return `//${facts.tag}[@name='${facts.attributes.name}']`;
  }
  if (facts.tag === 'button' && facts.text) {
    return `//button[normalize-space(text())='${facts.text}']`;
  }
  if (facts.tag === 'a' && facts.text) {
    return `//a[normalize-space(text())='${facts.text}']`;
  }

  return `//${facts.tag}`;
}

function buildPathString(facts: ElementFacts) {
  const segments = facts.domPath
    .split('>')
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(1);

  return segments
    .map((segment) => {
      const nth = segment.match(/:nth-of-type\((\d+)\)/i)?.[1];
      if (nth) {
        return nth;
      }
      if (segment.includes('#')) {
        return '-1';
      }
      return '1';
    })
    .join('|') || '1';
}

function buildUiObjectCriteria(
  facts: ElementFacts,
  control: A360ControlShape,
  xPath: string,
) {
  const criteria: Record<string, unknown> = {
    'HTML Tag': criterion(facts.tag.toUpperCase()),
    UniqueID: criterion(randomUUID(), false),
    WindowTitle: criterion('', false),
    innerHTML: criterion('', false),
    Left: criterion(roundCoordinate(facts.bounds.x), false),
    Description: criterion('', false),
    DOMXPath: criterion(xPath),
    'HTML Top': criterion(roundCoordinate(facts.bounds.y), false),
    'HTML Left': criterion(roundCoordinate(facts.bounds.x), false),
    Parent: criterion('', false),
    'HTML ID': criterion(facts.attributes.id ?? '', Boolean(facts.attributes.id)),
    Index: criterion('0', false),
    outerHTML: criterion('', false),
    'HTML Class': criterion(facts.attributes.class ?? '', false),
    'HTML FrameName': criterion('', false),
    'HTML HasFrame': criterion('false', false),
    Name: criterion(facts.attributes.name ?? '', false),
    States: criterion(
      facts.tag === 'input' && (facts.attributes.type ?? '').toLowerCase() === 'password'
        ? 'Protected'
        : '',
      false,
    ),
    'HTML Type': criterion(facts.attributes.type ?? '', Boolean(facts.attributes.type)),
    'HTML FramePath': criterion('', false),
    FrameDOMXPath: criterion('', false),
    'HTML InnerText': criterion(facts.text, Boolean(facts.text)),
    'HTML Alt': criterion(facts.attributes.alt ?? '', false),
    'HTML Href': criterion(facts.attributes.href ?? '', false),
    'HTML SourceIndex': criterion('0', false),
    ItemName: criterion('', false),
    Height: criterion(roundCoordinate(facts.bounds.height), false),
    ID: criterion('', false),
    Width: criterion(roundCoordinate(facts.bounds.width), false),
    'HTML Title': criterion(facts.attributes.title ?? '', false),
    Path: criterion(buildPathString(facts), false),
    'HTML Height': criterion(roundCoordinate(facts.bounds.height), false),
    'HTML Value': criterion('', false),
    'HTML TagIndex': criterion('1', false),
    Role: criterion(control.roleLabel),
    Top: criterion(roundCoordinate(facts.bounds.y), false),
    DefaultAction: criterion('', false),
    ItemValue: criterion('', false),
    'HTML ClassId': criterion('', false),
    'HTML Width': criterion(roundCoordinate(facts.bounds.width), false),
    Value: criterion('', false),
    'HTML Name': criterion(facts.attributes.name ?? '', Boolean(facts.attributes.name)),
    Class: criterion('', false),
    'HTML FrameSrc': criterion(facts.pageUrl ?? '', Boolean(facts.pageUrl)),
    IsVisible: criterion(String(facts.visible), false),
  };

  return criteria;
}

function buildBlobProperties(
  facts: ElementFacts,
  xPath: string,
) {
  return [
    { name: 'DOMXPath', value: xPath },
    { name: 'HTML ID', value: facts.attributes.id ?? '' },
    { name: 'HTML Name', value: facts.attributes.name ?? '' },
    { name: 'HTML Alt', value: facts.attributes.alt ?? '' },
    { name: 'HTML Tag', value: facts.tag.toUpperCase() },
    { name: 'HTML Class', value: facts.attributes.class ?? '' },
    { name: 'HTML InnerText', value: facts.text },
    { name: 'HTML SourceIndex', value: '0' },
    { name: 'HTML Href', value: facts.attributes.href ?? '' },
    { name: 'HTML Type', value: facts.attributes.type ?? '' },
    { name: 'HTML Value', value: '' },
    { name: 'HTML ClassId', value: '' },
    { name: 'HTML Title', value: facts.attributes.title ?? '' },
    { name: 'HTML Height', value: roundCoordinate(facts.bounds.height) },
    { name: 'HTML Width', value: roundCoordinate(facts.bounds.width) },
    { name: 'HTML TagIndex', value: '1' },
    { name: 'HTML Top', value: roundCoordinate(facts.bounds.y) },
    { name: 'HTML Left', value: roundCoordinate(facts.bounds.x) },
    { name: 'HTML HasFrame', value: 'false' },
    { name: 'HTML FrameSrc', value: facts.pageUrl ?? '' },
    { name: 'HTML FrameName', value: '' },
    { name: 'HTML FramePath', value: '' },
    { name: 'FrameDOMXPath', value: '' },
    { name: 'innerHTML', value: '' },
    { name: 'outerHTML', value: '' },
    { name: 'IsVisible', value: String(facts.visible) },
  ];
}

function buildBlobAttributes(facts: ElementFacts, control: A360ControlShape) {
  return [
    { name: 'UniqueID', value: randomUUID() },
    { name: 'ID', value: '' },
    { name: 'Name', value: facts.attributes.name ?? facts.name ?? '' },
    { name: 'Value', value: '' },
    { name: 'Class', value: '' },
    { name: 'Parent', value: '' },
    { name: 'WindowTitle', value: '' },
    { name: 'Role', value: control.roleLabel },
    { name: 'Path', value: buildPathString(facts) },
    { name: 'Index', value: '0' },
    { name: 'Left', value: roundCoordinate(facts.bounds.x) },
    { name: 'Top', value: roundCoordinate(facts.bounds.y) },
    { name: 'Width', value: roundCoordinate(facts.bounds.width) },
    { name: 'Height', value: roundCoordinate(facts.bounds.height) },
    { name: 'Description', value: '' },
    { name: 'States', value: '' },
    { name: 'DefaultAction', value: '' },
  ];
}

function buildBlob(
  facts: ElementFacts,
  control: A360ControlShape,
  xPath: string,
) {
  const clickX = Math.max(0, Math.round(facts.bounds.width / 2));
  const clickY = Math.max(0, Math.round(facts.bounds.height / 2));
  const blobPayload = {
    objNode: {
      uniqueID: randomUUID(),
      id: '',
      name: facts.attributes.name ?? facts.name ?? '',
      value: '',
      class: '',
      parent: '',
      windowTitle: '',
      path: {
        objPath: buildPathString(facts)
          .split('|')
          .filter(Boolean)
          .map((segment) => ({ index: Number(segment) || 1 })),
      },
      role: control.roleCode,
      index: 0,
      left: Math.round(facts.bounds.x),
      top: Math.round(facts.bounds.y),
      width: Math.round(facts.bounds.width),
      height: Math.round(facts.bounds.height),
      clickX,
      clickY,
      description: '',
      states:
        facts.tag === 'input' && (facts.attributes.type ?? '').toLowerCase() === 'password'
          ? 'Protected'
          : '',
      defaultAction: '',
      technology: {
        techType: 6,
        platformType: 12,
        applicationType: 3,
        processID: 'TA-CBS-CHROME-AGENT',
        winHandle: '',
        ocrEngine: null,
        isAdvancedCapture: false,
        isSilverlightTechnology: false,
      },
      actions: null,
      properties: buildBlobProperties(facts, xPath),
      attributes: buildBlobAttributes(facts, control),
      isLinked: false,
    },
    objParent: null,
    objItem: null,
    children: [],
    items: [],
    searchCriteria: control.searchCriteria,
    error: null,
    browserFramework: 'undefined',
    captureVersion: 2900,
  };

  return Buffer.from(JSON.stringify(blobPayload), 'utf8').toString('base64');
}

function buildUiObjectValue(
  facts: ElementFacts,
  options: BuildPayloadOptions = {},
): TypedValue {
  const control = toA360ControlShape(facts);
  const xPath = buildDomXPath(facts);
  const criteria = buildUiObjectCriteria(facts, control, xPath);
  const windowBinding = buildWindowBinding(facts.pageUrl, facts.pageTitle);

  return attachHealingMetadata(
    {
    type: 'UIOBJECT',
    uiObject: {
      blob: buildBlob(facts, control, xPath),
      controlType: control.controlType,
      technologyType: 'HTML',
      browserType: 'CHROME',
      criteria,
      isElevated: false,
      capture: options.screenshotBase64
        ? {
            thumbnailMetadataPath: '',
            screenshotMetadataPath: '',
            screenshotRectangle: {
              x: Math.round(facts.bounds.x),
              y: Math.round(facts.bounds.y),
              width: Math.round(facts.bounds.width),
              height: Math.round(facts.bounds.height),
            },
            thumbnailRectangle: {
              x: 0,
              y: 0,
              width: Math.round(facts.bounds.width),
              height: Math.round(facts.bounds.height),
            },
            securelyRecorded: false,
          }
        : {
            securelyRecorded: true,
          },
    },
    uiObjectWindow: {
      ...windowBinding.windowValue,
      expression: options.windowExpression ?? windowBinding.expression,
    },
    },
    {
      surroundingContext: facts.surroundingContext,
    },
  ) as TypedValue;
}

function buildAnchorValue(facts: ElementFacts): TypedValue {
  return {
    type: 'DICTIONARY',
    dictionary: [{ key: 'name', value: stringValue(facts.name || facts.text || facts.tag) }],
  };
}

function buildGenericRecorderNode(
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

  return {
    uid: options.uid ?? randomUUID(),
    packageName: options.packageName ?? 'Recorder',
    commandName: options.commandName ?? 'capture',
    disabled: false,
    attributes,
  };
}

function buildA360RecorderAttributes(
  payload: CapturedTargetPayload,
  options: RecorderNodeOptions,
) {
  const facts = payload.sourceFacts;
  const control = toA360ControlShape(facts);
  const attributes: Array<{ name: string; value: unknown }> = [
    { name: 'uiObject', value: payload.uiObject },
  ];

  if (options.action === 'type') {
    if (control.controlType === 'PASSWORD_TEXT') {
      attributes.push({ name: 'passwordtextAction', value: stringValue('SETTEXT') });
      attributes.push({ name: 'runInBackground', value: booleanValue(false) });
      attributes.push({ name: 'valueCV', value: stringValue(options.text ?? '') });
      attributes.push({ name: 'delay', value: numberValue(5) });
    } else {
      attributes.push({ name: 'textboxAction', value: stringValue('SETTEXT') });
      attributes.push({ name: 'runInBackground', value: booleanValue(false) });
      attributes.push({ name: 'typeOfInput', value: stringValue('VALUE') });
      attributes.push({ name: 'value', value: stringValue(options.text ?? '') });
      attributes.push({ name: 'delay', value: numberValue(5) });
    }
  } else if (options.action === 'select') {
    attributes.push({ name: 'menuAction', value: stringValue('SELECTITEMBYTEXT') });
    attributes.push({ name: 'runInBackground', value: booleanValue(false) });
    attributes.push({ name: 'value', value: stringValue(options.text ?? '') });
  } else if (control.controlType === 'LINK') {
    attributes.push({ name: 'linkAction', value: stringValue('CLICK') });
    attributes.push({ name: 'runInBackground', value: booleanValue(false) });
  } else {
    attributes.push({ name: 'buttonAction', value: stringValue('CLICK') });
    attributes.push({ name: 'runInBackground', value: booleanValue(false) });
  }

  attributes.push({ name: 'advancedWait', value: stringValue('BASIC') });
  attributes.push({ name: 'wait', value: numberValue(15) });

  return attributes;
}

export function buildCapturedTargetPayload(
  facts: ElementFacts,
  options: BuildPayloadOptions = {},
): CapturedTargetPayload {
  const windowBinding = buildWindowBinding(facts.pageUrl, facts.pageTitle);
  const payload: CapturedTargetPayload = {
    uiObject: buildUiObjectValue(facts, options),
    windowBinding,
    surroundingContext: facts.surroundingContext,
    suggestedVariables: [windowBinding.variable],
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
    payload.anchor = buildAnchorValue(facts);
  }

  return payload;
}

export function buildRecorderNode(
  payload: CapturedTargetPayload,
  options: RecorderNodeOptions,
): Record<string, unknown> {
  if (
    options.targetAttributeName ||
    options.actionAttributeName ||
    options.actionValueAttributeName
  ) {
    return buildGenericRecorderNode(payload, options);
  }

  return {
    uid: options.uid ?? randomUUID(),
    packageName: options.packageName ?? 'Recorder',
    commandName: options.commandName ?? 'capture',
    disabled: false,
    attributes: buildA360RecorderAttributes(payload, options),
  };
}
