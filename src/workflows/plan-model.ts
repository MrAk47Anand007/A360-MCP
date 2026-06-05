export type PlannedScalarType =
  | 'STRING'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'FILE'
  | 'DATETIME'
  | 'VARIABLE'
  | 'DICTIONARY';

export type PlannedValue =
  | { type: 'STRING'; string: string }
  | { type: 'STRING'; expression: string }
  | { type: 'NUMBER'; number: string | number }
  | { type: 'NUMBER'; expression: string }
  | { type: 'BOOLEAN'; boolean: boolean }
  | { type: 'FILE'; string: string }
  | { type: 'FILE'; expression: string }
  | { type: 'DATETIME'; expression: string }
  | { type: 'VARIABLE'; variableName: string }
  | { type: 'DICTIONARY'; dictionary: Array<{ key: string; value: PlannedValue }> };

export type PlannedAttribute = {
  name: string;
  value: PlannedValue;
};

export type PlannedVariable = {
  name: string;
  type: PlannedScalarType;
  description?: string;
  readOnly?: boolean;
  input?: boolean;
  output?: boolean;
  defaultValue?: PlannedValue;
};

export type PlannedPackage = {
  name: string;
  version?: string;
  settingsAttributes?: Array<Record<string, unknown>>;
};

export type PlannedStep = {
  uid?: string;
  title?: string;
  packageName: string;
  commandName: string;
  disabled?: boolean;
  attributes?: PlannedAttribute[];
  returnTo?: Extract<PlannedValue, { type: 'VARIABLE' }>;
  returns?: Record<string, PlannedValue>;
  children?: PlannedStep[];
  branches?: PlannedStep[];
};

export type PlannedBot = {
  botName: string;
  goal: string;
  variables: PlannedVariable[];
  steps: PlannedStep[];
  packages: PlannedPackage[];
};
