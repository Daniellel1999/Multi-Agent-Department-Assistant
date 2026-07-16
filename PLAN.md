# Implementation Plan

## 1. Interpretation of the assessment

Build a small TypeScript CLI application that demonstrates a clean multi-agent AI architecture with strict department data isolation.

The application should accept a user question, route it to one or more department-specific agents, and return a grounded response. The focus is not on building a production AI platform. The focus is on clear TypeScript, understandable routing, careful prompts, grounded numeric claims, agent isolation, orchestration for cross-department questions, and a README that explains the design.

The practical implementation should be intentionally small enough for approximately 2-3 hours. A simple CLI is the best fit because the assessment explicitly says no UI, no database, and no production infrastructure.

## 2. Functional requirements

- Provide a Finance Agent with a unique system prompt.
- Provide an HR Agent with a unique system prompt.
- Store finance data as hardcoded mock JSON.
- Store HR data as hardcoded mock JSON.
- Ensure the Finance Agent receives only finance data.
- Ensure the HR Agent receives only HR data.
- Accept a user question through a CLI.
- Route each question to exactly one of:
  - finance
  - hr
  - both
  - unknown
- Answer finance-related questions using only finance mock data.
- Answer HR-related questions using only HR mock data.
- For cross-department questions, ask both agents to produce grounded department-specific perspectives.
- Combine cross-department perspectives into one recommendation.
- Ensure the joint recommendation does not introduce facts or numbers absent from the agents' grounded responses.
- Report missing information instead of inventing answers.
- Return a structured response with:
  - `answer`
  - `factsUsed`
  - `assumptions`
  - `confidence`
  - `department`

## 3. Non-functional requirements

- Use Node.js.
- Use TypeScript with `strict` mode enabled.
- Use one official LLM SDK only.
- Prefer the official OpenAI SDK for implementation simplicity and broad reviewer familiarity.
- Use environment variables for API configuration.
- Do not hardcode secrets.
- Keep the LLM client mockable.
- Keep routing deterministic, understandable, and unit-testable.
- Keep orchestration logic testable without making real LLM calls.
- Keep the codebase small and easy to inspect.
- Provide a clear README with setup, usage, test commands, architecture notes, and limitations.

## 4. Explicit non-goals

- No web UI.
- No REST API server.
- No database.
- No authentication.
- No streaming response UI.
- No vector database or retrieval framework.
- No agent framework unless there is a strong reason.
- No real finance or HR integrations.
- No multi-provider abstraction for both OpenAI and Claude.
- No complex planner, memory, tool-use framework, or autonomous loops.
- No attempt to enforce security through prompts alone.

## 5. Assumptions and ambiguities

- The evaluator will run the application locally from the command line.
- Mock data can be small but should include enough numeric and qualitative data to answer meaningful questions.
- "Receives only data" means the prompt payload passed to each agent should include only that department's mock JSON and not the other department's data.
- "Using only that data" means responses must reference allowed fact keys from the provided mock JSON and explicitly state when the data is insufficient.
- The bonus orchestration should be included because it is small and demonstrates senior design judgment.
- Unknown questions should not be sent to a department agent.
- The exact OpenAI model is not specified. Use an environment variable with a documented default.
- The structured response can be represented as JSON in the CLI output for easy evaluation.

## 6. Proposed architecture

Use a simple layered architecture:

- CLI layer:
  - Parses the user question from command-line arguments or interactive prompt.
  - Calls the application service.
  - Prints a structured JSON response.
- Application service:
  - Calls the router.
  - Dispatches to the Finance Agent, HR Agent, both agents, or fallback.
  - Invokes the orchestrator for cross-department questions.
- Router:
  - Deterministic keyword-based classifier.
  - Returns route plus matched signals.
- Agents:
  - Share a common `Agent` interface.
  - Each agent has its own system prompt and is constructed with only its own mock data.
  - `answer()` accepts only the user question; the application service never passes arbitrary data into an agent call.
  - Each agent returns a normalized `AgentResponse`.
- Orchestrator:
  - Combines two grounded agent responses.
  - Produces a `JointResponse`.
  - Uses only validated facts present in the agent responses.
- LLM client:
  - Thin wrapper around the official OpenAI SDK.
  - Mockable interface for tests.
- Data modules:
  - Hardcoded finance JSON.
  - Hardcoded HR JSON.

## 7. End-to-end request flows

### Finance-only question

Example: "Can we afford a bigger marketing budget?"

