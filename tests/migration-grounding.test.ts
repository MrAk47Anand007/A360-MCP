import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  clearMigrationGroundingCache,
  loadMigrationGrounding,
  scoreMigrationCommand,
  scoreMigrationPackage,
} from '../src/workflows/migration-grounding.js';

const tempRoots: string[] = [];

afterEach(() => {
  delete process.env.A360_MIGRATION_PROJECT_ROOT;
  clearMigrationGroundingCache();
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

function createFixtureRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'a360-migration-grounding-'));
  tempRoots.push(root);
  mkdirSync(path.join(root, 'output'), { recursive: true });

  writeFileSync(
    path.join(root, 'output', 'mapping_data.json'),
    JSON.stringify({
      packageMap: {
        workflows: {
          name: 'Workflows',
          label: 'Workflow Tools',
          commands: [
            {
              name: 'runTaskBot',
              label: 'Run task bot',
              description: 'Run another automation from repository',
            },
          ],
        },
      },
      commandMap: {
        'workflows#runtaskbot': {
          name: 'runTaskBot',
          label: 'Run task bot',
          description: 'Run another automation from repository',
        },
      },
    }),
    'utf8',
  );

  writeFileSync(
    path.join(root, 'output', 'iteratorPackagesList.json'),
    JSON.stringify([{ name: 'Loop', version: '1.0.0' }]),
    'utf8',
  );

  writeFileSync(
    path.join(root, 'output', 'conditionalMapList.json'),
    JSON.stringify([{ name: 'If', version: '1.0.0' }]),
    'utf8',
  );

  process.env.A360_MIGRATION_PROJECT_ROOT = root;
  clearMigrationGroundingCache();
  return root;
}

describe('migration grounding', () => {
  it('loads local migration mapping assets into a deterministic snapshot', () => {
    createFixtureRoot();
    const snapshot = loadMigrationGrounding();

    expect(snapshot?.packageNames).toContain('Workflows');
    expect(snapshot?.iteratorPackageNames).toContain('Loop');
    expect(snapshot?.conditionalPackageNames).toContain('If');
    expect(snapshot?.commandHints.some((item) => item.packageName === 'Workflows' && item.commandName === 'runTaskBot')).toBe(true);
  });

  it('scores package and command relevance from migration tags', () => {
    createFixtureRoot();
    const snapshot = loadMigrationGrounding();
    expect(snapshot).not.toBeNull();

    const promptTokens = ['run', 'another', 'automation', 'repository'];
    expect(scoreMigrationPackage(promptTokens, 'Workflows', snapshot!)).toBeGreaterThan(0);
    expect(scoreMigrationCommand(promptTokens, 'Workflows', 'runTaskBot', snapshot!)).toBeGreaterThan(0);
  });
});
