# Department Agents Assessment

Small TypeScript CLI application with two isolated AI agents:

- Finance Agent: receives only hardcoded finance mock data.
- HR Agent: receives only hardcoded HR mock data.
- Router: deterministically routes questions to finance, HR, both, or unknown.
- Orchestrator: coordinates one bounded peer-response round and synthesizes cross-department recommendations.

## Setup

Requires Node.js 20+.

```bash
npm install
cp .env.example .env
```

Set `OPENAI_API_KEY` in `.env`. No other configuration is required.

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

The CLI calls an application service. The service routes the question, calls the relevant agent for single-department questions, and invokes the orchestrator only for cross-department questions.

The LLM is behind a small `LlmClient` interface. Tests use mock clients and never require a real API key.

## Routing

Routing is deterministic keyword routing. This was chosen over an LLM classifier because the assessment domain is small and the routing logic should be transparent, cheap, and unit-testable.

## Data Isolation

Finance and HR data live in separate modules. Each agent is constructed with only its own department data:

```ts
new FinanceAgent(llmClient, financeData);
new HrAgent(llmClient, hrData);
```

`Agent.answer()` accepts only the user question. For cross-department discussion, each agent has a separate peer-response method that receives only the other department's validated response. Agents never receive the other department's raw mock data.

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

For final cross-department recommendations, `factsUsed` contains only facts selected as materially supporting the recommendation, a constraint, a trade-off, or an unresolved disagreement. Facts are not included merely because they were available earlier in the discussion.

## Orchestration

For cross-department questions, the orchestrator uses a bounded one-round discussion:

1. Finance and HR independently analyze the question.
2. Both initial responses are validated and grounded.
3. Finance receives HR's validated initial position, and HR receives Finance's validated initial position.
4. Each agent produces exactly one peer response.
5. Peer responses are validated and grounded.
6. The orchestrator synthesizes one joint recommendation using the revised positions.

```text
Independent initial analyses
        ↓
Validation and grounding
        ↓
One mutual peer-response round
        ↓
Validation and grounding
        ↓
Joint recommendation using revised positions
```

This is intentionally limited to one round for predictable cost, bounded latency, easier testing, and lower repetition or hallucination risk. Single-department questions use one LLM call. Cross-department questions use up to five LLM calls: Finance initial, HR initial, Finance peer response, HR peer response, and final synthesis.

Raw department data is never shared between agents. Only validated responses are shared as peer context.

If an initial response cannot be grounded, the app skips peer discussion and returns a low-confidence insufficient-information fallback. If a peer response fails, synthesis continues from the validated initial responses and any valid peer refinement that remains. If final synthesis fails or references unsupported facts, the app returns a conservative fallback with the Finance position, HR position, any valid refinement, and low confidence.

Example:

```bash
npm run dev -- "Should we hire more people?"
```

The response is one joint recommendation with validated facts from Finance and HR, not two separate answers placed next to each other.

## Tests

The test suite covers:

- finance, HR, both, and unknown routing
- agent data isolation and `answer(question)` call shape
- one bounded peer-response round for cross-department questions
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
