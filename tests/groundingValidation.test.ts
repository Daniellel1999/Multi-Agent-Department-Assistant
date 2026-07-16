import { financeData } from "../src/data/financeData.js";
import { hrData } from "../src/data/hrData.js";
import {
  buildAgentResponse,
  resolveGroundedFacts,
  validateFactKeys
} from "../src/orchestration/groundingValidation.js";

describe("grounding validation", () => {
  it("accepts valid finance fact keys", () => {
    expect(validateFactKeys("finance", ["monthlyRevenue", "cashBalance"])).toEqual([
      "monthlyRevenue",
      "cashBalance"
    ]);
  });

  it("accepts valid HR fact keys", () => {
    expect(validateFactKeys("hr", ["totalHeadcount", "engineeringOpenRoles"])).toEqual([
      "totalHeadcount",
      "engineeringOpenRoles"
    ]);
  });

  it("rejects invalid fact keys", () => {
    expect(validateFactKeys("finance", ["monthlyRevenue", "totalHeadcount", "notReal"])).toEqual([
      "monthlyRevenue"
    ]);
  });

  it("treats model output with any invalid fact key as ungroundable", () => {
    const response = buildAgentResponse(
      {
        answer: "This answer should not be exposed.",
        factKeys: ["monthlyRevenue", "totalHeadcount"],
        assumptions: [],
        confidence: "high"
      },
      "finance",
      financeData
    );

    expect(response).toBeUndefined();
  });

  it("treats model output with empty fact keys as ungroundable", () => {
    const response = buildAgentResponse(
      {
        answer: "This answer has no grounded references.",
        factKeys: [],
        assumptions: [],
        confidence: "high"
      },
      "hr",
      hrData
    );

    expect(response).toBeUndefined();
  });

  it("resolves valid keys to values from trusted mock data", () => {
    const facts = resolveGroundedFacts("finance", ["monthlyRevenue"], financeData);

    expect(facts).toEqual([
      {
        source: "finance",
        label: "Monthly revenue",
        value: financeData.monthlyRevenue,
        path: "monthlyRevenue"
      }
    ]);
  });

  it("constructs GroundedFact objects for HR values", () => {
    const facts = resolveGroundedFacts("hr", ["engineeringOpenRoles"], hrData);

    expect(facts[0]).toEqual({
      source: "hr",
      label: "Engineering open roles",
      value: hrData.openRolesByDepartment.engineering,
      path: "openRolesByDepartment.engineering"
    });
  });

  it("does not trust model-generated fact values", () => {
    const response = buildAgentResponse(
      {
        answer: "Revenue is much higher than expected.",
        factKeys: ["monthlyRevenue"],
        factsUsed: [{ source: "finance", label: "Fake", value: 999999999 }],
        assumptions: [],
        confidence: "high"
      },
      "finance",
      financeData
    );

    expect(response?.factsUsed).toEqual([
      {
        source: "finance",
        label: "Monthly revenue",
        value: financeData.monthlyRevenue,
        path: "monthlyRevenue"
      }
    ]);
  });
});
