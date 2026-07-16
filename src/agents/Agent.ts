import type { AgentDepartment, AgentResponse } from "../domain.js";

export interface Agent {
  readonly department: AgentDepartment;
  answer(question: string): Promise<AgentResponse>;
}
