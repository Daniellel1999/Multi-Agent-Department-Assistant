export type Department = "finance" | "hr" | "both" | "unknown";

export type AgentDepartment = "finance" | "hr";

export type Confidence = "low" | "medium" | "high";

export interface RouteDecision {
  route: Department;
  reason: string;
  matchedSignals: string[];
}

export interface GroundedFact {
  source: AgentDepartment;
  label: string;
  value: string | number;
  path?: string;
}

export interface ModelAgentOutput {
  answer: string;
  factKeys: string[];
  assumptions: string[];
  confidence: Confidence;
}

export interface AgentResponse {
  answer: string;
  factsUsed: GroundedFact[];
  assumptions: string[];
  confidence: Confidence;
  department: AgentDepartment;
}

export interface PeerContext {
  department: AgentDepartment;
  answer: string;
  factsUsed: GroundedFact[];
  assumptions: string[];
  confidence: Confidence;
}

export interface FinalResponse {
  answer: string;
  factsUsed: GroundedFact[];
  assumptions: string[];
  confidence: Confidence;
  department: Department;
}

export interface DiscussionResult {
  question: string;
  financeInitial: AgentResponse;
  hrInitial: AgentResponse;
  financePeerResponse?: AgentResponse;
  hrPeerResponse?: AgentResponse;
}
