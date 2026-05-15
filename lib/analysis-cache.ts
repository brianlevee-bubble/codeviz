import type { GraphData } from '@/lib/types';

const CACHE_VERSION = 1;
const KEY_PREFIX = 'codeviz_analysis_v' + CACHE_VERSION + '_';

export interface CachedAnalysis {
  graphData: GraphData;
  cachedAt: string; // ISO timestamp
  directoryPath: string;
}

function cacheKey(directoryPath: string): string {
  // btoa of path as a stable key; replace non-ASCII-safe chars
  return KEY_PREFIX + btoa(unescape(encodeURIComponent(directoryPath)));
}

export function getCachedAnalysis(directoryPath: string): CachedAnalysis | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(cacheKey(directoryPath));
    if (!raw) return null;
    return JSON.parse(raw) as CachedAnalysis;
  } catch {
    return null;
  }
}

export function setCachedAnalysis(directoryPath: string, graphData: GraphData): void {
  if (typeof window === 'undefined') return;
  try {
    const entry: CachedAnalysis = { graphData, cachedAt: new Date().toISOString(), directoryPath };
    localStorage.setItem(cacheKey(directoryPath), JSON.stringify(entry));
  } catch {
    // localStorage full or unavailable — fail silently
  }
}

export function clearCachedAnalysis(directoryPath: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(cacheKey(directoryPath));
  } catch {
    // ignore
  }
}

/** Human-readable relative time string, e.g. "3 minutes ago", "2 days ago" */
export function timeAgo(isoTimestamp: string): string {
  const diff = Date.now() - new Date(isoTimestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
