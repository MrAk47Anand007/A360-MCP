# Control Room Editor Findings

Date: 2026-06-10

Source:
- Live Chrome DevTools MCP session against `https://community.cloud.automationanywhere.digital/#/bots/repository/private/files/task/13547705/edit`
- Frontend bundle: `aaenterprise.e7ea581995073a4535fd.js`
- Source map: `aaenterprise.e7ea581995073a4535fd.js.map`

## What We Confirmed

The Control Room editor ships a source-mapped webpack app under `webpack://cr-frontend/...`. That gives us the original React source for editor behavior, save flows, and repository API calls.

Important page facts:
- Webpack namespace: `window.webpackChunkcr_frontend`
- App version: `window.version === "40.0.0"`
- Editor page module root: `src/components/pages/repositories/TaskbotEditPage`

## Main Editor Modules

The most important editor files for bot building are:

- `src/components/pages/repositories/TaskbotEditPage/TaskbotEditPage.jsx`
- `src/components/pages/repositories/TaskbotEditPage/TaskbotEditorLoader.jsx`
- `src/components/pages/repositories/TaskbotEditPage/taskbotContent.ts`
- `src/components/pages/repositories/TaskbotEditPage/processContent/v1Content.js`
- `src/components/pages/repositories/TaskbotEditPage/processContent/v2Content.js`
- `src/store/api/repositories.js`
- `src/store/sagas/repositories.js`

## Save Pipeline

The editor save path is:

1. `TaskbotEditPage.handleSave()`
2. `TaskbotEditPage.handleCheckUnsaved()`
3. `TaskbotEditPage.handleSubmit()`
4. `TaskbotEditPage.getContent(values)`
5. `getTaskbotContent(...)`
6. `actions.repositoriesUpdateFile(...)`
7. `store/sagas/repositories.js -> updateFile(action)`
8. `store/api/repositories.js -> updateFileContent(...)`
9. `store/api/repositories.js -> updateFileDependencies(...)`

Key lines discovered:
- `TaskbotEditPage.handleSubmit()` builds `{content, dependencies, hasErrors}` with `this.getContent(values)`
- `taskbotContent.ts` is the main normalization layer that turns editor state into persisted bot JSON
- `repositories.js` saves content with `PUT /v2/repository/files/{fileId}/content`
- `repositories.js` saves dependencies with `PUT /v2/repository/files/{fileId}/dependencies`

## Persisted Content Shape

`TaskbotEditPage` defaults and `taskbotContent.ts` confirm the persisted model is built from:

- `triggers`
- `nodes`
- `orphans`
- `swimlanes`
- `swimlaneStacking`
- `variables`
- `packages`
- `packageSettings`
- `dependencies`
- `workItemTemplateName`
- `properties`

For task bots, the saved `properties` include:
- `botCodeVersion`
- `improvedNumberSupport`
- `timeout`
- `automationPriority`
- `runInChildWindow`
- `runInChildWindowMode`

For processes, the saved `properties` include:
- `processCodeVersion`

## Process Version Handling

The process editor has a very important compatibility path:

- The in-memory editor can work with v2-style process content
- During save, saga `updateFile(action)` checks `file.type`
- If the file is a process and `processCodeVersion === "0"`, it calls `getProcessV1Content(v2Content)`
- Only after that conversion does the frontend call `updateFileContent(...)`

That means Control Room still preserves a real frontend compatibility transformer from modern editor state into legacy process JSON.

This is useful for our MCP because we should not generate process JSON blindly when we can model a deterministic transformation pipeline.

## Task/Process Content Builders

`taskbotContent.ts` contains the core deterministic builder:

- `getTaskbotContent(...)`
- `getProcessContent()`
- `getTaskContent()`
- `processNodes(...)`
- `processVariables(...)`
- `processPackages(...)`

Important behavior:
- Package lists are derived from `usedPackageSet`
- Package settings are re-hydrated from package metadata
- Layout numbers are normalized before save
- Process save mode changes package version behavior based on `processCodeVersion`
- Task bot save includes `workItemTemplateName`

## Repository APIs Confirmed

From `src/store/api/repositories.js`:

- `GET /v2/repository/files/{fileId}/content`
- `PUT /v2/repository/files/{fileId}/content`
- `GET /v2/repository/files/{fileId}/dependencies`
- `PUT /v2/repository/files/{fileId}/dependencies`
- `POST /v3/repository/files/{fileId}/packagesVersionUpdate`

Meaning:
- Content and dependencies are separate persistence operations
- Package version refresh is its own API path

## Why This Matters For A360-MCP

These findings support the MCP roadmap in a concrete way:

- We can mirror Control Room's content shape instead of inventing our own
- We can separate `content build` from `dependency resolution`
- We can add deterministic package inference before JSON generation
- We can build a task-bot JSON generator first, then add process conversion rules
- We can eventually validate our generated JSON against the same repository save contract Control Room uses

## Recommended Next Work

1. Add a local research script that extracts named `cr-frontend` source-map files into `docs/research/control-room-src/`
2. Encode the confirmed save content shape into a formal TypeScript schema in `A360-MCP`
3. Compare our existing `createBot` output with `taskbotContent.ts` normalization rules
4. Use the separate dependency save behavior to design MCP tools like:
   - build bot json
   - resolve package dependencies
   - save bot content
   - sync dependency graph
5. Inspect package/resource picker modules next to understand command attribute serialization more deeply
