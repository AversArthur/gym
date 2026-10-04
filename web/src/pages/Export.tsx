import { useState } from 'react';
import { api, get } from '../lib/api';
import { idb } from '../lib/offline/idb';
import { useSyncStatus } from '../lib/offline/outbox';

const PERIODS: [number, string][] = [
  [7, '7 дней'],
  [14, '14 дней'],
  [30, '30 дней'],
];

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Без https clipboard API недоступен — старый способ через выделение
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function Logout() {
  const { pending } = useSyncStatus();
  async function logout() {
    if (
      pending > 0 &&
      !confirm(
        `Есть неотправленные подходы (${pending}). Они отправятся после следующего входа. Выйти?`,
      )
    )
      return;
    await api('POST', '/api/logout').catch(() => {});
    await (await idb()).delete('cache', 'me');
    location.href = '/';
  }
  return (
    <div className="workout-foot">
      <button type="button" className="link danger" onClick={logout}>
        Выйти из аккаунта
      </button>
    </div>
  );
}

export function ExportPage() {
  const [days, setDays] = useState(7);
  const [report, setReport] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string>();

  async function makeReport() {
    setCopied(false);
    setError(undefined);
    try {
      const from = Date.now() - days * 86_400_000;
      const { text } = await get<{ text: string }>(
        `/api/report/week?from=${from}&tz=${new Date().getTimezoneOffset()}`,
      );
      setReport(text || 'За этот период тренировок нет.');
      if (text) setCopied(await copyText(text));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section>
      <h1 className="page-title">Экспорт</h1>

      <div className="card">
        <h2 className="card-title">Отчёт для тренера</h2>
        <p className="muted small">
          Короткий текст по каждой тренировке: дата, день, вес × повторы.
        </p>
        <div className="seg" role="group" aria-label="Период отчёта" style={{ margin: '10px 0' }}>
          {PERIODS.map(([d, label]) => (
            <button key={d} aria-pressed={days === d} onClick={() => setDays(d)}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="btn primary wide" onClick={makeReport}>
          Скопировать отчёт
        </button>
        {error && <p className="small">Ошибка: {error}</p>}
        {report && (
          <>
            <textarea
              className="report"
              readOnly
              rows={Math.min(10, report.split('\n').length + 1)}
              value={report}
              onFocus={(e) => e.currentTarget.select()}
            />
            <p className="muted small">
              {copied ? 'Скопировано — вставь в чат.' : 'Выдели текст и скопируй вручную.'}
            </p>
          </>
        )}
      </div>

      <div className="card">
        <h2 className="card-title">Все данные</h2>
        <p className="muted small">Резервная копия или анализ в таблицах.</p>
        <div className="export-links">
          <a className="btn" href="/api/export.json" download>
            JSON
          </a>
          <a className="btn" href="/api/export.csv" download>
            CSV
          </a>
        </div>
      </div>
      <Logout />
    </section>
  );
}
