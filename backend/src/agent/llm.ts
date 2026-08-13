import Groq from "groq-sdk";

const apiKey = process.env.GROQ_API_KEY as string;
const modelName = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

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
  "IMPORTANT: Never mention function names, tool names, or internal API details in your response. " +
  "If a search returns no results, say so in plain terms (e.g. 'No matching records found'). " +
  "Respond in plain text only — no markdown, no asterisks, no bullet symbols, no bold formatting. " +
  "Do not invent data that didn't come from a tool.";

export async function createCompletion(
  messages: Groq.Chat.ChatCompletionMessageParam[],
  toolDefinitions: any[]
): Promise<Groq.Chat.ChatCompletion> {
  const tools: Groq.Chat.ChatCompletionTool[] = toolDefinitions.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parametersJsonSchema,
    },
  }));

  return groq.chat.completions.create({
    model: modelName,
    messages,
    tools,
    tool_choice: "auto",
  });
}
