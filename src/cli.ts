import "dotenv/config";
import { createDefaultApp } from "./app.js";
import type { LlmClient, LlmJsonRequest } from "./llm/LlmClient.js";

async function main() {
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) {
    console.error("Usage: npm run dev -- \"Should we hire more people?\"");
    process.exitCode = 1;
    return;
  }

  const llmClient = process.env.AI_ASSESSMENT_MOCK_LLM === "true" ? new DemoLlmClient() : undefined;
  const app = createDefaultApp(llmClient);
  const response = await app.answerQuestion(question);

  console.log(JSON.stringify(response, null, 2));
}

class DemoLlmClient implements LlmClient {
  async completeJson(request: LlmJsonRequest): Promise<unknown> {
    const lastMessage = request.messages.at(-1)?.content ?? "{}";
    const payload = JSON.parse(lastMessage) as Record<string, unknown>;
    const question = String(payload.question ?? "").toLowerCase();

    if ("financeData" in payload) {
      if (question.includes("hire") || question.includes("hiring") || question.includes("people")) {
        return {
          answer:
            "Finance can support critical hiring within the approved hiring budget, but the answer is limited to the finance data.",
          factKeys: ["approvedHiringBudget", "cashBalance", "monthlyBurnRate", "financeNotes"],
          assumptions: [],
          confidence: "high"
        };
      }

      return {
        answer: "Finance data shows current revenue, expenses, cash balance, and budget context for the question.",
        factKeys: ["monthlyRevenue", "operatingExpenses", "cashBalance", "marketingBudget", "financeNotes"],
        assumptions: [],
        confidence: "high"
      };
    }

    if ("hrData" in payload) {
      return {
        answer: "HR data indicates open roles and capacity pressure, especially in engineering.",
        factKeys: [
          "totalHeadcount",
          "engineeringOpenRoles",
          "salesOpenRoles",
          "attritionRatePercent",
          "capacityNotes"
        ],
        assumptions: [],
        confidence: "high"
      };
    }

    if ("financeResponse" in payload && "hrResponse" in payload) {
      return {
        answer:
          "Recommendation: proceed only with critical hiring because finance has approved hiring budget and HR reports open roles with engineering capacity pressure.",
        factKeys: [
          "finance:approvedHiringBudget",
          "finance:cashBalance",
          "hr:openRolesByDepartment.engineering",
          "hr:capacityNotes"
        ],
        assumptions: ["This recommendation is limited to the validated finance and HR responses."],
        confidence: "medium"
      };
    }

    return {
      answer: "Insufficient information.",
      factKeys: [],
      assumptions: [],
      confidence: "low"
    };
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unexpected CLI error.";
  console.error(message);
  process.exitCode = 1;
});
