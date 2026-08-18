import Groq from "groq-sdk";

const apiKey = process.env.GROQ_API_KEY as string;
const modelName = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

if (!apiKey || apiKey === "your-groq-api-key-here") {
  console.warn(
    "[groq] GROQ_API_KEY is not set — /search will fail until you add a free-tier key from https://console.groq.com/keys"
  );
}

const groq = new Groq({ apiKey });

export const SYSTEM_INSTRUCTION =
  "You are the search assistant for TalentFlow, an ATS (applicant tracking system). " +
  "Translate the user's natural-language request into tool calls, chaining multiple " +
  "tools when a query requires it (e.g. resolve a job title to a jobId before searching " +
  "interviews for that job). Once you have enough information, respond with a short, " +
  "plain-language summary of what you found. " +
  "IMPORTANT: The full result set is always already rendered as a table/grid/list right below your " +
  "reply, so never enumerate every record by name in your summary — that's redundant and unreadable " +
  "for anything more than a couple of results. Instead say how many you found and the key pattern " +
  "(e.g. 'Found 12 open jobs across Engineering, Design, and Data' or '113 skills across 4 " +
  "categories: Technical, Human, Management, Domain'), and call out anything genuinely notable " +
  "(e.g. a candidate who stands out). One or two sentences is enough. " +
  "IMPORTANT: Never mention function names, tool names, or internal API details in your response. " +
  "If a search returns no results, say so in plain terms (e.g. 'No matching records found'). " +
  "Respond in plain text only — no markdown, no asterisks, no bullet symbols, no bold formatting. " +
  "Do not invent data that didn't come from a tool. " +
  "For any create/update/schedule action, call the tool right away using only whatever details the " +
  "request already gives you — do not stop to ask the user clarifying questions to fill in gaps first " +
  "(e.g. missing department, title, or other fields). The user reviews an editable, pre-filled form " +
  "before anything is written, so leaving fields out is fine; only ask a clarifying question when the " +
  "request is ambiguous about which existing record it refers to (e.g. two candidates share a name).";

// ---------------------------------------------------------------
// Shared chat-message shape used throughout the agent (orchestrator.ts,
// tools.ts) — matches Groq's (OpenAI-compatible) chat completion shape
// directly, so no conversion is needed at this boundary.
// ---------------------------------------------------------------
export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ChatCompletionResult {
  choices: [{ message: ChatMessage }];
}

export async function createCompletion(
  messages: ChatMessage[],
  toolDefinitions: any[]
): Promise<ChatCompletionResult> {
  if (!apiKey) {
    throw new Error("No Groq API key configured — set GROQ_API_KEY in backend/.env");
  }

  const tools: Groq.Chat.ChatCompletionTool[] = toolDefinitions.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parametersJsonSchema,
    },
  }));

  const response = await groq.chat.completions.create({
    model: modelName,
    messages: messages as Groq.Chat.ChatCompletionMessageParam[],
    ...(tools.length ? { tools, tool_choice: "auto" } : {}),
  });

  return { choices: [{ message: response.choices[0].message as ChatMessage }] };
}
