# Demonstrating the real local LLM

Second Serve now defaults to **Qwen3 4B Instruct in Ollama**, using the official Strands `OllamaModel` provider. No API key or paid inference endpoint is required. A local LLM still needs downloaded weights, memory and CPU time.

## Start

```sh
docker compose up --build
```

Open http://localhost:8080. On the first start, the `model-init` service downloads approximately 2.5 GB of model weights into a persistent volume. The agent card shows whether the configured model is installed. Wait for readiness before recording. If an existing `.env` contains `AGENT_MODE=demo`, change it to `AGENT_MODE=ollama` and recreate the backend.

Do not delete your data volume. Existing accounts, food and partners remain in place. Older runs retain their original provider label; they do not become LLM runs retroactively.

## What the LLM actually does

1. It receives the available Strands tool definitions and coordinator context.
2. It requests tools to inspect the current account's food and recipient records.
3. It can resolve a natural-language partner preference to the actual recipient ID and pass that ID into the planning tool.
4. The tool validates the ID and computes allocations using capacity, allergens, diet, pickup deadlines and maximum distance.
5. The LLM reads the saved proposal and writes a summary of matches, unmet needs and next steps.

The model never approves its own plan or records physical delivery. A human still approves reservations and confirms handoffs. Natural-language interpretation can be wrong; review the actual proposal. Requests beyond partner priority are not guaranteed to be supported.

The run panel records the configured model ID, completed model responses, requested tool names, elapsed time, tool outcomes and final answer. It does not show private model reasoning. Ollama failures remain failures; there is no automatic switch to the scripted provider.

## A clear video scenario

Use a separate demo account and fictional records. Keep the food pickup window at two hours or longer while recording.

| Record | Values |
|---|---|
| Food donor | Corner Restaurant; 30 vegetable lunch boxes; vegetarian; no declared allergens |
| First partner | Nearby Community Kitchen; capacity 40; pin near the donor |
| Second partner | Night Shelter; capacity 20; vegetarian only; excludes nuts; pin slightly farther away but within the 5 km trip limit |

Run once without a preference and show the nearest suitable partner. **Do not approve this first proposal.** Enter this in **What should the coordinator know?**:

> Prioritize Night Shelter for dinner tonight. Send as many suitable portions there as its capacity allows, then use other partners for the rest.

Run again. Review whether the LLM selected Night Shelter's actual ID. The expected feasible split is 20 portions to the shelter and 10 to the other kitchen. The preference changes recipient order; capacity remains enforced.

Approve the second proposal, open the pickup board, confirm the two practice handoffs, refresh, and export the records. Clearly describe these as fictional demonstration records, not real deliveries.

## Suggested 4 minute 40 second recording

| Time | Show |
|---|---|
| 0:00–0:25 | Explain the problem: coordinators reconcile extra food, receiving capacity, ingredients and collection deadlines. |
| 0:25–0:50 | Login, live city search and your personalized map. Explain that food availability is entered by people. |
| 0:50–1:25 | The two partner records and food listing; show capacity and dietary fields. |
| 1:25–2:35 | Run the real local LLM, then demonstrate the partner preference. Show model ID, tool responses and the written summary. If inference is slow, transparently trim the waiting period or use a labelled time-lapse. |
| 2:35–3:25 | Review the allocation, approve it and show saved pickup records. |
| 3:25–4:05 | Confirm practice handoffs, refresh the impact page and export the manifest. |
| 4:05–4:40 | Show the architecture: React, FastAPI, private SQLite, Strands and Ollama. Explain human approval and the optional Bedrock integration. |

## Repeatable real-inference acceptance check

With the application running and backend Python dependencies installed locally:

```sh
python scripts/verify_live_llm.py
```

This check passed on the development machine: 3 model responses per run, approximately 34 and 31 seconds, and the requested 20/10 split. See [recorded evidence](live-llm-evidence.json). Timing and generated wording can vary.

The script creates a separate test account and runs the model twice. It asserts that the second run interprets the named preference, enforces capacity, reserves and completes the chosen pickups, and rejects approval of the now-stale first plan. It writes `artifacts/live-llm-verification.json` only on success. Its provider and model responses are real; ordinary unit tests use mocked/scripted responses and are separate evidence.

## Provider choice and attribution

The required Strands framework is used in all modes. Local inference does not claim AWS deployment or AgentCore usage. Bedrock remains an optional LLM provider that needs AWS authorization. The `demo` setting is explicitly scripted and exists for fast tests; do not present it as model-driven AI.

Sources: [Strands Ollama provider](https://strandsagents.com/docs/user-guide/concepts/model-providers/ollama/), [Qwen3 4B Instruct weights and Apache license](https://ollama.com/library/qwen3:4b-instruct), [Ollama Docker setup](https://docs.ollama.com/docker).
