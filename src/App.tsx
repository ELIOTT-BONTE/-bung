import { ComprehensionMode } from './modes/comprehension/ComprehensionMode';
import { JournalingMode } from './modes/journaling/JournalingMode';
import { VocabTrainingMode } from './modes/vocab-training/VocabTrainingMode';
import { AppShell } from './app/AppShell';
import { FirstRun } from './app/FirstRun';
import { Home } from './app/Home';
import { SettingsScreen } from './app/SettingsScreen';
import { useRoute } from './app/router';
import { SettingsProvider, useSettings } from './app/settings';
import { Alert, Spinner } from './ui';

function Routes() {
  const route = useRoute();

  switch (route) {
    case '/comprehension':
      return <ComprehensionMode />;
    case '/journal':
      return <JournalingMode />;
    case '/vocab':
      return <VocabTrainingMode />;
    case '/settings':
      return <SettingsScreen />;
    default:
      return <Home />;
  }
}

function Bootstrapped() {
  const { settings, ready, error } = useSettings();
  const route = useRoute();

  if (error) {
    return (
      <main className="mx-auto max-w-xl px-5 py-24">
        <Alert tone="danger" title="Could not open local storage">
          {error.message} This app needs IndexedDB, which private-browsing modes sometimes block.
        </Alert>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </main>
    );
  }

  if (!settings.firstRunCompleted) {
    return <FirstRun />;
  }

  return (
    <AppShell route={route}>
      <Routes />
    </AppShell>
  );
}

export function App() {
  return (
    <SettingsProvider>
      <Bootstrapped />
    </SettingsProvider>
  );
}
