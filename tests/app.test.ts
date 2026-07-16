import { createApp } from "../src/app.js";
import type { Agent } from "../src/agents/Agent.js";
import type { AgentResponse, FinalResponse } from "../src/domain.js";

function createAgent(department: "finance" | "hr", answer: string): Agent & { calls: string[] } {
  return {
    department,
    calls: [],
    async answer(question: string): Promise<AgentResponse> {
      this.calls.push(question);
      return {
        answer,
        factsUsed: [],
        assumptions: [],
        confidence: "high",
        department
      };
    }
  };
}

describe("application service", () => {
  it("unknown route does not call agents or orchestrator", async () => {
    const financeAgent = createAgent("finance", "finance");
    const hrAgent = createAgent("hr", "hr");
    let orchestratorCalls = 0;
    const app = createApp({
      financeAgent,
      hrAgent,
      orchestrator: {
        async combineDepartmentResponses(): Promise<FinalResponse> {
          orchestratorCalls += 1;
          throw new Error("Should not be called");
        }
      }
    });

    const response = await app.answerQuestion("What is the weather tomorrow?");

    expect(response.department).toBe("unknown");
    expect(financeAgent.calls).toEqual([]);
    expect(hrAgent.calls).toEqual([]);
    expect(orchestratorCalls).toBe(0);
  });

  it("finance route calls only Finance Agent with the question", async () => {
    const financeAgent = createAgent("finance", "finance");
    const hrAgent = createAgent("hr", "hr");
    const app = createApp({
      financeAgent,
      hrAgent,
      orchestrator: {
        async combineDepartmentResponses(): Promise<FinalResponse> {
          throw new Error("Should not be called");
        }
      }
    });

    await app.answerQuestion("What is our cash balance?");

    expect(financeAgent.calls).toEqual(["What is our cash balance?"]);
    expect(hrAgent.calls).toEqual([]);
  });

  it("HR route calls only HR Agent with the question", async () => {
    const financeAgent = createAgent("finance", "finance");
    const hrAgent = createAgent("hr", "hr");
    const app = createApp({
      financeAgent,
      hrAgent,
      orchestrator: {
        async combineDepartmentResponses(): Promise<FinalResponse> {
          throw new Error("Should not be called");
        }
      }
    });

    await app.answerQuestion("How many open roles do we have?");

    expect(financeAgent.calls).toEqual([]);
    expect(hrAgent.calls).toEqual(["How many open roles do we have?"]);
  });

  it("both route calls both agents and the orchestrator with validated responses", async () => {
    const financeAgent = createAgent("finance", "finance");
    const hrAgent = createAgent("hr", "hr");
    const orchestratorInputs: AgentResponse[] = [];
    const app = createApp({
      financeAgent,
      hrAgent,
      orchestrator: {
        async combineDepartmentResponses(_question, financeResponse, hrResponse): Promise<FinalResponse> {
          orchestratorInputs.push(financeResponse, hrResponse);
          return {
            answer: "combined",
            factsUsed: [],
            assumptions: [],
            confidence: "medium",
            department: "both"
          };
        }
      }
    });

    const response = await app.answerQuestion("Should we hire more people?");

    expect(response.department).toBe("both");
    expect(financeAgent.calls).toEqual(["Should we hire more people?"]);
    expect(hrAgent.calls).toEqual(["Should we hire more people?"]);
    expect(orchestratorInputs.map((input) => input.department)).toEqual(["finance", "hr"]);
  });
});
