import { useRef, useState } from "react";
import { Check, Crosshair, LoaderCircle, MapPin, Search } from "lucide-react";
import { api } from "./types";
import type { Place } from "./types";
import { LocationMap } from "./RescueMap";

export default function LocationPicker({
  value,
  onChange,
  pointLabel = "Your area",
}: {
  value: Place | null;
  onChange: (place: Place) => void;
  pointLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [manual, setManual] = useState({ name: "", lat: "", lng: "" });
  const generation = useRef(0);
  const choose = (p: Place) => {
    generation.current++;
    setBusy(false);
    setError("");
    setResults([]);
    setSearched(false);
    onChange(p);
  };
  const search = async () => {
    if (query.trim().length < 2) {
      setError("Enter at least two characters.");
      return;
    }
    const id = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const data = await api<{ results: Place[] }>(
        `/locations/search?q=${encodeURIComponent(query.trim())}`,
      );
      if (id === generation.current) {
        setResults(data.results);
        setSearched(true);
      }
    } catch (e) {
      if (id === generation.current) setError((e as Error).message);
    } finally {
      if (id === generation.current) setBusy(false);
    }
  };
  const locate = () => {
    if (!navigator.geolocation) {
      setError(
        "Device location is not supported here. Search for a city or enter coordinates.",
      );
      return;
    }
    const id = ++generation.current;
    setBusy(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (id === generation.current)
          choose({
            name: "Current area",
            label: `Near ${p.coords.latitude.toFixed(3)}, ${p.coords.longitude.toFixed(3)}`,
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            country: "",
            country_code: "",
            source: "device",
          });
      },
      () => {
        if (id === generation.current) {
          setBusy(false);
          setError(
            "Location permission was denied or the device could not locate you. You can search or enter coordinates instead.",
          );
        }
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 },
    );
  };
  return (
    <div className="location-picker">
      <label className="location-search-label">
        City or postal code
        <div className="location-search">
          <Search size={18} />
          <input
            aria-label="City or postal code"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void search();
              }
            }}
            placeholder="Search anywhere — e.g. Pune, London…"
            maxLength={100}
          />
          <button
            className="button primary"
            type="button"
            disabled={busy}
            onClick={search}
          >
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <>
                Search<span aria-hidden="true">↗</span>
              </>
            )}
          </button>
        </div>
      </label>
      <button
        className="device-location"
        type="button"
        onClick={locate}
        disabled={busy}
      >
        <Crosshair size={17} />
        Use my current location<span>With your permission</span>
      </button>
      {error && (
        <p className="location-error" role="alert">
          {error}
        </p>
      )}
      <div className="place-results" aria-live="polite">
        {results.map((p, i) => (
          <button
            type="button"
            key={`${p.lat}-${p.lng}-${i}`}
            onClick={() => choose(p)}
          >
            <MapPin size={19} />
            <span>
              <strong>{p.name}</strong>
              <small>{p.label}</small>
            </span>
            <Check size={16} />
          </button>
        ))}
        {searched && !busy && !results.length && (
          <p>
            No matching city found. Try a nearby city, device location, or
            manual coordinates.
          </p>
        )}
      </div>
      {value && (
        <div className="chosen-place">
          <div>
            <span className="chosen-icon">
              <MapPin size={20} />
            </span>
            <span>
              <small>{pointLabel}</small>
              <strong>{value.label}</strong>
              <span>
                {value.lat.toFixed(4)}, {value.lng.toFixed(4)}
              </span>
            </span>
            <Check size={18} />
          </div>
          <LocationMap
            location={value}
            onPick={(lat, lng) =>
              choose({ ...value, lat, lng, source: "manual" })
            }
          />
          <small>
            Click the map to move the pin. City search starts at the area
            centre.
          </small>
        </div>
      )}
      <details className="manual-location">
        <summary>Enter coordinates manually</summary>
        <div className="manual-grid">
          <label>
            Area name
            <input
              value={manual.name}
              onChange={(e) => setManual({ ...manual, name: e.target.value })}
              placeholder="Your city or neighbourhood"
            />
          </label>
          <label>
            Latitude
            <input
              type="number"
              min="-90"
              max="90"
              step="any"
              value={manual.lat}
              onChange={(e) => setManual({ ...manual, lat: e.target.value })}
            />
          </label>
          <label>
            Longitude
            <input
              type="number"
              min="-180"
              max="180"
              step="any"
              value={manual.lng}
              onChange={(e) => setManual({ ...manual, lng: e.target.value })}
            />
          </label>
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            const lat = Number(manual.lat),
              lng = Number(manual.lng);
            if (
              manual.name.trim().length < 2 ||
              manual.lat === "" ||
              manual.lng === "" ||
              !Number.isFinite(lat) ||
              !Number.isFinite(lng) ||
              Math.abs(lat) > 90 ||
              Math.abs(lng) > 180
            ) {
              setError(
                "Enter an area name and valid latitude (−90 to 90) and longitude (−180 to 180).",
              );
              return;
            }
            choose({
              name: manual.name.trim(),
              label: manual.name.trim(),
              lat,
              lng,
              country: "",
              country_code: "",
              source: "manual",
            });
          }}
        >
          Use these coordinates
        </button>
      </details>
      <p className="location-credit">
        City search:{" "}
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>{" "}
        ·{" "}
        <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">
          GeoNames
        </a>
        . Only your search text is sent to the lookup service. Your selected
        location is saved in your account. The map provider receives the area of
        the tiles you view.
      </p>
    </div>
  );
}
