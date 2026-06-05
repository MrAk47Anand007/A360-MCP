import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const swaggerFiles = [
  'swagger-export/swagger/api/v2/auth-api-supported.yaml',
  'swagger-export/swagger/api/v2/repository-management-api.yaml',
  'swagger-export/swagger/api/v3/deploy-api-supported.yaml',
  'swagger-export/swagger/api/v3/bot-execution-orchestrator-api-supported.yaml',
  'swagger-export/swagger/api/v2/packages-api-supported.yaml',
];

function extractBasePath(text) {
  const match = text.match(/\nservers:\n(?:\s*-\s*url:\s*([^\n]+))/);
  return match?.[1]?.trim() ?? '';
}

function collectEndpoints(text, source) {
  const endpoints = [];
  const basePath = extractBasePath(text);
  let currentPath = '';

  for (const line of text.split(/\r?\n/)) {
    const pathMatch = line.match(/^  (\/[^:]+):$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }

    const methodMatch = line.match(/^    (get|post|put|patch|delete):$/i);
    if (methodMatch && currentPath) {
      endpoints.push({
        method: methodMatch[1].toUpperCase(),
        path: `${basePath}${currentPath}`.replace(/\/{2,}/g, '/'),
        source,
      });
    }
  }

  return endpoints;
}

const endpoints = [];
for (const file of swaggerFiles) {
  const text = await readFile(join(process.cwd(), file), 'utf8');
  endpoints.push(...collectEndpoints(text, file));
}

const output = {
  generatedAt: new Date().toISOString(),
  swaggerFiles,
  endpoints,
};

await mkdir(join(process.cwd(), 'docs'), { recursive: true });
await writeFile(
  join(process.cwd(), 'docs', 'a360-swagger-inventory.json'),
  JSON.stringify(output, null, 2),
  'utf8',
);
