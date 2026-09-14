import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { LocateFixed, MapPin } from "lucide-react";
import type { Donation, Place, Recipient, Run } from "./types";
import { api } from "./types";

type Props = {
  donations: Donation[];
  recipients: Recipient[];
  run: Run | null;
  selected: string | null;
  onSelect: (id: string) => void;
  location: Place;
};
function LiveMap({
  location,
  donations = [],
  recipients = [],
  run = null,
  selected = null,
  onSelect,
  onPick,
  compact = false,
}: {
  location: Place;
  donations?: Donation[];
  recipients?: Recipient[];
  run?: Run | null;
  selected?: string | null;
  onSelect?: (id: string) => void;
  onPick?: (lat: number, lng: number) => void;
  compact?: boolean;
}) {
  const element = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    layers = useRef<L.LayerGroup | null>(null);
  const callbacks = useRef({ onSelect, onPick });
  callbacks.current = { onSelect, onPick };
  const [error, setError] = useState(""),
    [routes, setRoutes] = useState(true);
  const center = useRef(location);
  center.current = location;
  useEffect(() => {
    if (!element.current) return;
    const instance = L.map(element.current, {
      zoomControl: !compact,
      scrollWheelZoom: false,
      attributionControl: true,
    }).setView([center.current.lat, center.current.lng], compact ? 13 : 12);
    map.current = instance;
    layers.current = L.layerGroup().addTo(instance);
    let mounted = true;
    void api<{ tile_url: string }>("/map-config")
      .then((config) => {
        if (!mounted) return;
        L.tileLayer(config.tile_url, {
          maxZoom: 19,
          keepBuffer: 1,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
        })
          .on("tileerror", () => {
            if (mounted)
              setError(
                "Map imagery is unavailable. Your saved locations and rescue records still work.",
              );
          })
          .addTo(instance);
      })
      .catch(() => {
        if (mounted)
          setError(
            "Map imagery is unavailable. You can still enter or search for a location.",
          );
      });
    instance.on("click", (e: L.LeafletMouseEvent) => {
      const point = e.latlng.wrap();
      callbacks.current.onPick?.(point.lat, point.lng);
    });
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(element.current);
    return () => {
      mounted = false;
      observer.disconnect();
      instance.remove();
      map.current = null;
      layers.current = null;
    };
  }, [compact]);
  useEffect(() => {
    const group = layers.current;
    if (!group) return;
    group.clearLayers();
    const label = (name: string, detail: string) => {
      const box = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = name;
      box.append(
        title,
        document.createElement("br"),
        document.createTextNode(detail),
      );
      return box;
    };
    L.circleMarker([location.lat, location.lng], {
      radius: 7,
      color: "#657db0",
      weight: 2,
      fillColor: "#e5edff",
      fillOpacity: 1,
    })
      .bindTooltip(
        label(
          location.name,
          compact
            ? "Click the map to adjust this pin"
            : "Your workspace centre",
        ),
      )
      .addTo(group);
    if (
      routes &&
      run?.plan?.area?.lat === location.lat &&
      run.plan.area.lng === location.lng
    )
      for (const a of run.plan.allocations)
        L.polyline(
          [
            [a.pickup.lat, a.pickup.lng],
            [a.dropoff.lat, a.dropoff.lng],
          ],
          { color: "#63884b", weight: 3, dashArray: "6 7", opacity: 0.8 },
        ).addTo(group);
    recipients.forEach((r) =>
      L.marker([r.lat, r.lng], {
        icon: L.divIcon({
          className: "live-partner-pin",
          html: '<span aria-hidden="true">♥</span>',
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
        title: r.name,
      })
        .bindPopup(
          label(
            r.name,
            `${r.remaining_capacity} portions capacity · ${r.address}`,
          ),
        )
        .addTo(group),
    );
    donations
      .filter(
        (d) => d.remaining > 0 && new Date(d.expires_at).getTime() > Date.now(),
      )
      .forEach((d, i) =>
        L.marker([d.lat, d.lng], {
          icon: L.divIcon({
            className: `live-food-pin ${selected === d.id ? "selected" : ""}`,
            html: `<span>${i + 1}</span>`,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
          }),
          title: d.donor,
          keyboard: true,
        })
          .bindTooltip(label(d.donor, `${d.remaining} portions · ${d.address}`))
          .on("click", () => callbacks.current.onSelect?.(d.id))
          .addTo(group),
      );
  }, [location, donations, recipients, run, selected, routes, compact]);
  const ids =
    donations.map((d) => d.id).join(",") +
    "|" +
    recipients.map((r) => r.id).join(",");
  useEffect(() => {
    const points: L.LatLngTuple[] = [
      [location.lat, location.lng],
      ...donations.map((d) => [d.lat, d.lng] as L.LatLngTuple),
      ...recipients.map((r) => [r.lat, r.lng] as L.LatLngTuple),
    ];
    if (points.length > 1)
      map.current?.fitBounds(L.latLngBounds(points), {
        padding: [42, 42],
        maxZoom: 14,
      });
    else map.current?.setView([location.lat, location.lng], 13);
  }, [location.lat, location.lng, ids]);
  return (
    <div className={`live-map-wrap ${compact ? "compact" : ""}`}>
      <div
        ref={element}
        className="leaflet-surface"
        aria-label={`Interactive map of ${location.label}`}
      />
      {!compact && (
        <>
          <div className="live-map-label">
            <MapPin size={13} />
            {location.name}
            <span>OpenStreetMap</span>
          </div>
          <div className="live-map-legend">
            <span>
              <i />
              Food
            </span>
            <span>
              <i />
              Partners
            </span>
            <label>
              <input
                type="checkbox"
                checked={routes}
                onChange={(e) => setRoutes(e.target.checked)}
              />
              Connections
            </label>
          </div>
          <button
            className="live-map-recenter"
            type="button"
            onClick={() =>
              map.current?.setView([location.lat, location.lng], 13)
            }
            aria-label="Centre map on my location"
          >
            <LocateFixed size={18} />
          </button>
          <span className="live-map-estimates">
            Direct connections · travel estimates, not road navigation
          </span>
        </>
      )}
      {error && (
        <p className="map-service-error" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
export default function RescueMap(props: Props) {
  return <LiveMap {...props} />;
}
export function LocationMap({
  location,
  onPick,
}: {
  location: Place;
  onPick: (lat: number, lng: number) => void;
}) {
  return <LiveMap location={location} onPick={onPick} compact />;
}
