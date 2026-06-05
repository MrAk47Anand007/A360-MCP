import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildRecentActivityPayload } from '../a360/operations.js';

type OperationsDeps = {
  operationsApi: {
    deployAutomation: (payload: Record<string, unknown>) => Promise<unknown>;
    listActivity: (payload: Record<string, unknown>) => Promise<unknown>;
    getExecutionDetails: (executionId: string) => Promise<unknown>;
  };
};

export function registerOperationsTools(server: McpServer, deps: OperationsDeps) {
  server.registerTool(
    'a360_deploy_automation',
    {
      description: 'Deploy an automation in A360 Control Room.',
      inputSchema: z.object({
        payload: z.record(z.string(), z.unknown()),
      }),
    },
    async ({ payload }) => ({
      content: [{ type: 'text', text: JSON.stringify(await deps.operationsApi.deployAutomation(payload), null, 2) }],
    }),
  );

  server.registerTool(
    'a360_list_activity',
    {
      description: 'List bot execution activity in A360 Control Room.',
      inputSchema: z.object({
        payload: z.record(z.string(), z.unknown()).optional(),
      }),
    },
    async ({ payload }) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            await deps.operationsApi.listActivity(
              payload ?? buildRecentActivityPayload(),
            ),
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.registerTool(
    'a360_list_recent_activity',
    {
      description: 'List recent bot execution activity using a safe default filter window.',
      inputSchema: z.object({
        daysBack: z.number().int().positive().max(365).optional(),
        length: z.number().int().positive().max(1000).optional(),
      }),
    },
    async ({ daysBack, length }) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            await deps.operationsApi.listActivity(
              buildRecentActivityPayload(daysBack ?? 30, length ?? 20),
            ),
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.registerTool(
    'a360_get_execution_details',
    {
      description: 'Get execution details by execution id.',
      inputSchema: z.object({
        executionId: z.string().min(1),
      }),
    },
    async ({ executionId }) => ({
      content: [{ type: 'text', text: JSON.stringify(await deps.operationsApi.getExecutionDetails(executionId), null, 2) }],
    }),
  );
}
