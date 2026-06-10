import { z } from 'zod';

const typedValueSchema: z.ZodType<Record<string, unknown>> = z
  .object({
    type: z.string(),
  })
  .catchall(z.unknown());

const attributeSchema = z.object({
  name: z.string(),
  value: typedValueSchema,
});

export const a360NodeSchema: z.ZodType<Record<string, unknown>> = z.lazy(() =>
  z
    .object({
      uid: z.string(),
      commandName: z.string(),
      packageName: z.string(),
      disabled: z.boolean(),
      attributes: z.array(attributeSchema),
      returnTo: typedValueSchema.optional(),
      returns: z.record(z.string(), typedValueSchema).optional(),
      children: z.array(a360NodeSchema).optional(),
      branches: z.array(a360NodeSchema).optional(),
    })
    .catchall(z.unknown()),
);

export const a360VariableSchema = z
  .object({
    name: z.string(),
    description: z.string(),
    type: z.string(),
    readOnly: z.boolean(),
    input: z.boolean(),
    output: z.boolean(),
    defaultValue: typedValueSchema,
  })
  .catchall(z.unknown());

export const a360PackageSchema = z
  .object({
    name: z.string(),
    version: z.string(),
    settingsAttributes: z.array(z.record(z.string(), z.unknown())),
  })
  .catchall(z.unknown());

export const a360TaskBotPropertiesSchema = z
  .object({
    botCodeVersion: z.string(),
    improvedNumberSupport: z.boolean(),
    timeout: z.string(),
    automationPriority: z.string(),
    runInChildWindow: z.boolean(),
    runInChildWindowMode: z.string(),
  })
  .catchall(z.unknown());

export const a360TaskBotContentSchema = z
  .object({
    triggers: z.array(z.unknown()),
    nodes: z.array(a360NodeSchema),
    variables: z.array(a360VariableSchema),
    packages: z.array(a360PackageSchema),
    properties: a360TaskBotPropertiesSchema,
    workItemTemplateName: z.string().nullable(),
  })
  .catchall(z.unknown());

export const a360EditorDraftSchema = z
  .object({
    triggers: z.array(z.unknown()),
    nodes: z.array(a360NodeSchema),
    orphans: z.array(z.unknown()),
    swimlanes: z.array(z.unknown()),
    swimlaneStacking: z.string(),
    variables: z.array(a360VariableSchema),
    breakpoints: z.array(z.unknown()),
    packages: z.array(a360PackageSchema),
    packageSettings: z.record(z.string(), z.array(attributeSchema)),
    dependencies: z.array(z.unknown()),
    workItemTemplateName: z.string().nullable(),
    properties: z.record(z.string(), z.unknown()),
    hasContent: z.boolean(),
  })
  .catchall(z.unknown());

export type A360TypedValue = z.infer<typeof typedValueSchema>;
export type A360Node = z.infer<typeof a360NodeSchema>;
export type A360Variable = z.infer<typeof a360VariableSchema>;
export type A360Package = z.infer<typeof a360PackageSchema>;
export type A360TaskBotProperties = z.infer<typeof a360TaskBotPropertiesSchema>;
export type A360TaskBotContent = z.infer<typeof a360TaskBotContentSchema>;
export type A360EditorDraft = z.infer<typeof a360EditorDraftSchema>;
