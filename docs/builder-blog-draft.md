# Agents for Humans: Giving Surplus Food a Second Chance with Strands

**Draft for the project owner. Do not publish as a completed AWS deployment report until you have configured and tested live Bedrock.**

Food rescue is a coordination problem with a clock attached. A kitchen has surplus food; a community partner has capacity; someone has to reconcile quantities, ingredients, pickup windows, and distance. We built Second Serve to make that workflow concrete and reviewable.

The product starts with account creation and a location choice. A free Open-Meteo city lookup, optional browser location, and a real OpenStreetMap view bring the workspace to the coordinator’s area. New accounts start empty; users add their own partner capacity and food listings. It is a work surface for a coordinator, rather than a chatbot. A donor enters available portions and a pickup window. The coordinator can ask the agent to prepare the next rescue.

Strands Agents provides the orchestration loop. We gave the agent three tools: inspect surplus, inspect recipient needs, and create a rescue proposal. The planning tool checks database facts and produces structured allocations. A model-generated sentence is never allowed to become an inventory reservation by itself.

That separation was the most useful architectural decision. The model can organize tool use and explain the result; deterministic code enforces quantities, dietary compatibility, distance, and deadlines. Approval is a separate human action. The backend checks the plan again inside a transaction, so two proposals cannot reserve the same food. Failed approvals roll back the whole operation.

The local application runs with frontend, backend and Ollama services, plus a first-start model-download job. Nginx serves a React and TypeScript frontend and proxies to FastAPI. SQLite persists listings, partner capacity, run events, pickup manifests, and handoff confirmations. A completed pickup changes the impact dashboard only when a coordinator records the handoff.

The default provider is now a real local Qwen3 4B Instruct model served by Ollama through Strands. It selects tools, resolves natural-language partner preferences to actual database IDs, and summarizes the saved plan. Model responses and the model ID are recorded alongside tool events. An explicit scripted provider remains for fast unit tests; it is never an automatic fallback. Amazon Bedrock remains an optional cloud provider.

**Before publication, replace this paragraph with your verified AWS experience:** which AWS region and accessible model you used, what a real tool-calling run looked like, any permissions or latency issues you encountered, and what you measured. The development session did not have AWS credentials, so a successful live Bedrock run must not be claimed yet.

We deliberately limited the first version. It does not assign drivers, message partners, certify food safety, or perform live road routing. Its real work is the administrative loop: intake, matching, review, inventory reservation, pickup paperwork, and handoff records. Optional sample partners are explicitly fictional and appear around the selected area. Accounts have separate SQLite workspaces, and even Strands executor threads explicitly bind the owning account’s database.

The next step is to test that workflow with actual coordinators. AgentCore could provide a managed runtime for the agent, with authenticated domain tools and durable application data stored outside the runtime. That is a future deployment path, not something already deployed in this version.

The broader lesson is that an agent becomes useful when its work has inspectable consequences. Second Serve's result is a saved pickup plan and a handoff record, with a person retaining the final decision. Good food deserves another chance; software should make the coordination easier to complete.

Before posting on builder.aws, add the public repository link, your live demonstration link, a diagram, and verified AWS implementation details. Keep “Agents for Humans” in the published title.
