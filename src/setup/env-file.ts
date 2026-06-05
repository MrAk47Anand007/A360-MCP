export function parseEnvContent(content: string) {
  const entries = Object.create(null) as Record<string, string>;
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (match) {
      entries[match[1]] = match[2];
    }
  }
  return entries;
}
