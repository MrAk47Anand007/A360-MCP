import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type AppConfig } from './config.js';
import { createA360Client } from './a360/client.js';
import { loginWithApiKey, loginWithPassword } from './a360/auth.js';
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
import { extractHealingMetadata } from './capture/healing-metadata.js';
import {
  rankElementsBySurroundingContext,
  validateSurroundingContext,
} from './capture/surrounding-context.js';
import { buildRecorderNode } from './capture/target-payload.js';
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
import { applyBestPracticeScaffold } from './workflows/best-practices.js';
import { applyLogToFileFix, scanLogToFileIssues } from './workflows/transformations.js';
import { fixBotJson, normalizeBotJson, previewBotJson, validateBotJson } from './workflows/validation.js';
import { readPersistedConfig, writePersistedConfig } from './setup/config-file.js';

export type AppDependencies = ReturnType<typeof buildDependenciesFromConfig>;

export function buildDependenciesFromConfig(config: AppConfig) {
  let currentToken = config.accessToken ?? '';

  async function refreshToken() {
    const username = config.username?.trim();
    if (config.authMode === 'password') {
      if (!username || !config.password) {
        return null;
      }
      currentToken = await loginWithPassword(config.baseUrl, username, config.password);
    } else if (config.authMode === 'apikey') {
      if (!username || !config.apiKey) {
        return null;
      }
      currentToken = await loginWithApiKey(config.baseUrl, username, config.apiKey);
    } else {
      return null;
    }

    const persisted = await readPersistedConfig(config.configPath);
    await writePersistedConfig(config.configPath, {
      ...persisted,
      A360_USERNAME: username ?? persisted.A360_USERNAME,
      A360_ACCESS_TOKEN: currentToken,
    });

    return currentToken;
  }

  const client = createA360Client(config.baseUrl, {
    getToken: () => currentToken,
    onUnauthorized: refreshToken,
  });

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
      applyBestPracticeScaffold: (input: {
        botJson: Record<string, unknown>;
        startComment?: string;
        startLogMessage?: string;
        endLogMessage?: string;
        auditLogPath?: string;
        errorLogPath?: string;
      }) => Promise.resolve(applyBestPracticeScaffold(input)),
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
          token: currentToken,
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
      validateUiTargetBinding: async (input: {
        url: string;
        target: string;
        capturedContext: Record<string, unknown>;
        hints?: { role?: string; exactText?: string };
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
          const candidateContext = match.element.surroundingContext;
          if (!candidateContext) {
            return { status: 'error', error: 'Candidate target did not produce surrounding context.' };
          }
          const validation = validateSurroundingContext(
            input.capturedContext as never,
            candidateContext as never,
          );
          return {
            status: 'validated',
            validation,
            candidateElement: match.element,
          };
        } finally {
          await browser.close();
        }
      },
      repairUiTargetBinding: async (input: {
        url: string;
        capturedContext: Record<string, unknown>;
        target?: string;
        hints?: { role?: string; exactText?: string };
        captureImage?: boolean;
        includeAnchor?: boolean;
        recorderCommand?: Record<string, string | undefined>;
        action?: 'click' | 'type' | 'select';
        text?: string;
        browserUrl?: string;
      }) => {
        const { connectChromeSession } = await import('./capture/chrome-session.js');
        const browser = await connectChromeSession({ browserUrl: input.browserUrl });
        try {
          await browser.gotoUrl(input.url);
          const elements = await browser.snapshotElements();
          const ranked = rankElementsBySurroundingContext(
            input.capturedContext as never,
            elements,
          );
          const best = ranked[0];
          if (!best || !best.element.surroundingContext) {
            return { status: 'not-found', candidates: [] };
          }

          let textMatchElementId: string | undefined;
          if (input.target) {
            const textMatch = matchElement(input.target, elements, input.hints);
            if (textMatch.status === 'matched') {
              textMatchElementId = textMatch.element.elementId;
            }
          }

          const screenshotBase64 = input.captureImage
            ? ((await browser.screenshotElement(best.element.elementId)) ?? undefined)
            : undefined;
          const payload = buildCapturedTargetPayload(best.element, {
            screenshotBase64,
            includeAnchor: input.includeAnchor,
          });
          const node = input.action
            ? buildRecorderNode(payload, {
                action: input.action,
                text: input.text,
                ...((input.recorderCommand ?? {}) as Record<string, unknown>),
              })
            : undefined;

          return {
            status: best.validation.isMatch ? 'repaired' : 'review',
            best: {
              confidence: best.validation.confidence,
              reasons: best.validation.reasons,
              matchedTargetDescription: textMatchElementId === best.element.elementId,
              element: best.element,
              payload,
              node,
              suggestedVariables: payload.suggestedVariables,
            },
            candidates: ranked.slice(0, 5).map((entry) => ({
              confidence: entry.validation.confidence,
              reasons: entry.validation.reasons,
              elementId: entry.element.elementId,
              role: entry.element.role,
              name: entry.element.name,
              text: entry.element.text,
              domPath: entry.element.domPath,
            })),
          };
        } finally {
          await browser.close();
        }
      },
      insertRecorderSteps: (input: {
        fileId: string;
        nodes: Array<Record<string, unknown>>;
        variables?: Array<Record<string, unknown>>;
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
          {
            ...input,
            normalizeContent: (content) =>
              normalizeBotJson(client, content).then((result) => result.botJson),
          },
        ),
      patchStepTarget: (input: {
        fileId: string;
        nodeUid: string;
        attributeName: string;
        value: Record<string, unknown>;
        variables?: Array<Record<string, unknown>>;
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
          {
            ...input,
            normalizeContent: (content) =>
              normalizeBotJson(client, content).then((result) => result.botJson),
          },
        ),
      repairAndPatchUiTarget: async (input: {
        fileId: string;
        nodeUid: string;
        attributeName: string;
        url: string;
        capturedContext?: Record<string, unknown>;
        target?: string;
        hints?: { role?: string; exactText?: string };
        captureImage?: boolean;
        includeAnchor?: boolean;
        hasErrors?: boolean;
        browserUrl?: string;
      }) => {
        const getStoredCapturedContext = async () => {
          const content = (await getFileContent(client, input.fileId)) as Record<string, unknown>;
          const findNode = (nodes: unknown[]): Record<string, unknown> | undefined => {
            for (const nodeValue of nodes) {
              const node =
                nodeValue && typeof nodeValue === 'object' && !Array.isArray(nodeValue)
                  ? (nodeValue as Record<string, unknown>)
                  : undefined;
              if (!node) {
                continue;
              }
              if (node.uid === input.nodeUid) {
                return node;
              }
              const found =
                findNode(
                  Array.isArray(node.children) ? (node.children as unknown[]) : [],
                ) ??
                findNode(
                  Array.isArray(node.branches) ? (node.branches as unknown[]) : [],
                );
              if (found) {
                return found;
              }
            }
            return undefined;
          };

          const node = findNode(Array.isArray(content.nodes) ? (content.nodes as unknown[]) : []);
          if (!node || !Array.isArray(node.attributes)) {
            return undefined;
          }
          const attribute = (node.attributes as Array<Record<string, unknown>>).find(
            (candidate) => candidate.name === input.attributeName,
          );
          if (!attribute || !attribute.value || typeof attribute.value !== 'object') {
            return undefined;
          }
          return extractHealingMetadata(attribute.value as Record<string, unknown>)
            .surroundingContext;
        };

        const capturedContext = input.capturedContext ?? (await getStoredCapturedContext());
        if (!capturedContext) {
          return {
            status: 'missing-context',
            error:
              'No capturedContext was provided and no persisted A360 MCP healing metadata was found on the target node.',
          };
        }

        const repairResult = await (async () => {
          const { connectChromeSession } = await import('./capture/chrome-session.js');
          const browser = await connectChromeSession({ browserUrl: input.browserUrl });
          try {
            await browser.gotoUrl(input.url);
            const elements = await browser.snapshotElements();
            const ranked = rankElementsBySurroundingContext(
              capturedContext as never,
              elements,
            );
            const best = ranked[0];
            if (!best || !best.element.surroundingContext) {
              return { status: 'not-found' as const, candidates: [] };
            }

            let textMatchElementId: string | undefined;
            if (input.target) {
              const textMatch = matchElement(input.target, elements, input.hints);
              if (textMatch.status === 'matched') {
                textMatchElementId = textMatch.element.elementId;
              }
            }

            const screenshotBase64 = input.captureImage
              ? ((await browser.screenshotElement(best.element.elementId)) ?? undefined)
              : undefined;
            const payload = buildCapturedTargetPayload(best.element, {
              screenshotBase64,
              includeAnchor: input.includeAnchor,
            });

            return {
              status: best.validation.isMatch ? ('repaired' as const) : ('review' as const),
              best: {
                confidence: best.validation.confidence,
                reasons: best.validation.reasons,
                matchedTargetDescription: textMatchElementId === best.element.elementId,
                element: best.element,
                payload,
                suggestedVariables: payload.suggestedVariables,
              },
              candidates: ranked.slice(0, 5).map((entry) => ({
                confidence: entry.validation.confidence,
                reasons: entry.validation.reasons,
                elementId: entry.element.elementId,
                role: entry.element.role,
                name: entry.element.name,
                text: entry.element.text,
                domPath: entry.element.domPath,
              })),
            };
          } finally {
            await browser.close();
          }
        })();

        if (repairResult.status === 'not-found' || !('best' in repairResult)) {
          return repairResult;
        }

        const patchResult = await patchStepTarget(
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
          {
            fileId: input.fileId,
            nodeUid: input.nodeUid,
            attributeName: input.attributeName,
            value: (repairResult.best.payload.uiObject ?? repairResult.best.payload) as Record<
              string,
              unknown
            >,
            variables: repairResult.best.payload.suggestedVariables as
              | Array<Record<string, unknown>>
              | undefined,
            hasErrors: input.hasErrors,
            normalizeContent: (content) =>
              normalizeBotJson(client, content).then((result) => result.botJson),
          },
        );

        return {
          status: repairResult.status,
          repair: repairResult,
          patch: patchResult,
        };
      },
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
