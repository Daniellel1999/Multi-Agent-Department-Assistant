import type { Agent } from "./Agent.js";
import { hrPeerResponsePrompt, hrSystemPrompt } from "./prompts.js";
import type { AgentResponse, PeerContext } from "../domain.js";
import type { HrData } from "../data/hrData.js";
import { getHrFactKeys } from "../data/hrData.js";
import type { LlmClient } from "../llm/LlmClient.js";
import { buildAgentResponse, fallbackAgentResponse } from "../orchestration/groundingValidation.js";
import { safeErrorMessage } from "../utils/errorMessage.js";

export class HrAgent implements Agent {
  readonly department = "hr" as const;

  constructor(
    private readonly llmClient: LlmClient,
    private readonly data: HrData
  ) {}

  async answer(question: string): Promise<AgentResponse> {
    try {
      const modelOutput = await this.llmClient.completeJson({
        messages: [
          { role: "system", content: hrSystemPrompt },
          {
            role: "user",
            content: JSON.stringify({
              question,
              hrData: this.data,
              allowedFactKeys: getHrFactKeys()
            })
          }
        ]
      });

      return (
        buildAgentResponse(modelOutput, this.department, this.data) ??
        fallbackAgentResponse(this.department, "HR Agent response could not be grounded in the available HR data.")
      );
    } catch (error) {
      return fallbackAgentResponse(this.department, `HR Agent could not complete the request. ${safeErrorMessage(error)}`);
    }
  }

  async respondToPeer(question: string, peerContext: PeerContext): Promise<AgentResponse> {
    try {
      const modelOutput = await this.llmClient.completeJson({
        messages: [
          { role: "system", content: hrPeerResponsePrompt },
          {
            role: "user",
            content: JSON.stringify({
              question,
              hrData: this.data,
              allowedFactKeys: getHrFactKeys(),
              peerContext
            })
          }
        ]
      });

      return (
        buildAgentResponse(modelOutput, this.department, this.data) ??
        fallbackAgentResponse(this.department, "HR Agent peer response could not be grounded in the available HR data.")
      );
    } catch (error) {
      return fallbackAgentResponse(
        this.department,
        `HR Agent peer response could not complete the request. ${safeErrorMessage(error)}`
      );
    }
  }
}
