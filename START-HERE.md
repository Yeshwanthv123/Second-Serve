# Second Serve — complete project package

Second Serve helps food-rescue coordinators turn surplus food and community partner needs into reviewable pickup plans, reserved inventory, pickup manifests and confirmed handoff records. A real local Qwen3 language model drives the Strands Agents tool loop; no API key is needed.

## Start the application

1. Extract the ZIP and open a terminal in the extracted `second-serve` folder.
2. Start Docker Desktop with Linux containers. Allocate at least 8 GB RAM to Docker (12 GB recommended) and allow approximately 8 GB free disk.
3. Run `docker compose up --build`.
4. Open http://localhost:8080, create a local account, and choose your location.
5. Wait for the agent card to report that the local model is ready. Add your own food and receiving partners, or choose **Try a sample rescue** for explicitly fictional demonstration data.
6. Run the rescue agent, inspect its proposal, approve pickups, and confirm the sample handoffs to demonstrate the complete workflow.

The first start needs internet to download Docker images, dependencies and approximately 2.5 GB of model weights. These are downloaded automatically and are not embedded in this source ZIP. Subsequent starts reuse persistent model and database volumes. City search and map tiles also use internet services.

Use `docker compose down` to stop while retaining your data. See the README for setup, model troubleshooting and configuration.

## What is included

| Item | Location |
|---|---|
| Setup, product explanation and limitations | `README.md` |
| Python API, local LLM integration and backend tests | `backend/` |
| React/TypeScript interface, assets and frontend tests | `frontend/` |
| Complete Docker startup | `compose.yaml`, `docker.yaml`, both service Dockerfiles |
| Configuration template | `.env.example` |
| Architecture diagram | `docs/architecture.svg`, `docs/architecture.md` |
| Builder blog draft | `docs/builder-blog-draft.md` |
| Pitch and video script | `docs/demo-script.md` |
| Real-LLM recording walkthrough | `docs/live-agent.md` |
| Submission description and checklist | `docs/submission.md` |
| Research and source links | `docs/research.md` |
| Verification notes and compact evidence | `docs/verification.md`, `docs/live-llm-evidence.json` |
| Full real-LLM acceptance evidence using fictional records | `artifacts/live-llm-verification.json` (complete package) |
| Repeatable verification and packaging scripts | `scripts/` |
| CI workflow | `.github/workflows/ci.yml` |
| Open-source license and third-party disclosures | `LICENSE`, `THIRD_PARTY_NOTICES.md` |
| Per-file sizes and SHA-256 checksums | `PACKAGE-MANIFEST.json` (generated in the ZIP) |

## Before submitting

The blog is a draft and the video is a recording guide; neither has been published for you. Create a public source repository, record and publish a video of at most five minutes, supply your AWS Builder ID, and choose the official track. The optional blog includes a placeholder for verified AWS experience: local Ollama inference has been verified, but Bedrock and AgentCore deployment must not be claimed as completed.

This package includes application source and submission materials. It excludes credentials, private account databases, dependency caches, generated builds, model weights and unrelated skill repositories. Test handoffs in the evidence are fictional and do not represent actual food deliveries.

To regenerate this complete archive with Python, run `python scripts/package_source.py --complete` from the project folder.
