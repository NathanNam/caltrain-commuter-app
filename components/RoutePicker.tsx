'use client';

import { useEffect, useId, useState } from 'react';
import { SavedRoute } from '@/lib/types';
import { getStationById } from '@/lib/stations';
import { lineStations, plainName } from '@/lib/board';

interface RoutePickerProps {
  originId: string;
  destinationId: string;
  onChange: (originId: string, destinationId: string) => void;
  /** Start with the picker open (no route chosen yet). */
  forceOpen?: boolean;
}

const STORAGE_KEY = 'caltrain_saved_routes';
const MAX_ROUTES = 5;

function readSaved(): SavedRoute[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSaved(routes: SavedRoute[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
  } catch {
    // storage blocked: keep the list for this visit only
  }
}

function SwapIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 20V5m0 0L3 9m4-4l4 4M17 4v15m0 0l4-4m-4 4l-4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Compact route control: the current stations as one button (tap to change),
 * a swap button, and a fold-out panel with the station pickers and saved routes.
 */
export default function RoutePicker({ originId, destinationId, onChange, forceOpen }: RoutePickerProps) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(originId);
  const [draftTo, setDraftTo] = useState(destinationId);
  const [saved, setSaved] = useState<SavedRoute[]>([]);
  const [naming, setNaming] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [routeName, setRouteName] = useState('');
  const panelId = useId();

  useEffect(() => {
    setSaved(readSaved());
  }, []);

  useEffect(() => {
    setDraftFrom(originId);
    setDraftTo(destinationId);
  }, [originId, destinationId]);

  const isOpen = open || !!forceOpen;
  const origin = getStationById(originId);
  const destination = getStationById(destinationId);
  const hasRoute = !!origin && !!destination;
  const direction =
    hasRoute &&
    (lineStations.findIndex((s) => s.id === originId) < lineStations.findIndex((s) => s.id === destinationId)
      ? 'southbound'
      : 'northbound');

  const apply = (from: string, to: string) => {
    if (from && to && from !== to) {
      onChange(from, to);
      setOpen(false);
    }
  };

  const updateSaved = (routes: SavedRoute[]) => {
    writeSaved(routes);
    setSaved(routes);
  };

  const saveCurrent = () => {
    const name = routeName.trim();
    if (!name || !hasRoute) return;
    if (editingId) {
      updateSaved(saved.map((r) => (r.id === editingId ? { ...r, name } : r)));
    } else if (saved.length < MAX_ROUTES) {
      updateSaved([...saved, { id: Date.now().toString(), name, originId, destinationId }]);
    }
    setRouteName('');
    setEditingId(null);
    setNaming(false);
  };

  const draftValid = draftFrom && draftTo && draftFrom !== draftTo;

  return (
    <>
      {origin && destination && (
        <div className="routebar">
          <button
            type="button"
            className="route-btn"
            aria-expanded={isOpen}
            aria-controls={panelId}
            onClick={() => setOpen(!open)}
          >
            <span className="stations">
              {plainName(origin)} &rarr; {plainName(destination)}
            </span>
            <span className="meta">
              {direction} &middot; {isOpen ? 'close' : 'tap to change route'}
            </span>
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={`Swap direction: ${plainName(destination)} to ${plainName(origin)}`}
            title="Swap direction"
            onClick={() => onChange(destinationId, originId)}
          >
            <SwapIcon />
          </button>
        </div>
      )}

      {isOpen && (
        <div className="picker" id={panelId}>
          {!hasRoute && (
            <h2 className="rule-h" style={{ margin: '0 0 10px' }}>
              Choose your route
            </h2>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              apply(draftFrom, draftTo);
            }}
          >
            <div className="picker-row">
              <div className="field">
                <label htmlFor="route-from">From</label>
                <select id="route-from" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)}>
                  <option value="">Select a station</option>
                  {lineStations.map((s) => (
                    <option key={s.id} value={s.id} disabled={s.id === draftTo}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="swap-cell">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Swap from and to stations"
                  disabled={!draftFrom || !draftTo}
                  onClick={() => {
                    setDraftFrom(draftTo);
                    setDraftTo(draftFrom);
                  }}
                >
                  <SwapIcon />
                </button>
              </div>
              <div className="field field-to">
                <label htmlFor="route-to">To</label>
                <select id="route-to" value={draftTo} onChange={(e) => setDraftTo(e.target.value)}>
                  <option value="">Select a station</option>
                  {lineStations.map((s) => (
                    <option key={s.id} value={s.id} disabled={s.id === draftFrom}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="picker-actions">
              <button type="submit" className="btn btn-ink" disabled={!draftValid}>
                Show trains
              </button>
              {hasRoute && (
                <button type="button" className="btn" onClick={() => setOpen(false)}>
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="saved">
            <div className="saved-head">
              <span className="label">Saved routes</span>
              {hasRoute && !naming && saved.length < MAX_ROUTES && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setEditingId(null);
                    setRouteName('');
                    setNaming(true);
                  }}
                >
                  Save current route
                </button>
              )}
            </div>

            {naming && (
              <form
                className="saved-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveCurrent();
                }}
              >
                <div className="field">
                  <label htmlFor="route-name">{editingId ? 'Rename route' : 'Route name'}</label>
                  <input
                    id="route-name"
                    type="text"
                    value={routeName}
                    maxLength={30}
                    placeholder="e.g. Home to work"
                    onChange={(e) => setRouteName(e.target.value)}
                    autoFocus
                  />
                </div>
                <button type="submit" className="btn btn-ink" disabled={!routeName.trim()}>
                  {editingId ? 'Rename' : 'Save'}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setNaming(false);
                    setEditingId(null);
                    setRouteName('');
                  }}
                >
                  Cancel
                </button>
              </form>
            )}

            {saved.length === 0 ? (
              <p className="hint">No saved routes yet. Pick a route, then save it here for one-tap access.</p>
            ) : (
              <ul>
                {saved.map((route) => {
                  const o = getStationById(route.originId);
                  const d = getStationById(route.destinationId);
                  if (!o || !d) return null;
                  const current = route.originId === originId && route.destinationId === destinationId;
                  return (
                    <li key={route.id}>
                      <button
                        type="button"
                        className={`use${current ? ' current' : ''}`}
                        aria-current={current || undefined}
                        onClick={() => apply(route.originId, route.destinationId)}
                      >
                        <b>{route.name}</b>
                        <span>
                          {plainName(o)} &rarr; {plainName(d)}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Rename saved route ${route.name}`}
                        onClick={() => {
                          setEditingId(route.id);
                          setRouteName(route.name);
                          setNaming(true);
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Delete saved route ${route.name}`}
                        onClick={() => {
                          if (confirm(`Delete the saved route "${route.name}"?`)) {
                            updateSaved(saved.filter((r) => r.id !== route.id));
                          }
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {saved.length >= MAX_ROUTES && <p className="hint">Up to {MAX_ROUTES} routes can be saved.</p>}
          </div>
        </div>
      )}
    </>
  );
}
