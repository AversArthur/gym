import { useSyncStatus } from '../lib/offline/outbox';

/** «сохранено» / «ждёт синхронизации (3)» / «офлайн». */
export function SyncBadge() {
  const { pending, state } = useSyncStatus();
  let text: string, kind: string;
  if (state === 'auth') [text, kind] = ['нужен вход', 'warn'];
  else if (pending === 0) [text, kind] = ['сохранено', 'ok'];
  else if (state === 'offline') [text, kind] = [`офлайн · ждёт отправки (${pending})`, 'wait'];
  else if (state === 'syncing') [text, kind] = [`отправляется (${pending})`, 'wait'];
  else [text, kind] = [`ждёт синхронизации (${pending})`, 'wait'];
  return (
    <span className={`sync-badge ${kind}`} role="status">
      <span className="sync-dot" aria-hidden />
      {text}
    </span>
  );
}
