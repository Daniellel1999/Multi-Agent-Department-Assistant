# Department Agents Assessment

Small TypeScript CLI application with two isolated AI agents:

- Finance Agent: receives only hardcoded finance mock data.
- HR Agent: receives only hardcoded HR mock data.
- Router: deterministically routes questions to finance, HR, both, or unknown.
- Orchestrator: combines validated finance and HR responses for cross-department questions.

## Setup

Requires Node.js 20+.

```bash
npm install
cp .env.example .env
```

Set `OPENAI_API_KEY` in `.env`. No other configuration is required.

## Commands

```bash
npm run dev -- "What is our cash balance?"
npm run typecheck
npm test
```

## Examples

```bash
npm run dev -- "What is our monthly revenue?"
npm run dev -- "How many open roles do we have?"
npm run dev -- "Should we hire more people?"
npm run dev -- "What is the weather tomorrow?"
```

Responses are structured as JSON:

```json
{
  "answer": "...",
  "factsUsed": [],
  "assumptions": [],
  "confidence": "low",
  "department": "unknown"
}
```

## Architecture Summary

The CLI calls an application service. The service routes the question, calls the relevant agent or agents, and invokes the orchestrator only for cross-department questions.

The LLM is behind a small `LlmClient` interface. Tests use mock clients and never require a real API key.

## Routing

Routing is deterministic keyword routing. This was chosen over an LLM classifier because the assessment domain is small and the routing logic should be transparent, cheap, and unit-testable.

## Data Isolation

Finance and HR data live in separate modules. Each agent is constructed with only its own department data:

```ts
new FinanceAgent(llmClient, financeData);
new HrAgent(llmClient, hrData);
```

`Agent.answer()` accepts only the user question. The application service never passes arbitrary department data into an agent call.

## Grounding

The model returns:

```json
{
  "answer": "...",
  "factKeys": ["monthlyRevenue"],
  "assumptions": [],
  "confidence": "high"
}
```

Application code validates fact keys against the department allow-list, resolves values from trusted mock data, constructs `GroundedFact` objects, and adds the department field. Model-generated fact values are never trusted.

## Orchestration

For cross-department questions, both agents answer independently. The orchestrator receives only validated `AgentResponse` objects, not raw department data. If synthesis fails or references unsupported facts, the app returns a conservative fallback with the finance perspective, HR perspective, and low confidence.

## Tests

The test suite covers:

- finance, HR, both, and unknown routing
- agent data isolation and `answer(question)` call shape
- fact-key validation and trusted value resolution
- rejection or discard of invalid fact keys
- orchestration synthesis and fallback behavior
- application-service dispatch behavior

## Trade-offs

- Deterministic routing is less flexible than an LLM classifier, but it is easier to understand and test for this small assignment.
- Fact-key grounding is intentionally simpler than free-text hallucination detection.
- The CLI includes an explicit mock mode for local validation without API calls; real usage still goes through the official OpenAI SDK.

## Limitations

- Mock data is intentionally small.
- No UI, API server, database, auth, vector store, memory, or agent framework is included.
- Prompts are behavioral guidance, not security boundaries. Data isolation is enforced by construction and call shape.
