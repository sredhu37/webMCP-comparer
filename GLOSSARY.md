# webMCP-comparer

Compares how an AI agent completes the same task on the same website with and without the site's WebMCP tools.

## Language

**Suite**:
One YAML file describing a single target site, the model settings and a list of Scenarios.
_Avoid_: Config, test file, plan

**Scenario**:
One plain-language task to perform on the Suite's site, with its own Prompt and an optional success check.
_Avoid_: Test case, job, task

**Prompt**:
The instructions given to the agent for one Scenario; each Scenario has its own, and both Lanes receive it unchanged.
_Avoid_: Instruction, query

**Success check**:
Conditions defined in a Scenario that decide whether a Lane passed; when a Scenario has none, the Lane's agent's own report decides.
_Avoid_: Assertion, validation, judge

**Outcome**:
The result of one Lane for one Scenario: Pass, or Fail with a reason.
_Avoid_: Status, verdict, result

**Lane**:
One side of a Scenario's comparison, running its own agent and its own Chrome instance.
_Avoid_: Side, track, variant

**Baseline lane**:
The left Lane, whose agent has Browser tools only.
_Avoid_: Normal flow, control, non-MCP lane

**WebMCP lane**:
The right Lane, whose agent has Browser tools plus the target site's WebMCP tools.
_Avoid_: MCP lane, treatment

**Browser tools**:
The generic page actions given identically to both Lanes: screenshot, click, type, read page structure, navigate.
_Avoid_: DOM tools, default tools

**WebMCP tools**:
Tools the target site itself registers through the WebMCP browser API.
_Avoid_: MCP tools, site tools

**Run**:
One execution of a selected set of Scenarios from a Suite, both Lanes in parallel per Scenario, producing one log and one results file.
_Avoid_: Session, execution, batch
