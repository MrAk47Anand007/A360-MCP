import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { buildConfig } from './config.js';
import { createA360Client } from './a360/client.js';
import {
  getExecutionDetails,
  listActivity,
  deployAutomation,
} from './a360/operations.js';
import {
  getFileContent,
  getFileDependencies,
  listFolderItems,
  updateFileDependencies,
} from './a360/repository.js';
import { registerOperationsTools, registerRepositoryTools } from './tools/index.js';

export function createServer() {
  const config = buildConfig({});
  const client = createA360Client(config.baseUrl, config.accessToken ?? '');
  const server = new McpServer({
    name: 'automation-anywhere-a360',
    version: '0.1.0',
  });

  registerRepositoryTools(server, {
    repositoryApi: {
      listFolderItems: (folderId) => listFolderItems(client, folderId),
      getFileContent: (fileId) => getFileContent(client, fileId),
      getFileDependencies: (fileId) => getFileDependencies(client, fileId),
      updateFileDependencies: (fileId, childFileIds) =>
        updateFileDependencies(client, fileId, childFileIds),
    },
  });

  registerOperationsTools(server, {
    operationsApi: {
      deployAutomation: (payload) => deployAutomation(client, payload),
      listActivity: (payload) => listActivity(client, payload),
      getExecutionDetails: (executionId) => getExecutionDetails(client, executionId),
    },
  });

  return server;
}
