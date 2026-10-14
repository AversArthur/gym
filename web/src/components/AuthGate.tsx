import { useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, get } from '../lib/api';
import { cachedGet } from '../lib/offline/cachedGet';
import { cacheGet, cachePut } from '../lib/offline/idb';
import { flush } from '../lib/offline/outbox';
import { resetLocalData } from '../lib/offline/reset';
import { invalidateProgram } from '../lib/program';
import { store } from '../lib/storage';

export interface Me {
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'user';
}

/** Флаг явного выхода: без него офлайн пускаем по последнему успешному входу. */
export const LOGGED_OUT = 'logged-out';

/** Пускает в приложение только с сессией. Без сети доверяет последнему успешному входу. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'in' | 'out'>(() =>
    store.get(LOGGED_OUT) ? 'out' : 'checking',
  );

  useEffect(() => {
    if (state === 'checking')
      cachedGet<Me>('/api/me', 'me').then(
        () => setState('in'),
        (e) => setState(e instanceof ApiError && e.status === 401 ? 'out' : 'in'),
      );
    const onAuth = () => setState('out');
    window.addEventListener('auth-required', onAuth);
    return () => window.removeEventListener('auth-required', onAuth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signedIn(me: Me) {
    // Другой человек на этом устройстве: данные прошлого пользователя ему не показываем и не отправляем
    const prev = await cacheGet<Me>('me');
    if (prev && prev.id !== me.id) await resetLocalData();
    await cachePut('me', me);
    store.remove(LOGGED_OUT);
    invalidateProgram();
    setState('in');
    void flush();
  }

  if (state === 'checking') return null;
  if (state === 'out') return <AuthPage onDone={signedIn} />;
  return <>{children}</>;
}

function AuthPage({ onDone }: { onDone: (me: Me) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [username, setUsername] = useState(() => store.get<string>('username') ?? '');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    get<{ registrationOpen: boolean }>('/api/config').then(
      (c) => setRegistrationOpen(c.registrationOpen),
      () => {},
    );
  }, []);

  const isReg = mode === 'register';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isReg && password !== password2) return setError('Пароли не совпадают');
    setBusy(true);
    setError(undefined);
    try {
      const me = isReg
        ? await api<Me>('POST', '/api/register', { username, displayName, password })
        : await api<Me>('POST', '/api/login', { username, password });
      store.set('username', me.username);
      onDone(me);
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

  function switchMode(m: 'login' | 'register') {
    setMode(m);
    setError(undefined);
    setPassword('');
    setPassword2('');
  }

  return (
    <main className="wrap login">
      <h1 className="page-title">Gym Log</h1>
      <form className="card login-form" onSubmit={submit}>
        <h2 className="card-title">{isReg ? 'Регистрация' : 'Вход'}</h2>
        <label className="field">
          <span>Логин</span>
          <input
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value)}
            autoFocus={!username}
          />
          {isReg && <small className="muted">3–32 символа: латиница, цифры, _ . -</small>}
        </label>
        {isReg && (
          <label className="field">
            <span>Имя (как к тебе обращаться)</span>
            <input
              type="text"
              autoComplete="nickname"
              value={displayName}
              onChange={(e) => setDisplayName(e.currentTarget.value)}
            />
          </label>
        )}
        <label className="field">
          <span>Пароль</span>
          <input
            type="password"
            autoComplete={isReg ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            autoFocus={!!username && !isReg}
          />
          {isReg && <small className="muted">Не короче 8 символов</small>}
        </label>
        {isReg && (
          <label className="field">
            <span>Пароль ещё раз</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password2}
              onChange={(e) => setPassword2(e.currentTarget.value)}
            />
          </label>
        )}
        {error && <p className="small login-error">{error}</p>}
        <button
          type="submit"
          className="btn primary wide"
          disabled={busy || !username || !password || (isReg && !password2)}
        >
          {isReg ? 'Зарегистрироваться' : 'Войти'}
        </button>
        {isReg ? (
          <p className="small login-switch">
            Уже есть аккаунт?{' '}
            <button type="button" className="link" onClick={() => switchMode('login')}>
              Войти
            </button>
          </p>
        ) : registrationOpen ? (
          <p className="small login-switch">
            Нет аккаунта?{' '}
            <button type="button" className="link" onClick={() => switchMode('register')}>
              Регистрация
            </button>
          </p>
        ) : null}
        <p className="muted small">Вход запоминается на 90 дней.</p>
      </form>
    </main>
  );
}
