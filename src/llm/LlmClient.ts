export interface LlmMessage {
  role: "system" | "user";
  content: string;
}

export interface LlmJsonRequest {
  messages: LlmMessage[];
}

export interface LlmClient {
  completeJson(request: LlmJsonRequest): Promise<unknown>;
}
