import { useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from '../lib/api';
import { cachedGet } from '../lib/offline/cachedGet';
import { cachePut } from '../lib/offline/idb';
import { flush } from '../lib/offline/outbox';
import { invalidateProgram } from '../lib/program';
import { store } from '../lib/storage';

interface Me {
  id: number;
  username: string;
  displayName: string;
}

/** Пускает в приложение только с сессией. Без сети доверяет последнему успешному входу. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'in' | 'out'>('checking');

  useEffect(() => {
    cachedGet<Me>('/api/me', 'me').then(
      () => setState('in'),
      (e) => setState(e instanceof ApiError && e.status === 401 ? 'out' : 'in'),
    );
    const onAuth = () => setState('out');
    window.addEventListener('auth-required', onAuth);
    return () => window.removeEventListener('auth-required', onAuth);
  }, []);

  if (state === 'checking') return null;
  if (state === 'out')
    return (
      <LoginPage
        onDone={() => {
          invalidateProgram();
          setState('in');
          void flush();
        }}
      />
    );
  return <>{children}</>;
}

function LoginPage({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState(() => store.get<string>('username') ?? 'arthur');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const me = await api<Me>('POST', '/api/login', { username, password });
      store.set('username', username);
      await cachePut('me', me);
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 0
          ? 'Нет связи с сервером'
          : (err as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap login">
      <h1 className="page-title">Gym Log</h1>
      <form className="card login-form" onSubmit={submit}>
        <label className="field">
          <span>Логин</span>
          <input
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value)}
          />
        </label>
        <label className="field">
          <span>Пароль</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            autoFocus
          />
        </label>
        {error && <p className="small login-error">{error}</p>}
        <button type="submit" className="btn primary wide" disabled={busy || !password}>
          Войти
        </button>
        <p className="muted small">Вход запоминается на 90 дней.</p>
      </form>
    </main>
  );
}
