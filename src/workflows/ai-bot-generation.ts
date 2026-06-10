import { buildBotFromPlan } from './builder.js';
import type { A360Request } from '../a360/client.js';
import type { NormalizedPackageMetadata } from './package-intelligence.js';
import type { PlannedBot } from './plan-model.js';
import { resolvePackageMetadataForWorkflow } from './package-intelligence.js';
import { groundPromptToPlan } from './planner-grounding.js';
import { saveBotBundle } from './repository-save.js';

type PromptPlanningInput = {
  prompt: string;
  botName?: string;
  folderId?: string;
  preferredPackages?: string[];
  wrapInTry?: boolean;
};

type PromptPlanningResult = {
  plan: PlannedBot;
  requiredPackages: string[];
  missingData: string[];
  unsupportedInstructions: string[];
  confidence: {
    score: number;
    reasoning: string[];
  };
  grounding: {
    candidatePackages: Array<{
      name: string;
      label: string;
      version?: string;
      score: number;
      matchedTags: string[];
    }>;
    commandContext: Array<{
      packageName: string;
      packageVersion: string;
      commandName: string;
      commandType: 'command' | 'iterator' | 'conditional' | 'trigger' | 'exception';
      semanticTags: string[];
      requiredFields: string[];
    }>;
  };
};

type BuildBotFromPromptResult = {
  buildable: boolean;
  plan: PlannedBot;
  missingData: string[];
  unsupportedInstructions: string[];
  confidence: PromptPlanningResult['confidence'];
  grounding: PromptPlanningResult['grounding'];
  packageMetadataSummary: Array<{
    packageName: string;
    packageVersion: string;
    commandCount: number;
  }>;
  botJsonSummary?: {
    nodeCount: number;
    variableCount: number;
    packageCount: number;
  };
  botJson?: Record<string, unknown>;
};

type CreateBotFromPromptInput = PromptPlanningInput & {
  description?: string;
  dryRun?: boolean;
};

function normalizePrompt(prompt: string) {
  return prompt.replace(/\s+/g, ' ').trim();
}

