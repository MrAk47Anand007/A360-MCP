import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type AppConfig } from './config.js';
import { createA360Client } from './a360/client.js';
import {
  type PackageFilterRequest,
  getPackageVersionDetails,
  getPackageVersionUsage,
  listPackages,
} from './a360/packages.js';
import { type JsonObject } from './types.js';
import {
  getExecutionDetails,
  listActivity,
  deployAutomation,
} from './a360/operations.js';
import {
  createBot,
  deleteFile,
  getFileContent,
  getFileDependencies,
  listFolderChildren,
  listFolderItems,
  updateFileContent,
  updateFileDependencies,
} from './a360/repository.js';
import { registerOperationsTools, registerRepositoryTools, registerWorkflowTools, registerCaptureTools } from './tools/index.js';
import { insertRecorderSteps, patchStepTarget } from './workflows/bot-injection.js';
import { recordWebActions } from './workflows/ui-recording.js';
import { matchElement } from './capture/element-matcher.js';
import { buildCapturedTargetPayload } from './capture/target-payload.js';
import {
  buildBotJsonFromPrompt,
  createBotFromPrompt,
  planBotFromPrompt,
} from './workflows/ai-bot-generation.js';
import { exportAssets, exportBots } from './workflows/export.js';
import {
  getPackageCommandSchemaForWorkflow,
  getPackageVersionsForWorkflow,
  listAvailablePackagesForWorkflow,
  resolvePackageMetadataForWorkflow,
} from './workflows/package-intelligence.js';
import { applyPackageVersionUpdate, planPackageVersionUpdate, scanPackageUsage } from './workflows/package-governance.js';
import { saveBotBundle } from './workflows/repository-save.js';
import { silentSaveBot } from './workflows/silent-save.js';
import { applyLogToFileFix, scanLogToFileIssues } from './workflows/transformations.js';
import { fixBotJson, normalizeBotJson, previewBotJson, validateBotJson } from './workflows/validation.js';

export type AppDependencies = ReturnType<typeof buildDependenciesFromConfig>;

