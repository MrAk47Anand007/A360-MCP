import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_SOURCE_MAP_PATH =
  'C:/Users/Anand/AppData/Local/Temp/aaenterprise.js.map';

const DEFAULT_OUTPUT_DIR = 'docs/research/control-room-src';

const TARGET_SOURCES = [
  'webpack://cr-frontend/./src/components/pages/repositories/TaskbotEditPage/TaskbotEditPage.jsx',
  'webpack://cr-frontend/./src/components/pages/repositories/TaskbotEditPage/TaskbotEditorLoader.jsx',
  'webpack://cr-frontend/./src/components/pages/repositories/TaskbotEditPage/taskbotContent.ts',
  'webpack://cr-frontend/./src/components/pages/repositories/TaskbotEditPage/processContent/v1Content.js',
  'webpack://cr-frontend/./src/components/pages/repositories/TaskbotEditPage/processContent/v2Content.js',
  'webpack://cr-frontend/./src/store/api/repositories.js',
  'webpack://cr-frontend/./src/store/actions/repositories.js',
  'webpack://cr-frontend/./src/store/sagas/repositories.js',
  'webpack://cr-frontend/./src/components/editor/TaskbotEditor/TaskbotEditor.jsx',
  'webpack://cr-frontend/./src/components/editor/TaskbotCanvasList/TaskbotCanvasList.jsx',
  'webpack://cr-frontend/./src/components/editor/TaskbotCanvasFlow/TaskbotCanvasFlow.jsx',
];

function parseArgs(argv) {
  const result = {
    map: DEFAULT_SOURCE_MAP_PATH,
    out: DEFAULT_OUTPUT_DIR,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--map' && argv[index + 1]) {
      result.map = argv[index + 1];
      index += 1;
    } else if (arg === '--out' && argv[index + 1]) {
      result.out = argv[index + 1];
      index += 1;
    }
  }

  return result;
}

function toOutputRelativePath(sourcePath) {
  return sourcePath
    .replace(/^webpack:\/\/cr-frontend\/\.\//, 'cr-frontend/')
    .replace(/^webpack:\/\//, '')
    .replace(/\?\w+$/, '');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourceMapPath = path.resolve(options.map);
  const outputDir = path.resolve(options.out);
  const sourceMap = JSON.parse(await fs.readFile(sourceMapPath, 'utf8'));

  if (!Array.isArray(sourceMap.sources) || !Array.isArray(sourceMap.sourcesContent)) {
    throw new Error('Source map does not contain aligned sources and sourcesContent arrays.');
  }

  await fs.mkdir(outputDir, { recursive: true });

  const extractedFiles = [];
  for (const targetSource of TARGET_SOURCES) {
    const index = sourceMap.sources.indexOf(targetSource);
    if (index < 0) {
      throw new Error(`Target source not found in source map: ${targetSource}`);
    }

    const content = sourceMap.sourcesContent[index];
    if (typeof content !== 'string') {
      throw new Error(`No sourcesContent found for target source: ${targetSource}`);
    }

    const relativePath = toOutputRelativePath(targetSource);
    const outputPath = path.join(outputDir, relativePath);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, content, 'utf8');

    extractedFiles.push({
      source: targetSource,
      output: path.relative(process.cwd(), outputPath).replace(/\\/g, '/'),
      bytes: Buffer.byteLength(content, 'utf8'),
    });
  }

  const manifest = {
    extractedAt: new Date().toISOString(),
    sourceMapPath,
    outputDir,
    targetCount: TARGET_SOURCES.length,
    extractedFiles,
  };

  await fs.writeFile(
    path.join(outputDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        outputDir,
        extractedCount: extractedFiles.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
