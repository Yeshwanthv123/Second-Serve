export type Donation = {
  id: string;
  donor: string;
  food: string;
  category: string;
  portions: number;
  remaining: number;
  allergens: string[];
  vegetarian: boolean;
  address: string;
  lat: number;
  lng: number;
  expires_at: string;
  note: string;
};
export type Place = {
  name: string;
  label: string;
  lat: number;
  lng: number;
  country: string;
  country_code: string;
  source: "open-meteo" | "device" | "manual";
};
export type User = {
  id: string;
  name: string;
  email: string;
  location: Place | null;
};
export type Recipient = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  capacity: number;
  remaining_capacity: number;
  vegetarian_only: boolean;
  excluded_allergens: string[];
  description: string;
};
export type AgentStatus = {
  mode: string;
  model_id: string;
  llm: boolean;
  provider: string;
  ready: boolean;
  status: string;
  detail: string;
};
export const providerLabel = (mode?: string) =>
  mode === "ollama"
    ? "Local LLM · Ollama"
    : mode === "bedrock"
      ? "Amazon Bedrock"
      : "Scripted demo";
export type Overview = {
  agent?: AgentStatus;
  available_listings: number;
  available_portions: number;
  rescued_portions: number;
  completed_trips: number;
  reserved_portions: number;
  scheduled_trips: number;
  partners: number;
  latest_run_id: string | null;
  mode: string;
  city: string;
  demo_data: boolean;
  location: Place;
  area_radius_km: number;
};
export type Allocation = {
  donation_id: string;
  recipient_id: string;
  donor: string;
  food: string;
  recipient: string;
  portions: number;
  distance_km: number;
  eta_minutes: number;
  reason: string;
  expires_at: string;
  pickup: { lat: number; lng: number; address: string };
  dropoff: { lat: number; lng: number; address: string };
};
export type Run = {
  model_id?: string;
  model_calls?: number;
  elapsed_ms?: number;
  id: string;
  status: string;
  mode: string;
  created_at: string;
  summary: string | null;
  error: string | null;
  radius_km: number;
  events: {
    id: number;
    tool: string;
    title: string;
    detail: string;
    created_at: string;
  }[];
  plan: null | {
    area?: Place;
    allocations: Allocation[];
    skipped: { donor: string; portions: number; reason: string }[];
    total_portions: number;
    total_km: number;
    method: string;
    estimates: string;
  };
};
export type Mission = {
  id: string;
  run_id: string;
  donor: string;
  food: string;
  recipient: string;
  portions: number;
  distance_km: number;
  eta_minutes: number;
  status: string;
  pickup_address: string;
  dropoff_address: string;
  note: string;
  allergens: string;
  completed_at: string | null;
};
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    "/api" + path,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "SecondServe",
          },
          body: JSON.stringify(body),
        },
  );
  if (!response.ok) {
    const data = await response
      .json()
      .catch(() => ({ detail: "Connection failed" }));
    if (response.status === 401 && !path.startsWith("/auth/"))
      window.dispatchEvent(new Event("session-expired"));
    throw new ApiError(
      typeof data.detail === "string"
        ? data.detail
        : "Please check the form values and try again.",
      response.status,
    );
  }
  return response.json();
}
