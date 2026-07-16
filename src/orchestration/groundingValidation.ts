import type { AgentDepartment, AgentResponse, Confidence, GroundedFact, ModelAgentOutput } from "../domain.js";
import type { FinanceData } from "../data/financeData.js";
import { getFinanceFactKeys, resolveFinanceFact } from "../data/financeData.js";
import type { HrData } from "../data/hrData.js";
import { getHrFactKeys, resolveHrFact } from "../data/hrData.js";
import { parseJsonObject } from "../utils/parseJsonResponse.js";

type DepartmentData = FinanceData | HrData;

export function validateFactKeys(department: AgentDepartment, factKeys: string[]): string[] {
  const allowed = new Set(department === "finance" ? getFinanceFactKeys() : getHrFactKeys());
  return [...new Set(factKeys)].filter((key) => allowed.has(key));
}

export function hasOnlyValidFactKeys(department: AgentDepartment, factKeys: string[]): boolean {
  const allowed = new Set(department === "finance" ? getFinanceFactKeys() : getHrFactKeys());
  return factKeys.length > 0 && factKeys.every((key) => allowed.has(key));
}

export function resolveGroundedFacts(
  department: AgentDepartment,
  validFactKeys: string[],
  data: DepartmentData
): GroundedFact[] {
  return validFactKeys.flatMap((key) => {
    const fact =
      department === "finance" ? resolveFinanceFact(key, data as FinanceData) : resolveHrFact(key, data as HrData);

    return fact ? [fact] : [];
  });
}

export function parseModelAgentOutput(value: unknown): ModelAgentOutput | undefined {
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

  return {
    answer,
    factKeys,
    assumptions,
    confidence
  };
}

export function buildAgentResponse(
  modelOutput: unknown,
  department: AgentDepartment,
  data: DepartmentData
): AgentResponse | undefined {
  const parsed = parseModelAgentOutput(modelOutput);
  if (!parsed) {
    return undefined;
  }

  if (!hasOnlyValidFactKeys(department, parsed.factKeys)) {
    return undefined;
  }

  const validFactKeys = validateFactKeys(department, parsed.factKeys);
  const factsUsed = resolveGroundedFacts(department, validFactKeys, data);

  return {
    answer: parsed.answer,
    factsUsed,
    assumptions: parsed.assumptions,
    confidence: parsed.confidence,
    department
  };
}

export function fallbackAgentResponse(department: AgentDepartment, reason: string): AgentResponse {
  return {
    answer: reason,
    factsUsed: [],
    assumptions: ["The model response could not be safely grounded."],
    confidence: "low",
    department
  };
}

export function filterFactsToAllowedFacts(candidateFacts: GroundedFact[], allowedFacts: GroundedFact[]): GroundedFact[] {
  const allowed = new Set(allowedFacts.map(factIdentity));
  return candidateFacts.filter((fact) => allowed.has(factIdentity(fact)));
}

export function factIdentity(fact: GroundedFact): string {
  return `${fact.source}:${fact.path ?? fact.label}`;
}

function isConfidence(value: unknown): value is Confidence {
  return value === "low" || value === "medium" || value === "high";
}
