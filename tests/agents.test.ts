import { FinanceAgent } from "../src/agents/FinanceAgent.js";
import { HrAgent } from "../src/agents/HrAgent.js";
import { financeData } from "../src/data/financeData.js";
import { hrData } from "../src/data/hrData.js";
import type { PeerContext } from "../src/domain.js";
import type { LlmClient, LlmJsonRequest } from "../src/llm/LlmClient.js";

class RecordingLlmClient implements LlmClient {
  readonly requests: LlmJsonRequest[] = [];

  constructor(private readonly response: unknown) {}

  async completeJson(request: LlmJsonRequest): Promise<unknown> {
    this.requests.push(request);
    return this.response;
  }
}

describe("department agents", () => {
  const hrPeerContext: PeerContext = {
    department: "hr",
    answer: "HR reports engineering open roles.",
    factsUsed: [
      {
        source: "hr",
        label: "Engineering open roles",
        value: 5,
        path: "openRolesByDepartment.engineering"
      }
    ],
    assumptions: [],
    confidence: "high"
  };

  const financePeerContext: PeerContext = {
    department: "finance",
    answer: "Finance supports critical hiring within budget.",
    factsUsed: [
      {
        source: "finance",
        label: "Approved hiring budget",
        value: 240000,
        path: "approvedHiringBudget"
      }
    ],
    assumptions: [],
    confidence: "high"
  };

  it("FinanceAgent answer receives only a question at call time and uses finance data only", async () => {
    const llm = new RecordingLlmClient({
      answer: "Monthly revenue is $1,250,000 for Q2 FY2026.",
      factKeys: ["monthlyRevenue", "period"],
      assumptions: [],
      confidence: "high"
    });
    const agent = new FinanceAgent(llm, financeData);

    const response = await agent.answer("What is our monthly revenue?");
    const promptPayload = llm.requests[0]?.messages.at(-1)?.content ?? "";

    expect(response.department).toBe("finance");
    expect(response.answer).toContain("$1,250,000");
    expect(promptPayload).toContain("financeData");
    expect(promptPayload).toContain("monthlyRevenue");
    expect(promptPayload).not.toContain("hrData");
    expect(promptPayload).not.toContain("totalHeadcount");
    expect(response.factsUsed.map((fact) => fact.path)).toEqual(["monthlyRevenue", "period"]);
  });

  it("HrAgent answer receives only a question at call time and uses HR data only", async () => {
    const llm = new RecordingLlmClient({
      answer: "HR answer.",
      factKeys: ["totalHeadcount", "engineeringOpenRoles"],
      assumptions: [],
      confidence: "high"
    });
    const agent = new HrAgent(llm, hrData);

    const response = await agent.answer("How many open roles do we have?");
    const promptPayload = llm.requests[0]?.messages.at(-1)?.content ?? "";

    expect(response.department).toBe("hr");
    expect(promptPayload).toContain("hrData");
    expect(promptPayload).toContain("totalHeadcount");
    expect(promptPayload).not.toContain("financeData");
    expect(promptPayload).not.toContain("cashBalance");
    expect(response.factsUsed.map((fact) => fact.path)).toEqual([
      "totalHeadcount",
      "openRolesByDepartment.engineering"
    ]);
  });

  it("FinanceAgent peer response receives validated HR context but not raw HR data", async () => {
    const llm = new RecordingLlmClient({
      answer: "Finance maintains critical-only hiring after considering HR capacity constraints.",
      factKeys: ["approvedHiringBudget"],
      assumptions: [],
      confidence: "medium"
    });
    const agent = new FinanceAgent(llm, financeData);

    const response = await agent.respondToPeer("Should we hire more people?", hrPeerContext);
    const promptPayload = llm.requests[0]?.messages.at(-1)?.content ?? "";

    expect(response.department).toBe("finance");
    expect(response.factsUsed.map((fact) => fact.path)).toEqual(["approvedHiringBudget"]);
    expect(promptPayload).toContain("financeData");
    expect(promptPayload).toContain("peerContext");
    expect(promptPayload).toContain("Engineering open roles");
    expect(promptPayload).not.toContain("hrData");
    expect(promptPayload).not.toContain("headcountByDepartment");
  });

  it("HrAgent peer response receives validated Finance context but not raw finance data", async () => {
    const llm = new RecordingLlmClient({
      answer: "HR refines hiring to prioritize critical roles within Finance constraints.",
      factKeys: ["engineeringOpenRoles"],
      assumptions: [],
      confidence: "medium"
    });
    const agent = new HrAgent(llm, hrData);

    const response = await agent.respondToPeer("Should we hire more people?", financePeerContext);
    const promptPayload = llm.requests[0]?.messages.at(-1)?.content ?? "";

    expect(response.department).toBe("hr");
    expect(response.factsUsed.map((fact) => fact.path)).toEqual(["openRolesByDepartment.engineering"]);
    expect(promptPayload).toContain("hrData");
    expect(promptPayload).toContain("peerContext");
    expect(promptPayload).toContain("Approved hiring budget");
    expect(promptPayload).not.toContain("financeData");
    expect(promptPayload).not.toContain("departmentBudgets");
  });

  it("rejects a Finance Agent response containing HR-only or unknown fact keys", async () => {
    const llm = new RecordingLlmClient({
      answer: "Finance answer with unsupported claims.",
      factKeys: ["monthlyRevenue", "totalHeadcount", "fakeKey"],
      assumptions: [],
      confidence: "medium"
    });
    const agent = new FinanceAgent(llm, financeData);

    const response = await agent.answer("What is our revenue?");

    expect(response.department).toBe("finance");
    expect(response.confidence).toBe("low");
    expect(response.answer).not.toBe("Finance answer with unsupported claims.");
    expect(response.factsUsed).toEqual([]);
  });

  it("rejects a Finance Agent response with empty fact keys and high confidence", async () => {
    const llm = new RecordingLlmClient({
      answer: "Revenue is strong and cash is sufficient.",
      factKeys: [],
      assumptions: [],
      confidence: "high"
    });
    const agent = new FinanceAgent(llm, financeData);

    const response = await agent.answer("What is our revenue?");

    expect(response.department).toBe("finance");
    expect(response.confidence).toBe("low");
    expect(response.answer).toBe("Finance Agent response could not be grounded in the available finance data.");
    expect(response.answer).not.toBe("Revenue is strong and cash is sufficient.");
    expect(response.factsUsed).toEqual([]);
  });

  it("rejects an HR Agent response containing finance-only or unknown fact keys", async () => {
    const llm = new RecordingLlmClient({
      answer: "HR answer with unsupported claims.",
      factKeys: ["totalHeadcount", "cashBalance", "fakeKey"],
      assumptions: [],
      confidence: "high"
    });
    const agent = new HrAgent(llm, hrData);

    const response = await agent.answer("What is our headcount?");

    expect(response.department).toBe("hr");
    expect(response.confidence).toBe("low");
    expect(response.answer).not.toBe("HR answer with unsupported claims.");
    expect(response.factsUsed).toEqual([]);
  });

  it("rejects Finance peer responses that claim HR fact keys", async () => {
    const llm = new RecordingLlmClient({
      answer: "Finance answer with HR-owned fact.",
      factKeys: ["approvedHiringBudget", "engineeringOpenRoles"],
      assumptions: [],
      confidence: "medium"
    });
    const agent = new FinanceAgent(llm, financeData);

    const response = await agent.respondToPeer("Should we hire more people?", hrPeerContext);

    expect(response.department).toBe("finance");
    expect(response.confidence).toBe("low");
    expect(response.answer).not.toBe("Finance answer with HR-owned fact.");
    expect(response.factsUsed).toEqual([]);
  });

  it("rejects HR peer responses that claim Finance fact keys", async () => {
    const llm = new RecordingLlmClient({
      answer: "HR answer with Finance-owned fact.",
      factKeys: ["engineeringOpenRoles", "approvedHiringBudget"],
      assumptions: [],
      confidence: "medium"
    });
    const agent = new HrAgent(llm, hrData);

    const response = await agent.respondToPeer("Should we hire more people?", financePeerContext);

    expect(response.department).toBe("hr");
    expect(response.confidence).toBe("low");
    expect(response.answer).not.toBe("HR answer with Finance-owned fact.");
    expect(response.factsUsed).toEqual([]);
  });

  it("rejects an HR Agent response with empty fact keys and a factual answer", async () => {
    const llm = new RecordingLlmClient({
      answer: "Engineering has several open roles.",
      factKeys: [],
      assumptions: [],
      confidence: "high"
    });
    const agent = new HrAgent(llm, hrData);

    const response = await agent.answer("How many open roles do we have?");

    expect(response.department).toBe("hr");
    expect(response.confidence).toBe("low");
    expect(response.answer).toBe("HR Agent response could not be grounded in the available HR data.");
    expect(response.answer).not.toBe("Engineering has several open roles.");
    expect(response.factsUsed).toEqual([]);
  });

  it("returns safe fallback on invalid model JSON shape", async () => {
    const llm = new RecordingLlmClient({ answer: "Missing required fields." });
    const agent = new HrAgent(llm, hrData);

    const response = await agent.answer("What is attrition?");

    expect(response.department).toBe("hr");
    expect(response.confidence).toBe("low");
    expect(response.factsUsed).toEqual([]);
  });
});
