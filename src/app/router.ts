/**
 * Minimal hash router.
 *
 * Hash routing rather than history routing so the built app works on any
 * static host (GitHub Pages, a file server, an S3 bucket) with no rewrite
 * rules, which is the whole point of shipping this as a static bundle.
 */

import { useSyncExternalStore } from 'react';

export const ROUTES = ['/', '/comprehension', '/journal', '/vocab', '/settings'] as const;

export type Route = (typeof ROUTES)[number];

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  return (ROUTES as readonly string[]).includes(path) ? (path as Route) : '/';
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function getSnapshot(): string {
  return window.location.hash;
}

export function useRoute(): Route {
  return parseRoute(useSyncExternalStore(subscribe, getSnapshot, () => '#/'));
}

export function navigate(route: Route): void {
  if (window.location.hash === `#${route}`) return;
  window.location.hash = route;
}

export function hrefFor(route: Route): string {
  return `#${route}`;
}
