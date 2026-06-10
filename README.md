# A360 MCP

`a360-mcp` is a package-first MCP server for Automation Anywhere A360 Control Room.

It keeps the clean npm/CLI shape from the nearby UiPath MCP project, but adapts it for A360 Control Room auth, repository operations, package intelligence, bulk workflows, and grounded AI-assisted bot building.

## CLI

The package exposes the same primary CLI shape:

- `init`
- `doctor`
- `login`
- `whoami`
- `serve`
- `logout`

## What This Repo Is For

This repo is designed to turn three things into one usable MCP:

- live A360 Control Room APIs
- your existing A360 operational workflows
- natural-language driven bot planning and JSON generation

The important design choice is:

- AI can help plan intent, choose packages, and sequence actions
- final A360 JSON should be built by code, package metadata, templates, and validators
- the MCP should expose both low-level APIs and high-value operational workflows

## API Source Of Truth

This repo is grounded in exported Control Room swagger and live endpoint validation.

Primary exported specs:

- `swagger-export/swagger/api/v2/auth-api-supported.yaml`
- `swagger-export/swagger/api/v2/repository-management-api.yaml`
- `swagger-export/swagger/api/v3/deploy-api-supported.yaml`
- `swagger-export/swagger/api/v3/bot-execution-orchestrator-api-supported.yaml`
- `swagger-export/swagger/api/v2/packages-api-supported.yaml`

Supporting generated inventory:

- `docs/a360-swagger-inventory.json`
- `docs/control-room-editor-findings.md`
- `docs/research/control-room-src/manifest.json`

Additional implementation references were mined from:

- `../a360_dataset`
- `../UiPath-to-A360-Migration`

## Quickstart

```bash
npm install
npm run extract:swagger
npm run extract:editor-sources
npm run login
npm run doctor
npm run serve
```

## Configuration

Environment variables commonly used:

```env
A360_BASE_URL=https://your-control-room-url
A360_AUTH_MODE=password
A360_USERNAME=your-user
A360_PASSWORD=your-password
A360_DEFAULT_FOLDER_ID=123456
```

Token mode is also supported:

```env
A360_BASE_URL=https://your-control-room-url
A360_AUTH_MODE=token
A360_ACCESS_TOKEN=your-token
A360_DEFAULT_FOLDER_ID=123456
```

By default the package stores config under the current user's config directory. You can override the config path with `A360_CONFIG_PATH`.

## Capability Areas

The MCP is organized into clear capability groups.

### Repository

Low-level bot and repository operations:

- `a360_create_bot`
- `a360_list_folder_items`
- `a360_list_child_folders`
- `a360_get_bot_content`
- `a360_update_bot_content`
- `a360_get_bot_dependencies`
- `a360_update_bot_dependencies`
- `a360_save_bot_bundle`

### Operations

Execution and deployment surfaces:

- `a360_deploy_automation`
- `a360_list_activity`
- `a360_list_recent_activity`
- `a360_get_execution_details`

### Package Intelligence

Grounding layer for AI and package governance:

- `a360_list_available_packages`
- `a360_get_package_versions`
- `a360_get_package_command_schema`
- `a360_resolve_package_metadata`

### Workflows

Bulk and folder-scoped operational tools:

- `a360_export_bots`
- `a360_export_assets`
- `a360_scan_package_usage`
- `a360_plan_package_version_update`
- `a360_apply_package_version_update`
- `a360_scan_logtofile_issues`
- `a360_apply_logtofile_fix`
- `a360_silent_save_bot`

### AI Bot Generation

Prompt -> plan -> package metadata -> builder -> optional create:

- `a360_plan_bot_from_prompt`
- `a360_build_bot_json_from_prompt`
- `a360_create_bot_from_prompt`

### Validation

Preview, validate, and repair generated or edited bot JSON:

- `a360_validate_bot_json`
- `a360_preview_bot_json`
- `a360_normalize_bot_json`
- `a360_fix_bot_json`

### Live UI capture tools

These tools build recorder steps from real Chrome state instead of guessed payloads.
They connect to your Chrome over the DevTools Protocol. Start Chrome with:

    chrome.exe --remote-debugging-port=9222 --user-data-dir=%TEMP%\a360-capture-profile

or set `A360_MCP_CHROME_ENDPOINT` to an existing DevTools URL.

| Tool | Purpose |
| --- | --- |
| `a360_record_web_actions` | Execute structured steps (navigate/click/type/select) live in Chrome; capture each target into canonical `UIOBJECT`/`IMAGE` payloads plus ready recorder nodes. Halts with ranked candidates on ambiguity. |
| `a360_capture_ui_target` | Capture one element (no action) into canonical payload pieces. |
| `a360_insert_recorder_step` | Insert captured recorder node(s) into an existing bot and save via the normalized bundle flow. |
| `a360_patch_step_target` | Replace a node attribute's target payload with a captured one and save. |

The MCP client decomposes a natural-language prompt into structured steps; the
server matches each target description deterministically against the page's
elements — no AI guessing inside the server. Recorder command identity
(`packageName`/`commandName`/attribute names) defaults to `Recorder`/`Capture`
and is overridable per call; verify against `a360_get_package_command_schema`.

## Current Tool Count

Current MCP tool count: `31`

## Build Flow For AI-Driven Bots

The intended layered flow is:

```text
natural language prompt
-> intent extraction
-> package and command grounding
-> structured workflow plan
-> deterministic builder backend
-> validation / preview
-> optional create + save to Control Room
```

This avoids asking an LLM to invent raw A360 bot JSON directly.

The current planner now borrows the same major stages we already proved in the local `UiPath-to-A360-Migration` project:

- package resolver style package ranking from live Control Room metadata
- command/value context synthesis from normalized package commands and attributes
- variable inference based on selected grounded commands
- deterministic bot assembly through the TypeScript builder backend

## Live-Tested Areas

The following surfaces have been validated live against a real Control Room tenant:

- login and token persistence
- folder listing
- bot content reads
- dependency reads
- activity listing and execution detail lookup
- create bot
- update bot content
- update bot dependencies
- delete disposable bot
- package list and package detail metadata lookup
- prompt-driven dry-run build preview
- bot JSON preview, validation, and structural fix flow

One known role-based limitation found during live testing:

- package usage lookup can return `403` on `/v2/packages/{name}/versions/usage` depending on the tenant role

The package intelligence layer handles that gracefully and still resolves list/detail metadata.

## Validation And Safety

The repo now supports preview-first behavior for higher-risk flows:

- `dryRun` support for prompt-driven create flow
- package-grounded JSON building
- structural validation before save/create
- automatic repair of small structural issues

Recommended pattern for AI-driven workflows:

1. `a360_plan_bot_from_prompt`
2. `a360_build_bot_json_from_prompt`
3. `a360_preview_bot_json`
4. `a360_validate_bot_json`
5. `a360_create_bot_from_prompt`

## Development

Useful commands:

```bash
npm test
npm run check
npm run build
npm run extract:swagger
npm run extract:editor-sources
```

## Status

This repo is no longer just a scaffold. It now has:

- working auth and repository primitives
- working package intelligence
- deterministic A360 JSON builder backend
- prompt-driven planning/build/create flow
- validation and repair tools

Next expected work is deeper planner coverage, richer command templates, and broader Control Room workflow support.