1. CLI receives the question.
2. Router matches finance terms such as `budget`, `revenue`, `cost`, `profit`, `spend`, or `cash`.
3. Router returns `finance`.
4. Application service calls only `financeAgent.answer(question)`.
5. Finance Agent receives:
   - Finance system prompt.
   - Finance mock JSON from its constructor-owned dependency.
   - User question.
6. Finance Agent receives model output containing `answer`, `factKeys`, `assumptions`, and `confidence`.
7. Application-side agent code validates finance fact keys, resolves real values from finance data, and adds `department: "finance"`.
8. CLI prints JSON.

### HR-only question

Example: "Which teams have the highest attrition risk?"

1. CLI receives the question.
2. Router matches HR terms such as `headcount`, `hiring`, `attrition`, `employees`, `retention`, or `open roles`.
3. Router returns `hr`.
4. Application service calls only `hrAgent.answer(question)`.
5. HR Agent receives:
   - HR system prompt.
   - HR mock JSON from its constructor-owned dependency.
   - User question.
6. HR Agent receives model output containing `answer`, `factKeys`, `assumptions`, and `confidence`.
7. Application-side agent code validates HR fact keys, resolves real values from HR data, and adds `department: "hr"`.
8. CLI prints JSON.

### Cross-department question

Example: "Should we hire more people?"

1. CLI receives the question.
2. Router matches HR terms such as `hire` and also cross-functional decision patterns such as `should we`.
3. Router returns `both`.
4. Application service calls `financeAgent.answer(question)`.
5. Application service calls `hrAgent.answer(question)`.
6. Each agent returns a grounded departmental perspective.
7. Orchestrator combines both responses.
8. Orchestrator may call the LLM with only the two validated agent responses, not raw department data.
9. Orchestrator returns one recommendation with facts copied or summarized only from the agent responses.
10. CLI prints JSON with `department: "both"`.

### Unknown question

Example: "What is the weather tomorrow?"

1. CLI receives the question.
2. Router finds no finance or HR signals.
3. Router returns `unknown`.
4. Application service does not call either agent.
5. Fallback response says the application can answer only finance and HR questions using the mock data.
6. CLI prints JSON with low confidence and no facts used.

## 8. TypeScript domain models and interfaces

Use simple domain types. These are design-level shapes, not implementation code.

- `Department`
  - Values: `finance`, `hr`, `both`, `unknown`
- `Confidence`
  - Values: `low`, `medium`, `high`
- `RouteDecision`
  - `route: Department`
  - `reason: string`
  - `matchedSignals: string[]`
- `GroundedFact`
  - `source: "finance" | "hr"`
  - `label: string`
  - `value: string | number`
  - `path?: string`
- `ModelAgentOutput`
  - `answer: string`
  - `factKeys: string[]`
  - `assumptions: string[]`
  - `confidence: Confidence`
- `AgentResponse`
  - `answer: string`
  - `factsUsed: GroundedFact[]`
  - `assumptions: string[]`
  - `confidence: Confidence`
  - `department: "finance" | "hr"`
- `FinalResponse`
  - `answer: string`
  - `factsUsed: GroundedFact[]`
  - `assumptions: string[]`
  - `confidence: Confidence`
  - `department: Department`
- `Agent`
  - `readonly department: "finance" | "hr"`
  - `answer(question: string): Promise<AgentResponse>`
- `LlmClient`
  - `completeJson(request): Promise<unknown>`

Agent construction should bind department data explicitly:

- `new FinanceAgent(llmClient, financeData)`
- `new HrAgent(llmClient, hrData)`

The application service must never pass department data into `Agent.answer()`.

## 9. Mock finance and HR data design

Keep the mock data small, readable, and intentionally useful.

Finance data should include:

- Company-level period, for example `Q2 FY2026`.
- Revenue.
- Operating expenses.
- Cash balance.
- Burn rate or monthly net cash flow.
- Budget by department.
- Hiring budget or approved hiring spend.
- Margin or profitability indicator.
- Key finance notes.
- A department-specific fact-key allow-list, where each key maps to:
  - a readable label
  - a path or getter into the trusted mock data
  - the resolved value used in `GroundedFact`

Example finance questions supported:

- "What is our revenue?"
- "Can we afford more hiring?"
- "Which department is over budget?"
- "What is our cash runway?"

HR data should include:

