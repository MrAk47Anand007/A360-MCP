import { describe, expect, it } from 'vitest';
import {
  buildCapturedTargetPayload,
  buildRecorderNode,
} from '../src/capture/target-payload.js';
import type { ElementFacts } from '../src/capture/types.js';
import { normalizeTaskBotContentForSave } from '../src/workflows/repository-save.js';

const LOGIN_BUTTON: ElementFacts = {
  elementId: 'el-1',
  role: 'button',
  name: 'Login',
  text: 'Login',
  tag: 'button',
  domPath: 'body > form > button#login',
  attributes: { id: 'login', class: 'btn primary', type: 'submit' },
  pageUrl: 'https://acme-test.uipath.com/login',
  pageTitle: 'ACME System 1 - Login',
  visible: true,
  bounds: { x: 10, y: 20, width: 80, height: 30 },
};

const EMAIL_INPUT: ElementFacts = {
  elementId: 'el-2',
  role: 'textbox',
  name: 'Email:',
  text: '',
  tag: 'input',
  domPath: 'body > input#email',
  attributes: { id: 'email', name: 'email', type: 'email', class: 'form-control' },
  pageUrl: 'https://acme-test.uipath.com/login',
  pageTitle: 'ACME System 1 - Login',
  visible: true,
  bounds: { x: 132, y: 296, width: 485, height: 34 },
};

const PASSWORD_INPUT: ElementFacts = {
  ...EMAIL_INPUT,
  elementId: 'el-3',
  name: 'Password:',
  domPath: 'body > input#password',
  attributes: { id: 'password', name: 'password', type: 'password', class: 'form-control' },
};

