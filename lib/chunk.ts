export function chunkText(text: string, size = 800, overlap = 100): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    const slice = words.slice(i, i + size).join(" ");
    chunks.push(slice);
    i += size - overlap;
  }
  return chunks;
}
