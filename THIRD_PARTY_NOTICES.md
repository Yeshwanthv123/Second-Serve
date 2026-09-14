# Third-party notices and provenance

Second Serve application source and visual design were authored for this project with Codex assistance. Standard framework setup and API usage follow public documentation. No adjacent food-rescue application was copied, cloned into the application, or redistributed.

| Dependency / resource | Purpose | License / attribution |
|---|---|---|
| Ollama runtime / Python SDK | Local LLM inference | MIT; [Ollama](https://github.com/ollama/ollama) |
| Qwen3 4B Instruct model weights | Default local language model | Apache-2.0; downloaded at startup, not bundled in the source ZIP; [model and license](https://ollama.com/library/qwen3:4b-instruct) |
| Strands Agents Python SDK | Agent loop, tools, hooks, model providers | Apache-2.0; [Strands Agents](https://github.com/strands-agents) |
| FastAPI | API framework | MIT |
| Uvicorn / Starlette | ASGI server and routing | BSD-3-Clause |
| Pydantic | Request validation | MIT |
| boto3 / botocore | Amazon Bedrock access | Apache-2.0 |
| React / React DOM | UI framework | MIT |
| TypeScript | Frontend compiler | Apache-2.0 |
| Vite | Frontend build system | MIT |
| Lucide React | Interface icons | ISC; [Lucide](https://lucide.dev) |
| Manrope | Locally bundled display typography | SIL Open Font License 1.1 |
| DM Sans | Locally bundled body typography | SIL Open Font License 1.1 |
| Fontsource packaging | Font distribution | MIT packaging; font licenses remain OFL |
| Leaflet 1.9.4 | Interactive map | BSD-2-Clause; bundled notice at `/licenses/leaflet.txt` |
| OpenStreetMap | Geographic raster tiles | OSM contributors, ODbL; visible map attribution and tile policy apply |
| Open-Meteo / GeoNames | City geocoding | GeoNames data attribution / CC BY; Open-Meteo free non-commercial usage terms apply |
| Nginx | Static delivery and API proxy | BSD-2-Clause |
| Python / Node base images | Container runtimes | Respective upstream licenses, retained in images |

`backend/requirements.txt` and `frontend/package-lock.json` identify exact application dependency versions, including transitive packages. Installed packages and official container images retain their own license notices. Font and bundled frontend dependency license texts are included in `frontend/public/licenses/` and served at `/licenses/` by filename.

Optional sample donor names, partners, quantities and service descriptions are fictional. New accounts contain no seeded food records. The map now uses Leaflet and OpenStreetMap tiles, with visible attribution. The favicon, architecture diagram, CSS textures and UI composition were created for this project. City results come from GeoNames through Open-Meteo and are attributed in the location picker.

The existing `.agents`, `awesome-codex-skills`, and `codex-skills` workspace folders are development aids, not application dependencies. They are excluded from the distribution and should not be committed to the application's public repository.

Research references are documented in `docs/research.md`. Referencing an example for API understanding is not a claim of authorship over that upstream project. AWS, Amazon Bedrock, Strands Agents, GitHub, Docker, and other marks belong to their respective owners.
