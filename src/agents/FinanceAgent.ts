import type { Agent } from "./Agent.js";
import { financeSystemPrompt } from "./prompts.js";
import type { AgentResponse } from "../domain.js";
import type { FinanceData } from "../data/financeData.js";
import { getFinanceFactKeys } from "../data/financeData.js";
import type { LlmClient } from "../llm/LlmClient.js";
import { buildAgentResponse, fallbackAgentResponse } from "../orchestration/groundingValidation.js";
import { safeErrorMessage } from "../utils/errorMessage.js";

export class FinanceAgent implements Agent {
  readonly department = "finance" as const;

  constructor(
    private readonly llmClient: LlmClient,
    private readonly data: FinanceData
  ) {}

  async answer(question: string): Promise<AgentResponse> {
    try {
      const modelOutput = await this.llmClient.completeJson({
        messages: [
          { role: "system", content: financeSystemPrompt },
          {
            role: "user",
            content: JSON.stringify({
              question,
              financeData: this.data,
              allowedFactKeys: getFinanceFactKeys()
            })
          }
        ]
      });

      return (
        buildAgentResponse(modelOutput, this.department, this.data) ??
        fallbackAgentResponse(
          this.department,
          "Finance Agent response could not be grounded in the available finance data."
        )
      );
    } catch (error) {
      return fallbackAgentResponse(
        this.department,
        `Finance Agent could not complete the request. ${safeErrorMessage(error)}`
      );
    }
  }
}
