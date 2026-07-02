import * as vscode from 'vscode';

/**
 * Calls Groq Chat Completion API using the configured key and model,
 * with fallback to the user's provided key.
 */
export async function callGroqChatCompletion(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const config = vscode.workspace.getConfiguration('contextOptimizer');
  let apiKey = config.get<string>('groqApiKey')?.trim();

  if (!apiKey) {
    throw new Error('Groq API Key is not configured. Please set your Groq API Key (contextOptimizer.groqApiKey) in VS Code Settings.');
  }

  const model = config.get<string>('groqModel') || 'llama-3.1-8b-instant';

  // Access native fetch or throw
  const fetchFn = (globalThis as any).fetch;
  if (!fetchFn) {
    throw new Error('Native fetch API is not available in the current runtime environment.');
  }

  const response = await fetchFn('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API returned status ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Groq API returned an empty or invalid response.');
  }
  return content.trim();
}