- Company-level period.
- Total headcount.
- Headcount by department.
- Open roles by department.
- Attrition rate.
- Engagement score.
- Hiring pipeline status.
- Capacity or workload notes.
- Key HR notes.
- A department-specific fact-key allow-list, where each key maps to:
  - a readable label
  - a path or getter into the trusted mock data
  - the resolved value used in `GroundedFact`

Example HR questions supported:

- "How many open roles do we have?"
- "Where are we understaffed?"
- "Is attrition a concern?"
- "Should we hire more people?"

Avoid huge mock datasets. The point is grounding and isolation, not data volume.

## 10. Agent interface and responsibilities

Each agent should:

- Own one system prompt.
- Own or be constructed with only its department's mock data.
- Accept only the user question at call time.
- Produce a final structured `AgentResponse`.
- Ask the model to return `answer`, `factKeys`, `assumptions`, and `confidence`.
- Validate returned `factKeys` against a department-specific allow-list.
- Resolve valid fact keys to real values from trusted mock data.
- Construct `GroundedFact` objects in application code.
- Add the department field in application code.
- State assumptions.
- Use confidence based on available data.
- Refuse or narrow the answer when the data does not support the question.

Each agent should not:

- Receive another department's data.
- Accept arbitrary department data through `answer()`.
- Call tools or read files directly.
- Decide routing.
- Produce cross-department recommendations alone.
- Invent numbers.
- Trust model-generated fact values.
- Treat system prompts as a security boundary.

## 11. Finance Agent system prompt design

The Finance Agent prompt should instruct the model to:

- Act as a finance analysis assistant.
- Answer only from the provided finance JSON.
- Use numeric values exactly as provided.
- Never infer unavailable financial data.
- If asked for HR-specific information, say it does not have HR data.
- Return only the required raw model structure: `answer`, `factKeys`, `assumptions`, and `confidence`.
- Use only fact keys from the finance allow-list.
- Include fact keys for every factual or numeric claim.
- Distinguish facts from assumptions.
- Use low confidence when the data is incomplete.

Prompt emphasis:

- The prompt is a behavioral instruction.
- Data isolation is enforced by application code, not by trusting the prompt.
- The agent should be transparent about missing finance inputs.

## 12. HR Agent system prompt design

The HR Agent prompt should instruct the model to:

- Act as an HR workforce analysis assistant.
- Answer only from the provided HR JSON.
- Use headcount, attrition, hiring, and engagement values exactly as provided.
- Never infer unavailable financial data.
- If asked for finance-specific information, say it does not have finance data.
- Return only the required raw model structure: `answer`, `factKeys`, `assumptions`, and `confidence`.
- Use only fact keys from the HR allow-list.
- Include fact keys for every factual or numeric claim.
- Distinguish facts from assumptions.
- Use low confidence when the data is incomplete.

Prompt emphasis:

- The prompt guides behavior but does not secure data.
- The application must ensure only HR data is supplied to this agent.

## 13. Routing strategy

Considered options:

- Deterministic keyword routing:
  - Fast, cheap, transparent, easy to test.
  - Limited semantic understanding.
- LLM classifier:
  - More flexible language understanding.
  - Adds cost, latency, possible nondeterminism, and more test complexity.
- Hybrid router:
  - Deterministic first, LLM fallback for ambiguous cases.
  - More robust but slightly more implementation effort.

Chosen approach: deterministic keyword routing.

Reasoning:

- The assessment values understandable and testable routing logic.
- The domain is intentionally small.
- The implementation should fit 2-3 hours.
- Deterministic routing avoids using an LLM for a decision that can be cleanly demonstrated with tests.
- Ambiguous examples can be handled with explicit cross-department keyword sets.

Suggested routing rules:

- Finance signals:
  - `finance`
  - `revenue`
  - `profit`
  - `margin`
  - `cash`
  - `runway`
  - `budget`
  - `expense`
  - `cost`
  - `spend`
  - `burn`
  - `forecast`
- HR signals:
  - `hr`
  - `headcount`
  - `employee`
  - `employees`
  - `hire`
  - `hiring`
  - `open role`
  - `recruit`
  - `attrition`
  - `retention`
  - `engagement`
  - `team capacity`
- Cross-department decision signals:
  - `should we`
  - `can we`
  - `afford to hire`
  - `hire more`
  - `staffing budget`
  - `growth plan`

Decision rules:

