/** Text helpers: normalization, fuzzy matching. */
const IRREGULAR: Record<string, string> = { mice: "mouse", geese: "goose", men: "man", feet: "foot", teeth: "tooth", wolves: "wolf", knives: "knife", leaves: "leaf", calves: "calf", loaves: "loaf", lice: "louse", oxen: "ox" };

export function singular(w: string): string {
  if (IRREGULAR[w]) return IRREGULAR[w]!;
  if (w.length <= 3) return w;
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (/(ches|shes|sses|xes|zes|oes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s") && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

export function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z' \-]/g, " ").replace(/-/g, " ")
    .split(/\s+/).map((t) => t.replace(/^'+|'+$/g, "")).filter(Boolean);
}

export function normWord(w: string): string { return singular(w.toLowerCase().trim()); }
export function normPhrase(p: string): string { return tokenize(p).map(normWord).join(" "); }

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n]!;
}

/** Tolerant match for ASR / spelling slips: same first letter, len>=5, small edit distance. */
export function fuzzyEqual(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5 || a[0] !== b[0]) return false;
  const max = Math.max(a.length, b.length) >= 8 ? 2 : 1;
  return levenshtein(a, b) <= max;
}

export const STOPWORDS = new Set(("a an the and or but so of to in on at for with from by is are was were be been am it its this that these those i you he she we they me my your her his our their " +
  "um uh er hmm oh well let see think like just very really also then there here yes no yeah okay ok sure maybe about up out as if not do did does have has had will would can could " +
  "what who how when where why one some any all more most than too").split(" "));
