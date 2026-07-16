import OpenAI from "openai";
import type { LlmClient, LlmJsonRequest } from "./LlmClient.js";

export class OpenAiLlmClient implements LlmClient {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey = process.env.OPENAI_API_KEY, model = process.env.OPENAI_MODEL ?? "gpt-4o-mini") {
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required unless AI_ASSESSMENT_MOCK_LLM=true.");
    }

    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async completeJson(request: LlmJsonRequest): Promise<unknown> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: request.messages,
      response_format: { type: "json_object" },
      temperature: 0.1
    });

    const content = completion.choices[0]?.message.content;
    if (!content) {
      throw new Error("OpenAI returned an empty response.");
    }

    return JSON.parse(content);
  }
}