- If finance and HR signals are both present, route to `both`.
- If a cross-department decision signal is present with hiring or staffing language, route to `both`.
- If only finance signals are present, route to `finance`.
- If only HR signals are present, route to `hr`.
- Otherwise route to `unknown`.

## 14. Joint recommendation/orchestration strategy

The orchestrator should combine two already-grounded `AgentResponse` objects.

Recommended approach:

- First implementation: LLM-based synthesis with strict input constraints.
- The orchestrator prompt receives only:
  - Original user question.
  - Finance agent response.
  - HR agent response.
- It does not receive raw finance or HR mock data.
- It must not introduce new facts or numbers.
- It must list facts used by reusing the agents' facts.
- It should produce a practical recommendation, for example:
  - proceed
  - proceed with constraints
  - do not proceed
  - insufficient information

Add a post-processing validation step:

- Parse the synthesis output into the expected final response shape.
- Require final facts to come from the already validated agent responses.
- Reject or discard any attempted fact reference that is not present in the validated agent responses.
- Use a safe fallback if synthesis output is invalid, synthesis fails, or unsupported or unverifiable content is detected.

For a 2-3 hour assessment, a simple conservative fallback is acceptable.

The fallback can present:

- Finance perspective.
- HR perspective.
- A conservative recommendation or `insufficient information`.

## 15. Grounding and hallucination-prevention strategy

Use multiple layers:

- Data minimization:
  - Each agent receives only its own department data.
- Prompt requirements:
  - Agents must answer only from provided JSON.
  - Agents must return fact keys, not fact values.
  - Agents must report missing information.
- Structured output:
  - Raw agent model output requires `answer`, `factKeys`, `assumptions`, and `confidence`.
  - Final application responses require `answer`, `factsUsed`, `assumptions`, `confidence`, and `department`.
- Runtime parsing:
  - Parse LLM JSON responses.
  - Reject malformed outputs.
- Fact-key validation:
  - Validate every returned fact key against the department allow-list.
  - Discard or safely reject invalid fact keys.
  - Resolve valid keys to trusted values from mock data.
  - Construct `GroundedFact` objects in application code.
  - Never trust model-generated fact values.
- Orchestration validation:
  - Send only validated `AgentResponse` objects to the orchestrator.
  - Instruct synthesis not to introduce new facts or numeric values.
  - Use a conservative fallback when synthesis cannot be trusted.
- Tests:
  - Verify router behavior.
  - Verify fact-key validation and orchestration fallback behavior in mocked scenarios.

Important design note:

- System prompts help guide the model but are not security boundaries. Isolation comes from application code controlling the data passed to each agent.

## 16. Data-isolation approach

- Place finance mock data in a finance-specific module.
- Place HR mock data in an HR-specific module.
- Instantiate each agent with exactly one department-specific data provider or data constant.
- The application service calls `answer(question)` only.
- Do not pass an `allData` object into agents.
- Do not pass department data through `Agent.answer()`.
- Do not pass raw data into the orchestrator.
- Unit-test that the Finance Agent is constructed with finance data only.
- Unit-test that the HR Agent is constructed with HR data only.
- Unit-test that valid fact keys resolve to values from the trusted department data.
- Unit-test that invalid fact keys are rejected or discarded.
- Keep the LLM client interface narrow so tests can inspect payload construction.

## 17. Error handling and API failure behavior

Handle:

- Missing `OPENAI_API_KEY`.
  - Print a clear setup error.
- LLM API failure.
  - Return a structured low-confidence response explaining the model call failed.
- Invalid JSON from the LLM.
  - Return a structured low-confidence response explaining the response could not be parsed.
- Invalid fact keys from the LLM.
  - Discard invalid keys or return a safe low-confidence response, depending on whether enough valid facts remain.
- Unsupported question.
  - Return `unknown` response without calling an LLM.
- Empty question.
  - Return a CLI validation error.

Avoid exposing stack traces in normal CLI output. Keep useful debug details available in test output or optional development logs.

## 18. Suggested project/file structure

```text
.
├── README.md
├── PLAN.md
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env.example
├── src
│   ├── cli.ts
│   ├── app.ts
│   ├── domain.ts
│   ├── data
│   │   ├── financeData.ts
│   │   └── hrData.ts
│   ├── llm
│   │   ├── LlmClient.ts
│   │   └── OpenAiLlmClient.ts
│   ├── agents
│   │   ├── Agent.ts
│   │   ├── FinanceAgent.ts
│   │   ├── HrAgent.ts
│   │   └── prompts.ts
│   ├── routing
│   │   └── router.ts
│   ├── orchestration
│   │   ├── orchestrator.ts
│   │   └── groundingValidation.ts
│   └── utils
│       └── parseJsonResponse.ts
└── tests
    ├── router.test.ts
    ├── agents.test.ts
    ├── orchestrator.test.ts
    └── groundingValidation.test.ts
```

