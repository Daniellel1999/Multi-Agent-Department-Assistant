import type { AgentDepartment, AgentResponse, PeerContext } from "../domain.js";

export interface Agent {
  readonly department: AgentDepartment;
  answer(question: string): Promise<AgentResponse>;
  respondToPeer(question: string, peerContext: PeerContext): Promise<AgentResponse>;
}
