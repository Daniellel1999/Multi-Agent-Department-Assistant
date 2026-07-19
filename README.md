# Department Agents Assessment

Small TypeScript CLI application with two isolated AI agents:

- **Finance Agent** — receives only hardcoded finance mock data.
- **HR Agent** — receives only hardcoded HR mock data.
- **Router** — deterministically routes questions to Finance, HR, both agents, or an unknown route.
- **Orchestrator** — coordinates one bounded peer-response round and produces a joint recommendation for cross-department questions.

## Setup

Requires Node.js 20+.

```bash
npm install
cp .env.example .env
```

Set `OPENAI_API_KEY` in `.env`.

## Examples

```bash
npm run dev -- "What is our monthly revenue?"
npm run dev -- "How many open roles do we have?"
npm run dev -- "Should we hire more people?"
npm run dev -- "What is the weather tomorrow?"

npm run typecheck
npm test
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

The CLI calls an application service that routes the question and invokes only the required agent or agents.

The LLM is accessed through a small `LlmClient` interface. Tests use mock clients and never require a real API key.

## Routing

Routing uses deterministic keyword rules. This is transparent, inexpensive, predictable, and easy to unit-test for the assessment’s small domain.

## Data Isolation

Finance and HR data live in separate modules. Each agent is constructed with only its own department data:

```ts
new FinanceAgent(llmClient, financeData);
new HrAgent(llmClient, hrData);
```

`Agent.answer()` accepts only the user question. During cross-department discussion, each agent receives only the other department’s initial validated response, never its raw mock data.

Prompts guide model behavior, but isolation is enforced by application structure and method signatures.

## Grounding

Agents return fact identifiers rather than trusted fact values:

```json
{
  "answer": "...",
  "factKeys": ["monthlyRevenue"],
  "assumptions": [],
  "confidence": "high"
}
```

Application code validates each identifier against the department allow-list and resolves its value from trusted mock data. Model-generated fact values are never trusted.

The final `factsUsed` array contains only validated facts that materially support the recommendation, constraint, trade-off, or unresolved disagreement.

## Orchestration

For cross-department questions, the orchestrator uses a bounded one-round discussion:

1. Finance and HR independently produce initial analyses.
2. Both responses are validated and grounded.
3. Each agent receives the other department’s validated position.
4. Each agent produces one peer response.
5. The peer responses are validated.
6. The orchestrator produces one joint recommendation from the revised positions.

```text
Initial analyses
        ↓
Validation and grounding
        ↓
One peer-response round
        ↓
Validation and grounding
        ↓
Joint recommendation
```

The discussion is limited to one round to keep cost, latency, behavior, and testing predictable.

Single-department questions use one LLM call. A successful full cross-department flow uses up to five LLM calls.

If a peer response fails, synthesis continues using the valid information available. If final synthesis fails or references unsupported facts, the application returns a conservative low-confidence fallback.

## Tests

The test suite covers:

- Finance, HR, both, and unknown routing
- agent data isolation
- the bounded peer-response flow
- fact-key validation and trusted value resolution
- invalid fact rejection
- final synthesis and fallback behavior
- application-service dispatch

## Trade-offs

- Deterministic routing is less flexible than an LLM classifier but is more appropriate for this small assessment.
- Fact-key grounding is intentionally simpler than general free-text hallucination detection.
- Mock mode supports local validation without API calls; normal usage uses the official OpenAI SDK.
- The project intentionally excludes a UI, API server, database, authentication, memory, vector storage, and agent frameworks.