## 19. Testing strategy

Use Vitest.

Unit tests:

- Router tests:
  - Finance-only routes to `finance`.
  - HR-only routes to `hr`.
  - Hiring affordability routes to `both`.
  - Weather or unrelated question routes to `unknown`.
  - Ambiguous finance plus HR question routes to `both`.
- Agent payload tests:
  - Finance Agent `answer()` receives only a question at call time.
  - Finance Agent owns or is constructed with finance data only.
  - HR Agent `answer()` receives only a question at call time.
  - HR Agent owns or is constructed with HR data only.
  - Valid finance fact keys resolve to values from finance mock data.
  - Valid HR fact keys resolve to values from HR mock data.
  - Invalid fact keys are rejected or discarded.
  - Model-generated fact values are never trusted.
  - Agent parses valid LLM JSON into `AgentResponse`.
  - Agent returns safe fallback on invalid LLM JSON.
- Orchestrator tests:
  - Combines two mocked agent responses.
  - Preserves facts used from both agents.
  - Does not introduce facts absent from agent responses.
  - Receives validated `AgentResponse` objects only.
  - Falls back safely when synthesis fails.
  - Falls back safely when synthesis output is invalid or contains unsupported fact references.
- App service tests:
  - Unknown route does not call LLM.
  - Finance route calls only Finance Agent.
  - HR route calls only HR Agent.
  - Both route calls both agents and orchestrator.

Manual validation:

- Run CLI with finance-only question.
- Run CLI with HR-only question.
- Run CLI with cross-department question.
- Run CLI with unrelated question.

## 20. README structure

README should include:

- Overview.
- Setup.
- Commands.
- Examples.
- Architecture summary.
- Routing.
- Data isolation.
- Grounding.
- Orchestration.
- Tests.
- Trade-offs.
- Limitations.

Keep the README concise and practical. It should help an evaluator run and understand the project quickly, not become a long-form architecture document.

## 21. Trade-offs and rejected alternatives

Rejected: LLM classifier router.

- Reason:
  - Less deterministic.
  - Harder to test.
  - Adds another prompt and another API dependency point.
  - Overkill for the small known domain.

Rejected: hybrid router.

- Reason:
  - Good production direction, but unnecessary for a small assessment.
  - Adds ambiguity handling and additional test surface.

Rejected: full agent framework.

- Reason:
  - The task needs two isolated prompt callers and one orchestrator, not a planning framework.
  - Frameworks can obscure the simple architecture evaluators want to inspect.

Rejected: database or vector search.

- Reason:
  - The assessment explicitly says no database.
  - Data is hardcoded mock JSON.

Rejected: building both OpenAI and Claude clients.

- Reason:
  - The assessment says use either one.
  - Supporting both adds configuration, tests, and abstraction not needed for the goal.

## 22. Production evolution path

Potential future improvements:

- Replace mock JSON with department-specific tools or APIs.
- Add authorization around department data access.
- Add audit logs for prompts, facts used, and model responses.
- Add schema validation with a library such as Zod.
- Add tracing for routing, agent calls, and orchestration.
- Add a hybrid router for larger taxonomies.
- Add more departments using the same `Agent` interface.
- Add stronger factuality checks using structured citations and source IDs.
- Add retry logic and rate-limit handling.
- Add evaluation datasets for routing accuracy and answer grounding.

## 23. Time-boxed implementation sequence

### Step 1: Initialize project

- Goal:
  - Create the minimal Node.js TypeScript project foundation.
- Files likely to be created or changed:
  - `package.json`
  - `tsconfig.json`
  - `vitest.config.ts`
  - `.env.example`
  - `README.md`
- Main interfaces/functions:
  - None yet.
- Dependencies:
  - `typescript`
  - `tsx`
  - `vitest`
  - `@types/node`
  - `openai`
  - `dotenv`
- Tests or validation required:
  - `npm run typecheck`
  - `npm test`
- Risks or common mistakes:
  - Forgetting `strict: true`.
  - Adding unnecessary build tooling.
  - Hardcoding API keys.

