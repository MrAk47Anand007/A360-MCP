import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const stepSchema = z.object({
  action: z.enum(['navigate', 'click', 'type', 'select']),
  target: z.string().optional(),
  text: z.string().optional(),
  url: z.string().optional(),
  hints: z
    .object({
      role: z.string().optional(),
      exactText: z.string().optional(),
    })
    .optional(),
});

const recorderCommandSchema = z
  .object({
    packageName: z.string().optional(),
    commandName: z.string().optional(),
    targetAttributeName: z.string().optional(),
    actionAttributeName: z.string().optional(),
    actionValueAttributeName: z.string().optional(),
  })
  .optional();

type CaptureDeps = {
  captureApi: {
    recordWebActions: (input: {
      startUrl: string;
      steps: Array<z.infer<typeof stepSchema>>;
      captureImages?: boolean;
      includeAnchors?: boolean;
      recorderCommand?: z.infer<typeof recorderCommandSchema>;
      browserUrl?: string;
    }) => Promise<unknown>;
    captureUiTarget: (input: {
      url: string;
      target: string;
      hints?: { role?: string; exactText?: string };
      captureImage?: boolean;
      includeAnchor?: boolean;
      browserUrl?: string;
    }) => Promise<unknown>;
    insertRecorderSteps: (input: {
      fileId: string;
      nodes: Array<Record<string, unknown>>;
      afterUid?: string;
      recorderPackage?: { name: string; version: string };
      hasErrors?: boolean;
    }) => Promise<unknown>;
    patchStepTarget: (input: {
      fileId: string;
      nodeUid: string;
      attributeName: string;
      value: Record<string, unknown>;
      hasErrors?: boolean;
    }) => Promise<unknown>;
  };
};

export function registerCaptureTools(server: McpServer, deps: CaptureDeps) {
  server.registerTool(
    'a360_record_web_actions',
    {
      description:
        'Run a live web recording session in Chrome over CDP: execute structured steps (navigate/click/type/select), capture each acted-on element, and return canonical UIOBJECT/IMAGE payloads plus ready recorder nodes. Halts with ranked candidates on ambiguity.',
      inputSchema: z.object({
        startUrl: z.string().min(1),
        steps: z.array(stepSchema).min(1),
        captureImages: z.boolean().optional(),
        includeAnchors: z.boolean().optional(),
        recorderCommand: recorderCommandSchema,
        browserUrl: z.string().optional(),
      }),
    },
    async (input) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(await deps.captureApi.recordWebActions(input), null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    'a360_capture_ui_target',
    {
      description:
        'Capture a single UI element from a live Chrome page (no action performed) and return its canonical UIOBJECT/IMAGE/anchor payload pieces.',
      inputSchema: z.object({
        url: z.string().min(1),
        target: z.string().min(1),
        hints: z
          .object({ role: z.string().optional(), exactText: z.string().optional() })
          .optional(),
        captureImage: z.boolean().optional(),
        includeAnchor: z.boolean().optional(),
        browserUrl: z.string().optional(),
      }),
    },
    async (input) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(await deps.captureApi.captureUiTarget(input), null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    'a360_insert_recorder_step',
    {
      description:
        'Insert captured recorder node(s) into an existing bot (append or after a node uid), ensure the Recorder package dependency, and save via the normalized bundle flow.',
      inputSchema: z.object({
        fileId: z.string().min(1),
        nodes: z.array(z.record(z.string(), z.unknown())).min(1),
        afterUid: z.string().optional(),
        recorderPackage: z
          .object({ name: z.string().min(1), version: z.string().min(1) })
          .optional(),
        hasErrors: z.boolean().optional(),
      }),
    },
    async (input) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(await deps.captureApi.insertRecorderSteps(input), null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    'a360_patch_step_target',
    {
      description:
        'Replace one attribute value (e.g. a UIOBJECT target) on an existing bot node with a captured payload and save via the normalized bundle flow.',
      inputSchema: z.object({
        fileId: z.string().min(1),
        nodeUid: z.string().min(1),
        attributeName: z.string().min(1),
        value: z.record(z.string(), z.unknown()),
        hasErrors: z.boolean().optional(),
      }),
    },
    async (input) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(await deps.captureApi.patchStepTarget(input), null, 2),
        },
      ],
    }),
  );
}
