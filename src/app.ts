import type { Agent } from "./agents/Agent.js";
import { FinanceAgent } from "./agents/FinanceAgent.js";
import { HrAgent } from "./agents/HrAgent.js";
import { financeData } from "./data/financeData.js";
import { hrData } from "./data/hrData.js";
import type { FinalResponse } from "./domain.js";
import type { LlmClient } from "./llm/LlmClient.js";
import { OpenAiLlmClient } from "./llm/OpenAiLlmClient.js";
import { Orchestrator } from "./orchestration/orchestrator.js";
import { routeQuestion } from "./routing/router.js";

export interface AppDependencies {
  financeAgent: Agent;
  hrAgent: Agent;
  orchestrator: Pick<Orchestrator, "combineDepartmentResponses">;
}

export function createApp(dependencies: AppDependencies) {
  return {
    answerQuestion: (question: string) => answerQuestion(question, dependencies)
  };
}

export function createDefaultApp(llmClient: LlmClient = new OpenAiLlmClient()) {
  const financeAgent = new FinanceAgent(llmClient, financeData);
  const hrAgent = new HrAgent(llmClient, hrData);
  const orchestrator = new Orchestrator(llmClient);

  return createApp({ financeAgent, hrAgent, orchestrator });
}

export async function answerQuestion(question: string, dependencies: AppDependencies): Promise<FinalResponse> {
  const trimmed = question.trim();
  if (!trimmed) {
    return {
      answer: "Please provide a finance or HR question.",
      factsUsed: [],
      assumptions: [],
      confidence: "low",
      department: "unknown"
    };
  }

  const route = routeQuestion(trimmed);

  if (route.route === "finance") {
    return dependencies.financeAgent.answer(trimmed);
  }

  if (route.route === "hr") {
    return dependencies.hrAgent.answer(trimmed);
  }

  if (route.route === "both") {
    const [financeResponse, hrResponse] = await Promise.all([
      dependencies.financeAgent.answer(trimmed),
      dependencies.hrAgent.answer(trimmed)
    ]);

    return dependencies.orchestrator.combineDepartmentResponses(trimmed, financeResponse, hrResponse);
  }

  return {
    answer: "I can answer only finance and HR questions using the available mock department data.",
    factsUsed: [],
    assumptions: [],
    confidence: "low",
    department: "unknown"
  };
}
