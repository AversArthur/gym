import { Link, Route, Switch, useLocation } from 'wouter';
import { TodayPage } from './pages/Today';
import { WorkoutPage } from './pages/Workout';
import { HistoryPage } from './pages/History';
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
    <>
      <main className="wrap">
        <Switch>
          <Route path="/" component={TodayPage} />
          <Route path="/workout" component={WorkoutPage} />
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
      <nav className="bottom-nav" aria-label="Разделы">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} aria-current={location === n.href ? 'page' : undefined}>
            {n.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
