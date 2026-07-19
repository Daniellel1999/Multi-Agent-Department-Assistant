import type { AgentResponse, DiscussionResult } from "../src/domain.js";
import type { Agent } from "../src/agents/Agent.js";
import type { LlmClient, LlmJsonRequest } from "../src/llm/LlmClient.js";
import { Orchestrator } from "../src/orchestration/orchestrator.js";
import { FinanceAgent } from "../src/agents/FinanceAgent.js";
import { HrAgent } from "../src/agents/HrAgent.js";
import { financeData } from "../src/data/financeData.js";
import { hrData } from "../src/data/hrData.js";

class RecordingLlmClient implements LlmClient {
  readonly requests: LlmJsonRequest[] = [];

  constructor(private readonly response: unknown, private readonly shouldThrow = false) {}

  async completeJson(request: LlmJsonRequest): Promise<unknown> {
    this.requests.push(request);
    if (this.shouldThrow) {
      throw new Error("LLM failed");
    }
    return this.response;
  }
}

class DiscussionAwareLlmClient implements LlmClient {
  readonly requests: LlmJsonRequest[] = [];

  async completeJson(request: LlmJsonRequest): Promise<unknown> {
    this.requests.push(request);
    const payload = JSON.parse(request.messages.at(-1)?.content ?? "{}") as Record<string, unknown>;

    if ("financeData" in payload && !("peerContext" in payload)) {
      return {
        answer: "Finance is cautious about hiring and supports only critical roles.",
        factKeys: ["approvedHiringBudget"],
        assumptions: [],
        confidence: "high"
      };
    }

    if ("hrData" in payload && !("peerContext" in payload)) {
      return {
        answer: "HR supports targeted engineering hiring.",
        factKeys: ["engineeringOpenRoles"],
        assumptions: [],
        confidence: "high"
      };
    }

    if ("financeData" in payload && "peerContext" in payload) {
      return {
        answer: "Finance agrees critical engineering roles can be prioritized within the hiring budget.",
        factKeys: ["approvedHiringBudget", "financeNotes"],
        assumptions: [],
        confidence: "medium"
      };
    }

    if ("hrData" in payload && "peerContext" in payload) {
      return {
        answer: "HR narrows its recommendation to critical engineering roles after Finance's budget constraint.",
        factKeys: ["engineeringOpenRoles", "capacityNotes"],
        assumptions: [],
        confidence: "medium"
      };
    }

    if ("discussion" in payload) {
      const discussion = payload.discussion as DiscussionResult;
      return {
        answer: `Yes, but selectively. ${discussion.financePeerResponse?.answer} ${discussion.hrPeerResponse?.answer}`,
        factKeys: ["finance:approvedHiringBudget", "finance:notes", "hr:openRolesByDepartment.engineering", "hr:capacityNotes"],
        assumptions: [],
        confidence: "medium"
      };
    }

    throw new Error("Unexpected request");
  }
}

class FakeAgent implements Agent {
  readonly answerCalls: string[] = [];
  readonly peerCalls: Array<{ question: string; peerDepartment: "finance" | "hr" }> = [];

  constructor(
    readonly department: "finance" | "hr",
    private readonly initialResponse: AgentResponse,
    private readonly peerResponse: AgentResponse,
    private readonly failPeer = false
  ) {}

  async answer(question: string): Promise<AgentResponse> {
    this.answerCalls.push(question);
    return this.initialResponse;
  }

  async respondToPeer(question: string, peerContext: AgentResponse): Promise<AgentResponse> {
    this.peerCalls.push({ question, peerDepartment: peerContext.department });
    if (this.failPeer) {
      throw new Error("peer failed");
    }
    return this.peerResponse;
  }
}

const financeResponse: AgentResponse = {
  answer: "Finance supports critical hiring within approved budget.",
  factsUsed: [
    {
      source: "finance",
      label: "Approved hiring budget",
      value: 240000,
      path: "approvedHiringBudget"
    }
  ],
  assumptions: [],
  confidence: "high",
  department: "finance"
};

