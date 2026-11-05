const TURKISH_CHARACTERS: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u",
};

export function normalizeAddress(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşü]/g, (character) => TURKISH_CHARACTERS[character] ?? character)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizedIncludes(address: string, search: string): boolean {
  const normalizedSearch = normalizeAddress(search);
  return normalizedSearch.length > 0 && normalizeAddress(address).includes(normalizedSearch);
}
