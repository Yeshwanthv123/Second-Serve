import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App";
import LocationPicker from "../src/LocationPicker";
import type { Place } from "../src/types";

vi.mock("../src/RescueMap", () => ({
  default: () => <div>Interactive map</div>,
  LocationMap: () => <div>Selected location map</div>,
}));
const place: Place = {
  name: "London",
  label: "London, England, United Kingdom",
  lat: 51.508,
  lng: -0.126,
  country: "United Kingdom",
  country_code: "GB",
  source: "open-meteo",
};
let account: {
  id: string;
  name: string;
  email: string;
  location: Place | null;
} | null;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  account = null;
  fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const path = input.replace("/api", "");
    let value: unknown;
    if (path === "/auth/me") {
      if (!account)
        return new Response(JSON.stringify({ detail: "Please sign in." }), {
          status: 401,
        });
      value = { user: account };
    } else if (path === "/auth/register" || path === "/auth/login") {
      const body = JSON.parse(init!.body as string);
      account = {
        id: "alex",
        name: body.name || "Alex",
        email: body.email,
        location: null,
      };
      value = { user: account };
    } else if (path.startsWith("/locations/search?"))
      value = { results: [place] };
    else if (path === "/auth/location") {
      account!.location = JSON.parse(init!.body as string);
      value = { user: account };
    } else if (path === "/auth/logout") {
      account = null;
      value = { status: "signed_out" };
    } else if (path === "/overview")
      value = {
        available_listings: 0,
        available_portions: 0,
        rescued_portions: 0,
        completed_trips: 0,
        reserved_portions: 0,
        scheduled_trips: 0,
        partners: 0,
        latest_run_id: null,
        mode: "demo",
        city: account!.location!.name,
        location: account!.location,
        demo_data: false,
        area_radius_km: 50,
      };
    else if (["/donations", "/recipients", "/missions"].includes(path))
      value = [];
    else throw new Error(`Unmocked ${path}`);
    return new Response(JSON.stringify(value), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

it("registers, searches for a real place, saves it, opens an empty workspace and signs out", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(
    await screen.findByRole("button", { name: "Create account", exact: true }),
  );
  await user.type(screen.getByLabelText("Your name"), "Alex");
  await user.type(screen.getByLabelText("Email address"), "alex@example.com");
  await user.type(screen.getByLabelText("Password"), "strong-password");
  await user.click(
    screen.getAllByRole("button", { name: "Create account", exact: true })[1],
  );
  expect(
    await screen.findByRole("heading", { name: "Where is your community?" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Open my workspace" }),
  ).toBeDisabled();
  await user.type(screen.getByPlaceholderText(/Search anywhere/), "London");
  expect(
    fetchMock.mock.calls.some((c) => c[0].includes("/locations/search")),
  ).toBe(false);
  await user.click(screen.getByRole("button", { name: "Search", exact: true }));
  await user.click(
    await screen.findByRole("button", { name: /London London, England/ }),
  );
  await user.click(screen.getByRole("button", { name: "Open my workspace" }));
  expect(await screen.findByText("London collective")).toBeInTheDocument();
  expect(
    screen.getByText("Good food needs a place to go."),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /Try a sample rescue/ }),
  ).toBeInTheDocument();
  expect(screen.queryByText(/Bengaluru/)).not.toBeInTheDocument();
  const save = fetchMock.mock.calls.find((c) => c[0] === "/api/auth/location")!;
  expect(JSON.parse(save[1].body)).toEqual(place);
  expect(save[1].headers["X-Requested-With"]).toBe("SecondServe");
  await user.click(screen.getByRole("button", { name: "Sign out" }));
  expect(
    await screen.findByRole("heading", { name: "Welcome back." }),
  ).toBeInTheDocument();
});

it("restores the saved area on reload and exposes location editing", async () => {
  account = {
    id: "alex",
    name: "Alex",
    email: "alex@example.com",
    location: place,
  };
  const user = userEvent.setup();
  render(<App />);
  await user.click(
    await screen.findByRole("button", { name: /London collective/ }),
  );
  expect(
    await screen.findByRole("heading", { name: "Update workspace location" }),
  ).toBeInTheDocument();
  expect(screen.getByText(place.label)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Back to workspace" }));
  expect(await screen.findByText("London collective")).toBeInTheDocument();
});

it("shows login failure without opening the workspace", async () => {
  fetchMock.mockImplementation(
    async (input: string) =>
      new Response(
        JSON.stringify({
          detail: input.endsWith("/login")
            ? "Email or password is incorrect."
            : "Please sign in.",
        }),
        { status: 401 },
      ),
  );
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("heading", { name: "Welcome back." });
  await user.type(screen.getByLabelText("Email address"), "alex@example.com");
  await user.type(screen.getByLabelText("Password"), "wrong-password");
  await user.click(
    screen.getAllByRole("button", { name: "Sign in", exact: true })[1],
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Email or password is incorrect.",
  );
  expect(screen.queryByText("Rescue overview")).not.toBeInTheDocument();
});

it("keeps manual location available when device permission is denied", async () => {
  const getCurrentPosition = vi.fn((_success, error) => error({ code: 1 }));
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });
  const changed = vi.fn(),
    user = userEvent.setup();
  render(<LocationPicker value={null} onChange={changed} />);
  expect(getCurrentPosition).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: /Use my current location/ }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "permission was denied",
  );
  await user.click(screen.getByText("Enter coordinates manually"));
  await user.type(screen.getByLabelText("Area name"), "My neighbourhood");
  await user.type(screen.getByLabelText("Latitude"), "18.52");
  await user.type(screen.getByLabelText("Longitude"), "73.85");
  await user.click(
    screen.getByRole("button", { name: "Use these coordinates" }),
  );
  expect(changed).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "My neighbourhood",
      lat: 18.52,
      lng: 73.85,
      source: "manual",
    }),
  );
  expect(fetchMock).not.toHaveBeenCalled();
});

it("shows an API outage and keeps selection disabled instead of inventing a city", async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ detail: "City search is unavailable." }), {
      status: 503,
    }),
  );
  const user = userEvent.setup(),
    changed = vi.fn();
  render(<LocationPicker value={null} onChange={changed} />);
  await user.type(screen.getByPlaceholderText(/Search anywhere/), "Paris");
  await user.click(screen.getByRole("button", { name: "Search", exact: true }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "City search is unavailable.",
    ),
  );
  expect(changed).not.toHaveBeenCalled();
});
