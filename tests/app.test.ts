import { createApp } from "../src/app.js";
import type { Agent } from "../src/agents/Agent.js";
import type { AgentResponse, FinalResponse } from "../src/domain.js";

function createAgent(
  department: "finance" | "hr",
  answer: string
): Agent & { calls: string[]; peerCalls: string[] } {
  return {
    department,
    calls: [],
    peerCalls: [],
    async answer(question: string): Promise<AgentResponse> {
      this.calls.push(question);
      return {
        answer,
        factsUsed: [],
        assumptions: [],
        confidence: "high",
        department
      };
    },
    async respondToPeer(question: string): Promise<AgentResponse> {
      this.peerCalls.push(question);
      return {
        answer: `${answer} peer`,
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
        async runDepartmentDiscussion(): Promise<FinalResponse> {
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
        async runDepartmentDiscussion(): Promise<FinalResponse> {
          throw new Error("Should not be called");
        }
      }
    });

    await app.answerQuestion("What is our cash balance?");

    expect(financeAgent.calls).toEqual(["What is our cash balance?"]);
    expect(hrAgent.calls).toEqual([]);
    expect(financeAgent.peerCalls).toEqual([]);
    expect(hrAgent.peerCalls).toEqual([]);
  });

  it("HR route calls only HR Agent with the question", async () => {
    const financeAgent = createAgent("finance", "finance");
    const hrAgent = createAgent("hr", "hr");
    const app = createApp({
      financeAgent,
      hrAgent,
      orchestrator: {
        async runDepartmentDiscussion(): Promise<FinalResponse> {
          throw new Error("Should not be called");
        }
      }
    });

    await app.answerQuestion("How many open roles do we have?");

    expect(financeAgent.calls).toEqual([]);
    expect(hrAgent.calls).toEqual(["How many open roles do we have?"]);
    expect(financeAgent.peerCalls).toEqual([]);
    expect(hrAgent.peerCalls).toEqual([]);
  });

  it("both route delegates to the bounded discussion coordinator", async () => {
    const financeAgent = createAgent("finance", "finance");
    const hrAgent = createAgent("hr", "hr");
    let coordinatorQuestion = "";
    let coordinatorFinanceAgent: Agent | undefined;
    let coordinatorHrAgent: Agent | undefined;
    const app = createApp({
      financeAgent,
      hrAgent,
      orchestrator: {
        async runDepartmentDiscussion(question, receivedFinanceAgent, receivedHrAgent): Promise<FinalResponse> {
          coordinatorQuestion = question;
          coordinatorFinanceAgent = receivedFinanceAgent;
          coordinatorHrAgent = receivedHrAgent;
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
    expect(coordinatorQuestion).toBe("Should we hire more people?");
    expect(coordinatorFinanceAgent).toBe(financeAgent);
    expect(coordinatorHrAgent).toBe(hrAgent);
    expect(financeAgent.calls).toEqual([]);
    expect(hrAgent.calls).toEqual([]);
  });
});
