import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

type RepositoryDeps = {
  repositoryApi: {
    listFolderItems: (folderId: string) => Promise<unknown>;
    getFileContent: (fileId: string) => Promise<unknown>;
    getFileDependencies: (fileId: string) => Promise<unknown>;
    updateFileDependencies: (fileId: string, childFileIds: string[]) => Promise<unknown>;
  };
};

export function registerRepositoryTools(server: McpServer, deps: RepositoryDeps) {
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
}
