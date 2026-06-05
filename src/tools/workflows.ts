import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

type WorkflowDeps = {
  workflowApi: {
    planBotFromPrompt: (input: {
      prompt: string;
      botName?: string;
      folderId?: string;
      preferredPackages?: string[];
      wrapInTry?: boolean;
    }) => Promise<unknown>;
    buildBotJsonFromPrompt: (input: {
      prompt: string;
      botName?: string;
      folderId?: string;
      preferredPackages?: string[];
      wrapInTry?: boolean;
    }) => Promise<unknown>;
    createBotFromPrompt: (input: {
      prompt: string;
      botName?: string;
      folderId?: string;
      preferredPackages?: string[];
      wrapInTry?: boolean;
      description?: string;
      dryRun?: boolean;
    }) => Promise<unknown>;
    validateBotJson: (botJson: Record<string, unknown>) => Promise<unknown>;
    previewBotJson: (botJson: Record<string, unknown>) => Promise<unknown>;
    fixBotJson: (botJson: Record<string, unknown>) => Promise<unknown>;
    listAvailablePackages: (options?: {
      filterRequest?: {
        fields?: string[];
        filter?: Record<string, unknown> | null;
        sort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
        page?: { offset: number; length: number };
      };
      includeDownloadUrls?: boolean;
      search?: string;
    }) => Promise<unknown>;
    getPackageVersions: (packageName: string) => Promise<unknown>;
    getPackageCommandSchema: (input: {
      packageName: string;
      packageVersion?: string;
      commandName: string;
    }) => Promise<unknown>;
    resolvePackageMetadata: (
      packages: Array<{ name: string; version?: string }>,
    ) => Promise<unknown>;
    exportBots: (folderId: string, recursive?: boolean) => Promise<unknown>;
    exportAssets: (folderId: string, recursive?: boolean) => Promise<unknown>;
    scanPackageUsage: (folderId: string, recursive?: boolean) => Promise<unknown>;
    planPackageVersionUpdate: (
      folderId: string,
      targets: Record<string, string>,
      recursive?: boolean,
    ) => Promise<unknown>;
    applyPackageVersionUpdate: (
      folderId: string,
      targets: Record<string, string>,
      options?: { recursive?: boolean; dryRun?: boolean; selectedBotIds?: string[] },
    ) => Promise<unknown>;
    scanLogToFileIssues: (
      folderId: string,
      recursive?: boolean,
      logStructure?: string,
    ) => Promise<unknown>;
    applyLogToFileFix: (
      folderId: string,
      recursive?: boolean,
      logStructure?: string,
      dryRun?: boolean,
    ) => Promise<unknown>;
    silentSaveBot: (input: {
      fileId: string;
      content: Record<string, unknown>;
      dependencies: string[] | Record<string, unknown>;
      hasErrors?: boolean;
    }) => Promise<unknown>;
  };
};