describe('target payload converter', () => {
  it('builds an A360-style web UIOBJECT with blob, criteria, and window binding', () => {
    const payload = buildCapturedTargetPayload(LOGIN_BUTTON);

    expect(payload.uiObject.type).toBe('UIOBJECT');
    const uiObject = payload.uiObject.uiObject as Record<string, any>;
    expect(typeof uiObject.blob).toBe('string');
    expect(uiObject.controlType).toBe('BUTTON');
    expect(uiObject.technologyType).toBe('HTML');
    expect(uiObject.browserType).toBe('CHROME');
    expect(uiObject.capture).toEqual({ securelyRecorded: true });
    expect(uiObject.criteria['HTML InnerText']).toEqual({
      enabled: true,
      value: { type: 'STRING', string: 'Login' },
    });
    expect(uiObject.criteria['Role']).toEqual({
      enabled: true,
      value: { type: 'STRING', string: 'PushButton' },
    });
    expect(uiObject.criteria['DOMXPath']).toEqual({
      enabled: true,
      value: { type: 'STRING', string: "//button[@id='login']" },
    });
    expect(uiObject.criteria['HTML Tag']).toEqual({
      enabled: true,
      value: { type: 'STRING', string: 'BUTTON' },
    });
    expect(payload.uiObject.uiObjectWindow).toEqual({
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
        name: 'ACME System 1 - Login',
        nameCaseInsensitive: true,
      },
      browserTabTitleMode: 'string',
      browserTabTitleString: 'ACME System 1 - Login',
      browserTabTitleCaseInsensitive: true,
      windowTitleMode: 'string',
      windowTitleString: '',
      windowTitleCaseInsensitive: true,
      expression: '$pWinACMETESTUIPATHCOMLOGIN$',
    });
    expect(payload.windowBinding.variableName).toBe('pWinACMETESTUIPATHCOMLOGIN');
    expect(payload.suggestedVariables).toHaveLength(1);
    expect(payload.suggestedVariables[0]).toMatchObject({
      name: 'pWinACMETESTUIPATHCOMLOGIN',
      type: 'WINDOW',
      defaultValue: {
        type: 'WINDOW',
        mode: 'browser',
        browserTabTitleString: 'ACME System 1 - Login',
      },
    });
    expect((payload.suggestedVariables[0].defaultValue as Record<string, unknown>).resize).toBeUndefined();
    expect(payload.surroundingContext).toBeUndefined();
  });

  it('preserves selector suggestions when present on the captured facts', () => {
    const payload = buildCapturedTargetPayload({
      ...EMAIL_INPUT,
      associatedLabel: 'Email',
      helpText: 'Enter your email address',
      stableParentSelector: '#login-form',
      recommendedSelectors: [
        { type: 'id', selector: "//input[@id='email']", reason: 'Stable element id' },
      ],
      surroundingContext: {
        page: { url: 'https://acme-test.uipath.com/login', title: 'ACME System 1 - Login', host: 'acme-test.uipath.com', path: '/login' },
        target: {
          tag: 'input',
          role: 'textbox',
          name: 'Email',
          text: '',
          type: 'email',
          id: 'email',
          elementId: 'el-2',
          domPath: 'body > input#email',
          associatedLabel: 'Email',
          helpText: 'Enter your email address',
          stableParentSelector: '#login-form',
          recommendedSelectors: [{ type: 'id', selector: "//input[@id='email']", reason: 'Stable element id' }],
        },
        previous: null,
        next: null,
        position: { nthOfType: 1, totalOfType: 1 },
      },
    });

    expect(payload.surroundingContext).toMatchObject({
      target: {
        associatedLabel: 'Email',
        stableParentSelector: '#login-form',
      },
    });
    expect((payload.uiObject as Record<string, any>).a360Mcp).toMatchObject({
      type: 'DICTIONARY',
    });
  });

  it('includes an IMAGE typed value when a screenshot is provided', () => {
    const payload = buildCapturedTargetPayload(LOGIN_BUTTON, {
      screenshotBase64: 'aGVsbG8=',
    });

    expect(payload.image).toEqual({
      type: 'IMAGE',
      image: 'aGVsbG8=',
      securelyRecorded: true,
    });
  });

  it('omits IMAGE when no screenshot is provided', () => {
    const payload = buildCapturedTargetPayload(LOGIN_BUTTON);
    expect(payload.image).toBeUndefined();
  });

  it('builds an anchor DICTIONARY naming the target', () => {
    const payload = buildCapturedTargetPayload(LOGIN_BUTTON, { includeAnchor: true });

    expect(payload.anchor).toEqual({
      type: 'DICTIONARY',
      dictionary: [{ key: 'name', value: { type: 'STRING', string: 'Login' } }],
    });
  });

  it('builds a recorder node carrying A360 web recorder attributes for click actions', () => {
    const payload = buildCapturedTargetPayload(LOGIN_BUTTON);
    const node = buildRecorderNode(payload, { action: 'click' });

    expect(node.packageName).toBe('Recorder');
    expect(node.commandName).toBe('capture');
    expect(node.disabled).toBe(false);
    expect(typeof node.uid).toBe('string');

    const attributes = node.attributes as Array<{ name: string; value: any }>;
    expect(attributes.map((a) => a.name)).toEqual([
      'uiObject',
      'buttonAction',
      'runInBackground',
      'advancedWait',
      'wait',
    ]);
    expect(attributes.find((a) => a.name === 'buttonAction')?.value).toEqual({
      type: 'STRING',
      string: 'CLICK',
    });
  });

  it('builds textbox recorder attributes for ordinary text input', () => {
    const payload = buildCapturedTargetPayload(EMAIL_INPUT);
    const node = buildRecorderNode(payload, { action: 'type', text: 'hello@example.com' });

    const attributes = node.attributes as Array<{ name: string; value: any }>;
    expect(attributes.map((a) => a.name)).toEqual([
      'uiObject',
      'textboxAction',
      'runInBackground',
      'typeOfInput',
      'value',
      'delay',
      'advancedWait',
      'wait',
    ]);
    expect(attributes.find((a) => a.name === 'value')?.value).toEqual({
      type: 'STRING',
      string: 'hello@example.com',
    });
  });

  it('builds password recorder attributes for password input', () => {
    const payload = buildCapturedTargetPayload(PASSWORD_INPUT);
    const node = buildRecorderNode(payload, { action: 'type', text: 'secret' });

    const attributes = node.attributes as Array<{ name: string; value: any }>;
    expect(attributes.map((a) => a.name)).toEqual([
      'uiObject',
      'passwordtextAction',
      'runInBackground',
      'valueCV',
      'delay',
      'advancedWait',
      'wait',
    ]);
    expect(attributes.find((a) => a.name === 'valueCV')?.value).toEqual({
      type: 'STRING',
      string: 'secret',
    });
  });

  it('honors recorder command identity overrides', () => {
    const payload = buildCapturedTargetPayload(LOGIN_BUTTON);
    const node = buildRecorderNode(payload, {
      action: 'click',
      packageName: 'UniversalRecorder',
      commandName: 'CaptureObject',
      targetAttributeName: 'objectDetails',
    });

    expect(node.packageName).toBe('UniversalRecorder');
    expect(node.commandName).toBe('CaptureObject');
    const attributes = node.attributes as Array<{ name: string; value: any }>;
    expect(attributes.find((a) => a.name === 'objectDetails')).toBeDefined();
  });
});

describe('save pipeline compatibility', () => {
  it('captured payloads normalize cleanly through the save pipeline', () => {
    const payload = buildCapturedTargetPayload(LOGIN_BUTTON);
    const node = buildRecorderNode(payload, { action: 'click' });

    const normalized = normalizeTaskBotContentForSave({
      nodes: [node],
      properties: { botCodeVersion: '5' },
    });

    const savedNode = normalized.nodes[0] as Record<string, any>;
    const target = savedNode.attributes.find((a: any) => a.value?.type === 'UIOBJECT');
    expect(Array.isArray(target.value.uiObject.criteria)).toBe(false);
    expect(target.value.uiObject.criteria['HTML Tag']).toBeDefined();
    expect(typeof target.value.uiObject.blob).toBe('string');
  });
});
