import type { Brain } from "./types.js";
import { mockBrain } from "./mock.js";
export * from "./types.js";
/** Provider switch. Only "mock" ships. A real LLM provider would implement Brain and be added here. */
export function getBrain(): Brain {
  const p = process.env.LLM_PROVIDER ?? "mock";
  if (p !== "mock") console.warn(`LLM_PROVIDER=${p} is not available in this build; using mock.`);
  return mockBrain;
}
