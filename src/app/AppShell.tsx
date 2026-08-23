import type { ReactNode } from 'react';
import { getBackend } from '../inference';
import { Badge, cn } from '../ui';
import { BrandMark } from './BrandMark';
import { hrefFor, type Route } from './router';
import { useSettings } from './settings';

const NAV_ITEMS: readonly { route: Route; label: string }[] = [
  { route: '/', label: 'Overview' },
  { route: '/comprehension', label: 'Reading' },
  { route: '/journal', label: 'Journal' },
  { route: '/vocab', label: 'Vocabulary' },
];

export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  const { activeTier } = useSettings();
  const backend = getBackend(activeTier);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-ink-800/60 bg-ink-950/70 sticky top-0 z-20 border-b backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-5">
          <a href={hrefFor('/')} className="flex items-center gap-2.5">
            <BrandMark className="size-9 text-lg" />
            <span className="text-ink-100 hidden text-sm font-semibold tracking-tight sm:block">
              Übung
            </span>
          </a>

          <nav className="flex flex-1 items-center gap-0.5 sm:gap-1">
            {NAV_ITEMS.map((item) => {
              const active = item.route === route;
              return (
                <a
                  key={item.route}
                  href={hrefFor(item.route)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'rounded-lg px-2.5 py-1.5 text-sm transition-colors duration-150 sm:px-3',
                    active
                      ? 'bg-ink-850/80 text-ink-100'
                      : 'text-ink-400 hover:text-ink-200 hover:bg-ink-850/50',
                  )}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          <a
            href={hrefFor('/settings')}
            className="flex items-center gap-2"
            title={`Inference tier: ${backend.label}`}
          >
            <Badge tone={activeTier === 'mock' ? 'accent' : 'success'} className="hidden sm:inline-flex">
              {backend.label}
            </Badge>
            <span
              className={cn(
                'rounded-lg px-2.5 py-1.5 text-sm transition-colors duration-150',
                route === '/settings'
                  ? 'bg-ink-850/80 text-ink-100'
                  : 'text-ink-400 hover:text-ink-200 hover:bg-ink-850/50',
              )}
            >
              Settings
            </span>
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 sm:py-12">{children}</main>

      <footer className="border-ink-800/60 border-t">
        <div className="text-ink-600 mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-5 py-5 text-xs">
          <span>Fully client-side. No backend, no telemetry, no account.</span>
          <span>Data stored in this browser only.</span>
        </div>
      </footer>
    </div>
  );
}
