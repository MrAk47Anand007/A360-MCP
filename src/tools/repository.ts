import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

type RepositoryDeps = {
  repositoryApi: {
    createBot: (parentFolderId: string, name: string, description?: string) => Promise<unknown>;
    listFolderItems: (folderId: string) => Promise<unknown>;
    listFolderChildren: (folderId: string) => Promise<unknown>;
    getFileContent: (fileId: string) => Promise<unknown>;
    updateFileContent: (
      fileId: string,
      content: Record<string, unknown>,
      hasErrors?: boolean,
    ) => Promise<unknown>;
    getFileDependencies: (fileId: string) => Promise<unknown>;
    updateFileDependencies: (fileId: string, childFileIds: string[]) => Promise<unknown>;
  };
};

export function registerRepositoryTools(server: McpServer, deps: RepositoryDeps) {
  server.registerTool(
    'a360_create_bot',
    {
      description: 'Create a new A360 taskbot in a target folder.',
      inputSchema: z.object({
        parentFolderId: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
      }),
    },
    async ({ parentFolderId, name, description }) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            await deps.repositoryApi.createBot(parentFolderId, name, description),
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.registerTool(
    'a360_list_folder_items',
    {
      description: 'List repository items inside an A360 folder.',
      inputSchema: z.object({
        folderId: z.string().min(1),
      }),
    },
    async ({ folderId }) => ({
      content: [{ type: 'text', text: JSON.stringify(await deps.repositoryApi.listFolderItems(folderId), null, 2) }],
    }),
  );

  server.registerTool(
    'a360_list_child_folders',
    {
      description: 'List child folders inside an A360 folder.',
      inputSchema: z.object({
        folderId: z.string().min(1),
      }),
    },
    async ({ folderId }) => ({
      content: [{ type: 'text', text: JSON.stringify(await deps.repositoryApi.listFolderChildren(folderId), null, 2) }],
    }),
  );

  server.registerTool(
    'a360_get_bot_content',
    {
      description: 'Get A360 bot content JSON by file id.',
      inputSchema: z.object({
        fileId: z.string().min(1),
      }),
    },
    async ({ fileId }) => ({
      content: [{ type: 'text', text: JSON.stringify(await deps.repositoryApi.getFileContent(fileId), null, 2) }],
    }),
  );

  server.registerTool(
    'a360_update_bot_content',
    {
      description: 'Update A360 bot content JSON by file id.',
      inputSchema: z.object({
        fileId: z.string().min(1),
        content: z.record(z.string(), z.unknown()),
        hasErrors: z.boolean().optional(),
      }),
    },
    async ({ fileId, content, hasErrors }) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            await deps.repositoryApi.updateFileContent(fileId, content, hasErrors),
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.registerTool(
    'a360_get_bot_dependencies',
    {
      description: 'Get A360 bot dependencies by file id.',
      inputSchema: z.object({
        fileId: z.string().min(1),
      }),
    },
    async ({ fileId }) => ({
      content: [{ type: 'text', text: JSON.stringify(await deps.repositoryApi.getFileDependencies(fileId), null, 2) }],
    }),
  );

  server.registerTool(
    'a360_update_bot_dependencies',
    {
      description: 'Update A360 bot dependencies by file id.',
      inputSchema: z.object({
        fileId: z.string().min(1),
        childFileIds: z.array(z.string()),
      }),
    },
    async ({ fileId, childFileIds }) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            await deps.repositoryApi.updateFileDependencies(fileId, childFileIds),
            null,
            2,
          ),
        },
      ],
    }),
  );
}
