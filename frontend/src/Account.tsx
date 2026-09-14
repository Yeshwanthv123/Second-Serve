import { useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowRight,
  Check,
  Leaf,
  LoaderCircle,
  MapPin,
  Soup,
  Truck,
  Users,
} from "lucide-react";
import { api } from "./types";
import type { Place, User } from "./types";
import LocationPicker from "./LocationPicker";

export function AccountScreen({ onUser }: { onUser: (user: User) => void }) {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const data = await api<{ user: User }>(
        register ? "/auth/register" : "/auth/login",
        {
          email: f.get("email"),
          password: f.get("password"),
          ...(register ? { name: f.get("name") } : {}),
        },
      );
      onUser(data.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="account-page">
      <aside className="account-story">
        <a className="account-brand" href="/">
          <img src="/favicon.svg" alt="" />
          second<span>serve</span>
        </a>
        <div className="story-main">
          <span className="story-kicker">GOOD FOOD. ANOTHER CHANCE.</span>
          <h1>
            Your neighbourhood.
            <br />
            One more
            <br />
            <em>seat at the table.</em>
          </h1>
          <p>
            Extra food at a restaurant. Space at a community kitchen. We help
            you connect the two, before good food goes to waste.
          </p>
          <div className="story-journey">
            <div>
              <Soup size={23} />
              <span>List extra food</span>
            </div>
            <ArrowRight size={17} />
            <div>
              <Users size={23} />
              <span>Find a fit</span>
            </div>
            <ArrowRight size={17} />
            <div>
              <Truck size={23} />
              <span>Track the handoff</span>
            </div>
          </div>
        </div>
        <div className="story-footer">
          <Leaf size={18} />
          <span>Built for the people who bring communities together.</span>
        </div>
      </aside>
      <main className="account-form-panel">
        <div className="account-form-wrap">
          <div className="account-overline">YOUR COMMUNITY STARTS HERE</div>
          <h2>{register ? "Make room for more good." : "Welcome back."}</h2>
          <p>
            {register
              ? "Create your account. Next, choose the area you want to help."
              : "Sign in to your food-rescue workspace."}
          </p>
          <div className="auth-tabs">
            <button
              type="button"
              aria-pressed={!register}
              className={!register ? "active" : ""}
              onClick={() => {
                setRegister(false);
                setError("");
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              aria-pressed={register}
              className={register ? "active" : ""}
              onClick={() => {
                setRegister(true);
                setError("");
              }}
            >
              Create account
            </button>
          </div>
          <form onSubmit={submit} className="auth-form">
            {error && (
              <div role="alert" className="error-banner">
                {error}
              </div>
            )}
            {register && (
              <label>
                Your name
                <input
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder="How should we call you?"
                />
              </label>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                required
                minLength={10}
                maxLength={128}
                placeholder={
                  register ? "At least 10 characters" : "Your password"
                }
              />
            </label>
            <button className="button primary" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <>
                  {register ? "Create account" : "Sign in"}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
          <div className="account-note">
            <MapPin size={19} />
            <p>
              Your first sign-in includes a location step. Search for a city or
              choose to use your device location.
            </p>
          </div>
          <small className="local-account-note">
            This account belongs to this Second Serve installation. No emails
            are sent; email verification and password recovery are not yet
            available.
          </small>
        </div>
      </main>
    </div>
  );
}

export function LocationSetup({
  user,
  onUser,
  onLogout,
  editing = false,
  onCancel,
}: {
  user: User;
  onUser: (user: User) => void;
  onLogout: () => void;
  editing?: boolean;
  onCancel?: () => void;
}) {
  const [location, setLocation] = useState<Place | null>(user.location),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const save = async () => {
    if (!location) return;
    setBusy(true);
    setError("");
    try {
      const data = await api<{ user: User }>("/auth/location", location);
      onUser(data.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="location-setup">
      <header>
        <a className="brand" href="/">
          <img src="/favicon.svg" alt="" />
          <span>
            second<span className="brand-light">serve</span>
          </span>
        </a>
        <button
          className="button secondary"
          onClick={editing ? onCancel : onLogout}
        >
          {editing ? "Back to workspace" : "Sign out"}
        </button>
      </header>
      <main className="onboarding-layout">
        <section className="onboarding-story">
          <div className="onboarding-steps">
            <span>
              <Check size={13} />
              Account created
            </span>
            <i />
            <span className="current">
              <MapPin size={13} />
              Choose your area
            </span>
          </div>
          <div className="eyebrow">A GOOD PLACE TO BEGIN</div>
          <h1>
            {editing
              ? "Where shall we help next?"
              : `Let’s start close to home, ${user.name.split(" ")[0]}.`}
          </h1>
          <p>
            Your location centres the map and shows food and partners within 50
            km. You choose exactly what gets listed.
          </p>
          <div className="onboarding-explainer">
            <h2>What does Second Serve do?</h2>
            <p>
              Imagine you have 30 extra lunch boxes. Add a community kitchen
              that can receive them, then let the rescue agent check distance,
              dietary needs, capacity and the pickup deadline.
            </p>
            <p>
              You review the plan, approve the pickup records, and confirm when
              the food arrives.
            </p>
            <div>
              <span>1. Add a partner</span>
              <span>2. List food</span>
              <span>3. Plan a rescue</span>
            </div>
          </div>
          <p className="onboarding-honesty">
            Your workspace starts empty. A free location lookup finds places,
            not food availability or partner commitments. A clearly labelled
            sample rescue is available if you want to try the flow.
          </p>
        </section>
        <section className="onboarding-location">
          <h2>
            {editing ? "Update workspace location" : "Where is your community?"}
          </h2>
          <p>Choose a city, use your device, or set a pin yourself.</p>
          <LocationPicker value={location} onChange={setLocation} />
          {error && (
            <p role="alert" className="error-banner">
              {error}
            </p>
          )}
          {editing && (
            <p className="location-change-note">
              Existing records keep their coordinates. The overview and planner
              will use your new area; pickup history stays in your account.
            </p>
          )}
          <button
            className="button primary onboarding-submit"
            onClick={save}
            disabled={!location || busy}
          >
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <>
                {editing ? "Save location" : "Open my workspace"}
                <ArrowRight size={17} />
              </>
            )}
          </button>
        </section>
      </main>
    </div>
  );
}
