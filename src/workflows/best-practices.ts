import { randomUUID } from 'node:crypto';

type BotJson = Record<string, unknown> & {
  nodes?: Array<Record<string, unknown>>;
  variables?: Array<Record<string, unknown>>;
  packages?: Array<Record<string, unknown>>;
};

export type BestPracticeScaffoldInput = {
  botJson: Record<string, unknown>;
  startComment?: string;
  startLogMessage?: string;
  endLogMessage?: string;
  auditLogPath?: string;
  errorLogPath?: string;
};

function stringValue(value: string) {
  return { type: 'STRING', string: value };
}

function fileExpression(variableName: string) {
  return `file://$${variableName}$`;
}

function createStringVariable(name: string, input: boolean, defaultValue: string) {
  return {
    name,
    description: '',
    type: 'STRING',
    readOnly: false,
    input,
    output: false,
    defaultValue: stringValue(defaultValue),
  };
}

function ensurePackage(botJson: BotJson, name: string, version: string) {
  const packages = Array.isArray(botJson.packages) ? [...botJson.packages] : [];
  if (!packages.some((entry) => entry.name === name)) {
    packages.push({ name, version, settingsAttributes: [] });
  }
  botJson.packages = packages;
}

function ensureVariable(botJson: BotJson, variable: Record<string, unknown>) {
  const variables = Array.isArray(botJson.variables) ? [...botJson.variables] : [];
  if (!variables.some((entry) => entry.name === variable.name)) {
    variables.push(variable);
  }
  botJson.variables = variables;
}

function createCommentNode(comment: string) {
  return {
    uid: randomUUID(),
    commandName: 'Comment',
    packageName: 'Comment',
    disabled: false,
    attributes: [{ name: 'comment', value: stringValue(comment) }],
  };
}

function createLogNode(message: string, fileVar = 'iStrAuditLogFilePath') {
  return {
    uid: randomUUID(),
    commandName: 'logToFile',
    packageName: 'LogToFile',
    disabled: false,
    attributes: [
      {
        name: 'filePath',
        value: { type: 'FILE', expression: fileExpression(fileVar) },
      },
      {
        name: 'logContent',
        value: {
          type: 'STRING',
          expression: ` | $System:Machine$ | $System:AATaskName$ | INFO | 1 | ${message} $String:Enter$`,
        },
      },
      {
        name: 'appendTimestamp',
        value: { type: 'BOOLEAN', boolean: true },
      },
      {
        name: 'logOption',
        value: stringValue('APPEND_FILE'),
      },
      {
        name: 'encodingValue',
        value: stringValue('ANSI'),
      },
    ],
  };
}

export function applyBestPracticeScaffold(input: BestPracticeScaffoldInput) {
  const botJson = JSON.parse(JSON.stringify(input.botJson ?? {})) as BotJson;
  const nodes = Array.isArray(botJson.nodes) ? [...botJson.nodes] : [];
  const prefix: Array<Record<string, unknown>> = [];
  const suffix: Array<Record<string, unknown>> = [];

  ensurePackage(botJson, 'Comment', '2.16.0');
  ensurePackage(botJson, 'LogToFile', '3.8.0');
  ensureVariable(
    botJson,
    createStringVariable(
      'iStrAuditLogFilePath',
      true,
      input.auditLogPath ?? 'C:\\Logs\\Audit\\Audit_Log.txt',
    ),
  );
  ensureVariable(
    botJson,
    createStringVariable(
      'iStrErrorLogFilePath',
      true,
      input.errorLogPath ?? 'C:\\Logs\\Error\\Error_Log.txt',
    ),
  );

  const startComment = input.startComment?.trim() || 'Starting bot execution.';
  const startLogMessage = input.startLogMessage?.trim() || 'Bot execution started.';
  const endLogMessage = input.endLogMessage?.trim() || 'Bot execution completed.';

  prefix.push(createCommentNode(startComment));
  prefix.push(createLogNode(startLogMessage));
  suffix.push(createLogNode(endLogMessage));

  botJson.nodes = [...prefix, ...nodes, ...suffix];

  return {
    botJson,
    summary: {
      insertedNodeCount: prefix.length + suffix.length,
      ensuredPackages: ['Comment', 'LogToFile'],
      ensuredVariables: ['iStrAuditLogFilePath', 'iStrErrorLogFilePath'],
    },
  };
}
