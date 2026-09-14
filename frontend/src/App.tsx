import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowDownToLine,
  Activity,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Croissant,
  Carrot,
  Soup,
  Heart,
  LayoutDashboard,
  Leaf,
  LoaderCircle,
  MapPin,
  Menu,
  Network,
  Plus,
  Radio,
  RefreshCw,
  Route,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sprout,
  Truck,
  Users,
  X,
  Zap,
  CircleHelp,
  AlertCircle,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { api, ApiError, providerLabel } from "./types";
import { AccountScreen, LocationSetup } from "./Account";
import LocationPicker from "./LocationPicker";
import type {
  Donation,
  Recipient,
  Overview,
  Run,
  Mission,
  User,
  Place,
  AgentStatus,
} from "./types";
import RescueMap from "./RescueMap";

type Page = "overview" | "pickups" | "network" | "impact";
const nav = [
  { id: "overview", label: "Rescue overview", icon: LayoutDashboard },
  { id: "pickups", label: "Pickup board", icon: Route },
  { id: "network", label: "Community network", icon: Network },
  { id: "impact", label: "Our impact", icon: Sprout },
] as const;
const mins = (date: string) =>
  Math.max(0, Math.ceil((new Date(date).getTime() - Date.now()) / 60000));
const timeLabel = (date: string) => {
  const n = mins(date);
  return n === 0
    ? "Window closed"
    : n < 60
      ? `${n}m left`
      : `${Math.floor(n / 60)}h ${n % 60}m left`;
};
const foodIcon = (category: string, size = 25) =>
  category === "Bakery" ? (
    <Croissant size={size} />
  ) : category === "Produce" ? (
    <Carrot size={size} />
  ) : (
    <Soup size={size} />
  );

