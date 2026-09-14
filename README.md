# Second Serve

**Good food. Another chance.**

Second Serve is a surplus-food coordination prototype for community kitchens, food-rescue volunteers, and neighbourhood nonprofits. A Strands agent inspects available food, checks recipient needs, and prepares a feasible pickup plan. The coordinator approves it, the application reserves inventory and creates manifests, and confirmed handoffs update the impact dashboard.

React + TypeScript · FastAPI + Python · SQLite · Strands Agents · Docker Compose

[MIT license](LICENSE) · [Architecture](docs/architecture.md) · [Research](docs/research.md) · [Demo script](docs/demo-script.md) · [Submission checklist](docs/submission.md) · [Verification](docs/verification.md)

## Run with one command

Prerequisites: **Docker Desktop running with Linux containers**, Docker Compose **v2.20+**, and internet access for the first image/package build. Windows with WSL2, macOS, or Linux with Docker Engine is the intended platform.

Allow **at least 8 GB of RAM for Docker**, with 12 GB recommended, plus approximately 8 GB of free disk for images and model storage. The model weights are about 2.5 GB; the first download can take several minutes. CPU inference works without a GPU, but speed depends on hardware.

From this directory:

```sh
docker compose up --build
```

Open **[http://localhost:8080](http://localhost:8080)**. Interactive API documentation is at **[http://localhost:8000/docs](http://localhost:8000/docs)**.

No environment file, API key, AWS account, Node installation or Python installation is needed for the **default real local LLM**. Compose builds the frontend and backend, starts Ollama, and downloads `qwen3:4b-instruct` once into a persistent model volume. The application opens while the download runs; the agent card reports readiness. SQLite is kept in a separate persistent volume. Fonts and icons are bundled locally. Accounts use password login and private workspaces. Ports remain bound to localhost for the default local installation. City search and map imagery need internet; manual coordinates and saved records work when those services are unavailable.

`compose.yaml` is the default entrypoint and includes the requested `docker.yaml`. An equivalent command that does not need Compose `include` support is:

```sh
docker compose -f docker.yaml up --build
```

To stop without losing data:

```sh
docker compose down
```

## Start with your community

1. Open the app and choose **Create account**. Enter your name, email and a password of at least 10 characters. These are local accounts; no email is sent.
2. On your first sign-in, **search for a city or postal code**, select a result, and open your workspace. Alternatively, choose **Use my current location**, grant browser permission, or enter coordinates manually. Move the map pin to refine the location.
3. Your account starts **empty**. Add a community partner you coordinate with: receiving address, map pin, capacity, dietary needs and allergen exclusions.
4. Choose **List surplus food**. Enter the donor, portions, ingredients, pickup deadline, address and actual pickup pin. The saved area supplies the initial map centre; it is not a verified street address. Food and partners must be within 50 km of your selected centre.
5. Click **Run rescue agent**. It reads your account's current inventory and recipient needs, then persists a proposed pickup plan. Use the settings control to change maximum donor-to-partner trip distance.
6. Review the tool events and allocations, then **Approve & create pickups**. The backend rechecks deadlines, capacity and quantities and reserves them atomically.
7. Coordinate collection, then **Confirm handoff** on the pickup board. Your impact counts and CSV/JSON exports reflect these saved records.
8. Sign out and back in: your area, listings, partners and pickup history persist. Click the location selector in the sidebar to change area. Existing records keep their original coordinates; the overview and planner filter to your new area, while pickup history remains account-wide.

For a quick walkthrough, choose **Try a sample rescue** in an empty workspace. It deliberately adds six fictional kitchens and four fictional partners around the location you selected, with 244 test portions. Every sample name is labelled. The location API does **not** discover available food or willing partners. Sample pickup windows expire normally; restarting does not renew them. Capacity is consumed by approved pickups and is not automatically replenished. To try a fresh sample later, create a separate account; do not delete your volume to reset a demonstration.

The project solves a coordination problem: a restaurant has extra lunch boxes, a community kitchen can receive them, and a coordinator needs a feasible plan and a reliable record of what actually happened. The app does intake, constraint checking, planning, inventory reservation, manifests and handoff recordkeeping. Physical transport and communication with partners remain human tasks; no driver is assigned or message sent by the app.

### Free location services

- **Open-Meteo geocoding** searches cities/postcodes after you click Search. No API key is needed for the free non-commercial service. Responses are cached for 24 hours; per-user and application-wide limits protect the service. See [geocoding docs](https://open-meteo.com/en/docs/geocoding-api) and [usage terms/pricing](https://open-meteo.com/en/pricing).
- **Leaflet + OpenStreetMap tiles** provide the real interactive map. Visible attribution is retained; no offline downloads or bulk tile prefetching. Lines connect saved pickup and receiving coordinates; they are not driving directions. See [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
- Device location is requested only on your click. It normally requires HTTPS or localhost. Denial and provider outages have manual/search fallbacks. Device mode uses a neutral “Current area” name instead of guessing a city; city search gives a named place.
- Providers are configured with `GEOCODING_URL` and `MAP_TILE_URL`. A replacement geocoder must use the same response schema; a tile provider must permit the usage and retain any additional required attribution.

### Accounts and stored data

Passwords are salted with scrypt. Random session tokens are stored as hashes, expire after seven days and are revoked on logout. The browser gets an HttpOnly, SameSite=Lax cookie. Mutations require the application request header and validate browser origins. Authentication attempts are rate limited.

The named Docker volume contains an account/session database and a separate domain SQLite file per account. API reads, exports, background jobs and Strands tools are bound to that account's file. The old shared prototype database, if present, is preserved and is not exposed to newly registered users. New accounts are independent coordinator workspaces, not a shared marketplace.

For a hosted HTTPS installation, set `COOKIE_SECURE=true` and `APP_ORIGINS` to its exact origin, terminate TLS correctly, and keep one backend worker. Email verification, password recovery, invitations and organization roles are not implemented. Keep volume backups: deleting `secondserve-data` deletes accounts and their records. In live Bedrock mode, entered donor/recipient records and coordinator notes are sent to the configured AWS model.

## A real LLM drives the default agent

`AGENT_MODE=ollama` is the default. The actual Qwen3 4B Instruct language model runs in Ollama and is connected through the official Strands `OllamaModel` provider. It receives tool definitions, chooses tool calls, reads their database results, interprets coordinator partner preferences, and writes the final summary. There is no scripted fallback when inference fails.

Try this: add a nearby partner with capacity 40, a slightly farther **Night Shelter** with capacity 20, and 30 portions of suitable food. Run once without a preference. Then, before approving, enter **“Prioritize Night Shelter for dinner tonight, then send the rest to other partners”** and run again. The model should resolve the named partner to its real record ID. The planner can send up to 20 suitable portions there and assign the remainder elsewhere. Review the result: a model can misunderstand language, and a preference never overrides capacity, diet, deadlines or distance.

The run panel shows the model ID, the number of completed LLM responses, tool requests, elapsed time, persisted tool outcomes and an expanded LLM-written summary. Historical scripted runs retain their original provider label; run again to generate a new local-LLM result.

| Mode | Model | Credentials | Intended use |
|---|---|---|---|
| `ollama` (default) | Real local `qwen3:4b-instruct` | None | Working LLM-driven prototype and video |
| `bedrock` | Real Amazon Bedrock model | AWS model access | Optional cloud inference |
| `demo` | Explicitly scripted custom Strands provider; **not an LLM** | None | Fast automated tests and workflow rehearsals |

The LLM controls tool use and can select a preferred partner. Deterministic tools enforce the actual allocations. It cannot reserve food, approve itself, change ingredients or mark a delivery complete. Other requests in free text are context, not automatically supported capabilities.

### First startup and model troubleshooting

- Wait for the agent card to show the model is installed. The food and partner forms work while it downloads.
- Inspect first-download progress with `docker compose logs --tail 20 model-init`.
- If a download fails after its automatic retries, run `docker compose run --rm model-init`.
- Inspect installed weights with `docker compose exec ollama ollama list`.
- If inference fails, inspect `docker compose logs backend ollama`; give Docker sufficient memory, then retry. The UI never substitutes a fake success.
- To change the model, set `OLLAMA_MODEL` in `.env` to a compatible tool-calling Ollama model and run Compose again. Memory and reliability vary by model.
- Local development outside Docker also needs a running Ollama server. Set `OLLAMA_HOST` if it is not at `http://localhost:11434`.

The Ollama endpoint is internal to Docker, without a published host port. Model weights persist in `secondserve-models`; account records persist separately in `secondserve-data`. Local inference does not send food or partner records to a cloud model. City search and map tiles remain independent internet services.

See [local LLM walkthrough](docs/live-agent.md) and [Strands Ollama provider documentation](https://strandsagents.com/docs/user-guide/concepts/model-providers/ollama/).

### Enable Amazon Bedrock

Copy `.env.example` to `.env`, set `AGENT_MODE=bedrock`, and supply credentials authorized for your chosen region and model. Prefer temporary credentials, including `AWS_SESSION_TOKEN`. Never commit `.env`.

```dotenv
AGENT_MODE=bedrock
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-20250514-v1:0
AWS_ACCESS_KEY_ID=your-temporary-access-key
AWS_SECRET_ACCESS_KEY=your-temporary-secret
AWS_SESSION_TOKEN=your-session-token
```

Then recreate the backend:

```sh
docker compose up --build --force-recreate
```

The account needs model access and appropriate `bedrock:InvokeModel` / `bedrock:InvokeModelWithResponseStream` permissions. Cross-region inference profiles can require permission for both the profile and destination models. Choose an available model ID for your account; the default follows the pinned SDK's Sonnet 4 example. Consult [Strands Bedrock provider documentation](https://strandsagents.com/docs/user-guide/concepts/model-providers/amazon-bedrock/) and [Bedrock model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html).

Live Bedrock calls incur AWS charges. Credentials and model access were not available during this build, so a successful **Bedrock** inference has not been verified. This does not affect the local Ollama provider.

## Architecture

![Second Serve architecture](docs/architecture.svg)

Three bounded Strands tools execute the workflow:

- `inspect_surplus`: reads available quantities, declared allergens, and deadlines.
- `inspect_recipient_needs`: reads remaining capacity and dietary restrictions.
- `create_rescue_plan`: computes and persists a constraint-checked proposal.

Planning prioritizes earlier deadlines, then considers an LLM-selected preferred partner when supplied, followed by nearest feasible recipients, splitting quantities when necessary. It is a greedy heuristic, **not** a global optimization or fleet scheduler. Distance is Haversine × 1.35; ETA assumes 18 km/h and 8 minutes handling. The map uses real geographic tiles; its direct connection lines and travel estimates are not turn-by-turn navigation. Unknown volunteer availability, traffic, refrigeration, and transport conditions are not modeled.

The agent has no dispatch, shell, browser, email, arbitrary SQL, or file-access tool. Approval is a separate API action. Eight model calls maximum and ten tool executions maximum limit loops; a configurable 600-second elapsed budget is checked before each live model call (180 seconds for scripted tests), with per-request network timeouts. These checks bound the loop between calls; they are not a durable job timeout. Interrupted runs are marked failed on startup. Run **one backend worker** with SQLite.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` | Local accounts and cookie sessions |
| GET | `/api/auth/me` | Restore signed-in profile and saved location |
| POST | `/api/auth/location` | First-sign-in or updated workspace location |
| GET | `/api/locations/search?q=...` | Cached live city lookup |
| GET | `/api/map-config` | Configured tile URL |
| POST | `/api/workspace/sample` | Explicit sample records, empty workspace only |
| GET | `/api/agent/status` | Actual configured provider/model and local model readiness |
| GET | `/api/health` | Public health, mode, framework version |
| GET | `/api/overview` | Persisted workspace counts |
| GET / POST | `/api/donations` | List or create surplus |
| GET / POST | `/api/recipients` | List or add receiving partners |
| GET / POST | `/api/runs` | Run history / start background planning |
| GET | `/api/runs/{id}` | Status, plan, and tool events |
| POST | `/api/runs/{id}/approve` | Revalidate and reserve atomically |
| GET | `/api/runs/{id}/manifest` | Download JSON record |
| GET | `/api/missions` | Pickup records |
| POST | `/api/missions/{id}/complete` | Idempotent handoff confirmation |
| GET | `/api/missions/export.csv` | Download spreadsheet-safe manifests |

See `/docs` for request schemas. API clients must retain the login cookie and send `X-Requested-With: SecondServe` on POST requests. Apart from health, registration and login, API endpoints require authentication; operational endpoints also require a saved location. Run creation returns HTTP 202 and the UI polls status. Only one run per account can be actively planning. Location changes are rejected while its run is active; plans from an earlier location cannot be approved. HTTP 409 signals a concurrent run, stale plan, or invalid transition; 422 signals invalid input. Repeated approval and completion do not double-count.

## Verify

After the containers start:

```sh
docker compose exec backend python -m pytest -q tests
```

Tests create isolated temporary databases and do not alter your workspace database. See [verification notes](docs/verification.md) for executed checks and remaining gaps. The GitHub Actions workflow builds both images, runs the tests inside the backend container, and checks frontend/API health.

Verification completed: **41 backend tests and 14 frontend tests, both Docker image builds and healthy Compose startup**. Actual HTTP checks covered the sample rescue (264 test portions) and a newly registered account with live geocoding and user-created records (30 test portions). Visual browser QA and Amazon Bedrock inference remain unverified. Live Ollama acceptance also passed: two real model runs changed the recipient allocation from a natural-language preference, then completed approval and handoff. See [verification notes](docs/verification.md). The Docker frontend build executes its component tests.

Local development, if desired:

```sh
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r backend/requirements.txt
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

In a second terminal:

```sh
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to FastAPI. Run local tests from `backend` with `python -m pytest -q`; build the frontend with `npm run build`.

## Troubleshooting

- **Docker pipe/socket not found:** open Docker Desktop and wait for the Linux engine to report running. Windows requires working WSL2 virtualization. A valid Compose file cannot start a stopped Docker daemon.
- **Ports occupied:** stop the conflicting service, or change the host port on the left side of the mapping in `docker.yaml` and include the new exact browser origin in `APP_ORIGINS`.
- **No feasible plan:** the pickup window may have expired, recipients may be full, or dietary/radius constraints may exclude every match. Read the unmatched explanations, add fresh food, or change the radius.
- **Stale plan:** another plan was approved, or a deadline elapsed. Start a new run. The failed approval rolls back every reservation.
- **Bedrock failure:** inspect `docker compose logs backend`; check credentials, model ID, region, model access, and IAM permissions. The app does not disguise failures as successful demos.
- **A restart interrupted planning:** the failed run remains visible. Start another one; planning itself never reserves food.

## Hackathon readiness and provenance

Application source and design were newly authored in this workspace on September 11–12, 2026, with Codex assistance. Standard dependencies are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Existing skill repositories in the workspace are development aids and are excluded from the deliverable; they are not application code. No food-rescue project was copied or forked.

The three track names and exact submission-period dates were not supplied. Confirm both before submission. The public repository URL, public YouTube/Vimeo video, AWS Builder ID, and optional published blog/live demo are account-owned submission steps that have **not** been completed here. AgentCore is optional and is described as a future deployment path, not an existing deployment.

Food quantities, ingredients, pickup windows, and handoff confirmations are operator-entered. This prototype does not certify food safety or independently verify meals delivered. Keep a human responsible for handling checks and physical logistics. Organization roles, account recovery, capacity rollover, driver scheduling, monitoring, and external notifications would be needed for a public operational service. Local account isolation is implemented, but this is not a shared donor marketplace.
