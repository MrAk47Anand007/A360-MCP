# A360 MCP

`a360-mcp` is a package-first MCP server for Automation Anywhere A360 Control Room.

It follows the same CLI shape as the nearby UiPath MCP package:

- `init`
- `doctor`
- `login`
- `whoami`
- `serve`
- `logout`

## API source of truth

This repo is grounded in the exported Control Room swagger YAML captured from the live swagger page:

- `swagger-export/swagger/api/v2/auth-api-supported.yaml`
- `swagger-export/swagger/api/v2/repository-management-api.yaml`
- `swagger-export/swagger/api/v3/deploy-api-supported.yaml`
- `swagger-export/swagger/api/v3/bot-execution-orchestrator-api-supported.yaml`
- `swagger-export/swagger/api/v2/packages-api-supported.yaml`

## Initial supported MCP surface

- Control Room login
- folder listing
- bot content reads
- dependency reads and updates
- automation deploy
- activity list and execution lookups

## Quickstart

```bash
npm install
npm run extract:swagger
npm run login
npm run doctor
npm run serve
```

## Local config

By default the package stores config under the current user's config directory. You can override the config file path with `A360_CONFIG_PATH`.
