# A360 MCP Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-grade Automation Anywhere A360 MCP server from scratch that combines live Control Room APIs, your existing dataset workflows, exported swagger specs, and AI-assisted bot construction into one natural-language automation surface.

**Architecture:** Keep a thin, well-tested TypeScript MCP core inside `A360-MCP`, grounded in exported swagger and live tenant validation. Reuse the proven logic from `a360_dataset`, `A360_BotKit`, and `UiPath-to-A360-Migration` as workflow engines for bulk updates, migration, import/export, and AI-assisted bot JSON generation. Avoid raw LLM-to-final-JSON generation; instead use AI for intent/planning and your existing builder logic plus live package metadata for valid A360 payload generation.

**Tech Stack:** TypeScript, Node.js 20+, MCP SDK, zod, Vitest, live A360 Control Room APIs, exported swagger YAML, local migration/dataset scripts, optional LLM integration for planning and structured intent generation

---

### Task 1: Stabilize the MCP runtime and current live-tested tool slice

**Files:**
- Modify: `src/index.ts`
- Modify: `src/cli.ts`
- Modify: `src/server.ts`
- Modify: `src/config.ts`
- Modify: `src/setup/config-file.ts`
- Test: `tests/cli.test.ts`
- Test: `tests/config.test.ts`
- Test: `tests/server.test.ts`

- [ ] **Step 1: Keep the package CLI surface fixed**

The package must keep this CLI contract:

```text
init
doctor
login
whoami
serve
logout
```

- [ ] **Step 2: Keep persisted auth/config loading as the MCP runtime entrypoint**

The server bootstrap must continue to:

- load saved config
- load saved access token
- fail cleanly if no token exists
- build the live API dependency graph from config before `serve`

- [ ] **Step 3: Re-run the current baseline verification**

Run:

```bash
npm run extract:swagger
npm test
npm run check
```

Expected:

- swagger inventory is regenerated
- all tests pass
- typecheck passes

### Task 2: Expand the repository and bot lifecycle toolset

**Files:**
- Modify: `src/a360/repository.ts`
- Modify: `src/tools/repository.ts`
- Modify: `src/server.ts`
- Test: `tests/repository.test.ts`

- [ ] **Step 1: Keep the live-tested repository primitives**

These methods and tools should remain stable because they are already proven against the tenant:

```text
listFolderItems
listFolderChildren
getFileContent
updateFileContent
getFileDependencies
updateFileDependencies
createBot
deleteFile
```

- [ ] **Step 2: Add the next repository helpers from swagger**

Add client methods and MCP tools for:

```text
GET  /v2/repository/files/{fileid}/parents
POST /v2/repository/workspaces/{workspaceType}/files/list
POST /v2/repository/file/list
```

Tool candidates:

- `a360_get_file_parents`
- `a360_list_workspace_files`
- `a360_search_repository_items`

- [ ] **Step 3: Validate the new helpers live**

For each new helper:

- run one live smoke call against the tenant
- keep outputs summarized in the thread
- do not mutate content unless explicitly needed

### Task 3: Productize import, export, and migration workflows from the dataset

**Files:**
- Create: `src/workflows/export.ts`
- Create: `src/workflows/import.ts`
- Create: `src/workflows/migration.ts`
- Create: `src/tools/workflows.ts`
- Modify: `src/tools/index.ts`
- Modify: `src/server.ts`
- Test: `tests/workflows.test.ts`

- [ ] **Step 1: Port bot export workflow**

Use the logic pattern from:

- `a360_dataset/A360MigrationSRtoDST.py`

Tool candidates:

- `a360_export_bots`
- `a360_export_assets`

Expected behavior:

- recursively scan folders
- download content
- optionally save local JSON backups
- return export summary

- [ ] **Step 2: Port bot import workflow**

Use the logic pattern from:

- `a360_dataset/A360BulkImporter.py`

Tool candidates:

- `a360_import_bots`
- `a360_import_assets`

Expected behavior:

- create bot/asset shell
- upload content
- update dependencies when required
- return per-file success/failure

- [ ] **Step 3: Port cross-Control-Room migration workflow**

Use the logic pattern from:

- `a360_dataset/A360MigrationSRtoDST.py`
- `a360_dataset/A360MigrationSRtoDSTWithAll.py`

Tool candidates:

- `a360_migrate_bots_between_control_rooms`
- `a360_migrate_assets_between_control_rooms`

Expected behavior:

- source auth
- destination auth
- recursive discovery
- create destination shell
- push content
- save summary and failures

### Task 4: Build package governance tools from the bulk package updater

**Files:**
- Create: `src/workflows/package-governance.ts`
- Modify: `src/tools/workflows.ts`
- Test: `tests/package-governance.test.ts`

