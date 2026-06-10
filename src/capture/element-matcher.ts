import type { ElementFacts } from './types.js';

export type ScoredCandidate = {
  element: ElementFacts;
  score: number;
};

export type MatchResult =
  | { status: 'matched'; element: ElementFacts; score: number; candidates: ScoredCandidate[] }
  | { status: 'ambiguous'; candidates: ScoredCandidate[] }
  | { status: 'not-found'; candidates: ScoredCandidate[] };

export type MatchHints = {
  role?: string;
  exactText?: string;
};

const ROLE_KEYWORDS: Record<string, string[]> = {
  button: ['button'],
  link: ['link'],
  textbox: ['field', 'input', 'textbox', 'box'],
  checkbox: ['checkbox'],
  radio: ['radio'],
  combobox: ['dropdown', 'select', 'combobox'],
  heading: ['heading', 'title'],
  image: ['image', 'icon', 'logo'],
};

const MIN_MATCH_SCORE = 3;
const AMBIGUITY_GAP = 2;
const MAX_CANDIDATES = 5;

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9@.]+/)
    .filter((token) => token.length > 1);
}

function deriveRoleHint(tokens: string[]): string | null {
  for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
    if (keywords.some((keyword) => tokens.includes(keyword))) {
      return role;
    }
  }
  return null;
}

function isRoleKeywordToken(token: string): boolean {
  return Object.values(ROLE_KEYWORDS).some((keywords) => keywords.includes(token));
}

function scoreElement(
  descriptionTokens: string[],
  roleHint: string | null,
  element: ElementFacts,
): number {
  const nameTokens = tokenize(element.name);
  const textTokens = tokenize(element.text);
  const attributeTokens = tokenize(
    [
      element.attributes.placeholder ?? '',
      element.attributes['aria-label'] ?? '',
      element.attributes.id ?? '',
      element.attributes.name ?? '',
      element.attributes.title ?? '',
    ].join(' '),
  );

  let score = 0;
  for (const token of descriptionTokens) {
    if (isRoleKeywordToken(token)) {
      continue;
    }
    if (nameTokens.includes(token)) {
      score += 3;
    } else if (textTokens.includes(token)) {
      score += 2;
    } else if (attributeTokens.includes(token)) {
      score += 2;
    }
  }

  if (roleHint && element.role === roleHint) {
    score += 3;
  }
  if (element.visible) {
    score += 1;
  } else if (score > 0) {
    score -= 2;
  }

  return score;
}

export function matchElement(
  targetDescription: string,
  elements: ElementFacts[],
  hints: MatchHints = {},
): MatchResult {
  const descriptionTokens = tokenize(targetDescription);
  const roleHint = hints.role ?? deriveRoleHint(descriptionTokens);

  let pool = elements;
  if (hints.exactText) {
    const exact = hints.exactText.trim().toLowerCase();
    const exactPool = elements.filter(
      (element) =>
        element.text.trim().toLowerCase() === exact ||
        element.name.trim().toLowerCase() === exact,
    );
    if (exactPool.length > 0) {
      pool = exactPool;
    }
  }

  const ranked: ScoredCandidate[] = pool
    .map((element) => ({ element, score: scoreElement(descriptionTokens, roleHint, element) }))
    .sort((a, b) => b.score - a.score);

  const candidates = ranked.slice(0, MAX_CANDIDATES);
  const best = ranked[0];

  if (!best || best.score < MIN_MATCH_SCORE) {
    return { status: 'not-found', candidates };
  }

  const second = ranked[1];
  if (second && best.score - second.score < AMBIGUITY_GAP) {
    return { status: 'ambiguous', candidates };
  }

  return { status: 'matched', element: best.element, score: best.score, candidates };
}
