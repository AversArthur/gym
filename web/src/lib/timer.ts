// Таймер отдыха: один на приложение, хранит время окончания (переживает перезагрузку и сон вкладки).
import { useSyncExternalStore } from 'react';
import { beep, vibrate } from './feedback';
import { store } from './storage';

export interface RestTimer {
  endsAt: number;
  total: number;
  label: string;
  /** время, когда таймер дозвенел (для плашки «Отдых окончен») */
  doneAt?: number;
}

const KEY = 'rest-timer';
let state: RestTimer | null = store.get<RestTimer>(KEY);
type Snapshot = (RestTimer & { left: number }) | null;
let snapshot: Snapshot = null;
const subs = new Set<() => void>();
let tick: ReturnType<typeof setInterval> | null = null;

/** Пересчитывает снимок для React; новый объект — только если что-то изменилось. */
function refresh() {
  const left = state ? Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000)) : 0;
  if (!state) snapshot = null;
  else if (
    !snapshot ||
    snapshot.left !== left ||
    snapshot.endsAt !== state.endsAt ||
    snapshot.doneAt !== state.doneAt
  )
    snapshot = { ...state, left };
  subs.forEach((f) => f());
}

function emit() {
  store.set(KEY, state);
  refresh();
}

function loop() {
  if (tick) return;
  tick = setInterval(() => {
    if (!state) return stopLoop();
    const now = Date.now();
    if (!state.doneAt && now >= state.endsAt) {
      state = { ...state, doneAt: now };
      vibrate();
      beep();
      emit();
    } else if (state.doneAt && now - state.doneAt > 6000) {
      state = null;
      emit();
      stopLoop();
    } else refresh();
  }, 250);
}
function stopLoop() {
  if (tick) clearInterval(tick);
  tick = null;
}

export const restTimer = {
  start(sec: number, label: string) {
    state = { endsAt: Date.now() + sec * 1000, total: sec, label };
    emit();
    loop();
  },
  add(sec: number) {
    if (!state) return;
    const endsAt = Math.max(Date.now(), state.endsAt + sec * 1000);
    state = { ...state, endsAt, total: Math.max(state.total + sec, 1), doneAt: undefined };
    emit();
    loop();
  },
  stop() {
    state = null;
    emit();
    stopLoop();
  },
};

if (state) {
  refresh();
  loop();
}

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

/** Текущий таймер и секунды до конца; перерисовка 4 раза в секунду, только пока таймер идёт. */
export function useRestTimer(): Snapshot {
  return useSyncExternalStore(subscribe, () => snapshot);
}
