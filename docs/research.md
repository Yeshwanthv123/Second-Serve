# Research and design decision

Research performed September 11–12, 2026 using the selected GitHub connector and public primary documentation. This is a representative landscape review, not an exhaustive claim to have found every possible GitHub solution.

## Candidates considered

| Direction | End-to-end work | Demo strength | Main implementation risk |
|---|---|---|---|
| Surplus-food rescue coordination | Intake → constraints → pickup proposal → approval → reservation → manifests → handoff ledger | Visible neighborhood map, time pressure, understandable human benefit | Real partner availability, driver scheduling, and food handling require operational validation |
| Volunteer scheduling | Intake → availability matching → shift roster → confirmations | Clear practical value and scheduling artifacts | External messaging and real calendars make credential-free judging harder |
| Household administrative assistant | Documents → task extraction → applications or correspondence | Relatable recurring problem | Sensitive data, external permissions, and high-stakes domain boundaries broaden scope |

**Selected: Second Serve.** It supports a complete local state-changing workflow without needing private accounts to demonstrate it. Its strongest story is reducing coordination effort for community kitchens. This has not been validated through user interviews and is not a promise of winning.

## GitHub references

- [strands-agents/samples](https://github.com/strands-agents/samples): official examples of Strands agents, tool calling, integrations, and full-stack demos. Used to verify supported architecture patterns; no sample application was copied.
- [strands-agents/tools](https://github.com/strands-agents/tools): community tool library. We chose narrow custom tools instead of installing broad shell/browser capabilities.
- [aws-samples/sample-strands-agent-with-agentcore](https://github.com/aws-samples/sample-strands-agent-with-agentcore): deployment reference identified through the GitHub search connector. AgentCore is a possible next step, not a required local runtime.
- [aws-samples/sample-strands-agentcore-starter](https://github.com/aws-samples/sample-strands-agentcore-starter): official full-stack starter demonstrating Strands, FastAPI, and AgentCore integration. Its cloud infrastructure and conversational UI differ from this local React/SQLite task surface.
- [awslabs/agentcore-samples](https://github.com/awslabs/agentcore-samples): deployment and operations examples. Informational reference only.
- [jackgoldsmith4/LMFR_Data_Tools](https://github.com/jackgoldsmith4/LMFR_Data_Tools), [vtshah/CommunityFoodRescue](https://github.com/vtshah/CommunityFoodRescue), and [shubbhhh/Surplus_Food-Donation](https://github.com/shubbhhh/Surplus_Food-Donation): adjacent repositories found by searches for “food rescue language:Python” and “surplus food donation.” Search metadata was reviewed; these codebases were **not audited or reused**. A README fetch for LMFR_Data_Tools returned 404, so no deeper functionality claim is made about it.

## Primary technical references

- [Strands custom model providers](https://strandsagents.com/docs/user-guide/concepts/model-providers/custom_model_provider/): model stream interface. The offline provider implements the installed, pinned Python SDK's abstract interface and is tested through the actual `Agent` loop.
- [Strands custom tools](https://strandsagents.com/docs/user-guide/concepts/tools/custom-tools/): tool decoration and execution patterns.
- [Strands tool overview](https://strandsagents.com/docs/user-guide/concepts/tools/): tools execute with host permissions, motivating a narrow allowlist.
- [Strands examples overview](https://strandsagents.com/docs/examples/): supported examples and deployments.

Public documentation can evolve. Implementation details were checked against the installed `strands-agents==1.13.0` source and exercised by local tests, rather than assuming the newest documentation matches a pinned release.

## What differentiates this prototype

The result is a coordinator's work surface, not a chat transcript. Agent tool calls lead to durable proposals, human-approved inventory reservations, downloadable pickup records, and a handoff ledger. Approval rechecks hard constraints transactionally. The demo openly distinguishes scripted orchestration, live model inference, and completed physical work.

The UI is original: warm paper surfaces, restrained forest and sage tones, locally bundled typography, a neighborhood map, animated plan routes, and purposeful status transitions. It uses no borrowed screenshot, template, or existing food-rescue source.

## Questions pressure-tested

1. **Who actually benefits?** Coordinators who currently reconcile surplus quantities, capacity, dietary constraints, and deadlines across separate records. User validation is still needed.
2. **What work does it complete?** Recordkeeping and coordination artifacts through confirmation. It does not transport food or communicate with partners.
3. **What prevents a convincing but wrong plan?** Deterministic feasibility checks, server-side revalidation, and atomic approval. The model summary is not authoritative state.
4. **What happens when two plans overlap?** One can reserve; the stale approval receives 409 without partial writes.
5. **Can judges run it without credentials?** Yes, using an explicitly scripted model with the real Strands loop. A live Bedrock run remains necessary to demonstrate actual LLM behavior.
6. **Does the map imply unavailable capabilities?** The map now uses real OpenStreetMap tiles; direct connections, distance and travel-time estimates are labelled, and trips are independent.
7. **Are impact numbers inflated?** Only coordinator-confirmed handoffs count as rescued portions. No conversion into people fed, verified meals, kilograms, or carbon savings is claimed.


## Location and account iteration (September 12, 2026)

The original fixed-city sample made the application look static. The revised implementation adds local accounts, private workspaces, first-sign-in location selection, explicit sample-data loading, receiving-partner intake and a real Leaflet map.

- [Open-Meteo geocoding API](https://open-meteo.com/en/docs/geocoding-api): city/postcode queries, coordinates, administrative area and country metadata. Requests occur after a Search click and pass through the backend cache.
- [Open-Meteo pricing](https://open-meteo.com/en/pricing): the free endpoint is for non-commercial usage with request limits; no availability guarantee. Application limits are conservative and documented.
- [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/): visible attribution, HTTPS raster endpoint, ordinary browser caching/referrers and no bulk/offline prefetch. Tile endpoint is configurable.
- [Leaflet](https://leafletjs.com/): interactive map, markers, pan/zoom and clickable location pins; BSD license retained in the frontend distribution.

Neither geocoding nor map tiles establish that food is available or a community group has agreed to receive it. Those remain user-entered facts. The live geocoder was exercised through the running Docker application for Pune, Maharashtra, India.


## Real local LLM iteration

The user chose local inference without an API key. The selected [Qwen3 4B Instruct model](https://ollama.com/library/qwen3:4b-instruct) advertises tool support, 2.5 GB quantized weights and an Apache-2.0 license. The installed Strands 1.13.0 SDK contains the official [OllamaModel provider](https://strandsagents.com/docs/user-guide/concepts/model-providers/ollama/); Ollama Python 0.5.4 supplies its runtime dependency. [Ollama 0.11.10](https://github.com/ollama/ollama/releases/tag/v0.11.10) is pinned for the Docker runtime.

The model receives tool definitions and actual account records. Coordinator text can select a preferred recipient, while deterministic code validates the ID and enforces dietary, distance, deadline and capacity limits. A live acceptance script exercises two model runs with different preferences on the same inventory; its evidence is separate from scripted unit tests. The default no longer silently presents a scripted model as the agent.
