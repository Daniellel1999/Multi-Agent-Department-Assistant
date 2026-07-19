import { orchestrationSystemPrompt } from "../agents/prompts.js";
import type { Agent } from "../agents/Agent.js";
import type { AgentResponse, Confidence, FinalResponse, GroundedFact } from "../domain.js";
import type { LlmClient } from "../llm/LlmClient.js";
import { factIdentity, filterFactsToAllowedFacts } from "./groundingValidation.js";
import { parseJsonObject } from "../utils/parseJsonResponse.js";

interface SynthesisOutput {
  answer: string;
  factKeys: string[];
  assumptions: string[];
  confidence: Confidence;
}

export class Orchestrator {
  constructor(private readonly llmClient: LlmClient) {}

  async runDepartmentDiscussion(question: string, financeAgent: Agent, hrAgent: Agent): Promise<FinalResponse> {
    const [financeResponse, hrResponse] = await Promise.all([financeAgent.answer(question), hrAgent.answer(question)]);

    if (!hasGroundedFacts(financeResponse) || !hasGroundedFacts(hrResponse)) {
      return this.combineDepartmentResponses(question, financeResponse, hrResponse);
    }

    const [financePeerResult, hrPeerResult] = await Promise.allSettled([
      financeAgent.respondToPeer(question, toPeerContext(hrResponse)),
      hrAgent.respondToPeer(question, toPeerContext(financeResponse))
    ]);
    const financePeerResponse = settledAgentResponse(financePeerResult);
    const hrPeerResponse = settledAgentResponse(hrPeerResult);

    if (!hasGroundedFacts(financePeerResponse) || !hasGroundedFacts(hrPeerResponse)) {
      return this.combineDepartmentResponses(question, financeResponse, hrResponse);
    }

    return this.combineDepartmentResponses(question, financeResponse, hrResponse, financePeerResponse, hrPeerResponse);
  }

  async combineDepartmentResponses(
    question: string,
    financeResponse: AgentResponse,
    hrResponse: AgentResponse,
    financePeerResponse?: AgentResponse,
    hrPeerResponse?: AgentResponse
  ): Promise<FinalResponse> {
    const missingGroundedDepartments = getMissingGroundedDepartments(financeResponse, hrResponse);
    if (missingGroundedDepartments.length > 0) {
      return this.insufficientGroundingFallback(financeResponse, hrResponse, missingGroundedDepartments, [
        financePeerResponse,
        hrPeerResponse
      ]);
    }

    const validResponses = [financeResponse, hrResponse, financePeerResponse, hrPeerResponse].filter(
      hasGroundedFacts
    );
    const allowedFacts = validResponses.flatMap((response) => response.factsUsed);
    const allowedFactKeys = allowedFacts.map(factIdentity);

    try {
      const modelOutput = await this.llmClient.completeJson({
        messages: [
          { role: "system", content: orchestrationSystemPrompt },
          {
            role: "user",
            content: JSON.stringify({
              question,
              financeResponse,
              hrResponse,
              financePeerResponse,
              hrPeerResponse,
              allowedFactKeys
            })
          }
        ]
      });
      const parsed = parseSynthesisOutput(modelOutput);
      if (!parsed) {
        return this.fallback(financeResponse, hrResponse, "Synthesis output was invalid.", [
          financePeerResponse,
          hrPeerResponse
        ]);
      }

      if (parsed.factKeys.length === 0) {
        return this.fallback(financeResponse, hrResponse, "Synthesis did not reference any validated facts.", [
          financePeerResponse,
          hrPeerResponse
        ]);
      }

      if (parsed.factKeys.some((key) => !allowedFactKeys.includes(key))) {
        return this.fallback(financeResponse, hrResponse, "Synthesis referenced unsupported facts.", [
          financePeerResponse,
          hrPeerResponse
        ]);
      }

      if (!referencesRequiredDepartments(parsed.factKeys, financeResponse, hrResponse)) {
        return this.fallback(
          financeResponse,
          hrResponse,
          "Synthesis did not reference validated facts from each grounded department.",
          [financePeerResponse, hrPeerResponse]
        );
      }

      const requestedFacts = factsByKeys(parsed.factKeys, allowedFacts);
      return {
        answer: parsed.answer,
        factsUsed: filterFactsToAllowedFacts(requestedFacts, allowedFacts),
        assumptions: parsed.assumptions,
        confidence: parsed.confidence,
        department: "both"
      };
    } catch {
      return this.fallback(financeResponse, hrResponse, "Synthesis failed.", [financePeerResponse, hrPeerResponse]);
    }
  }

