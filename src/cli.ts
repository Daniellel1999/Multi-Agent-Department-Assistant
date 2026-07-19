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

    if ("peerContext" in payload && "financeData" in payload) {
      return {
        answer:
          "Finance maintains a critical-only hiring stance after considering HR's capacity concerns.",
        factKeys: ["approvedHiringBudget", "financeNotes"],
        assumptions: ["HR capacity concerns are considered only from HR's grounded analysis."],
        confidence: "medium"
      };
    }

    if ("peerContext" in payload && "hrData" in payload) {
      return {
        answer:
          "HR agrees hiring should prioritize critical roles, with engineering open roles remaining the main workforce constraint.",
        factKeys: ["engineeringOpenRoles", "capacityNotes"],
        assumptions: ["Finance budget constraints are considered only from Finance's grounded analysis."],
        confidence: "medium"
      };
    }

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

    if ("discussion" in payload) {
      return {
        answer:
          "Recommendation: proceed only with critical hiring. Finance maintains the budget constraint after HR's peer input, and HR agrees engineering capacity is the main workforce trade-off.",
        factKeys: [
          "finance:approvedHiringBudget",
          "finance:notes",
          "hr:openRolesByDepartment.engineering",
          "hr:capacityNotes"
        ],
        assumptions: ["This recommendation is limited to the available Finance and HR data."],
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
