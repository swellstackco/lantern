/** Keyword classifier for the safety path. Never says the word that starts with "s" and ends with "troke". */
export type ConcernLevel = "emergency" | "concern" | "none";

const EMERGENCY: RegExp[] = [
  /\bdroop/, /\bnumb/, /\bslur/, /\bface\b.*\b(weird|funny|different|crooked|heavy)/,
  /\b(arm|leg|hand)\b.*\b(weak|heavy|won'?t|can'?t|limp|gave out)/, /\b(weak|weakness)\b.*\b(arm|leg|side)/,
  /\b(trouble|hard|can'?t|cannot|difficult)\b.*\b(speak|speaking|talk|talking|get (my )?words)/, /\bspeech\b.*\b(off|weird|slurred|wrong)/,
  /\bsudden(ly)?\b.*\b(confus|dizzy|headache|can'?t see)/, /\bconfus/, /\bdon'?t know where i am/, /\bwhere am i\b/, /\bi'?m lost\b/,
  /\bi fell\b/, /\b(she|he|mom|dad) fell\b/, /\bhad a fall\b/, /\bfallen\b/, /\bcan'?t get up\b/, /\bchest pain/, /\bcan'?t breathe/,
];
const CONCERN: RegExp[] = [/\b(sad|lonely|hopeless|depressed|down in the dumps|tired of everything|worthless)\b/, /\bworried (about|that) my memory\b/, /\bforgot (again|everything)\b/, /\bscared\b/];

export function classify(transcript: string): ConcernLevel {
  const t = transcript.toLowerCase();
  if (EMERGENCY.some((r) => r.test(t))) return "emergency";
  if (CONCERN.some((r) => r.test(t))) return "concern";
  return "none";
}

export const emergencyPhrasing = (careName?: string) =>
  `This could be an emergency. Please call 911 now. ${careName ? `I'm letting ${careName} know.` : "Please tell someone near you."}`;
export const concernPhrasing = () => "I'm sorry you're feeling that way. I'm here. Would you like me to let someone know you could use a call?";
