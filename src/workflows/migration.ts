import { createA360Client } from '../a360/client.js';
import { exportBots } from './export.js';
import { importBots } from './import.js';

export async function migrateBotsBetweenControlRooms(input: {
  sourceBaseUrl: string;
  sourceToken: string;
  sourceFolderId: string;
  destinationBaseUrl: string;
  destinationToken: string;
  destinationFolderId: string;
  recursive?: boolean;
}) {
  const sourceClient = createA360Client(input.sourceBaseUrl, input.sourceToken);
  const destinationClient = createA360Client(
    input.destinationBaseUrl,
    input.destinationToken,
  );

  const exported = await exportBots(
    sourceClient,
    input.sourceFolderId,
    input.recursive ?? true,
  );

  const imported = await importBots(
    destinationClient,
    input.destinationFolderId,
    exported.bots.map((bot) => ({
      name: bot.name,
      content: bot.content,
      dependencies: [],
      description: `Migrated from ${input.sourceBaseUrl}`,
    })),
  );

  return {
    exportedCount: exported.count,
    importedCount: imported.count,
    results: imported.results,
  };
}
