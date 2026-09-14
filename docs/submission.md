# Submission package

## Project title

**Second Serve — Good food. Another chance.**

## Short description

Second Serve helps community food-rescue coordinators turn surplus into a practical pickup plan. Built with Strands Agents, it checks donor deadlines, recipient capacity, dietary restrictions, and distance; creates a reviewable proposal; reserves inventory after human approval; and records handoffs with downloadable manifests. Local accounts, first-sign-in city lookup and a real OpenStreetMap view make the workspace personal. A warm, map-led React interface makes the agent's work visible, while FastAPI and SQLite keep every operational step durable.

## Longer description

A kitchen with extra food and a community partner with capacity can be only a few streets apart. The missing piece is often coordination: what can be collected, who can accept it, how much fits, and how quickly it needs to move.

Second Serve gives a coordinator one place to manage that work. Donors list portions, declared allergens, a location, and a pickup window. The Strands agent invokes bounded tools to read the current inventory and recipient needs, then persists a feasible pickup proposal. A deterministic planner checks time, distance, remaining capacity, and dietary compatibility.

Before anything is reserved, the coordinator sees the tool results, routes, matched quantities, and unmatched explanations. Approval revalidates the plan transactionally. That prevents overlapping plans from allocating the same food twice. Pickup manifests can be downloaded, and human-confirmed handoffs update the impact dashboard.

The default agent uses a real local Qwen3 4B Instruct model through Ollama and Strands. It chooses tool calls, resolves coordinator partner preferences and writes the summary of the persisted plan. It requires no API key. The run panel records model identity, model responses and tool outcomes. A separate, explicitly scripted provider remains for unit tests; failures never switch to it automatically. Amazon Bedrock is an optional cloud provider.

The prototype uses React with TypeScript, FastAPI, Python, and SQLite, delivered as frontend, backend and Ollama Docker services plus a first-start model-download job. It runs locally with `docker compose up --build`. The interface includes a neighborhood map, animated routes, responsive layouts, native dialogs, reduced-motion support, search, category filters, agent run inspection, pickup records, and CSV/JSON exports.

New accounts start empty; optional sample kitchens and partners are explicitly fictional demo records. Handoff counts are operator-reported portions, not independently verified people fed. Real-world transport, partner contact, and food-handling checks remain human responsibilities.

## Requirement checklist

| Requirement | Status / action |
|---|---|
| New project | Application newly authored September 11–12, 2026; confirm these dates fall within the official submission period |
| Required Strands tooling | Implemented actual `Agent`, custom model provider, hooks, and three decorated tools |
| Actual AI agent demonstration | Default local Ollama LLM implemented; use the real-inference acceptance script and recording guide. Bedrock remains optional. |
| Functional source and install instructions | Included in repository-ready source package; see verification notes for remaining environment-limited checks |
| Public repository URL | Not yet created/published; upload this application source to your public GitHub/GitLab/Bitbucket repository |
| Recognized license | Root `LICENSE` is MIT; verify the public repository's license detector after publishing |
| README | Included |
| Architecture diagram | Included as SVG and Mermaid |
| Video ≤5 minutes | Script and shot list included; record the working application and publish to YouTube/Vimeo |
| Problem / audience / significance pitch | Included in the video script |
| AWS Builder ID | User must supply their own ID |
| Track | Three track names were omitted from the brief; select the closest official community/social-impact or practical-workflow track after checking the actual labels |
| Optional live demo | Not publicly deployed; local authentication is implemented. Public hosting requires HTTPS and production configuration; see README. |
| Optional AgentCore | Not implemented/deployed; do not claim AgentCore deployment credit |
| Optional builder.aws blog | Draft included with “Agents for Humans” in title; verify live AWS experience, then publish under your own account |
| Third-party disclosure | Included; no adjacent food-rescue source was copied |

## Public repository preparation

The source archive intentionally excludes `.env`, databases, virtual environments, package caches, build artifacts, and the pre-existing skill repositories. A repository should include only this application's source, lockfiles, docs, workflows, Docker files, and license.

Suggested repository name: `second-serve`. Suggested About text: “A Strands-powered surplus-food rescue coordinator. React, FastAPI, SQLite, and Docker.” Suggested topics: `strands-agents`, `amazon-bedrock`, `food-rescue`, `fastapi`, `react`, `hackathon`.

Before final submission: run a clean Docker installation, exercise the local LLM once, confirm the published repository works without private files, and ensure the public video and project description accurately distinguish demo and live behavior.

