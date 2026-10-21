/**
 * The "Alexa brain" seam. The simulator asks a Brain what to say and which MCP tools to call.
 * The mock provider below is scripted and deterministic. A real LLM provider can implement the same
 * interface later (receive toolsFromList, return say + toolCalls). No paid API is used.
 */
export interface BrainState {
  participantId: string;
  mode: "idle" | "checkin" | "visit_offer";
  session?: { sessionId: string; slot: string };
  /** words currently being held for the participant (never shown on screen) */
  hiddenWords?: string[];
  pendingFeedback?: string;
}
export type BrainEvent =
  | { type: "user"; text: string }
  | { type: "toolResult"; name: string; args?: Record<string, any>; result: { structuredContent?: any; isError?: boolean; text?: string } };
export interface ToolCall { name: string; arguments: Record<string, unknown> }
export interface BrainRequest { state?: BrainState; event: BrainEvent; toolsFromList?: { name: string; description?: string }[]; history?: unknown[] }
export interface BrainResponse { state: BrainState; /** spoken line */ say?: string; /** what the screen ribbon shows (hides the three words) */ display?: string; toolCalls: ToolCall[]; provider: string }
export interface Brain { name: string; step(req: BrainRequest): Promise<BrainResponse> }