function slugifyBotName(name: string) {
  return name
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function splitInstructions(prompt: string) {
  return prompt
    .split(/[\n.]+| then | and then /i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function inferBotName(prompt: string) {
  const compact = normalizePrompt(prompt);
  if (!compact) {
    return 'GeneratedA360Bot';
  }

  return slugifyBotName(compact.slice(0, 60)) || 'GeneratedA360Bot';
}

export async function planBotFromPrompt(
  request: A360Request,
  input: PromptPlanningInput,
): Promise<PromptPlanningResult> {
  const normalizedPrompt = normalizePrompt(input.prompt);
  const botName = input.botName?.trim() || inferBotName(normalizedPrompt);
  const instructions = splitInstructions(normalizedPrompt);
  const grounded = await groundPromptToPlan(request, {
    prompt: normalizedPrompt,
    preferredPackages: input.preferredPackages,
  });

  const plan: PlannedBot = {
    botName,
    goal: normalizedPrompt,
    variables: grounded.variables,
    steps:
      input.wrapInTry === false
        ? grounded.steps
        : [
            {
              packageName: 'ErrorHandler',
              commandName: 'try',
              children: grounded.steps,
            },
          ],
    packages: grounded.packages,
  };

  if (input.wrapInTry !== false && !plan.packages.some((pkg) => pkg.name.toLowerCase() === 'errorhandler')) {
    plan.packages = [{ name: 'ErrorHandler', settingsAttributes: [] }, ...plan.packages];
  }

  const missingData: string[] = [];
  if (
    plan.packages.some((pkg) => pkg.name.toLowerCase() === 'logtofile') &&
    !plan.variables.some((variable) => variable.name === 'logFilePath')
  ) {
    missingData.push('Missing input variable for LogToFile file path.');
  }

  const recognizedCount = instructions.length - grounded.unsupportedInstructions.length;
  const score = instructions.length === 0 ? 0.2 : recognizedCount / instructions.length;
  const reasoning = [
    `${recognizedCount} of ${instructions.length || 1} prompt instructions mapped to grounded package-command candidates.`,
    ...grounded.reasoning,
  ];

  return {
    plan,
    requiredPackages: plan.packages.map((pkg) => pkg.name),
    missingData,
    unsupportedInstructions: grounded.unsupportedInstructions,
    confidence: {
      score: Number(score.toFixed(2)),
      reasoning,
    },
    grounding: {
      candidatePackages: grounded.candidatePackages,
      commandContext: grounded.commandContext,
    },
  };
}

export async function buildBotJsonFromPrompt(
  request: A360Request,
  input: PromptPlanningInput,
): Promise<BuildBotFromPromptResult> {
  const planning = await planBotFromPrompt(request, input);
  const metadataResolution = await resolvePackageMetadataForWorkflow(
    request,
    planning.plan.packages.map((pkg) => ({ name: pkg.name, version: pkg.version })),
  );

  const metadata = metadataResolution.packages as NormalizedPackageMetadata[];
  const unresolvedPackages = planning.plan.packages
    .map((pkg) => pkg.name)
    .filter(
      (pkgName) =>
        !metadata.some((resolved) => resolved.packageName.toLowerCase() === pkgName.toLowerCase()),
    );

  const missingData = [...planning.missingData];
  if (unresolvedPackages.length > 0) {
    missingData.push(`Unresolved packages: ${unresolvedPackages.join(', ')}`);
  }

  const buildable = unresolvedPackages.length === 0;
  if (!buildable) {
    return {
      buildable,
      plan: planning.plan,
      missingData,
      unsupportedInstructions: planning.unsupportedInstructions,
      confidence: planning.confidence,
      grounding: planning.grounding,
      packageMetadataSummary: metadata.map((item) => ({
        packageName: item.packageName,
        packageVersion: item.packageVersion,
        commandCount: item.commandCount,
      })),
    };
  }

  const botJson = buildBotFromPlan(planning.plan, metadata) as unknown as Record<string, unknown>;
  const builtPackages = Array.isArray(botJson.packages) ? botJson.packages : [];
  const builtVariables = Array.isArray(botJson.variables) ? botJson.variables : [];
  const builtNodes = Array.isArray(botJson.nodes) ? botJson.nodes : [];

  return {
    buildable,
    plan: planning.plan,
    missingData,
    unsupportedInstructions: planning.unsupportedInstructions,
    confidence: planning.confidence,
    grounding: planning.grounding,
    packageMetadataSummary: metadata.map((item) => ({
      packageName: item.packageName,
      packageVersion: item.packageVersion,
      commandCount: item.commandCount,
    })),
    botJsonSummary: {
      nodeCount: builtNodes.length,
      variableCount: builtVariables.length,
      packageCount: builtPackages.length,
    },
    botJson,
  };
}

export async function createBotFromPrompt(
  request: A360Request,
  repositoryApi: {
    createBot: (parentFolderId: string, name: string, description?: string) => Promise<unknown>;
    updateFileContent: (
      fileId: string,
      content: Record<string, unknown>,
      hasErrors?: boolean,
    ) => Promise<unknown>;
    updateFileDependencies: (fileId: string, childFileIds: string[]) => Promise<unknown>;
  },
  input: CreateBotFromPromptInput,
  defaults?: {
    defaultFolderId?: string;
  },
) {
  const build = await buildBotJsonFromPrompt(request, input);
  const targetFolderId = input.folderId ?? defaults?.defaultFolderId;

  if (input.dryRun || !build.buildable || !targetFolderId) {
    return {
      dryRun: input.dryRun ?? false,
      buildable: build.buildable,
      targetFolderId: targetFolderId ?? null,
      preview: build,
      missingData: targetFolderId
        ? build.missingData
        : [...build.missingData, 'Missing target folder id for creation.'],
    };
  }

  const created = (await repositoryApi.createBot(
    targetFolderId,
    input.botName?.trim() || build.plan.botName,
    input.description ?? build.plan.goal,
  )) as Record<string, unknown>;
  const fileId = String(created.id ?? '');
  const saveResult = await saveBotBundle(repositoryApi, {
    fileId,
    content: (build.botJson ?? {}) as Record<string, unknown>,
    dependencies: [],
    hasErrors: false,
  });

  return {
    dryRun: false,
    buildable: true,
    createdBot: {
      id: fileId,
      name: created.name ?? input.botName?.trim() ?? build.plan.botName,
      path: created.path ?? null,
    },
    summary: build.botJsonSummary,
    saveSummary: {
      childFileIds: saveResult.childFileIds,
    },
    plan: build.plan,
    grounding: build.grounding,
  };
}