### Step 2: Define domain models

- Goal:
  - Establish shared types for routing, agents, facts, and final responses.
- Files likely to be created or changed:
  - `src/domain.ts`
- Main interfaces/functions:
  - `Department`
  - `Confidence`
  - `RouteDecision`
  - `GroundedFact`
  - `ModelAgentOutput`
  - `AgentResponse`
  - `FinalResponse`
  - `Agent`
- Dependencies:
  - TypeScript only.
- Tests or validation required:
  - Typecheck.
- Risks or common mistakes:
  - Making types too generic.
  - Allowing `any` to leak through the app.
  - Reintroducing any request object that carries arbitrary department data.
  - Mixing raw model responses with validated domain responses.

### Step 3: Add mock data

- Goal:
  - Provide small finance and HR datasets that support meaningful questions.
- Files likely to be created or changed:
  - `src/data/financeData.ts`
  - `src/data/hrData.ts`
- Main interfaces/functions:
  - `financeData`
  - `hrData`
- Dependencies:
  - Domain types if desired.
- Tests or validation required:
  - Typecheck.
  - Manual review that data contains enough fields for sample questions.
- Risks or common mistakes:
  - Creating overly large mock data.
  - Duplicating finance values in HR data or HR values in finance data.
  - Using vague labels that make facts hard to cite.

### Step 4: Implement deterministic router

- Goal:
  - Route user questions to finance, HR, both, or unknown using transparent rules.
- Files likely to be created or changed:
  - `src/routing/router.ts`
  - `tests/router.test.ts`
- Main interfaces/functions:
  - `routeQuestion(question): RouteDecision`
- Dependencies:
  - `src/domain.ts`
  - Vitest.
- Tests or validation required:
  - Finance-only route test.
  - HR-only route test.
  - Cross-department route test.
  - Unknown route test.
  - Ambiguous mixed-signal route test.
- Risks or common mistakes:
  - Making route decisions depend on an LLM.
  - Failing to normalize case.
  - Matching substrings too loosely.
  - Routing hiring affordability questions only to HR.

### Step 5: Create mockable LLM client interface

- Goal:
  - Keep OpenAI usage behind a small interface so tests can mock model responses.
- Files likely to be created or changed:
  - `src/llm/LlmClient.ts`
  - `src/llm/OpenAiLlmClient.ts`
- Main interfaces/functions:
  - `LlmClient`
  - `OpenAiLlmClient.completeJson(...)`
- Dependencies:
  - `openai`
  - `dotenv`
- Tests or validation required:
  - Typecheck.
  - Mock client used in agent tests.
- Risks or common mistakes:
  - Sprinkling OpenAI SDK calls throughout the app.
  - Returning raw strings everywhere.
  - Making tests require a real API key.

### Step 6: Add agent prompts and shared agent interface

- Goal:
  - Define clear department-specific behavior and a common agent contract.
- Files likely to be created or changed:
  - `src/agents/Agent.ts`
  - `src/agents/prompts.ts`
- Main interfaces/functions:
  - `Agent`
  - `financeSystemPrompt`
  - `hrSystemPrompt`
- Dependencies:
  - Domain models.
- Tests or validation required:
  - Prompt review.
  - Typecheck.
- Risks or common mistakes:
  - Relying on prompts as the only data isolation mechanism.
  - Writing prompts that allow unsupported inference.
  - Forgetting to require `factKeys` instead of model-generated fact values.

### Step 7: Implement Finance Agent

- Goal:
  - Build the finance-only agent using the shared LLM client.
- Files likely to be created or changed:
  - `src/agents/FinanceAgent.ts`
  - `tests/agents.test.ts`
- Main interfaces/functions:
  - `FinanceAgent.answer(question: string)`
- Dependencies:
  - `LlmClient`
  - `financeData`
  - `financeSystemPrompt`
  - Finance fact-key allow-list and resolver.
  - JSON parse utility.
- Tests or validation required:
  - Finance Agent `answer()` receives only a question at call time.
  - Finance Agent is constructed with finance data only.
  - Finance Agent does not include HR data in its LLM prompt.
  - Valid JSON response with valid fact keys parses.
  - Valid finance fact keys resolve to trusted finance values.
  - Invalid finance fact keys are rejected or discarded.
  - Model-generated fact values are ignored if present.
  - Invalid JSON response becomes safe fallback.