export function buildDependenciesFromConfig(config: AppConfig) {
  const client = createA360Client(config.baseUrl, config.accessToken ?? '');

  return {
    repositoryApi: {
      createBot: (parentFolderId: string, name: string, description?: string) =>
        createBot(client, parentFolderId, name, description),
      listFolderItems: (folderId: string) => listFolderItems(client, folderId),
      listFolderChildren: (folderId: string) => listFolderChildren(client, folderId),
      getFileContent: (fileId: string) => getFileContent(client, fileId),
      updateFileContent: (
        fileId: string,
        content: Record<string, unknown>,
        hasErrors?: boolean,
      ) => updateFileContent(client, fileId, content, hasErrors),
      getFileDependencies: (fileId: string) => getFileDependencies(client, fileId),
      updateFileDependencies: (fileId: string, childFileIds: string[]) =>
        updateFileDependencies(client, fileId, childFileIds),
      deleteFile: (fileId: string) => deleteFile(client, fileId),
    },
    operationsApi: {
      deployAutomation: (payload: Record<string, unknown>) => deployAutomation(client, payload),
      listActivity: (payload: Record<string, unknown>) => listActivity(client, payload),
      getExecutionDetails: (executionId: string) => getExecutionDetails(client, executionId),
    },
    packageApi: {
      listPackages: (options?: {
        filterRequest?: PackageFilterRequest;
        includeDownloadUrls?: boolean;
      }) => listPackages(client, options),
      getPackageVersionDetails: (packages: Array<{ name: string; version?: string }>) =>
        getPackageVersionDetails(client, packages),
      getPackageVersionUsage: (
        packageName: string,
        filterRequest?: PackageFilterRequest,
      ) => getPackageVersionUsage(client, packageName, filterRequest),
    },
    workflowApi: {
      planBotFromPrompt: (input: {
        prompt: string;
        botName?: string;
        folderId?: string;
        preferredPackages?: string[];
        wrapInTry?: boolean;
      }) => planBotFromPrompt(client, input),
      buildBotJsonFromPrompt: (input: {
        prompt: string;
        botName?: string;
        folderId?: string;
        preferredPackages?: string[];
        wrapInTry?: boolean;
      }) => buildBotJsonFromPrompt(client, input),
      createBotFromPrompt: (input: {
        prompt: string;
        botName?: string;
        folderId?: string;
        preferredPackages?: string[];
        wrapInTry?: boolean;
        description?: string;
        dryRun?: boolean;
      }) =>
        createBotFromPrompt(
          client,
          {
            createBot: (parentFolderId: string, name: string, description?: string) =>
              createBot(client, parentFolderId, name, description),
            updateFileContent: (
              fileId: string,
              content: Record<string, unknown>,
              hasErrors?: boolean,
            ) => updateFileContent(client, fileId, content, hasErrors),
            updateFileDependencies: (fileId: string, childFileIds: string[]) =>
              updateFileDependencies(client, fileId, childFileIds),
          },
          input,
          {
            defaultFolderId: config.defaultFolderId,
          },
        ),
      validateBotJson: (botJson: Record<string, unknown>) =>
        validateBotJson(client, botJson),
      previewBotJson: (botJson: Record<string, unknown>) =>
        previewBotJson(client, botJson),
      fixBotJson: (botJson: Record<string, unknown>) =>
        fixBotJson(client, botJson),
      normalizeBotJson: (botJson: Record<string, unknown>) =>
        normalizeBotJson(client, botJson),
      exportBots: (folderId: string, recursive?: boolean) => exportBots(client, folderId, recursive),
      exportAssets: (folderId: string, recursive?: boolean) => exportAssets(client, folderId, recursive),
      listAvailablePackages: (options?: {
        filterRequest?: PackageFilterRequest;
        includeDownloadUrls?: boolean;
        search?: string;
      }) => listAvailablePackagesForWorkflow(client, options),
      getPackageVersions: (packageName: string) =>
        getPackageVersionsForWorkflow(client, packageName),
      getPackageCommandSchema: (input: {
        packageName: string;
        packageVersion?: string;
        commandName: string;
      }) => getPackageCommandSchemaForWorkflow(client, input),
      resolvePackageMetadata: (packages: Array<{ name: string; version?: string }>) =>
        resolvePackageMetadataForWorkflow(client, packages),
      scanPackageUsage: (folderId: string, recursive?: boolean) => scanPackageUsage(client, folderId, recursive),
      planPackageVersionUpdate: (
        folderId: string,
        targets: Record<string, string>,
        recursive?: boolean,
      ) => planPackageVersionUpdate(client, folderId, targets, recursive),
      applyPackageVersionUpdate: (
        folderId: string,
        targets: Record<string, string>,
        options?: { recursive?: boolean; dryRun?: boolean; selectedBotIds?: string[] },
      ) => applyPackageVersionUpdate(client, folderId, targets, options),
      scanLogToFileIssues: (
        folderId: string,
        recursive?: boolean,
        logStructure?: string,
      ) => scanLogToFileIssues(client, folderId, recursive, logStructure),
      applyLogToFileFix: (
        folderId: string,
        recursive?: boolean,
        logStructure?: string,
        dryRun?: boolean,
      ) => applyLogToFileFix(client, folderId, recursive, logStructure, dryRun),
      silentSaveBot: (input: {
        fileId: string;
        content: Record<string, unknown>;
        dependencies: string[] | Record<string, unknown>;
        hasErrors?: boolean;
      }) =>
        silentSaveBot({
          fileId: input.fileId,
          baseUrl: config.baseUrl,
          token: config.accessToken ?? '',
          hasErrors: input.hasErrors,
          content: input.content as JsonObject,
          dependencies: Array.isArray(input.dependencies)
            ? input.dependencies
            : (input.dependencies as JsonObject),
        }),
      saveBotBundle: (input: {
        fileId: string;
        content: Record<string, unknown>;
        dependencies?: string[] | Record<string, unknown>;
        hasErrors?: boolean;
      }) =>
        normalizeBotJson(client, input.content).then((normalized) =>
          saveBotBundle(
          {
            updateFileContent: (
              fileId: string,
              content: Record<string, unknown>,
              hasErrors?: boolean,
            ) => updateFileContent(client, fileId, content, hasErrors),
            updateFileDependencies: (fileId: string, childFileIds: string[]) =>
              updateFileDependencies(client, fileId, childFileIds),
          },
          {
            fileId: input.fileId,
            content: normalized.botJson,
            dependencies: Array.isArray(input.dependencies)
              ? input.dependencies
              : (input.dependencies as JsonObject | undefined),
            hasErrors: input.hasErrors,
          },
        ).then((saveResult) => ({
          ...saveResult,
          normalization: {
            changed: normalized.changed,
            changes: normalized.changes,
            resolvedPackages: normalized.resolvedPackages,
          },
        }))),
    },
    captureApi: {
      recordWebActions: async (input: {
        startUrl: string;
        steps: Array<Record<string, unknown>>;
        captureImages?: boolean;
        includeAnchors?: boolean;
        recorderCommand?: Record<string, string | undefined>;
        browserUrl?: string;
      }) => {
        const { connectChromeSession } = await import('./capture/chrome-session.js');
        const browser = await connectChromeSession({ browserUrl: input.browserUrl });
        try {
          return await recordWebActions(browser, {
            startUrl: input.startUrl,
            steps: input.steps as never,
            captureImages: input.captureImages,
            includeAnchors: input.includeAnchors,
            recorderCommand: input.recorderCommand as never,
          });
        } finally {
          await browser.close();
        }
      },
      captureUiTarget: async (input: {
        url: string;
        target: string;
        hints?: { role?: string; exactText?: string };
        captureImage?: boolean;
        includeAnchor?: boolean;
        browserUrl?: string;
      }) => {
        const { connectChromeSession } = await import('./capture/chrome-session.js');
        const browser = await connectChromeSession({ browserUrl: input.browserUrl });
        try {
          await browser.gotoUrl(input.url);
          const elements = await browser.snapshotElements();
          const match = matchElement(input.target, elements, input.hints);
          if (match.status !== 'matched') {
            return { status: match.status, candidates: match.candidates };
          }
          const screenshotBase64 = input.captureImage
            ? ((await browser.screenshotElement(match.element.elementId)) ?? undefined)
            : undefined;
          const payload = buildCapturedTargetPayload(match.element, {
            screenshotBase64,
            includeAnchor: input.includeAnchor,
          });
          return { status: 'matched', payload };
        } finally {
          await browser.close();
        }
      },
      insertRecorderSteps: (input: {
        fileId: string;
        nodes: Array<Record<string, unknown>>;
        afterUid?: string;
        recorderPackage?: { name: string; version: string };
        hasErrors?: boolean;
      }) =>
        insertRecorderSteps(
          {
            getFileContent: (fileId: string) => getFileContent(client, fileId),
            getFileDependencies: (fileId: string) => getFileDependencies(client, fileId),
            updateFileContent: (
              fileId: string,
              content: Record<string, unknown>,
              hasErrors?: boolean,
            ) => updateFileContent(client, fileId, content, hasErrors),
            updateFileDependencies: (fileId: string, childFileIds: string[]) =>
              updateFileDependencies(client, fileId, childFileIds),
          },
          input,
        ),
      patchStepTarget: (input: {
        fileId: string;
        nodeUid: string;
        attributeName: string;
        value: Record<string, unknown>;
        hasErrors?: boolean;
      }) =>
        patchStepTarget(
          {
            getFileContent: (fileId: string) => getFileContent(client, fileId),
            getFileDependencies: (fileId: string) => getFileDependencies(client, fileId),
            updateFileContent: (
              fileId: string,
              content: Record<string, unknown>,
              hasErrors?: boolean,
            ) => updateFileContent(client, fileId, content, hasErrors),
            updateFileDependencies: (fileId: string, childFileIds: string[]) =>
              updateFileDependencies(client, fileId, childFileIds),
          },
          input,
        ),
    },
  };
}

export function createServer(deps: AppDependencies) {
  const server = new McpServer({
    name: 'automation-anywhere-a360',
    version: '0.1.0',
  });

  registerRepositoryTools(server, deps);
  registerOperationsTools(server, deps);
  registerWorkflowTools(server, deps);
  registerCaptureTools(server, deps);

  return server;
}