- [ ] **Step 1: Port package scan logic**

Use the logic pattern from:

- `a360_dataset/PythonScripts__a360_bulk_package_version_update.py`

Tool candidates:

- `a360_scan_package_usage`
- `a360_summarize_package_versions`

Expected outputs:

- package names
- versions in use
- count of bots per version
- bot ids/names/paths using each package

- [ ] **Step 2: Add update plan generation**

Tool candidate:

- `a360_plan_package_version_update`

Expected behavior:

- take `folderId`
- take target package versions
- compare current vs target
- produce a dry-run plan

- [ ] **Step 3: Add bulk apply flow**

Tool candidate:

- `a360_apply_package_version_update`

Expected behavior:

- update `packages[]` in bot JSON
- save content
- save dependencies
- support `dryRun`
- support `bulk` or `selectedBots`

- [ ] **Step 4: Validate one real package-governance scenario**

Scenario:

- scan a folder with many bots
- identify one package needing version normalization
- dry-run the update plan
- apply only if explicitly approved

### Task 5: Build bulk transformation tools for bot-wide fixes

**Files:**
- Create: `src/workflows/transformations.ts`
- Modify: `src/tools/workflows.ts`
- Test: `tests/transformations.test.ts`

- [ ] **Step 1: Port Log To File numbering and log message fix logic**

Use the logic pattern from:

- `A360_BotKit/.../background/control_room.js`

Especially:

- line counting
- log message update flow
- save sequencing

Tool candidates:

- `a360_scan_logtofile_issues`
- `a360_plan_logtofile_fix`
- `a360_apply_logtofile_fix`

- [ ] **Step 2: Design bulk-safe execution flow**

Each bulk transform tool should support:

- `folderId`
- `recursive`
- `selectedBotIds`
- `dryRun`

Output should include:

- bots scanned
- bots changed
- skipped bots
- failed bots

- [ ] **Step 3: Add future transformation slots**

Keep this workflow module open for future bulk changes like:

- retry wrapper insertion
- logging scaffolding
- comment insertion
- package normalization
- dependency cleanup

### Task 6: Implement the full silent-save/editor-compatible path

**Files:**
- Create: `src/workflows/silent-save.ts`
- Modify: `src/a360/repository.ts`
- Modify: `src/tools/repository.ts`
- Test: `tests/silent-save.test.ts`

- [ ] **Step 1: Port editor-style save behavior**

Use the logic pattern from:

- `A360_BotKit/.../background/control_room.js`

Required save sequence:

```text
PUT /v2/repository/files/{fileId}/content?hasErrors=false|true
Content-Type: application/vnd.aa.taskbot

PUT /v2/repository/files/{fileId}/dependencies
```

- [ ] **Step 2: Expose a dedicated MCP tool**

Tool candidate:

- `a360_silent_save_bot`

Expected behavior:

- accept final content payload
- accept dependency payload or child ids
- perform save sequence
- return save summary

- [ ] **Step 3: Validate against a disposable live bot**

Use a temporary bot:

- create it
- save content using silent path
- save dependencies
- read back results
- delete temp bot

### Task 7: Build package intelligence as the grounding layer for AI workflows

**Files:**
- Create: `src/workflows/package-intelligence.ts`
- Modify: `src/tools/workflows.ts`
- Test: `tests/package-intelligence.test.ts`

- [ ] **Step 1: Expose package metadata queries**

Use:

- package list/version APIs
- package detail/metainfo APIs

Tool candidates:

- `a360_list_available_packages`
- `a360_get_package_versions`
- `a360_get_package_command_schema`
- `a360_resolve_package_metadata`

- [ ] **Step 2: Build normalized command metadata objects**

The output should be reusable by later AI tools:

- package name
- package version
- command names
- command labels
- attributes
- required fields
- return shapes

- [ ] **Step 3: Cache or memoize package lookups**

Do not re-fetch the same package metadata repeatedly during one request when building bot JSON plans.

### Task 8: Convert the UiPath-to-A360-Migration project into a generic A360 JSON builder backend

**Files:**
- Create: `src/workflows/builder.ts`
- Create: `src/workflows/plan-model.ts`
- Test: `tests/builder.test.ts`

- [ ] **Step 1: Define an intermediate workflow plan format**

Create a plan model like:

```ts
type PlannedBot = {
  botName: string;
  goal: string;
  variables: Array<Record<string, unknown>>;
  steps: Array<Record<string, unknown>>;
  packages: Array<Record<string, unknown>>;
};
```

- [ ] **Step 2: Reuse the migration project as the backend compiler**

Mine logic from:

- `UiPath-to-A360-Migration__main.py`
- `UiPath-to-A360-Migration/main.py`
- mapping/context helpers in that project

