import { Link, Route, Switch, useLocation } from 'wouter';
import { TodayPage } from './pages/Today';
import { WorkoutPage } from './pages/Workout';
import { WorkoutSummaryPage } from './pages/WorkoutSummary';
import { RestTimerBar } from './components/RestTimerBar';
import { AuthGate } from './components/AuthGate';
import { HistoryPage } from './pages/History';
import { HistoryDetailPage } from './pages/HistoryDetail';
import { ProgressPage } from './pages/Progress';
import { ProgramPage } from './pages/Program';
import { ExportPage } from './pages/Export';
import { DevAnimsPage } from './pages/DevAnims';

const NAV = [
  { href: '/', label: 'Сегодня' },
  { href: '/history', label: 'История' },
  { href: '/progress', label: 'Прогресс' },
  { href: '/program', label: 'Программа' },
  { href: '/export', label: 'Экспорт' },
] as const;

export function App() {
  const [location] = useLocation();
  return (
    <AuthGate>
      <main className="wrap">
        <Switch>
          <Route path="/" component={TodayPage} />
          <Route path="/workout/:id/summary" component={WorkoutSummaryPage} />
          <Route path="/workout/:id" component={WorkoutPage} />
          <Route path="/history/:id" component={HistoryDetailPage} />
          <Route path="/history" component={HistoryPage} />
          <Route path="/progress" component={ProgressPage} />
          <Route path="/program" component={ProgramPage} />
          <Route path="/export" component={ExportPage} />
          <Route path="/dev/anims" component={DevAnimsPage} />
          <Route>
            <h1>Не найдено</h1>
          </Route>
        </Switch>
      </main>
      <RestTimerBar />
      <nav className="bottom-nav" aria-label="Разделы">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={
              (
                n.href === '/'
                  ? location === '/' || location.startsWith('/workout')
                  : location.startsWith(n.href)
              )
                ? 'page'
                : undefined
            }
          >
            {n.label}
          </Link>
        ))}
      </nav>
    </AuthGate>
  );
}
