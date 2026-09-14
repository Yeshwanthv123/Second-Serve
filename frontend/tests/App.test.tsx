import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App";
import type { Donation, Mission, Recipient, Run } from "../src/types";

const donation: Donation = {
  id: "d1",
  donor: "Test Bakery",
  food: "Sourdough loaves",
  category: "Bakery",
  portions: 48,
  remaining: 48,
  allergens: ["gluten"],
  vegetarian: true,
  address: "Indiranagar",
  lat: 12.975,
  lng: 77.64,
  expires_at: new Date(Date.now() + 7200000).toISOString(),
  note: "Collect sealed bags",
};
const recipient: Recipient = {
  id: "r1",
  name: "Community Table",
  address: "Domlur",
  lat: 12.96,
  lng: 77.638,
  capacity: 100,
  remaining_capacity: 100,
  vegetarian_only: true,
  excluded_allergens: [],
  description: "Community kitchen",
};
vi.mock("../src/RescueMap", () => ({
  default: () => <div>Interactive map</div>,
  LocationMap: () => <div>Location pin</div>,
}));
const location = {
  name: "Pune",
  label: "Pune, India",
  lat: 18.52,
  lng: 73.85,
  country: "India",
  country_code: "IN",
  source: "manual",
};
let currentRun: Run | null;
let currentMissions: Mission[];
let currentDonations: Donation[];
let currentRecipients: Recipient[];
let failApproval: boolean;
let activeMode: string;
let modelReady: boolean;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  currentRun = null;
  currentMissions = [];
  currentDonations = [{ ...donation }];
  currentRecipients = [{ ...recipient }];
  failApproval = false;
  activeMode = "demo";
  modelReady = true;
  fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const path = input.replace("/api", "");
    let value: unknown;
    if (path === "/auth/me")
      value = {
        user: {
          id: "test",
          name: "Alex Coordinator",
          email: "alex@example.com",
          location,
        },
      };
    else if (path === "/overview")
      value = {
        available_listings: currentDonations.filter((d) => d.remaining > 0)
          .length,
        available_portions: currentDonations.reduce(
          (n, d) => n + d.remaining,
          0,
        ),
        rescued_portions: currentMissions
          .filter((m) => m.status === "completed")
          .reduce((n, m) => n + m.portions, 0),
        completed_trips: currentMissions.filter((m) => m.status === "completed")
          .length,
        reserved_portions: currentMissions
          .filter((m) => m.status === "scheduled")
          .reduce((n, m) => n + m.portions, 0),
        scheduled_trips: currentMissions.filter((m) => m.status === "scheduled")
          .length,
        partners: 1,
        latest_run_id: currentRun?.id || null,
        mode: activeMode,
        agent: {
          mode: activeMode,
          model_id: "qwen3:4b-instruct",
          llm: activeMode !== "demo",
          provider: activeMode,
          ready: modelReady,
          status: modelReady ? "ready" : "model_missing",
          detail: modelReady
            ? "Local model installed."
            : "First startup downloads the model.",
        },
        city: "Pune",
        location,
        area_radius_km: 50,
        demo_data: true,
      };
    else if (path === "/donations" && init?.method === "POST") {
      const data = JSON.parse(init.body as string);
      currentDonations.push({
        ...donation,
        ...data,
        id: "d2",
        remaining: data.portions,
      });
      value = { id: "d2" };
    } else if (path === "/donations") value = currentDonations;
    else if (path === "/recipients" && init?.method === "POST") {
      const data = JSON.parse(init.body as string);
      currentRecipients.push({
        ...data,
        id: "r2",
        remaining_capacity: data.capacity,
      });
      value = { id: "r2" };
    } else if (path === "/recipients") value = currentRecipients;
    else if (path === "/missions") value = currentMissions;
    else if (path === "/runs" && init?.method === "POST") {
      currentRun = {
        id: "run-1",
        status: "ready",
        mode: activeMode,
        model_id: activeMode === "ollama" ? "qwen3:4b-instruct" : undefined,
        model_calls: activeMode === "ollama" ? 4 : 0,
        elapsed_ms: activeMode === "ollama" ? 12000 : 0,
        created_at: new Date().toISOString(),
        summary: "The plan is ready.",
        error: null,
        radius_km: 5,
        events: [
          {
            id: 1,
            tool: "inspect_surplus",
            title: "Surplus inventory checked",
            detail: "48 portions inspected.",
            created_at: new Date().toISOString(),
          },
        ],
        plan: {
          allocations: [
            {
              donation_id: "d1",
              recipient_id: "r1",
              donor: donation.donor,
              food: donation.food,
              recipient: recipient.name,
              portions: 48,
              distance_km: 1.2,
              eta_minutes: 12,
              reason: "Feasible",
              expires_at: donation.expires_at,
              pickup: {
                lat: donation.lat,
                lng: donation.lng,
                address: donation.address,
              },
              dropoff: {
                lat: recipient.lat,
                lng: recipient.lng,
                address: recipient.address,
              },
            },
          ],
          skipped: [],
          total_portions: 48,
          total_km: 1.2,
          method: "Greedy",
          estimates: "Estimated distance",
        },
      };
      value = { id: "run-1", status: "running" };
    } else if (path === "/runs/run-1") value = currentRun;
    else if (path === "/runs/run-1/approve") {
      if (failApproval)
        return new Response(
          JSON.stringify({ detail: "The plan is stale. Run the agent again." }),
          { status: 409 },
        );
      currentRun!.status = "dispatched";
      currentDonations[0].remaining = 0;
      currentMissions = [
        {
          id: "trip-1",
          run_id: "run-1",
          donor: donation.donor,
          food: donation.food,
          recipient: recipient.name,
          portions: 48,
          distance_km: 1.2,
          eta_minutes: 12,
          status: "scheduled",
          pickup_address: donation.address,
          dropoff_address: recipient.address,
          note: donation.note,
          allergens: '["gluten"]',
          completed_at: null,
        },
      ];
      value = { status: "dispatched", missions: currentMissions };
    } else if (path === "/missions/trip-1/complete") {
      currentMissions[0].status = "completed";
      value = { status: "completed" };
    } else throw new Error(`Unmocked endpoint ${path}`);
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("coordinator interface", () => {
  it("shows real model identity, sends coordinator context and exposes model responses", async () => {
    activeMode = "ollama";
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Sourdough loaves" });
    expect(screen.getByText("LOCAL LLM · STRANDS")).toBeInTheDocument();
    await user.type(
      screen.getByLabelText("Rescue preferences"),
      "Prioritize Community Table tonight.",
    );
    await user.click(screen.getByRole("button", { name: "Run rescue agent" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("qwen3:4b-instruct")).toBeInTheDocument();
    expect(
      within(dialog).getByText("LLM responses received"),
    ).toBeInTheDocument();
    expect(
      within(dialog)
        .getByText("LLM-written coordinator summary")
        .closest("details"),
    ).toHaveAttribute("open");
    const call = fetchMock.mock.calls.find(
      (c) => c[0] === "/api/runs" && c[1]?.method === "POST",
    )!;
    expect(JSON.parse(call[1].body).instructions).toBe(
      "Prioritize Community Table tonight.",
    );
  });
  it("blocks planning while the local model is missing", async () => {
    activeMode = "ollama";
    modelReady = false;
    render(<App />);
    expect(
      await screen.findByRole("button", { name: "Run rescue agent" }),
    ).toBeDisabled();
    expect(
      screen.getByText("First startup downloads the model."),
    ).toBeInTheDocument();
  });
  it("saves a community partner with the selected area and dietary needs", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      await screen.findByRole("button", { name: "1. Add a partner" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Make a place at the table.",
    });
    await user.type(
      within(dialog).getByLabelText("Partner name"),
      "Local Community Kitchen",
    );
    await user.type(
      within(dialog).getByLabelText("Receiving address"),
      "Community hall entrance",
    );
    await user.type(
      within(dialog).getByLabelText("Portions they can receive"),
      "40",
    );
    await user.click(within(dialog).getByLabelText("Vegetarian food only"));
    await user.click(within(dialog).getByLabelText("nuts"));
    await user.click(
      within(dialog).getByRole("button", { name: "Save community partner" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole("button", { name: "Community network", exact: true }),
    );
    expect(
      await screen.findByRole("heading", { name: "Local Community Kitchen" }),
    ).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(
      (c) => c[0] === "/api/recipients" && c[1]?.method === "POST",
    )!;
    expect(JSON.parse(call[1].body)).toMatchObject({
      name: "Local Community Kitchen",
      capacity: 40,
      vegetarian_only: true,
      excluded_allergens: ["nuts"],
      lat: location.lat,
      lng: location.lng,
    });
  });
  it("loads API records and exposes the scripted provider honestly", async () => {
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: "Sourdough loaves" }),
    ).toBeInTheDocument();
    expect(screen.getByText("SCRIPTED DEMO · STRANDS")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/overview", {});
  });
  it("filters listings and clears an empty search", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Sourdough loaves" });
    await user.click(
      screen.getByRole("button", { name: "Produce", exact: true }),
    );
    expect(
      screen.getByRole("heading", { name: "No listings match your search." }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(
      screen.getByRole("heading", { name: "Sourdough loaves" }),
    ).toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", { name: "Search surplus food" }),
      "nonexistent",
    );
    expect(
      screen.getByRole("heading", { name: "No listings match your search." }),
    ).toBeInTheDocument();
  });
  it("posts a real form payload and refreshes the listing view", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Sourdough loaves" });
    await user.click(
      screen.getByRole("button", { name: "List surplus food", exact: true }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Give good food a second chance.",
    });
    await user.type(
      within(dialog).getByLabelText("Kitchen or donor name"),
      "Test Kitchen",
    );
    await user.type(
      within(dialog).getByLabelText("What’s on the table?"),
      "Vegetable rice",
    );
    await user.type(
      within(dialog).getByLabelText("Pickup address"),
      "12th Main",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "List surplus food" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByRole("heading", { name: "Vegetable rice" }),
    ).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(
      (c) => c[0] === "/api/donations" && c[1]?.method === "POST",
    )!;
    expect(JSON.parse(call[1].body)).toMatchObject({
      donor: "Test Kitchen",
      food: "Vegetable rice",
      portions: 30,
      vegetarian: true,
      allergens: [],
    });
  });
  it("connects planning, approval, pickup completion and impact", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Sourdough loaves" });
    await user.click(screen.getByRole("button", { name: "Run rescue agent" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Your rescue, in motion.",
    });
    expect(
      within(dialog).getByText("Surplus inventory checked"),
    ).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole("button", { name: "Approve & create pickups" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Open pickup board" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Confirm handoff" }),
    );
    expect(
      await screen.findByRole("button", { name: "Handoff recorded" }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Our impact", exact: true }),
    );
    expect(
      screen.getByText(/48 portions have reached community partners/),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        (c) => c[0] === "/api/missions/trip-1/complete",
      ),
    ).toBe(true);
  });
  it("shows a stale-approval failure inside the open dialog", async () => {
    failApproval = true;
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Sourdough loaves" });
    await user.click(screen.getByRole("button", { name: "Run rescue agent" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Approve & create pickups" }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "The plan is stale",
    );
    expect(currentMissions).toHaveLength(0);
  });
  it("shows community capacity and explains demo limits", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Sourdough loaves" });
    await user.click(
      screen.getByRole("button", { name: "Community network", exact: true }),
    );
    expect(
      screen.getByRole("progressbar", {
        name: "Community Table remaining capacity",
      }),
    ).toHaveAttribute("value", "100");
    await user.click(
      screen.getByRole("button", { name: "How Second Serve works" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(/this mode is not an LLM/),
    ).toBeInTheDocument();
  });
});
