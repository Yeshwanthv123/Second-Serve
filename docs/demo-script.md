# Demo video — target 4 minutes 35 seconds

Do not record credentials or `.env`. Use fictional records. The default provider is now a real local Qwen3 LLM through Ollama and Strands. Follow [the current local LLM recording guide](live-agent.md) for a preference-driven demonstration. If explicitly choosing `AGENT_MODE=demo`, disclose that its provider is scripted.

| Time | Screen | Narration / action |
|---|---|---|
| 0:00–0:25 | Login / create account | “Good food should reach a table. But a community coordinator has to juggle surplus quantities, pickup deadlines, dietary needs, and who has room to accept a delivery. Second Serve handles the coordination record from first listing to confirmed handoff.” |
| 0:25–0:45 | First sign-in / location search | Search for your city and select a live result. “Choose where you coordinate. This is a real city lookup and map, and each account starts empty. I can add our own food and partners, or explicitly load fictional sample records for this walkthrough.” |
| 0:45–1:15 | List surplus form | Add “Corner Kitchen,” 20 vegetable rice portions, a two-hour window, vegetarian, no declared allergens, actual demo coordinates. “A donor gives us the quantities, ingredients, collection point, and pickup deadline.” |
| 1:15–1:35 | Network / settings | Point out the nut exclusion and vegetarian rule at Asha. Show the trip radius and enter a preferred partner in the coordinator context. “A nearby recipient is not automatically the right recipient. Capacity, diet, and time all have to work.” |
| 1:35–2:10 | Run rescue agent / events | “Strands orchestrates three bounded tools. They inspect surplus, inspect recipient needs, and create a plan. The local Qwen3 model chooses the tool calls and summarizes the result. The visible trace is actual persisted tool output.” |
| 2:10–2:40 | Proposed allocations | Show the matched portions, trips, and estimates. “Every proposed allocation is checked by code. The map uses OpenStreetMap geography; connection lines are direct, and travel estimates do not use live traffic. This is an explainable first-pass planner, not a fleet optimizer.” |
| 2:40–3:05 | Approve & create pickups | “The agent cannot approve itself. When I approve, the backend rechecks the entire plan and reserves quantities in one transaction. If another plan took that inventory or a deadline passed, this approval fails without partial reservations.” |
| 3:05–3:40 | Pickup board / export | “Now we have real pickup records, not just a suggestion in chat. I can download the manifest for our team. People still coordinate transport and verify handling. The application does not claim to send messages or assign a driver.” Confirm one handoff. |
| 3:40–4:00 | Impact dashboard | “Only a confirmed handoff counts toward rescued portions. Refreshing the page preserves the record. We don't turn these numbers into unsupported claims about people fed or emissions avoided.” |
| 4:00–4:20 | Architecture SVG / repo | “The stack is React and TypeScript, FastAPI, SQLite, and Strands Agents. Docker Compose starts both services. Automated tests cover the complete workflow, stale plans, concurrent approval, rollback, and repeat submissions.” |
| 4:20–4:35 | Overview or impact | “Second Serve gives a coordinator a complete, reviewable workflow. Good food. Another chance.” |

## Recording checklist

- Create a separate demo account, choose its location, and explicitly load sample data with valid pickup windows. For an entirely user-created demo, add a community partner and list 30 lunch boxes at nearby pins.
- Use a clean browser viewport; verify keyboard focus and the entire approval flow first.
- Make the agent-mode badge readable.
- Show the real tool events and at least one actual handoff.
- Do not say “deployed on AgentCore”; it is not.
- Do not claim that notifications, driver assignments, live routing, food safety certification, or independent delivery verification exist.
- Keep the final cut under five minutes; publish publicly on YouTube or Vimeo and add its URL to the submission.