const hrResponse: AgentResponse = {
  answer: "HR reports open engineering roles.",
  factsUsed: [
    {
      source: "hr",
      label: "Engineering open roles",
      value: 5,
      path: "openRolesByDepartment.engineering"
    }
  ],
  assumptions: [],
  confidence: "high",
  department: "hr"
};

const financePeerResponse: AgentResponse = {
  answer: "Finance maintains a critical-only hiring stance after HR input.",
  factsUsed: [
    {
      source: "finance",
      label: "Finance notes",
      value: "Finance has approved hiring spend for critical roles only.",
      path: "notes"
    }
  ],
  assumptions: [],
  confidence: "medium",
  department: "finance"
};

const hrPeerResponse: AgentResponse = {
  answer: "HR agrees engineering roles should be prioritized within budget constraints.",
  factsUsed: [
    {
      source: "hr",
      label: "Capacity notes",
      value: "Engineering managers report delivery risk from unfilled backend roles.",
      path: "capacityNotes"
    }
  ],
  assumptions: [],
  confidence: "medium",
  department: "hr"
};

const revisedFinancePeerResponse: AgentResponse = {
  answer: "Finance now recommends delaying non-critical hiring until role-level costs are evaluated.",
  factsUsed: [
    {
      source: "finance",
      label: "Approved hiring budget",
      value: 240000,
      path: "approvedHiringBudget"
    }
  ],
  assumptions: ["Role-level costs are not available."],
  confidence: "medium",
  department: "finance"
};

const revisedHrPeerResponse: AgentResponse = {
  answer: "HR revises its recommendation to delay broad hiring and focus only on the delivery-risk roles.",
  factsUsed: [
    {
      source: "hr",
      label: "Capacity notes",
      value: "Engineering managers report delivery risk from unfilled backend roles.",
      path: "capacityNotes"
    }
  ],
  assumptions: [],
  confidence: "medium",
  department: "hr"
};

const ungroundedFinanceResponse: AgentResponse = {
  answer: "Finance Agent response could not be grounded in the available finance data.",
  factsUsed: [],
  assumptions: ["The model response could not be safely grounded."],
  confidence: "low",
  department: "finance"
};

const ungroundedHrResponse: AgentResponse = {
  answer: "HR Agent response could not be grounded in the available HR data.",
  factsUsed: [],
  assumptions: ["The model response could not be safely grounded."],
  confidence: "low",
  department: "hr"
};

