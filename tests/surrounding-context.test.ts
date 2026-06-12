import { describe, expect, it } from 'vitest';
import {
  buildSurroundingContext,
  rankElementsBySurroundingContext,
  validateSurroundingContext,
} from '../src/capture/surrounding-context.js';
import type { ElementFacts } from '../src/capture/types.js';

function fact(
  elementId: string,
  partial: Partial<ElementFacts> = {},
): ElementFacts {
  return {
    elementId,
    role: 'button',
    name: '',
    text: '',
    tag: 'button',
    domPath: `body > button#${elementId}`,
    attributes: {},
    pageUrl: 'https://example.test/login',
    pageTitle: 'Example Login',
    visible: true,
    bounds: { x: 0, y: 0, width: 100, height: 20 },
    ...partial,
  };
}

describe('surrounding context', () => {
  it('builds deterministic previous/next neighbor context', () => {
    const elements = [
      fact('email', {
        tag: 'input',
        role: 'textbox',
        attributes: { id: 'email', type: 'email' },
        associatedLabel: 'Email',
        stableParentSelector: '#login-form',
      }),
      fact('password', { tag: 'input', role: 'textbox', attributes: { id: 'password', type: 'password' } }),
      fact('login', { name: 'Login', text: 'Login' }),
    ];

    const context = buildSurroundingContext(elements[1], elements);
    expect(context.target.id).toBe('password');
    expect(context.target.stableParentSelector).toBe('');
    expect(context.previous?.tag).toBe('input');
    expect(context.next?.text).toBe('Login');
    expect(context.position.totalOfType).toBe(1);
  });

  it('validates matching contexts with high confidence', () => {
    const elements = [
      fact('email', {
        tag: 'input',
        role: 'textbox',
        attributes: { id: 'email', type: 'email' },
        associatedLabel: 'Email',
        stableParentSelector: '#login-form',
      }),
      fact('login', {
        name: 'Login',
        text: 'Login',
        stableParentSelector: '#login-form',
      }),
    ];
    const captured = buildSurroundingContext(elements[1], elements);
    const candidate = buildSurroundingContext(structuredClone(elements[1]), structuredClone(elements));

    const result = validateSurroundingContext(captured, candidate);
    expect(result.isMatch).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('uses associated label and stable parent as extra confidence signals', () => {
    const captured = buildSurroundingContext(
      fact('email', {
        tag: 'input',
        role: 'textbox',
        attributes: { id: 'email', type: 'email' },
        associatedLabel: 'Email',
        stableParentSelector: '#login-form',
      }),
      [
        fact('email', {
          tag: 'input',
          role: 'textbox',
          attributes: { id: 'email', type: 'email' },
          associatedLabel: 'Email',
          stableParentSelector: '#login-form',
        }),
      ],
    );
    const candidate = buildSurroundingContext(
      fact('email2', {
        tag: 'input',
        role: 'textbox',
        attributes: { id: 'email2', type: 'email' },
        associatedLabel: 'Email',
        stableParentSelector: '#login-form',
      }),
      [
        fact('email2', {
          tag: 'input',
          role: 'textbox',
          attributes: { id: 'email2', type: 'email' },
          associatedLabel: 'Email',
          stableParentSelector: '#login-form',
        }),
      ],
    );

    const result = validateSurroundingContext(captured, candidate);
    expect(result.isMatch).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.65);
  });

  it('rejects contexts when the target tag changes', () => {
    const captured = buildSurroundingContext(
      fact('login', { tag: 'button', role: 'button', name: 'Login', text: 'Login' }),
      [fact('login', { tag: 'button', role: 'button', name: 'Login', text: 'Login' })],
    );
    const candidate = buildSurroundingContext(
      fact('login', { tag: 'a', role: 'link', name: 'Login', text: 'Login' }),
      [fact('login', { tag: 'a', role: 'link', name: 'Login', text: 'Login' })],
    );

    const result = validateSurroundingContext(captured, candidate);
    expect(result.isMatch).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it('ranks the best candidate first for repair flows', () => {
    const capturedSource = fact('email', {
      tag: 'input',
      role: 'textbox',
      attributes: { id: 'email', type: 'email' },
      associatedLabel: 'Email',
      stableParentSelector: '#login-form',
      name: 'Email',
    });
    const captured = buildSurroundingContext(capturedSource, [capturedSource]);

    const bestElement = fact('email-live', {
      tag: 'input',
      role: 'textbox',
      attributes: { id: 'email-live', type: 'email' },
      associatedLabel: 'Email',
      stableParentSelector: '#login-form',
      name: 'Email',
    });
    const weakElement = fact('search', {
      tag: 'input',
      role: 'textbox',
      attributes: { id: 'search', type: 'text' },
      associatedLabel: 'Search',
      stableParentSelector: '#header',
      name: 'Search',
    });

    const best = {
      ...bestElement,
      surroundingContext: buildSurroundingContext(bestElement, [bestElement]),
    };
    const weak = {
      ...weakElement,
      surroundingContext: buildSurroundingContext(weakElement, [weakElement]),
    };

    const ranked = rankElementsBySurroundingContext(captured, [weak, best]);
    expect(ranked[0].element.elementId).toBe('email-live');
    expect(ranked[0].validation.confidence).toBeGreaterThan(ranked[1].validation.confidence);
  });
});