- Risks or common mistakes:
  - Passing combined data into the agent.
  - Passing data through `answer()`.
  - Letting malformed LLM output crash the CLI.
  - Trusting model-generated fact values.
  - Not preserving `department: "finance"`.

### Step 8: Implement HR Agent

- Goal:
  - Build the HR-only agent using the shared LLM client.
- Files likely to be created or changed:
  - `src/agents/HrAgent.ts`
  - `tests/agents.test.ts`
- Main interfaces/functions:
  - `HrAgent.answer(question: string)`
- Dependencies:
  - `LlmClient`
  - `hrData`
  - `hrSystemPrompt`
  - HR fact-key allow-list and resolver.
  - JSON parse utility.
- Tests or validation required:
  - HR Agent `answer()` receives only a question at call time.
  - HR Agent is constructed with HR data only.
  - HR Agent does not include finance data in its LLM prompt.
  - Valid JSON response with valid fact keys parses.
  - Valid HR fact keys resolve to trusted HR values.
  - Invalid HR fact keys are rejected or discarded.
  - Model-generated fact values are ignored if present.
  - Invalid JSON response becomes safe fallback.
- Risks or common mistakes:
  - Copy-paste errors from Finance Agent.
  - Wrong prompt or wrong department label.
  - Accidentally importing finance data.
  - Trusting model-generated fact values.

### Step 9: Implement grounding validation

- Goal:
  - Validate department-specific fact keys, resolve trusted values from mock data, and construct `GroundedFact` objects.
- Files likely to be created or changed:
  - `src/orchestration/groundingValidation.ts`
  - `tests/groundingValidation.test.ts`
- Main interfaces/functions:
  - `validateFactKeys(department, factKeys)`
  - `resolveGroundedFacts(department, validFactKeys)`
  - `buildAgentResponse(modelOutput, department, data)`
- Dependencies:
  - Domain models.
  - Department fact-key allow-lists.
  - Mock data modules.
- Tests or validation required:
  - Accepts valid finance fact keys.
  - Accepts valid HR fact keys.
  - Rejects or discards invalid fact keys.
  - Resolves valid keys to values from trusted mock data.
  - Constructs `GroundedFact` objects itself.
  - Ignores model-generated fact values.
- Risks or common mistakes:
  - Building a general-purpose hallucination-detection engine.
  - Parsing arbitrary numbers from natural-language answers.
  - Trusting the model as the source of truth for fact values.
  - Sharing one fact-key allow-list across departments.

### Step 10: Implement orchestrator

- Goal:
  - Combine Finance and HR responses into one recommendation for cross-department questions.
- Files likely to be created or changed:
  - `src/orchestration/orchestrator.ts`
  - `tests/orchestrator.test.ts`
- Main interfaces/functions:
  - `combineDepartmentResponses(question, financeResponse, hrResponse)`
- Dependencies:
  - `LlmClient`
  - `groundingValidation`
  - Domain models.
- Tests or validation required:
  - Combines mocked agent responses.
  - Includes facts from both departments.
  - Returns `department: "both"`.
  - Receives validated `AgentResponse` objects only.
  - Falls back when synthesis fails.
  - Falls back when synthesis output is invalid or includes unsupported fact references.
- Risks or common mistakes:
  - Passing raw finance and HR data to the orchestrator.
  - Letting the orchestrator invent new facts.
  - Reintroducing broad hallucination-scanning complexity.
  - Producing vague recommendations with no facts used.

### Step 11: Implement application service

- Goal:
  - Wire router, agents, orchestrator, and fallback behavior into one request handler.
- Files likely to be created or changed:
  - `src/app.ts`
  - `tests/app.test.ts`
- Main interfaces/functions:
  - `answerQuestion(question): Promise<FinalResponse>`
- Dependencies:
  - Router.
  - Agents.
  - Orchestrator.
- Tests or validation required:
  - Unknown route skips LLM calls.
  - Finance route calls only Finance Agent.
  - HR route calls only HR Agent.
  - Both route calls both agents and orchestrator.
  - Agent calls pass only the question, not department data.
  - Orchestrator receives validated agent responses, not raw data.
- Risks or common mistakes:
  - Letting routing logic leak into CLI.
  - Calling both agents for every question.
  - Passing arbitrary data into `Agent.answer()`.
  - Returning inconsistent response shapes.

### Step 12: Implement CLI

- Goal:
  - Provide a simple executable interface for evaluator use.
- Files likely to be created or changed:
  - `src/cli.ts`
  - `package.json`
