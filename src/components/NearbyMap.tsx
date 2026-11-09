import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Practice } from '../lib/api';

/** Centre par défaut : ville de Béjaïa. */
export const BEJAIA_CENTER: [number, number] = [36.7509, 5.0567];

type Props = {
  practices: Practice[];
  user: [number, number] | null;
  labels: { you: string; book: string; km: string; notOnMawid: string; view: string };
  name: (p: Practice) => string;
  selected?: string | null;
  onSelect?: (slug: string) => void;
  className?: string;
};

const pin = (color: string) =>
  L.divIcon({
    className: '',
    html: `<span style="display:block;width:22px;height:22px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    popupAnchor: [0, -22],
  });

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Carte OpenStreetMap des cabinets, avec la position du patient. */
export function NearbyMap({ practices, user, labels, name, selected, onSelect, className }: Props) {
  const markers = useRef<Record<string, L.Marker>>({});
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!box.current || map.current) return;
    map.current = L.map(box.current, { scrollWheelZoom: false }).setView(user || BEJAIA_CENTER, 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    markers.current = {};
    const points: L.LatLngExpression[] = [];
    if (user) {
      L.marker(user, { icon: pin('#2563eb') }).bindPopup(`<b>${esc(labels.you)}</b>`).addTo(g);
      points.push(user);
    }
    for (const p of practices) {
      if (p.latitude == null || p.longitude == null) continue;
      const dist = p.distance_km != null ? `<br>${p.distance_km} ${esc(labels.km)}` : '';
      const bookable = p.online_booking !== false;
      const link = bookable
        ? `<a href="/d/${encodeURIComponent(p.slug)}">${esc(labels.book)} →</a>`
        : `<span style="color:#64748b">${esc(labels.notOnMawid)}</span><br><a href="/d/${encodeURIComponent(p.slug)}">${esc(labels.view)} →</a>`;
      const mk = L.marker([p.latitude, p.longitude], { icon: pin(bookable ? '#0f766e' : '#94a3b8') })
        .bindPopup(`<b>${esc(name(p))}</b>${dist}<br>${link}`)
        .on('click', () => onSelect?.(p.slug))
        .addTo(g);
      markers.current[p.slug] = mk;
      // On cadre la carte sur le patient + les 5 cabinets les plus proches.
      if (points.length < (user ? 6 : 5)) points.push([p.latitude, p.longitude]);
    }
    if (points.length > 1) m.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 15, animate: false });
    else if (points.length === 1) m.setView(points[0], 14, { animate: false });
  }, [practices, user]);

  // Cabinet choisi dans la liste → on ouvre sa bulle sur la carte.
  useEffect(() => {
    const mk = selected ? markers.current[selected] : null;
    if (!mk || !map.current) return;
    map.current.panTo(mk.getLatLng(), { animate: false });
    mk.openPopup();
  }, [selected, practices]);

  return <div ref={box} className={className || 'h-72 w-full overflow-hidden rounded-2xl border border-slate-200 sm:h-96'} role="region" aria-label="Carte" />;
}
