import type { FinanceAgentContract, HrAgentContract } from "./agents/Agent.js";
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
  financeAgent: FinanceAgentContract;
  hrAgent: HrAgentContract;
  orchestrator: Pick<Orchestrator, "runDepartmentDiscussion">;
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

  switch (route.route) {
    case "finance":
      return dependencies.financeAgent.answer(trimmed);
    case "hr":
      return dependencies.hrAgent.answer(trimmed);
    case "both":
      return dependencies.orchestrator.runDepartmentDiscussion(trimmed, dependencies.financeAgent, dependencies.hrAgent);
    case "unknown":
      return {
        answer: "I can answer only finance and HR questions using the available mock department data.",
        factsUsed: [],
        assumptions: [],
        confidence: "low",
        department: "unknown"
      };
    default:
      return assertNever(route.route);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled route: ${value}`);
}