- Main interfaces/functions:
  - CLI entrypoint.
  - Argument parsing for question text.
- Dependencies:
  - `answerQuestion`
  - `dotenv`
- Tests or validation required:
  - Manual run with sample questions.
  - Typecheck.
- Risks or common mistakes:
  - Building an unnecessary interactive UI.
  - Poor handling of quoted questions.
  - Printing unstructured prose instead of JSON.

### Step 13: Write README

- Goal:
  - Explain how to run, test, and evaluate the solution concisely.
- Files likely to be created or changed:
  - `README.md`
- Main interfaces/functions:
  - Not applicable.
- Dependencies:
  - Final project commands.
- Tests or validation required:
  - Follow README commands locally.
  - Confirm examples match actual CLI behavior.
- Risks or common mistakes:
  - Omitting API key setup.
  - Failing to explain routing and data isolation.
  - Turning the README into a long-form architecture document.
  - Overstating production readiness.

### Step 14: Final validation

- Goal:
  - Confirm the solution meets the assessment with minimal scope.
- Files likely to be created or changed:
  - Possibly minor fixes only.
- Main interfaces/functions:
  - Not applicable.
- Dependencies:
  - Full project.
- Tests or validation required:
  - `npm test`
  - `npm run typecheck`
  - Manual CLI examples.
  - Review that no HR data is passed to Finance Agent and no finance data is passed to HR Agent.
  - Review that no data is passed through `Agent.answer()`.
  - Review that fact keys are validated and resolved from mock data.
  - Review that the grounding module does not parse arbitrary numbers from natural-language answers.
- Risks or common mistakes:
  - Leaving dead code.
  - Adding unrequested features late.
  - Forgetting to document limitations.

## 24. Definition of done and acceptance criteria

The implementation is done when:

- The project runs as a TypeScript CLI.
- Finance-only questions route to the Finance Agent.
- HR-only questions route to the HR Agent.
- Cross-department questions route to both agents and the orchestrator.
- Unknown questions return a safe fallback without an LLM call.
- Finance Agent receives only finance mock data.
- HR Agent receives only HR mock data.
- Agent `answer()` methods accept only the user question.
- Department data is supplied through construction or internal department-specific dependencies.
- Raw model output contains `answer`, `factKeys`, `assumptions`, and `confidence`.
- Returned fact keys are validated against department-specific allow-lists.
- Valid fact keys are resolved to real values from trusted mock data.
- Model-generated fact values are never trusted.
- Cross-department final answers use only facts grounded in agent responses.
- The orchestrator receives validated `AgentResponse` objects only, not raw department data.
- Responses include:
  - `answer`
  - `factsUsed`
  - `assumptions`
  - `confidence`
  - `department`
- Routing has unit tests.
- Orchestration has unit tests.
- Fact-key validation and fact resolution have unit tests.
- Data isolation is documented and tested.
- README concisely explains setup, usage, architecture summary, routing, data isolation, grounding, orchestration, tests, trade-offs, and limitations.
- No database, UI, production infrastructure, or unnecessary framework is included.

## Concise implementation checklist

- Initialize strict TypeScript Node project.
- Add OpenAI SDK behind a mockable `LlmClient`.
- Define domain models.
- Add hardcoded finance and HR mock data.
- Implement deterministic router.
- Add Finance Agent with finance-only data.
- Add HR Agent with HR-only data.
- Add orchestrator for cross-department recommendations.
- Add fact-key validation and trusted fact resolution.
- Add CLI entrypoint.
- Add unit tests for routing, agent payload isolation, orchestration, and fallback behavior.
- Add README with setup, examples, architecture, and limitations.
- Run typecheck, tests, and manual CLI examples.

## Unnecessary features to avoid

- Web UI.
- API server.
- Database.
- Vector search.
- Auth system.
- Real HR or finance integrations.
- Multi-LLM provider support.
- Full agent framework.
- Persistent memory.
- Streaming output.
- Complex natural-language router.
- Overly large mock datasets.
- Production deployment files.

## Five highest-risk mistakes

1. Accidentally exposing cross-department data to the wrong agent or to the orchestrator.
2. Trusting model-generated fact values instead of resolving values from trusted mock data.
3. Accepting invalid fact keys without rejection, discard, or safe fallback behavior.
4. Allowing the orchestrator to introduce unsupported facts or numeric values.
5. Overcomplicating the solution beyond the assessment scope.
