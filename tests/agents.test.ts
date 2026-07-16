import { FinanceAgent } from "../src/agents/FinanceAgent.js";
import { HrAgent } from "../src/agents/HrAgent.js";
import { financeData } from "../src/data/financeData.js";
import { hrData } from "../src/data/hrData.js";
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