  private fallback(
    financeResponse: AgentResponse,
    hrResponse: AgentResponse,
    reason: string,
    peerResponses: Array<AgentResponse | undefined> = []
  ): FinalResponse {
    const validPeerResponses = peerResponses.filter(hasGroundedFacts);
    const factsUsed = [
      ...financeResponse.factsUsed,
      ...hrResponse.factsUsed,
      ...validPeerResponses.flatMap((response) => response.factsUsed)
    ];
    const peerLines = validPeerResponses.map(
      (response) => `${labelDepartment(response)} peer refinement: ${response.answer}`
    );

    return {
      answer: [
        `${reason}`,
        `Finance perspective: ${financeResponse.answer}`,
        `HR perspective: ${hrResponse.answer}`,
        ...peerLines,
        "Recommendation: insufficient information for a stronger combined recommendation without a valid synthesis."
      ].join(" "),
      factsUsed,
      assumptions: [
        ...financeResponse.assumptions,
        ...hrResponse.assumptions,
        ...validPeerResponses.flatMap((response) => response.assumptions),
        "The combined recommendation used a conservative fallback."
      ],
      confidence: "low",
      department: "both"
    };
  }

  private insufficientGroundingFallback(
    financeResponse: AgentResponse,
    hrResponse: AgentResponse,
    missingDepartments: string[],
    peerResponses: Array<AgentResponse | undefined> = []
  ): FinalResponse {
    const validPeerResponses = peerResponses.filter(hasGroundedFacts);
    return {
      answer: [
        `Insufficient information: ${missingDepartments.join(" and ")} lacked grounded facts.`,
        "A joint Finance and HR recommendation cannot be produced from the validated agent responses."
      ].join(" "),
      factsUsed: [
        ...financeResponse.factsUsed,
        ...hrResponse.factsUsed,
        ...validPeerResponses.flatMap((response) => response.factsUsed)
      ],
      assumptions: [
        ...financeResponse.assumptions,
        ...hrResponse.assumptions,
        ...validPeerResponses.flatMap((response) => response.assumptions),
        "The combined recommendation was not produced because both departments must provide grounded facts."
      ],
      confidence: "low",
      department: "both"
    };
  }
}

function hasGroundedFacts(response: AgentResponse | undefined): response is AgentResponse {
  return Boolean(response && response.factsUsed.length > 0);
}

function labelDepartment(response: AgentResponse): string {
  return response.department === "finance" ? "Finance" : "HR";
}

function toPeerContext(response: AgentResponse) {
  return {
    department: response.department,
    answer: response.answer,
    factsUsed: response.factsUsed,
    assumptions: response.assumptions,
    confidence: response.confidence
  };
}

function settledAgentResponse(result: PromiseSettledResult<AgentResponse>): AgentResponse | undefined {
  return result.status === "fulfilled" ? result.value : undefined;
}

function parseSynthesisOutput(value: unknown): SynthesisOutput | undefined {
  const record = parseJsonObject(value);
  if (!record) {
    return undefined;
  }

  const { answer, factKeys, assumptions, confidence } = record;
  if (
    typeof answer !== "string" ||
    !Array.isArray(factKeys) ||
    !factKeys.every((key) => typeof key === "string") ||
    !Array.isArray(assumptions) ||
    !assumptions.every((assumption) => typeof assumption === "string") ||
    !isConfidence(confidence)
  ) {
    return undefined;
  }

  return { answer, factKeys, assumptions, confidence };
}

function factsByKeys(keys: string[], facts: GroundedFact[]): GroundedFact[] {
  const byKey = new Map(facts.map((fact) => [factIdentity(fact), fact]));
  return keys.flatMap((key) => {
    const fact = byKey.get(key);
    return fact ? [fact] : [];
  });
}

function referencesRequiredDepartments(
  factKeys: string[],
  financeResponse: AgentResponse,
  hrResponse: AgentResponse
): boolean {
  const referencesFinance = factKeys.some((key) => key.startsWith("finance:"));
  const referencesHr = factKeys.some((key) => key.startsWith("hr:"));

  return financeResponse.factsUsed.length > 0 && hrResponse.factsUsed.length > 0 && referencesFinance && referencesHr;
}

function getMissingGroundedDepartments(financeResponse: AgentResponse, hrResponse: AgentResponse): string[] {
  const missing: string[] = [];
  if (financeResponse.factsUsed.length === 0) {
    missing.push("Finance");
  }
  if (hrResponse.factsUsed.length === 0) {
    missing.push("HR");
  }
  return missing;
}

function isConfidence(value: unknown): value is Confidence {
  return value === "low" || value === "medium" || value === "high";
}
