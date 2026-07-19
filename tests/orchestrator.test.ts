import type { AgentResponse } from "../src/domain.js";
import type { Agent } from "../src/agents/Agent.js";
import type { LlmClient, LlmJsonRequest } from "../src/llm/LlmClient.js";
import { Orchestrator } from "../src/orchestration/orchestrator.js";

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

  it("continues to initial-response synthesis when one peer response call fails", async () => {
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
    expect(payload).not.toContain("hrPeerResponse");
  });

  it("combines validated agent responses and preserves allowed facts", async () => {
    const llm = new RecordingLlmClient({
      answer: "Proceed with critical engineering hiring.",
      factKeys: ["finance:approvedHiringBudget", "hr:openRolesByDepartment.engineering"],
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
    expect(response.answer).toContain("did not reference any validated facts");
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
    expect(response.answer).toContain("unsupported facts");
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
    expect(response.answer).toContain("each grounded department");
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

    expect(payload).toContain("financeResponse");
    expect(payload).toContain("hrResponse");
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

  it("falls back when synthesis fails", async () => {
    const orchestrator = new Orchestrator(new RecordingLlmClient({}, true));

    const response = await orchestrator.combineDepartmentResponses(
      "Should we hire more people?",
      financeResponse,
      hrResponse
    );

    expect(response.department).toBe("both");
    expect(response.confidence).toBe("low");
    expect(response.answer).toContain("Finance perspective");
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
    expect(response.answer).toContain("unsupported facts");
  });
});
