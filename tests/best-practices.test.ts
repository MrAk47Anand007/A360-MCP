import { describe, expect, it } from 'vitest';
import { applyBestPracticeScaffold } from '../src/workflows/best-practices.js';

describe('best practice scaffold', () => {
  it('adds log packages, variables, and prefix/suffix nodes deterministically', () => {
    const result = applyBestPracticeScaffold({
      botJson: {
        nodes: [
          {
            uid: 'node-1',
            commandName: 'messageBox',
            packageName: 'MessageBox',
            disabled: false,
            attributes: [],
          },
        ],
        variables: [],
        packages: [{ name: 'MessageBox', version: '1.0.0', settingsAttributes: [] }],
      },
      startComment: 'Initialize login flow.',
      startLogMessage: 'Starting login flow.',
      endLogMessage: 'Finished login flow.',
    });

    expect(result.summary.ensuredPackages).toEqual(['Comment', 'LogToFile']);
    expect(result.summary.ensuredVariables).toEqual([
      'iStrAuditLogFilePath',
      'iStrErrorLogFilePath',
    ]);

    const botJson = result.botJson as Record<string, any>;
    expect(botJson.packages.map((entry: any) => entry.name)).toEqual([
      'MessageBox',
      'Comment',
      'LogToFile',
    ]);
    expect(botJson.variables.map((entry: any) => entry.name)).toEqual([
      'iStrAuditLogFilePath',
      'iStrErrorLogFilePath',
    ]);
    expect(botJson.nodes[0].commandName).toBe('Comment');
    expect(botJson.nodes[1].commandName).toBe('logToFile');
    expect(botJson.nodes[2].uid).toBe('node-1');
    expect(botJson.nodes[3].commandName).toBe('logToFile');
  });
});