The builder should:

- consume structured steps
- resolve package/command metadata
- assemble valid node JSON
- output final A360 bot JSON

- [ ] **Step 3: Keep AI out of final raw schema generation**

AI may help with:

- intent extraction
- choosing commands
- sequencing actions

But final JSON assembly must be performed by:

- builder logic
- package metadata
- templates
- validators

### Task 9: Build AI-assisted bot generation as a layered workflow

**Files:**
- Create: `src/workflows/ai-bot-generation.ts`
- Modify: `src/tools/workflows.ts`
- Test: `tests/ai-bot-generation.test.ts`

- [ ] **Step 1: Add an intent/planning tool**

Tool candidate:

- `a360_plan_bot_from_prompt`

Input:

- natural language request
- optional bot name
- optional folder id
- optional preferred packages

Output:

- structured workflow plan
- required packages
- missing data
- confidence notes

- [ ] **Step 2: Add a grounded JSON build tool**

Tool candidate:

- `a360_build_bot_json_from_prompt`

Expected flow:

```text
prompt -> structured plan -> package metadata -> builder backend -> bot JSON
```

- [ ] **Step 3: Add final creation tool**

Tool candidate:

- `a360_create_bot_from_prompt`

Expected behavior:

- create bot shell
- generate JSON
- save content
- save dependencies
- return created bot id and summary

- [ ] **Step 4: Add preview-first safety**

All AI-driven creation must support:

- `dryRun`
- preview of planned steps
- preview of selected packages
- preview of final JSON summary

### Task 10: Build validation and repair tools around generated or edited bots

**Files:**
- Create: `src/workflows/validation.ts`
- Modify: `src/tools/workflows.ts`
- Test: `tests/validation.test.ts`

- [ ] **Step 1: Validate generated bot JSON**

Tool candidates:

- `a360_validate_bot_json`
- `a360_preview_bot_json`

Checks:

- valid package versions
- valid commands
- required fields present
- dependencies structurally consistent
- content can be saved

- [ ] **Step 2: Add repair/fix tool**

Tool candidate:

- `a360_fix_bot_json`

Expected behavior:

- auto-fix small structural issues
- report unresolved issues clearly

### Task 11: Group tools into user-facing MCP capability areas

**Files:**
- Modify: `src/tools/index.ts`
- Modify: `README.md`

- [ ] **Step 1: Keep clear capability groups**

Recommended groups:

- repository
- operations
- workflows
- package intelligence
- AI bot generation
- validation

- [ ] **Step 2: Keep tool naming natural**

Prefer names like:

- `a360_export_bots`
- `a360_plan_package_version_update`
- `a360_apply_logtofile_fix`
- `a360_create_bot_from_prompt`

over low-level internal names.

### Task 12: Document the whole system clearly

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Create: `docs/capabilities.md`

- [ ] **Step 1: Document current stable tools**

Include:

- login/auth
- repository tools
- activity tools
- create/update/delete bot flows

- [ ] **Step 2: Document advanced workflows**

Include:

- export/import
- migration
- package governance
- bulk transforms
- AI-assisted generation

- [ ] **Step 3: Add natural-language examples**

Examples should include:

- “Update package X to version Y across this folder”
- “Export all bots from this folder”
- “Fix all Log To File numbering issues”
- “Create a bot that reads Excel rows and sends email reminders”

### Task 13: Phase execution order

**Files:**
- Modify: `docs/superpowers/plans/2026-06-05-a360-mcp-master-plan.md`

- [ ] **Step 1: Execute in this order**

Recommended build order:

```text
Phase 1  - stable MCP core and live-tested repository/activity tools
Phase 2  - import/export/migration workflows
Phase 3  - package governance and bulk transforms
Phase 4  - silent-save/editor-compatible flow
Phase 5  - package intelligence layer
Phase 6  - generic builder backend from migration project
Phase 7  - AI-assisted bot generation and validation
```

- [ ] **Step 2: Keep “preview first, apply second” for all bulk/AI tools**

Anything destructive or wide-scope must support:

- dry-run
- plan output
- explicit apply step

### Task 14: Final verification standard

**Files:**
- Test: all `tests/*.test.ts`

- [ ] **Step 1: Run the full verification suite**

Run:

```bash
npm run extract:swagger
npm test
npm run check
```

- [ ] **Step 2: Run live smoke validation by capability**

At minimum:

- one read flow
- one activity flow
- one create/update/delete flow
- one content+dependency save flow
- one bulk dry-run workflow

- [ ] **Step 3: Keep production safety**

Before any broad folder mutation:

- preview the plan
- target a test folder when possible
- use disposable bots for mutation validation
