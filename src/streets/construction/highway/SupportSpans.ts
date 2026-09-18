import { GRID_STEP, snap } from '../../../geom/clip';
import { HIGHWAY_DECK } from './dimensions';
import { contactStations } from './SupportStations';
import type { SupportObstacle } from './SupportStations';
import { clearSupportAt } from './SupportSite';
import type { HighwayEnvelope } from './schema';

/** A stretch of the run where a column stands clear, measured along the path. */
export interface ClearSpan { start: number; end: number }

const STATION_EPSILON = 1e-6;

/**
 * The stretches of the flat deck a column can stand under. Grade streets crossing
 * beneath the deck cut it into these spans; everything between them is blocked.
 */
export function clearSpans(
  envelope: HighwayEnvelope, obstacles: readonly SupportObstacle[], from: number, to: number,
): ClearSpan[] {
  const events = contactStations(envelope, from, to, obstacles);
  const spans: ClearSpan[] = [];
  for (let i = 0; i + 1 < events.length; i++) {
    const start = events[i]!, end = events[i + 1]!;
    if (end - start < STATION_EPSILON) continue;
    if (!clearSupportAt(envelope, (start + end) / 2, obstacles)) continue;
    const last = spans[spans.length - 1];
    if (last && start - last.end < STATION_EPSILON) last.end = end;
    else spans.push({ start, end });
  }
  return spans.map((span) => standable(envelope, obstacles, span)).filter((span): span is ClearSpan => span !== null);
}

/**
 * Columns for one run: one at each end of every clear span, so the deck is carried
 * on both sides of a crossing street, the stretch between them filled evenly, and
 * any column the deck carries without dropped. Returns null when a crossing is too
 * wide to bridge within the support pitch.
 */
export function planSupportStations(spans: readonly ClearSpan[], from: number, to: number): number[] | null {
  // A blocked sliver narrower than a column is no place for two of them.
  const stations = spans.flatMap((span) => fill(Math.max(span.start, from), Math.min(span.end, to)))
    .filter((station, index, all) => index === 0 || station - all[index - 1]! >= HIGHWAY_DECK.supportSize);
  const kept: number[] = [];
  for (const [index, station] of stations.entries()) {
    const previous = kept.length ? kept[kept.length - 1]! : from;
    const next = index + 1 < stations.length ? stations[index + 1]! : to;
    // A column the deck can carry without is not built.
    if (next - previous <= HIGHWAY_DECK.supportPitch + STATION_EPSILON) continue;
    kept.push(station);
  }
  let previous = from;
  for (const station of kept) {
    if (station - previous > HIGHWAY_DECK.supportPitch + STATION_EPSILON) return null;
    previous = station;
  }
  return to - previous > HIGHWAY_DECK.supportPitch + STATION_EPSILON ? null : kept;
}

/** Evenly spaced stations covering one clear stretch, ends included. */
function fill(start: number, end: number): number[] {
  if (end - start < HIGHWAY_DECK.supportSize) return [snap((start + end) / 2)];
  const steps = Math.max(1, Math.ceil((end - start) / HIGHWAY_DECK.supportPitch));
  return Array.from({ length: steps + 1 }, (_, index) => snap(start + (end - start) * index / steps));
}

/** Pulls a span's ends inward until a snapped column at each one stands clear. */
function standable(
  envelope: HighwayEnvelope, obstacles: readonly SupportObstacle[], span: ClearSpan,
): ClearSpan | null {
  let { start, end } = span;
  for (let step = 0; step < 2 && !clearSupportAt(envelope, snap(start), obstacles); step += 1) start += GRID_STEP;
  for (let step = 0; step < 2 && !clearSupportAt(envelope, snap(end), obstacles); step += 1) end -= GRID_STEP;
  if (end < start || !clearSupportAt(envelope, snap(start), obstacles) || !clearSupportAt(envelope, snap(end), obstacles)) {
    return null;
  }
  return { start: snap(start), end: snap(end) };
}
