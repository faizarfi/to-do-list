export function toUpperCaseText(text: string): string {
  return text.toUpperCase();
}

export function toLowerCaseText(text: string): string {
  return text.toLowerCase();
}

export function toTitleCaseText(text: string): string {
  return text.replace(/\S+/g, (word) => {
    const first = word.charAt(0).toUpperCase();
    const rest = word.slice(1).toLowerCase();
    return `${first}${rest}`;
  });
}

export function removeExtraSpaces(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n");
}

export function removeEmptyLines(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

export function removeDuplicateLines(text: string, caseSensitive: boolean = true): string {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const key = caseSensitive ? line : line.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      kept.push(line);
    }
  }
  return kept.join("\n");
}

export function sortTextLines(text: string, direction: "asc" | "desc" = "asc"): string {
  const lines = text.split(/\r?\n/);
  lines.sort((a, b) =>
    direction === "asc"
      ? a.localeCompare(b, "id-ID")
      : b.localeCompare(a, "id-ID")
  );
  return lines.join("\n");
}

export interface TextStatistics {
  characters: number;
  charactersNoSpaces: number;
  words: number;
  lines: number;
}

export function computeTextStats(text: string): TextStatistics {
  if (!text) {
    return { characters: 0, charactersNoSpaces: 0, words: 0, lines: 0 };
  }
  const trimmedWords = text.trim();
  const words = trimmedWords ? trimmedWords.split(/\s+/).length : 0;
  return {
    characters: text.length,
    charactersNoSpaces: text.replace(/\s/g, "").length,
    words,
    lines: text.split(/\r?\n/).length,
  };
}