export function registerWorkflowTools(server: McpServer, deps: WorkflowDeps) {
  server.registerTool(
    'a360_validate_bot_json',
    {
      description: 'Validate generated or edited A360 bot JSON against resolved package metadata and basic structural rules.',
      inputSchema: z.object({
        botJson: z.record(z.string(), z.unknown()),
      }),
    },
    async ({ botJson }) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(await deps.workflowApi.validateBotJson(botJson), null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    'a360_preview_bot_json',
    {
      description: 'Preview an A360 bot JSON payload with package, variable, command, and validation summary.',
      inputSchema: z.object({
        botJson: z.record(z.string(), z.unknown()),
      }),
    },
    async ({ botJson }) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(await deps.workflowApi.previewBotJson(botJson), null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    'a360_fix_bot_json',
    {
      description: 'Apply small automatic structural fixes to A360 bot JSON and return unresolved validation issues.',
      inputSchema: z.object({
        botJson: z.record(z.string(), z.unknown()),
      }),
    },
    async ({ botJson }) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(await deps.workflowApi.fixBotJson(botJson), null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    'a360_plan_bot_from_prompt',
    {
      description: 'Turn a natural language automation request into a structured A360 workflow plan.',
      inputSchema: z.object({
        prompt: z.string().min(1),
        botName: z.string().optional(),
        folderId: z.string().optional(),
        preferredPackages: z.array(z.string()).optional(),
        wrapInTry: z.boolean().optional(),
      }),
    },
    async ({ prompt, botName, folderId, preferredPackages, wrapInTry }) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            await deps.workflowApi.planBotFromPrompt({
              prompt,
              botName,
              folderId,
              preferredPackages,
              wrapInTry,
            }),
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.registerTool(
    'a360_build_bot_json_from_prompt',
    {
      description: 'Build grounded A360 bot JSON from a natural language prompt using the package metadata and builder backend.',
      inputSchema: z.object({
        prompt: z.string().min(1),
        botName: z.string().optional(),
        folderId: z.string().optional(),
        preferredPackages: z.array(z.string()).optional(),
        wrapInTry: z.boolean().optional(),
      }),
    },
    async ({ prompt, botName, folderId, preferredPackages, wrapInTry }) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            await deps.workflowApi.buildBotJsonFromPrompt({
              prompt,
              botName,
              folderId,
              preferredPackages,
              wrapInTry,
            }),
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.registerTool(
    'a360_create_bot_from_prompt',
    {
      description: 'Preview or create an A360 bot from a natural language prompt using the grounded builder flow.',
      inputSchema: z.object({
        prompt: z.string().min(1),
        botName: z.string().optional(),
        folderId: z.string().optional(),
        preferredPackages: z.array(z.string()).optional(),
        wrapInTry: z.boolean().optional(),
        description: z.string().optional(),
        dryRun: z.boolean().optional(),
      }),
    },
    async ({ prompt, botName, folderId, preferredPackages, wrapInTry, description, dryRun }) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            await deps.workflowApi.createBotFromPrompt({
              prompt,
              botName,
              folderId,
              preferredPackages,
              wrapInTry,
              description,
              dryRun,
            }),
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.registerTool(
    'a360_list_available_packages',
    {
      description: 'List available A360 packages and visible versions from Control Room package APIs.',
      inputSchema: z.object({
        search: z.string().optional(),
        includeDownloadUrls: z.boolean().optional(),
        filterRequest: z
          .object({
            fields: z.array(z.string()).optional(),
            filter: z.record(z.string(), z.unknown()).nullable().optional(),
            sort: z
              .array(
                z.object({
                  field: z.string(),
                  direction: z.enum(['asc', 'desc']),
                }),
              )
              .optional(),
            page: z
              .object({
                offset: z.number().int().min(0),
                length: z.number().int().positive().max(1000),
              })
              .optional(),
          })
          .optional(),
      }),
    },
    async ({ search, includeDownloadUrls, filterRequest }) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            await deps.workflowApi.listAvailablePackages({
              search,
              includeDownloadUrls,
              filterRequest,
            }),
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.registerTool(
    'a360_get_package_versions',
    {
      description: 'Get the visible versions and Control Room usage payload for a package.',
      inputSchema: z.object({
        packageName: z.string().min(1),
      }),
    },
    async ({ packageName }) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(await deps.workflowApi.getPackageVersions(packageName), null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    'a360_get_package_command_schema',
    {
      description: 'Resolve normalized command schema metadata for one package command.',
      inputSchema: z.object({
        packageName: z.string().min(1),
        packageVersion: z.string().optional(),
        commandName: z.string().min(1),
      }),
    },
    async ({ packageName, packageVersion, commandName }) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            await deps.workflowApi.getPackageCommandSchema({
              packageName,
              packageVersion,
              commandName,
            }),
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.registerTool(
    'a360_resolve_package_metadata',
    {
      description: 'Resolve normalized package, command, iterator, and conditional metadata for selected packages.',
      inputSchema: z.object({
        packages: z
          .array(
            z.object({
              name: z.string().min(1),
              version: z.string().optional(),
            }),
          )
          .min(1),
      }),
    },
    async ({ packages }) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(await deps.workflowApi.resolvePackageMetadata(packages), null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    'a360_export_bots',
    {
      description: 'Export all taskbots from a folder scope as JSON payloads.',
      inputSchema: z.object({
        folderId: z.string().min(1),
        recursive: z.boolean().optional(),
      }),
    },
    async ({ folderId, recursive }) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(await deps.workflowApi.exportBots(folderId, recursive), null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    'a360_export_assets',
    {
      description: 'Export bots, forms, and workflows from a folder scope as JSON payloads.',
      inputSchema: z.object({
        folderId: z.string().min(1),
        recursive: z.boolean().optional(),
      }),
    },
    async ({ folderId, recursive }) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(await deps.workflowApi.exportAssets(folderId, recursive), null, 2),
        },
      ],
    }),
  );

  server.registerTool(
    'a360_scan_package_usage',
    {
      description: 'Scan package usage and versions across bots in a folder scope.',
      inputSchema: z.object({
        folderId: z.string().min(1),
        recursive: z.boolean().optional(),
      }),
    },
    async ({ folderId, recursive }) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            await deps.workflowApi.scanPackageUsage(folderId, recursive),
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.registerTool(
    'a360_plan_package_version_update',
    {
      description: 'Build a dry-run plan for updating package versions across bots in a folder scope.',
      inputSchema: z.object({
        folderId: z.string().min(1),
        targets: z.record(z.string(), z.string()),
        recursive: z.boolean().optional(),
      }),
    },
    async ({ folderId, targets, recursive }) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            await deps.workflowApi.planPackageVersionUpdate(folderId, targets, recursive),
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.registerTool(
    'a360_apply_package_version_update',
    {
      description: 'Apply a package version update plan across bots in a folder scope.',
      inputSchema: z.object({
        folderId: z.string().min(1),
        targets: z.record(z.string(), z.string()),
        recursive: z.boolean().optional(),
        dryRun: z.boolean().optional(),
        selectedBotIds: z.array(z.string()).optional(),
      }),
    },
    async ({ folderId, targets, recursive, dryRun, selectedBotIds }) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            await deps.workflowApi.applyPackageVersionUpdate(folderId, targets, {
              recursive,
              dryRun,
              selectedBotIds,
            }),
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.registerTool(
    'a360_scan_logtofile_issues',
    {
      description: 'Scan bots for Log To File numbering issues in a folder scope.',
      inputSchema: z.object({
        folderId: z.string().min(1),
        recursive: z.boolean().optional(),
        logStructure: z.string().optional(),
      }),
    },
    async ({ folderId, recursive, logStructure }) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            await deps.workflowApi.scanLogToFileIssues(folderId, recursive, logStructure),
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.registerTool(
    'a360_apply_logtofile_fix',
    {
      description: 'Apply Log To File numbering fixes across bots in a folder scope.',
      inputSchema: z.object({
        folderId: z.string().min(1),
        recursive: z.boolean().optional(),
        logStructure: z.string().optional(),
        dryRun: z.boolean().optional(),
      }),
    },
    async ({ folderId, recursive, logStructure, dryRun }) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            await deps.workflowApi.applyLogToFileFix(
              folderId,
              recursive,
              logStructure,
              dryRun,
            ),
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.registerTool(
    'a360_silent_save_bot',
    {
      description: 'Save A360 bot content and dependencies using the editor-compatible silent save path.',
      inputSchema: z.object({
        fileId: z.string().min(1),
        content: z.record(z.string(), z.unknown()),
        dependencies: z.union([z.array(z.string()), z.record(z.string(), z.unknown())]),
        hasErrors: z.boolean().optional(),
      }),
    },
    async ({ fileId, content, dependencies, hasErrors }) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            await deps.workflowApi.silentSaveBot({
              fileId,
              content,
              dependencies,
              hasErrors,
            }),
            null,
            2,
          ),
        },
      ],
    }),
  );
}