describe("Orchestrator", () => {
  it("successful both flow performs exactly five LLM operations and shares only validated peer contexts", async () => {
    const llm = new DiscussionAwareLlmClient();
    const orchestrator = new Orchestrator(llm);
    const financeAgent = new FinanceAgent(llm, financeData);
    const hrAgent = new HrAgent(llm, hrData);

    const response = await orchestrator.runDepartmentDiscussion(
      "Should we hire more people?",
      financeAgent,
      hrAgent
    );

    expect(response.answer).toContain("critical engineering roles");
    expect(llm.requests).toHaveLength(5);

    const payloads = llm.requests.map((request) => JSON.parse(request.messages.at(-1)?.content ?? "{}"));
    expect(payloads.filter((payload) => "financeData" in payload && !("peerContext" in payload))).toHaveLength(1);
    expect(payloads.filter((payload) => "hrData" in payload && !("peerContext" in payload))).toHaveLength(1);
    expect(payloads.filter((payload) => "financeData" in payload && "peerContext" in payload)).toHaveLength(1);
    expect(payloads.filter((payload) => "hrData" in payload && "peerContext" in payload)).toHaveLength(1);
    expect(payloads.filter((payload) => "discussion" in payload)).toHaveLength(1);

    const financePeerPayload = payloads.find((payload) => "financeData" in payload && "peerContext" in payload);
    const hrPeerPayload = payloads.find((payload) => "hrData" in payload && "peerContext" in payload);
    expect(financePeerPayload.peerContext.department).toBe("hr");
    expect(hrPeerPayload.peerContext.department).toBe("finance");
    expect(JSON.stringify(financePeerPayload)).not.toContain("hrData");
    expect(JSON.stringify(hrPeerPayload)).not.toContain("financeData");
  });

  it("coordinates one bounded discussion round before synthesis", async () => {
    const llm = new RecordingLlmClient({
      answer: "Proceed with critical engineering hiring.",
      factKeys: ["finance:approvedHiringBudget", "hr:openRolesByDepartment.engineering"],
      assumptions: [],
      confidence: "medium"
    });
    const orchestrator = new Orchestrator(llm);
    const financeAgent = new FakeAgent("finance", financeResponse, financePeerResponse);
    const hrAgent = new FakeAgent("hr", hrResponse, hrPeerResponse);

    const response = await orchestrator.runDepartmentDiscussion(
      "Should we hire more people?",
      financeAgent,
      hrAgent
    );

    expect(response.department).toBe("both");
    expect(financeAgent.answerCalls).toEqual(["Should we hire more people?"]);
    expect(hrAgent.answerCalls).toEqual(["Should we hire more people?"]);
    expect(financeAgent.peerCalls).toEqual([{ question: "Should we hire more people?", peerDepartment: "hr" }]);
    expect(hrAgent.peerCalls).toEqual([{ question: "Should we hire more people?", peerDepartment: "finance" }]);
  });

  it("does not build peer context when an initial response has no grounded facts", async () => {
    const llm = new RecordingLlmClient({
      answer: "This should not be called.",
      factKeys: ["hr:openRolesByDepartment.engineering"],
      assumptions: [],
      confidence: "high"
    });
    const orchestrator = new Orchestrator(llm);
    const financeAgent = new FakeAgent("finance", ungroundedFinanceResponse, financePeerResponse);
    const hrAgent = new FakeAgent("hr", hrResponse, hrPeerResponse);

    const response = await orchestrator.runDepartmentDiscussion(
      "Should we hire more people?",
      financeAgent,
      hrAgent
    );

    expect(llm.requests).toEqual([]);
    expect(financeAgent.peerCalls).toEqual([]);
    expect(hrAgent.peerCalls).toEqual([]);
    expect(response.confidence).toBe("low");
    expect(response.answer).toContain("Finance lacked grounded facts");
  });

  it("continues synthesis from initial responses and any valid peer response when one peer call fails", async () => {
    const llm = new RecordingLlmClient({
      answer: "Proceed carefully using the initial Finance and HR positions.",
      factKeys: ["finance:approvedHiringBudget", "hr:openRolesByDepartment.engineering"],
      assumptions: [],
      confidence: "medium"
    });
    const orchestrator = new Orchestrator(llm);
    const financeAgent = new FakeAgent("finance", financeResponse, financePeerResponse, true);
    const hrAgent = new FakeAgent("hr", hrResponse, hrPeerResponse);

    const response = await orchestrator.runDepartmentDiscussion(
      "Should we hire more people?",
      financeAgent,
      hrAgent
    );

    expect(response.answer).toBe("Proceed carefully using the initial Finance and HR positions.");
    expect(response.confidence).toBe("medium");
    expect(financeAgent.peerCalls).toHaveLength(1);
    expect(hrAgent.peerCalls).toHaveLength(1);
    const payload = llm.requests[0]?.messages.at(-1)?.content ?? "";
    expect(payload).not.toContain("financePeerResponse");
    expect(payload).toContain("hrPeerResponse");
  });

  it("combines validated agent responses and includes only selected material facts", async () => {
    const llm = new RecordingLlmClient({
      answer: "Proceed with critical engineering hiring.",
      factKeys: ["finance:approvedHiringBudget", "finance:approvedHiringBudget", "hr:openRolesByDepartment.engineering"],
      assumptions: ["Recommendation is limited to validated responses."],
      confidence: "medium"
    });
    const orchestrator = new Orchestrator(llm);

    const response = await orchestrator.combineDepartmentResponses(
      "Should we hire more people?",
      financeResponse,
      hrResponse
    );

    expect(response.department).toBe("both");
    expect(response.factsUsed).toEqual([...financeResponse.factsUsed, ...hrResponse.factsUsed]);
    expect(response.confidence).toBe("medium");
  });

  it("rejects synthesis with empty fact keys", async () => {
    const orchestrator = new Orchestrator(
      new RecordingLlmClient({
        answer: "Proceed with hiring.",
        factKeys: [],
        assumptions: [],
        confidence: "high"
      })
    );

    const response = await orchestrator.combineDepartmentResponses(
      "Should we hire more people?",
      financeResponse,
      hrResponse
    );

    expect(response.confidence).toBe("low");
    expect(response.answer).toContain("A complete recommendation is not available");
    expect(response.answer).not.toBe("Proceed with hiring.");
  });

  it("rejects synthesis with only unknown fact keys", async () => {
    const orchestrator = new Orchestrator(
      new RecordingLlmClient({
        answer: "Proceed with unsupported facts.",
        factKeys: ["finance:unknown", "hr:unknown"],
        assumptions: [],
        confidence: "high"
      })
    );

    const response = await orchestrator.combineDepartmentResponses(
      "Should we hire more people?",
      financeResponse,
      hrResponse
    );

    expect(response.confidence).toBe("low");
    expect(response.answer).toContain("A complete recommendation is not available");
  });

  it("falls back when synthesis references only one department while both supplied grounded facts", async () => {
    const orchestrator = new Orchestrator(
      new RecordingLlmClient({
        answer: "Proceed based only on finance.",
        factKeys: ["finance:approvedHiringBudget"],
        assumptions: [],
        confidence: "medium"
      })
    );

    const response = await orchestrator.combineDepartmentResponses(
      "Should we hire more people?",
      financeResponse,
      hrResponse
    );

    expect(response.confidence).toBe("low");
    expect(response.answer).toContain("A complete recommendation is not available");
    expect(response.answer).not.toBe("Proceed based only on finance.");
  });

  it("skips synthesis when Finance has no grounded facts and HR does", async () => {
    const llm = new RecordingLlmClient({
      answer: "This should not be called.",
      factKeys: ["hr:openRolesByDepartment.engineering"],
      assumptions: [],
      confidence: "high"
    });
    const orchestrator = new Orchestrator(llm);

    const response = await orchestrator.combineDepartmentResponses(
      "Should we hire more people?",
      ungroundedFinanceResponse,
      hrResponse
    );

    expect(llm.requests).toEqual([]);
    expect(response.department).toBe("both");
    expect(response.confidence).toBe("low");
    expect(response.answer).toContain("Finance lacked grounded facts");
    expect(response.answer).toContain("joint Finance and HR recommendation cannot be produced");
    expect(response.answer).not.toContain("This should not be called");
  });

  it("skips synthesis when HR has no grounded facts and Finance does", async () => {
    const llm = new RecordingLlmClient({
      answer: "This should not be called.",
      factKeys: ["finance:approvedHiringBudget"],
      assumptions: [],
      confidence: "high"
    });
    const orchestrator = new Orchestrator(llm);

    const response = await orchestrator.combineDepartmentResponses(
      "Should we hire more people?",
      financeResponse,
      ungroundedHrResponse
    );

    expect(llm.requests).toEqual([]);
    expect(response.department).toBe("both");
    expect(response.confidence).toBe("low");
    expect(response.answer).toContain("HR lacked grounded facts");
    expect(response.answer).toContain("joint Finance and HR recommendation cannot be produced");
    expect(response.answer).not.toContain("This should not be called");
  });

  it("skips synthesis when neither department has grounded facts", async () => {
    const llm = new RecordingLlmClient({
      answer: "This should not be called.",
      factKeys: [],
      assumptions: [],
      confidence: "high"
    });
    const orchestrator = new Orchestrator(llm);

    const response = await orchestrator.combineDepartmentResponses(
      "Should we hire more people?",
      ungroundedFinanceResponse,
      ungroundedHrResponse
    );

    expect(llm.requests).toEqual([]);
    expect(response.department).toBe("both");
    expect(response.confidence).toBe("low");
    expect(response.answer).toContain("Finance and HR lacked grounded facts");
    expect(response.answer).toContain("joint Finance and HR recommendation cannot be produced");
    expect(response.factsUsed).toEqual([]);
  });

  it("sends validated AgentResponse objects only, not raw department data", async () => {
    const llm = new RecordingLlmClient({
      answer: "Proceed carefully.",
      factKeys: ["finance:approvedHiringBudget", "hr:openRolesByDepartment.engineering"],
      assumptions: [],
      confidence: "medium"
    });
    const orchestrator = new Orchestrator(llm);

    await orchestrator.combineDepartmentResponses(
      "Should we hire more people?",
      financeResponse,
      hrResponse,
      financePeerResponse,
      hrPeerResponse
    );
    const payload = llm.requests[0]?.messages.at(-1)?.content ?? "";

    expect(payload).toContain("discussion");
    expect(payload).toContain("financeInitial");
    expect(payload).toContain("hrInitial");
    expect(payload).toContain("financePeerResponse");
    expect(payload).toContain("hrPeerResponse");
    expect(payload).toContain("allowedFactKeys");
    expect(payload).not.toContain("financeData");
    expect(payload).not.toContain("hrData");
  });

  it("allows final synthesis to reference validated peer response facts", async () => {
    const llm = new RecordingLlmClient({
      answer: "Proceed with critical hiring after peer refinements from both departments.",
      factKeys: ["finance:notes", "hr:capacityNotes"],
      assumptions: [],
      confidence: "medium"
    });
    const orchestrator = new Orchestrator(llm);

    const response = await orchestrator.combineDepartmentResponses(
      "Should we hire more people?",
      financeResponse,
      hrResponse,
      financePeerResponse,
      hrPeerResponse
    );

    expect(response.answer).toContain("peer refinements");
    expect(response.factsUsed).toEqual([...financePeerResponse.factsUsed, ...hrPeerResponse.factsUsed]);
  });

  it("final recommendation changes when peer responses change while initial responses stay the same", async () => {
    class PeerSensitiveLlmClient implements LlmClient {
      async completeJson(request: LlmJsonRequest): Promise<unknown> {
        const payload = JSON.parse(request.messages.at(-1)?.content ?? "{}") as { discussion: DiscussionResult };
        const financePeerAnswer = payload.discussion.financePeerResponse?.answer ?? "";
        if (financePeerAnswer.includes("delaying")) {
          return {
            answer:
              "Delay broad hiring. Finance added a cost constraint, while HR narrowed support to delivery-risk roles.",
            factKeys: ["finance:approvedHiringBudget", "hr:capacityNotes"],
            assumptions: [],
            confidence: "medium"
          };
        }

        return {
          answer:
            "Yes, hire critical engineering roles. Both departments converged on targeted hiring after the discussion.",
          factKeys: ["finance:notes", "hr:capacityNotes"],
          assumptions: [],
          confidence: "medium"
        };
      }
    }

    const orchestrator = new Orchestrator(new PeerSensitiveLlmClient());
    const versionA = await orchestrator.combineDepartmentResponses(
      "Should we hire more people?",
      financeResponse,
      hrResponse,
      financePeerResponse,
      hrPeerResponse
    );
    const versionB = await orchestrator.combineDepartmentResponses(
      "Should we hire more people?",
      financeResponse,
      hrResponse,
      revisedFinancePeerResponse,
      revisedHrPeerResponse
    );

    expect(versionA.answer).toContain("hire critical engineering roles");
    expect(versionB.answer).toContain("Delay broad hiring");
    expect(versionA.answer).not.toBe(versionB.answer);
  });

  it("successful wording is user-facing and avoids internal implementation terms", async () => {
    const llm = new RecordingLlmClient({
      answer:
        "Yes, but selectively. Finance supports hiring only for critical roles within the approved budget, while HR identifies engineering as the highest-priority need because unfilled backend roles are creating delivery risk.",
      factKeys: ["finance:approvedHiringBudget", "finance:notes", "hr:capacityNotes"],
      assumptions: ["Role-level costs were not provided."],
      confidence: "medium"
    });
    const orchestrator = new Orchestrator(llm);

    const response = await orchestrator.combineDepartmentResponses(
      "Should we hire more people?",
      financeResponse,
      hrResponse,
      financePeerResponse,
      hrPeerResponse
    );

    expect(response.answer).toMatch(/^Yes, but selectively/);
    expect(response.answer).toContain("approved budget");
    expect(response.answer).toContain("delivery risk");
    expect(response.answer.toLowerCase()).not.toContain("validated finance response");
    expect(response.answer.toLowerCase()).not.toContain("validated hr response");
    expect(response.answer.toLowerCase()).not.toContain("peer response");
    expect(response.answer.toLowerCase()).not.toContain("orchestrator");
    expect(response.answer.toLowerCase()).not.toContain("fact key");
    expect(response.answer.toLowerCase()).not.toContain("model output");
    expect(response.answer.toLowerCase()).not.toContain("supplied context");
    expect(response.answer.toLowerCase()).not.toContain("engagement score");
  });

  it("omits available but irrelevant facts from final factsUsed", async () => {
    const financeWithExtraFact: AgentResponse = {
      ...financeResponse,
      factsUsed: [
        ...financeResponse.factsUsed,
        {
          source: "finance",
          label: "Cash balance",
          value: 4200000,
          path: "cashBalance"
        }
      ]
    };
    const hrWithExtraFact: AgentResponse = {
      ...hrResponse,
      factsUsed: [
        ...hrResponse.factsUsed,
        {
          source: "hr",
          label: "Engagement score",
          value: 72,
          path: "engagementScore"
        }
      ]
    };
    const llm = new RecordingLlmClient({
      answer: "Yes, but selectively based on budget and engineering need.",
      factKeys: ["finance:approvedHiringBudget", "hr:openRolesByDepartment.engineering"],
      assumptions: [],
      confidence: "medium"
    });
    const orchestrator = new Orchestrator(llm);

    const response = await orchestrator.combineDepartmentResponses(
      "Should we hire more people?",
      financeWithExtraFact,
      hrWithExtraFact
    );

    expect(response.factsUsed.map((fact) => fact.path)).toEqual([
      "approvedHiringBudget",
      "openRolesByDepartment.engineering"
    ]);
  });

  it("falls back when synthesis fails", async () => {
    const orchestrator = new Orchestrator(new RecordingLlmClient({}, true));

    const response = await orchestrator.combineDepartmentResponses(
      "Should we hire more people?",
      financeResponse,
      hrResponse
    );

    expect(response.department).toBe("both");
    expect(response.confidence).toBe("low");
    expect(response.answer).toContain("Finance position");
    expect(response.factsUsed).toEqual([...financeResponse.factsUsed, ...hrResponse.factsUsed]);
  });

  it("falls back on invalid output or unsupported fact references", async () => {
    const orchestrator = new Orchestrator(
      new RecordingLlmClient({
        answer: "Proceed with unsupported data.",
        factKeys: ["finance:approvedHiringBudget", "hr:unknown"],
        assumptions: [],
        confidence: "high"
      })
    );

    const response = await orchestrator.combineDepartmentResponses(
      "Should we hire more people?",
      financeResponse,
      hrResponse
    );

    expect(response.confidence).toBe("low");
    expect(response.answer).toContain("A complete recommendation is not available");
  });
});