function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-inner">
        <header>
          <h2 id={titleId}>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const boot = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setUser((await api<{ user: User }>("/auth/me")).user);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401))
        setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void boot();
    const expired = () => {
      setUser(null);
      setEditing(false);
    };
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, [boot]);
  const logout = async () => {
    try {
      await api("/auth/logout", {});
      setUser(null);
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (loading)
    return (
      <div className="loading-state">
        <LoaderCircle className="spin" />
        Opening Second Serve…
      </div>
    );
  if (error)
    return (
      <div className="loading-state">
        <p role="alert">{error}</p>
        <button className="button primary" onClick={boot}>
          Reconnect
        </button>
      </div>
    );
  if (!user) return <AccountScreen onUser={setUser} />;
  if (!user.location || editing)
    return (
      <LocationSetup
        user={user}
        editing={editing}
        onCancel={() => setEditing(false)}
        onLogout={logout}
        onUser={(u) => {
          setUser(u);
          setEditing(false);
        }}
      />
    );
  return (
    <Dashboard
      key={`${user.id}-${user.location.lat}-${user.location.lng}`}
      user={user as User & { location: Place }}
      onChangeLocation={() => setEditing(true)}
      onLogout={logout}
    />
  );
}

function Dashboard({
  user,
  onChangeLocation,
  onLogout,
}: {
  user: User & { location: Place };
  onChangeLocation: () => void;
  onLogout: () => void;
}) {
  const location = user.location;
  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const [page, setPage] = useState<Page>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("All food");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Donation | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showPartner, setShowPartner] = useState(false);
  const [showRun, setShowRun] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [radius, setRadius] = useState(5);
  const [notes, setNotes] = useState("");
  const [, tick] = useState(0);

  const refresh = useCallback(async () => {
    const [o, d, r, m] = await Promise.all([
      api<Overview>("/overview"),
      api<Donation[]>("/donations"),
      api<Recipient[]>("/recipients"),
      api<Mission[]>("/missions"),
    ]);
    setOverview(o);
    if (o.agent) setAgentStatus(o.agent);
    setDonations(d);
    setRecipients(r);
    setMissions(m);
    if (o.latest_run_id) setRun(await api<Run>(`/runs/${o.latest_run_id}`));
    else setRun(null);
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => tick((v) => v + 1), 30000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (overview?.mode !== "ollama") return;
    const timer = setInterval(() => {
      void api<AgentStatus>("/agent/status")
        .then(setAgentStatus)
        .catch(() =>
          setAgentStatus((s) =>
            s
              ? {
                  ...s,
                  ready: false,
                  detail:
                    "Cannot check model readiness. Reconnect to the backend.",
                }
              : s,
          ),
        );
    }, 10000);
    return () => clearInterval(timer);
  }, [overview?.mode]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (run?.status !== "running") return;
    const interval = setInterval(async () => {
      try {
        const next = await api<Run>(`/runs/${run.id}`);
        setRun(next);
        if (next.status !== "running") await refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    }, 900);
    return () => clearInterval(interval);
  }, [run?.id, run?.status, refresh]);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const start = () =>
    act(async () => {
      const next = await api<{ id: string }>("/runs", {
        radius_km: radius,
        instructions: notes,
      });
      setRun(await api<Run>(`/runs/${next.id}`));
      setShowRun(true);
    });
  const approve = () =>
    act(async () => {
      await api(`/runs/${run!.id}/approve`, {});
      await refresh();
      setToast("Pickup manifests created. Your rescue is ready to coordinate.");
    });
  const complete = (id: string) =>
    act(async () => {
      await api(`/missions/${id}/complete`, {});
      await refresh();
      setToast("Handoff recorded. Good food, back where it belongs.");
    });
  const available = donations.filter(
    (d) => d.remaining > 0 && mins(d.expires_at) > 0,
  );
  const filtered = available.filter(
    (d) =>
      (filter === "All food" || filter === d.category) &&
      `${d.donor} ${d.food}`.toLowerCase().includes(search.toLowerCase()),
  );
  const current = donations.find((d) => d.id === selected);
  const planning = busy || run?.status === "running";
  const canPlan =
    !planning &&
    available.length > 0 &&
    recipients.length > 0 &&
    agentStatus?.ready !== false;
  const go = (id: Page) => {
    setPage(id);
    setMobileNav(false);
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <button
          className="brand"
          onClick={() => go("overview")}
          aria-label="Second Serve home"
        >
          <img src="/favicon.svg" alt="" />
          <span>
            second<span className="brand-light">serve</span>
          </span>
        </button>
        <div className="workspace-label">THE COMMUNITY WORKSPACE</div>
        <button className="workspace" onClick={onChangeLocation}>
          <span className="workspace-icon">
            <Leaf size={20} />
          </span>
          <span>
            <strong>{location.name} collective</strong>
            <small>Local food. Lasting change.</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {nav.map((n) => (
            <button
              key={n.id}
              aria-current={page === n.id ? "page" : undefined}
              className={page === n.id ? "active" : ""}
              onClick={() => go(n.id)}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.id === "pickups" && !!overview?.scheduled_trips && (
                <b>{overview.scheduled_trips}</b>
              )}
              {page === n.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="tiny-tag">
            <span className="live-dot" /> SMALL ACTIONS. REAL IMPACT.
          </span>
          <div className="note-art">
            <Sprout size={51} strokeWidth={1.25} />
            <span className="orbit o1" />
            <span className="orbit o2" />
          </div>
          <h3>
            Good food deserves
            <br />a second chance.
          </h3>
          <p>Let’s make sure it gets one.</p>
          <button onClick={() => go("impact")}>
            See our collective impact <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <button onClick={() => setShowHelp(true)}>
            <CircleHelp size={17} />
            How Second Serve works
            <ArrowUpRight size={14} />
          </button>
          <div className="profile">
            <span className="avatar">{initials}</span>
            <span>
              <strong>{user.name}</strong>
              <small>{location.name} · your workspace</small>
            </span>
            <span className="online" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-toggle icon-button"
              onClick={() => setMobileNav(!mobileNav)}
              aria-label="Toggle navigation"
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{nav.find((n) => n.id === page)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="mode-badge">
              <i />
              {providerLabel(overview?.mode)}
            </span>
            <button
              className="icon-button"
              aria-label="Refresh workspace"
              onClick={() => act(refresh)}
            >
              <RefreshCw size={16} className={busy ? "spin" : ""} />
            </button>
            <button className="button secondary" onClick={onLogout}>
              Sign out
            </button>
          </div>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span /> GOOD FOOD. ANOTHER CHANCE.
              </div>
              <h1>
                {page === "overview"
                  ? "A little surplus. A lot of good."
                  : page === "pickups"
                    ? "From kitchen to community."
                    : page === "network"
                      ? "Better, together."
                      : "Every portion has a purpose."}
              </h1>
              <p>
                {page === "overview"
                  ? "Your neighbourhood has enough. Let’s get it to the right people."
                  : page === "pickups"
                    ? "Coordinate the pickup. Confirm the handoff. Close the loop."
                    : page === "network"
                      ? "The people and places that make a second chance possible."
                      : "Real handoffs, recorded by your collective. One rescue at a time."}
              </p>
            </div>
            <button className="button primary" onClick={() => setShowAdd(true)}>
              <Plus size={18} />
              List surplus food
            </button>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={17} />
              </button>
            </div>
          )}
          {!overview ? (
            <div className="loading-state">
              <LoaderCircle className="spin" />
              Connecting to your community…
              <button className="button secondary" onClick={() => act(refresh)}>
                Retry connection
              </button>
            </div>
          ) : (
            <>
              {page === "overview" && (
                <section className="workspace-guide">
                  <div>
                    <span className="eyebrow">
                      {overview.demo_data
                        ? "SAMPLE DATA IN THIS WORKSPACE"
                        : "FROM EXTRA FOOD TO A COMPLETED HANDOFF"}
                    </span>
                    <h2>
                      {overview.demo_data
                        ? "Explore a sample rescue in your area."
                        : "Good food needs a place to go."}
                    </h2>
                    <p>
                      {overview.demo_data
                        ? "Sample kitchens and partners are fictional. Run the agent, review its plan, and record a practice handoff."
                        : "Add a receiving partner and list extra food. The agent checks who can take it, prepares a pickup plan, and tracks your confirmed handoffs."}
                    </p>
                  </div>
                  <div className="guide-actions">
                    <button
                      className="button secondary"
                      onClick={() => setShowPartner(true)}
                    >
                      <Users size={16} />
                      1. Add a partner
                    </button>
                    <button
                      className="button secondary"
                      onClick={() => setShowAdd(true)}
                    >
                      <Soup size={16} />
                      2. List food
                    </button>
                    <button
                      className="button primary"
                      onClick={start}
                      disabled={!canPlan}
                    >
                      <Zap size={16} />
                      3. Plan a rescue
                    </button>
                  </div>
                  {!donations.length &&
                    !recipients.length &&
                    !missions.length && (
                      <button
                        className="sample-action"
                        disabled={busy}
                        onClick={() =>
                          act(async () => {
                            await api("/workspace/sample", {});
                            await refresh();
                            setToast(
                              "Fictional sample data added around your chosen location.",
                            );
                          })
                        }
                      >
                        Just exploring? Try a sample rescue{" "}
                        <ArrowRight size={15} />
                      </button>
                    )}
                </section>
              )}
              <section className="stats-grid" aria-label="Community statistics">
                {[
                  {
                    value: overview.available_portions,
                    label: "Portions available",
                    icon: Soup,
                    foot: `From ${overview.available_listings} local kitchens`,
                    className: "",
                  },
                  {
                    value: overview.reserved_portions,
                    label: "Portions on their way",
                    icon: Truck,
                    foot: `${overview.scheduled_trips} pickup${overview.scheduled_trips === 1 ? "" : "s"} to coordinate`,
                    className: "",
                  },
                  {
                    value: overview.partners,
                    label: "Community partners",
                    icon: Users,
                    foot: `Within 50 km of ${location.name}`,
                    className: "",
                  },
                  {
                    value: overview.rescued_portions,
                    label: "Portions rescued",
                    icon: Heart,
                    foot: "Confirmed handoffs · this workspace",
                    className: "impact-stat",
                  },
                ].map((s) => (
                  <article className={`stat ${s.className}`} key={s.label}>
                    <div className="stat-title">
                      {s.label}
                      <s.icon size={18} />
                    </div>
                    <strong key={s.value}>
                      {s.value.toLocaleString()}
                      <span>
                        {s.label === "Community partners"
                          ? " places"
                          : " portions"}
                      </span>
                    </strong>
                    <small>
                      {s.className ? (
                        <ArrowUpRight size={13} />
                      ) : (
                        <span className="stat-dot" />
                      )}
                      {s.foot}
                    </small>
                  </article>
                ))}
              </section>
              {page === "overview" && (
                <>
                  <section className="operations-grid">
                    <div className="map-panel">
                      <div className="section-top">
                        <h2>
                          Good things, close by
                          <span className="count-tag">
                            {available.length} available
                          </span>
                        </h2>
                        <span>
                          <MapPin size={13} />
                          {location.name}
                          {location.country_code
                            ? `, ${location.country_code}`
                            : ""}
                        </span>
                      </div>
                      <RescueMap
                        location={location}
                        donations={donations}
                        recipients={recipients}
                        run={run}
                        selected={selected}
                        onSelect={(id) => setSelected(id)}
                      />
                      <div className="map-selection">
                        {current && current.remaining > 0 ? (
                          <>
                            <span
                              className={`food-mini ${current.category === "Produce" ? "produce" : ""}`}
                            >
                              {foodIcon(current.category, 20)}
                            </span>
                            <div>
                              <strong>{current.donor}</strong>
                              <span>
                                {current.remaining} portions · {current.address}
                              </span>
                            </div>
                            <button onClick={() => setDetail(current)}>
                              View listing <ArrowUpRight size={15} />
                            </button>
                          </>
                        ) : (
                          <>
                            <MapPin size={19} />
                            <span>
                              Select a food marker to explore a nearby listing.
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <aside className="agent-card">
                      <div className="agent-top">
                        <span className="agent-symbol">
                          <Sparkles size={20} />
                        </span>
                        <span className="agent-status">
                          <span className="live-dot" />
                          {run?.status === "running"
                            ? "WORKING"
                            : "READY TO HELP"}
                        </span>
                      </div>
                      <div>
                        <h2>
                          Meet your
                          <br />
                          rescue coordinator.
                        </h2>
                        <p>
                          A little intelligence.
                          <br />A lot less running around.
                        </p>
                      </div>
                      <ol className="agent-steps">
                        <li>
                          <span>01</span>
                          <div>
                            <strong>Find the right match</strong>
                            <small>Dietary needs, capacity & proximity</small>
                          </div>
                        </li>
                        <li>
                          <span>02</span>
                          <div>
                            <strong>Make a pickup plan</strong>
                            <small>Prioritise food with less time left</small>
                          </div>
                        </li>
                        <li>
                          <span>03</span>
                          <div>
                            <strong>You give the green light</strong>
                            <small>Review, approve & record handoffs</small>
                          </div>
                        </li>
                      </ol>
                      {overview.mode !== "demo" && (
                        <label className="agent-context">
                          What should the coordinator know?
                          <textarea
                            aria-label="Rescue preferences"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            maxLength={1000}
                            placeholder="Prioritize a partner for tonight’s dinner…"
                          />
                          <small>
                            The model interprets partner preferences. All food
                            constraints still apply.
                          </small>
                        </label>
                      )}
                      {agentStatus && (
                        <div
                          className={`model-readiness ${agentStatus.ready ? "ready" : "pending"}`}
                          role="status"
                        >
                          <span className="live-dot" />
                          <div>
                            <strong>{agentStatus.model_id}</strong>
                            <small>{agentStatus.detail}</small>
                          </div>
                        </div>
                      )}
                      {!available.length || !recipients.length ? (
                        <p className="agent-prerequisite">
                          Add available food and a receiving partner to prepare
                          a rescue.
                        </p>
                      ) : null}
                      <div className="agent-actions">
                        <button
                          className="button agent-run"
                          onClick={start}
                          disabled={!canPlan}
                        >
                          {planning ? (
                            <LoaderCircle size={17} className="spin" />
                          ) : (
                            <Zap size={17} />
                          )}{" "}
                          {planning
                            ? "Planning your rescue…"
                            : "Run rescue agent"}
                          <ArrowRight size={17} />
                        </button>
                        <div className="agent-bottom">
                          <span>
                            {overview.mode === "demo"
                              ? "SCRIPTED DEMO · STRANDS"
                              : overview.mode === "ollama"
                                ? "LOCAL LLM · STRANDS"
                                : "AMAZON BEDROCK · STRANDS"}
                          </span>
                          <button
                            onClick={() => setShowSettings(true)}
                            aria-label="Agent planning settings"
                          >
                            <Settings2 size={16} />
                          </button>
                        </div>
                        {run && (
                          <button
                            className="last-run"
                            onClick={() => setShowRun(true)}
                          >
                            <Activity size={13} />
                            View latest run
                            <span className={`status-dot ${run.status}`} />
                            <ChevronRight size={13} />
                          </button>
                        )}
                      </div>
                    </aside>
                  </section>
                  <section className="surplus-section">
                    <div className="section-top">
                      <div>
                        <h2>
                          Fresh opportunities
                          <span className="count-tag">{available.length}</span>
                        </h2>
                        <p>Good food looking for its next table.</p>
                      </div>
                      <div className="search-box">
                        <Search size={16} />
                        <input
                          aria-label="Search surplus food"
                          placeholder="Find food or a kitchen…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                        <span>⌕</span>
                      </div>
                    </div>
                    <div className="filter-row">
                      <div
                        className="filter-tabs"
                        aria-label="Filter food category"
                      >
                        {[
                          "All food",
                          "Prepared meals",
                          "Bakery",
                          "Produce",
                        ].map((f) => (
                          <button
                            key={f}
                            className={filter === f ? "active" : ""}
                            aria-pressed={filter === f}
                            onClick={() => setFilter(f)}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                      <span className="sort-label">
                        <Clock3 size={13} />
                        Earliest pickup first
                      </span>
                    </div>
                    <div className="food-grid">
                      {filtered.map((d, i) => (
                        <button
                          className={`food-card ${selected === d.id ? "selected" : ""}`}
                          key={d.id}
                          style={{ animationDelay: `${i * 55}ms` }}
                          onClick={() => {
                            setSelected(d.id);
                            setDetail(d);
                          }}
                        >
                          <div className="food-card-top">
                            <span
                              className={`food-art ${d.category === "Produce" ? "produce" : d.category === "Bakery" ? "bakery" : "meals"}`}
                            >
                              {foodIcon(d.category, 29)}
                            </span>
                            <span
                              className={`time-badge ${mins(d.expires_at) < 90 ? "urgent" : ""}`}
                            >
                              <Clock3 size={12} />
                              {timeLabel(d.expires_at)}
                            </span>
                          </div>
                          <div className="food-category">{d.category}</div>
                          <h3>{d.food}</h3>
                          <span className="donor-name">
                            <MapPin size={12} />
                            {d.donor}
                          </span>
                          <div className="food-card-bottom">
                            <strong>
                              {d.remaining}
                              <span> portions</span>
                            </strong>
                            <span>
                              {d.vegetarian && <Leaf size={12} />}{" "}
                              {d.vegetarian ? "Vegetarian" : "Contains meat"}
                              <ArrowUpRight size={17} />
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                    {!filtered.length && (
                      <div className="empty-state">
                        <Leaf size={30} />
                        <h3>
                          {available.length
                            ? "No listings match your search."
                            : "A fresh start for the next rescue."}
                        </h3>
                        <p>
                          {available.length
                            ? "Try another food category or kitchen name."
                            : "All food has been reserved or its pickup window has closed. Add a fresh listing to keep things moving."}
                        </p>
                        <button
                          className="button secondary"
                          onClick={() =>
                            available.length
                              ? (setSearch(""), setFilter("All food"))
                              : setShowAdd(true)
                          }
                        >
                          {available.length
                            ? "Clear filters"
                            : "List surplus food"}
                        </button>
                      </div>
                    )}
                  </section>
                </>
              )}
              {page === "pickups" && (
                <section className="pickup-section">
                  <div className="section-top">
                    <div>
                      <h2>
                        The handoff board
                        <span className="count-tag">{missions.length}</span>
                      </h2>
                      <p>
                        Manifests are local records. Coordinate collection with
                        your partners.
                      </p>
                    </div>
                    <a
                      className="button secondary"
                      href="/api/missions/export.csv"
                      download
                    >
                      <ArrowDownToLine size={15} />
                      Export manifests
                    </a>
                  </div>
                  {!missions.length ? (
                    <div className="empty-state">
                      <Truck size={38} />
                      <h3>Your first rescue starts here.</h3>
                      <p>
                        Run the agent and approve a plan to create real pickup
                        records.
                      </p>
                      <button
                        className="button primary"
                        onClick={start}
                        disabled={!canPlan}
                      >
                        <Zap size={16} />
                        Plan a rescue
                      </button>
                    </div>
                  ) : (
                    <div className="mission-grid">
                      {missions.map((m, i) => (
                        <article
                          className={`mission-card ${m.status === "completed" ? "completed" : ""}`}
                          key={m.id}
                        >
                          <div className="mission-top">
                            <span className="eyebrow">
                              PICKUP {String(i + 1).padStart(2, "0")}
                            </span>
                            <span className="pill">
                              {m.status === "completed" ? (
                                <Check size={12} />
                              ) : (
                                <Clock3 size={12} />
                              )}{" "}
                              {m.status === "completed"
                                ? "Handed over"
                                : "Ready for pickup"}
                            </span>
                          </div>
                          <h3>{m.food}</h3>
                          <div className="trip-stops">
                            <div>
                              <i />
                              <span>
                                <strong>{m.donor}</strong>
                                <small>{m.pickup_address}</small>
                              </span>
                            </div>
                            <div>
                              <i />
                              <span>
                                <strong>{m.recipient}</strong>
                                <small>{m.dropoff_address}</small>
                              </span>
                            </div>
                          </div>
                          <div className="trip-numbers">
                            <strong>
                              {m.portions}
                              <small>portions</small>
                            </strong>
                            <strong>
                              {m.distance_km}
                              <small>est. km</small>
                            </strong>
                            <strong>
                              {m.eta_minutes}
                              <small>est. minutes</small>
                            </strong>
                          </div>
                          <p className="trip-note">{m.note}</p>
                          <div className="allergen-note">
                            Declared allergens:{" "}
                            {JSON.parse(m.allergens).join(", ") ||
                              "None declared"}
                          </div>
                          <button
                            className={`button ${m.status === "completed" ? "secondary" : "primary"}`}
                            disabled={busy || m.status === "completed"}
                            onClick={() => complete(m.id)}
                          >
                            <CheckCircle2 size={16} />
                            {m.status === "completed"
                              ? "Handoff recorded"
                              : "Confirm handoff"}
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              )}
              {page === "network" && (
                <section className="network-section">
                  <div className="section-top">
                    <div>
                      <h2>A neighbourhood that shows up.</h2>
                      <p>
                        Partners you add in your selected area. Capacity is the
                        number of portions they can currently receive.
                      </p>
                    </div>
                    <span className="pill">
                      <span className="live-dot" />
                      {recipients.length} connected partners
                    </span>
                  </div>
                  <button
                    className="button primary"
                    onClick={() => setShowPartner(true)}
                  >
                    <Plus size={16} />
                    Add community partner
                  </button>
                  <div className="network-grid">
                    {recipients.map((r, i) => (
                      <article className="partner-card" key={r.id}>
                        <div className="partner-visual">
                          <div className="partner-house">
                            <Users size={42} strokeWidth={1} />
                          </div>
                          <span>COMMUNITY PARTNER / 0{i + 1}</span>
                        </div>
                        <div className="partner-body">
                          <h3>{r.name}</h3>
                          <p>{r.description}</p>
                          <span className="donor-name">
                            <MapPin size={13} />
                            {r.address}
                          </span>
                          <div className="capacity-label">
                            <span>Available capacity</span>
                            <strong>
                              {r.remaining_capacity} / {r.capacity} portions
                            </strong>
                          </div>
                          <progress
                            value={r.remaining_capacity}
                            max={r.capacity}
                            aria-label={`${r.name} remaining capacity`}
                          />
                          <div className="partner-tags">
                            <span>
                              <Leaf size={12} />
                              {r.vegetarian_only
                                ? "Vegetarian only"
                                : "All meal types"}
                            </span>
                            <span>
                              {r.excluded_allergens.length
                                ? `No ${r.excluded_allergens.join(", ")}`
                                : "No allergen exclusions"}
                            </span>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}
              {page === "impact" && (
                <section className="impact-section">
                  <div className="impact-feature">
                    <div className="eyebrow">EVERY HANDOFF COUNTS</div>
                    <h2>
                      Food is meant
                      <br />
                      to be <em>shared.</em>
                    </h2>
                    <p>
                      {overview.rescued_portions
                        ? `${overview.rescued_portions} portions have reached community partners, with ${overview.completed_trips} handoffs confirmed by your coordinator.`
                        : "Your story starts with the first handoff. Run a rescue, approve the plan, and record a delivery to see your impact here."}
                    </p>
                    <button
                      className="button lime"
                      onClick={() =>
                        go(overview.scheduled_trips ? "pickups" : "overview")
                      }
                    >
                      {overview.scheduled_trips
                        ? "Complete a handoff"
                        : "Start a rescue"}
                      <ArrowUpRight size={17} />
                    </button>
                    <div className="impact-art">
                      <div className="plate">
                        <Sprout size={100} strokeWidth={0.9} />
                      </div>
                      <span className="plate-ring" />
                    </div>
                  </div>
                  <div className="impact-details">
                    <article>
                      <Heart size={25} />
                      <strong>{overview.rescued_portions}</strong>
                      <h3>Portions given a second chance</h3>
                      <p>
                        Counted only after a coordinator confirms the handoff.
                        One declared portion is not a verified meal or person
                        fed.
                      </p>
                    </article>
                    <article>
                      <Route size={25} />
                      <strong>{overview.completed_trips}</strong>
                      <h3>Community connections made</h3>
                      <p>
                        Completed pickup records saved in the database, with a
                        timestamp and recipient for every handoff.
                      </p>
                    </article>
                    <article>
                      <ShieldCheck size={25} />
                      <strong>100%</strong>
                      <h3>Approval before reservation</h3>
                      <p>
                        Every plan needs a coordinator’s approval. Quantities,
                        dietary rules, and deadlines are checked again before
                        reservation.
                      </p>
                    </article>
                  </div>
                  <a
                    href="/api/missions/export.csv"
                    download
                    className="button secondary"
                  >
                    <ArrowDownToLine size={16} />
                    Download your handoff records
                  </a>
                </section>
              )}
              <footer className="page-footer">
                <span>
                  <Sprout size={14} />
                  Made for people. Powered by possibility.
                </span>
                <span>
                  SECOND SERVE <i /> AGENTS FOR HUMANS
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {toast}
        </div>
      )}
      {showAdd && (
        <AddDonation
          location={location}
          onClose={() => setShowAdd(false)}
          onSaved={async () => {
            setShowAdd(false);
            await refresh();
            setToast("Surplus listed. Your next rescue can include it.");
          }}
        />
      )}
      {showPartner && (
        <AddPartner
          location={location}
          onClose={() => setShowPartner(false)}
          onSaved={async () => {
            setShowPartner(false);
            await refresh();
            setToast(
              "Community partner added. Your next plan can include them.",
            );
          }}
        />
      )}
      {detail && (
        <Modal
          title="A little more about this food"
          onClose={() => setDetail(null)}
        >
          <div className="listing-detail">
            <span
              className={`food-art ${detail.category === "Bakery" ? "bakery" : "produce"}`}
            >
              {foodIcon(detail.category, 34)}
            </span>
            <span className="eyebrow">{detail.category}</span>
            <h3>{detail.food}</h3>
            <p>
              {detail.donor} · {detail.address}
            </p>
            <div className="detail-stats">
              <span>
                <strong>{detail.remaining}</strong>available portions
              </span>
              <span>
                <strong>{timeLabel(detail.expires_at)}</strong>donor pickup
                window
              </span>
            </div>
            <p className="info-box">
              {detail.note || "No collection notes provided."}
            </p>
            <p>
              <strong>Declared allergens:</strong>{" "}
              {detail.allergens.join(", ") || "None declared"}
            </p>
            <p>
              <strong>Diet:</strong>{" "}
              {detail.vegetarian ? "Vegetarian" : "Contains meat"}
            </p>
            <small>
              Pickup windows and ingredients are donor-provided. Confirm
              storage, packaging, and handling at collection.
            </small>
            <button
              className="button primary"
              onClick={() => {
                setDetail(null);
                start();
              }}
              disabled={!canPlan}
            >
              <Zap size={16} />
              Include in next rescue plan
            </button>
          </div>
        </Modal>
      )}
      {showSettings && (
        <Modal
          title="Make the plan work for you"
          onClose={() => setShowSettings(false)}
        >
          <div className="settings-content">
            <label>
              Maximum trip distance <strong>{radius} km</strong>
              <input
                type="range"
                min="1"
                max="15"
                step="1"
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
              />
            </label>
            <p>
              Estimated distance from each donor to their community partner. The
              agent always checks capacity, dietary rules, and pickup windows.
            </p>
            <label>
              Coordinator context{" "}
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={1000}
                placeholder="For example: prioritize the Night Shelter for tonight’s dinner…"
              />
            </label>
            <small>
              The LLM can select a preferred partner from your context.
              Capacity, diet, distance and deadlines remain enforced by code.
              Other requests may not be supported; review the proposal. Scripted
              test mode ignores this text.
            </small>
            <button
              className="button primary"
              onClick={() => setShowSettings(false)}
            >
              Save planning preferences
              <Check size={16} />
            </button>
          </div>
        </Modal>
      )}
      {showHelp && (
        <Modal
          title="Good food. A complete second chance."
          onClose={() => setShowHelp(false)}
        >
          <div className="help-content">
            <p>
              Second Serve is a local prototype for surplus-food coordinators.
              You add surplus food and receiving community kitchens in your
              chosen area. The optional sample rescue uses fictional kitchens
              and community partners.
            </p>
            <ol>
              <li>
                <strong>List surplus.</strong> Add portions, ingredients, a
                location and a pickup window.
              </li>
              <li>
                <strong>Run the agent.</strong> Strands tools inspect inventory
                and recipient needs, then build a feasible proposal.
              </li>
              <li>
                <strong>Approve.</strong> The backend rechecks the plan and
                reserves inventory in one transaction.
              </li>
              <li>
                <strong>Close the loop.</strong> Download manifests, coordinate
                the pickup, and confirm the handoff.
              </li>
            </ol>
            <div className="info-box">
              <strong>{providerLabel(overview?.mode)}</strong>
              <p>
                {overview?.mode !== "demo"
                  ? "A real language model chooses Strands tool calls, interprets partner preferences and summarizes the saved proposal."
                  : "No API key required. A scripted model exercises the actual Strands tool loop; this mode is not an LLM."}{" "}
                Plans and handoffs are persisted. No drivers are assigned and no
                external notifications are sent.
              </p>
            </div>
          </div>
        </Modal>
      )}
      {showRun && run && (
        <Modal
          title="Your rescue, in motion."
          wide
          onClose={() => setShowRun(false)}
        >
          <div className="run-content">
            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}
            <div className="run-meta">
              <span className="pill">
                <Radio size={13} />
                {providerLabel(run.mode)} · Strands Agents
              </span>
              <span className={`run-status ${run.status}`}>
                {run.status === "ready"
                  ? run.plan?.allocations.length
                    ? "Awaiting approval"
                    : "No feasible pickups"
                  : run.status === "dispatched"
                    ? "Manifests created"
                    : run.status}
              </span>
            </div>
            {run.mode !== "demo" && (
              <div className="inference-receipt">
                <span>
                  <strong>{run.model_id || providerLabel(run.mode)}</strong>
                  Actual model used
                </span>
                <span>
                  <strong>{run.model_calls || 0}</strong>LLM responses received
                </span>
                {run.elapsed_ms != null && (
                  <span>
                    <strong>{(run.elapsed_ms / 1000).toFixed(1)}s</strong>Run
                    duration
                  </span>
                )}
              </div>
            )}
            {run.error && (
              <div className="error-banner" role="alert">
                {run.error}
              </div>
            )}
            <div
              className="run-timeline"
              aria-live="polite"
              aria-relevant="additions"
            >
              {run.events.map((e, i) => (
                <div
                  className="timeline-event"
                  key={e.id}
                  style={{ animationDelay: `${i * 70}ms` }}
                >
                  <span className="timeline-check">
                    {e.tool === "error" ? (
                      <AlertCircle size={13} />
                    ) : e.tool === "model" ? (
                      <Sparkles size={13} />
                    ) : (
                      <Check size={13} />
                    )}
                  </span>
                  <div>
                    <strong>{e.title}</strong>
                    <p>{e.detail}</p>
                    <code>{e.tool}</code>
                  </div>
                  <time>
                    {new Date(e.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              ))}
              {run.status === "running" && (
                <div className="timeline-event">
                  <LoaderCircle className="spin" size={20} />
                  <div>
                    <strong>Working through the plan…</strong>
                    <p>Live tool results will appear here.</p>
                  </div>
                </div>
              )}
            </div>
            {run.plan && (
              <>
                <div className="plan-summary">
                  <span>
                    <strong>{run.plan.total_portions}</strong>portions matched
                  </span>
                  <span>
                    <strong>{run.plan.allocations.length}</strong>pickup trips
                  </span>
                  <span>
                    <strong>{run.plan.total_km}</strong>estimated km
                  </span>
                </div>
                <h3 className="plan-heading">A second chance, mapped out.</h3>
                <div className="plan-allocations">
                  {run.plan.allocations.map((a, i) => (
                    <div className="allocation" key={i}>
                      <span className="allocation-number">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <strong>
                          {a.donor}
                          <ArrowRight size={12} />
                          {a.recipient}
                        </strong>
                        <p>{a.food}</p>
                        <small>
                          {a.eta_minutes} min est. · {a.distance_km} km ·{" "}
                          {timeLabel(a.expires_at)}
                        </small>
                      </div>
                      <b>
                        {a.portions}
                        <small>portions</small>
                      </b>
                    </div>
                  ))}
                </div>
                {run.plan.skipped.length > 0 && (
                  <div className="unmatched">
                    <h4>Needs another match</h4>
                    {run.plan.skipped.map((s, i) => (
                      <p key={i}>
                        <strong>
                          {s.donor} · {s.portions} portions
                        </strong>
                        <br />
                        {s.reason}
                      </p>
                    ))}
                  </div>
                )}
                <p className="estimate-note">
                  {run.plan.estimates} Trips are planned separately; volunteer
                  availability is not modeled.
                </p>
              </>
            )}
            {run.summary && (
              <details className="agent-summary" open={run.mode !== "demo"}>
                <summary>
                  {run.mode === "demo"
                    ? "Coordinator summary"
                    : "LLM-written coordinator summary"}
                </summary>
                <p>{run.summary}</p>
              </details>
            )}
            <div className="run-footer">
              {run.status === "ready" && (
                <>
                  <p>
                    <ShieldCheck size={16} />
                    You approve. The agent takes care of the paperwork.
                  </p>
                  <button
                    className="button primary"
                    onClick={approve}
                    disabled={busy || !run.plan?.allocations.length}
                  >
                    {busy ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <CheckCircle2 size={16} />
                    )}
                    Approve & create pickups
                  </button>
                </>
              )}
              {run.status === "dispatched" && (
                <button
                  className="button primary"
                  onClick={() => {
                    setShowRun(false);
                    go("pickups");
                  }}
                >
                  Open pickup board
                  <ArrowRight size={16} />
                </button>
              )}
              {run.status === "failed" && (
                <button
                  className="button primary"
                  disabled={!canPlan}
                  onClick={start}
                >
                  Try a new run
                  <RefreshCw size={16} />
                </button>
              )}
              {run.status !== "running" && (
                <a
                  className="download-link"
                  href={`/api/runs/${run.id}/manifest`}
                  download
                >
                  <ArrowDownToLine size={14} />
                  Download run record
                </a>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function AddPartner({
  location,
  onClose,
  onSaved,
}: {
  location: Place;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [point, setPoint] = useState<Place | null>(location);
  const [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError("");
    try {
      await api("/recipients", {
        name: f.get("name"),
        address: f.get("address"),
        capacity: Number(f.get("capacity")),
        vegetarian_only: f.get("vegetarian") === "on",
        excluded_allergens: f.getAll("allergens"),
        description: f.get("description"),
        lat: point!.lat,
        lng: point!.lng,
      });
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title="Make a place at the table." onClose={onClose}>
      <form className="donation-form" onSubmit={submit}>
        <p>
          Add a kitchen, shelter or community group you coordinate with. Confirm
          their capacity and receiving location before planning a pickup.
        </p>
        {error && (
          <p role="alert" className="error-banner">
            {error}
          </p>
        )}
        <label>
          Partner name
          <input
            name="name"
            required
            minLength={2}
            maxLength={120}
            placeholder="e.g. Neighbourhood Community Kitchen"
          />
        </label>
        <div className="form-row">
          <label>
            Receiving address
            <input
              name="address"
              required
              minLength={3}
              maxLength={200}
              placeholder="Street and collection entrance"
            />
          </label>
          <label>
            Portions they can receive
            <input
              type="number"
              name="capacity"
              min={1}
              max={10000}
              required
              placeholder="e.g. 40"
            />
          </label>
        </div>
        <label>
          About this partner
          <textarea
            name="description"
            maxLength={300}
            placeholder="Who they serve, receiving instructions…"
          />
        </label>
        <label className="checkbox-label">
          <input type="checkbox" name="vegetarian" />
          Vegetarian food only
        </label>
        <fieldset>
          <legend>Allergens they cannot accept</legend>
          <div className="allergen-grid">
            {["gluten", "dairy", "nuts", "soy", "eggs", "shellfish"].map(
              (a) => (
                <label key={a}>
                  <input type="checkbox" name="allergens" value={a} />
                  {a}
                </label>
              ),
            )}
          </div>
        </fieldset>
        <p className="form-hint">
          Set their receiving pin within 50 km of {location.name}.
        </p>
        <LocationPicker
          value={point}
          onChange={setPoint}
          pointLabel="Receiving location"
        />
        <button className="button primary" disabled={saving}>
          {saving ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Plus size={16} />
          )}
          Save community partner
        </button>
      </form>
    </Modal>
  );
}

function AddDonation({
  location,
  onClose,
  onSaved,
}: {
  location: Place;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [point, setPoint] = useState<Place | null>(location);
  const [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await api("/donations", {
        donor: f.get("donor"),
        food: f.get("food"),
        category: f.get("category"),
        portions: Number(f.get("portions")),
        allergens: f.getAll("allergens"),
        vegetarian: f.get("vegetarian") === "on",
        address: f.get("address"),
        lat: point!.lat,
        lng: point!.lng,
        pickup_within_minutes: Number(f.get("window")),
        note: f.get("note"),
      });
      await onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title="Give good food a second chance." onClose={onClose}>
      <form className="donation-form" onSubmit={submit}>
        <p>
          Tell us what’s available. Your rescue coordinator will find where it
          can do the most good.
        </p>
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        <label>
          Kitchen or donor name
          <input
            name="donor"
            required
            minLength={2}
            maxLength={100}
            placeholder="e.g. The Corner Kitchen"
          />
        </label>
        <label>
          What’s on the table?
          <input
            name="food"
            required
            minLength={3}
            maxLength={150}
            placeholder="e.g. Fresh vegetable lunch boxes"
          />
        </label>
        <div className="form-row">
          <label>
            Food category
            <select name="category">
              <option>Prepared meals</option>
              <option>Bakery</option>
              <option>Produce</option>
            </select>
          </label>
          <label>
            Available portions
            <input
              name="portions"
              type="number"
              min="1"
              max="2000"
              defaultValue="30"
              required
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            Pickup window
            <select name="window">
              <option value="60">Within 1 hour</option>
              <option value="120">Within 2 hours</option>
              <option value="240">Within 4 hours</option>
              <option value="480">Within 8 hours</option>
            </select>
          </label>
          <label>
            Pickup address
            <input
              name="address"
              required
              minLength={3}
              maxLength={200}
              placeholder="Street, neighbourhood"
            />
          </label>
        </div>
        <p className="form-hint">
          Set the actual pickup pin within 50 km of {location.name}. It starts
          at your workspace centre.
        </p>
        <LocationPicker
          value={point}
          onChange={setPoint}
          pointLabel="Pickup location"
        />
        <label className="checkbox-label">
          <input type="checkbox" name="vegetarian" defaultChecked />
          Vegetarian food
        </label>
        <fieldset>
          <legend>Declared allergens</legend>
          <div className="allergen-grid">
            {["gluten", "dairy", "nuts", "soy", "eggs", "shellfish"].map(
              (a) => (
                <label key={a}>
                  <input type="checkbox" name="allergens" value={a} />
                  {a}
                </label>
              ),
            )}
          </div>
        </fieldset>
        <label>
          Collection notes
          <textarea
            name="note"
            maxLength={600}
            placeholder="Packaging, ingredients, collection entrance…"
          />
        </label>
        <button className="button primary" type="submit" disabled={saving}>
          {saving ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Plus size={16} />
          )}{" "}
          {saving ? "Saving listing…" : "List surplus food"}
        </button>
      </form>
    </Modal>
  );
}
