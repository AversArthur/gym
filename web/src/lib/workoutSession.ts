// Состояние идущей тренировки: подходы с сервера + оптимистичные изменения + UI-черновики.
// Вся запись проходит через saveSet/removeSet — в фазе 8 сюда встанет офлайн-очередь.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  uuid,
  type ActiveProgram,
  type LastMap,
  type SetUpsert,
  type WorkoutDetail,
  type WorkoutPatch,
  type WorkoutSet,
} from '@gym/shared';
import { api, get } from './api';
import { loadProgram } from './program';
import { store } from './storage';

export interface Draft {
  weight?: string;
  amount?: string;
}

export interface UiState {
  /** черновики полей: ключ `${exerciseId}:${setIndex}` */
  drafts: Record<string, Draft>;
  /** лишние подходы сверх программы */
  extra: Record<string, number>;
  skipped: Record<string, boolean>;
}

const emptyUi = (): UiState => ({ drafts: {}, extra: {}, skipped: {} });
export const draftKey = (exerciseId: string, setIndex: number) => `${exerciseId}:${setIndex}`;

export type SetStatus = 'saving' | 'error';

export function useWorkoutSession(workoutId: number) {
  const [program, setProgram] = useState<ActiveProgram>();
  const [workout, setWorkout] = useState<WorkoutDetail>();
  const [last, setLast] = useState<LastMap>({});
  const [error, setError] = useState<Error>();
  const [status, setStatus] = useState<Record<string, SetStatus>>({});
  const uiKey = `workout-ui:${workoutId}`;
  const [ui, setUiState] = useState<UiState>(() => store.get<UiState>(uiKey) ?? emptyUi());
  const workoutRef = useRef(workout);
  useEffect(() => {
    workoutRef.current = workout;
  }, [workout]);

  const setUi = useCallback(
    (fn: (u: UiState) => UiState) =>
      setUiState((u) => {
        const next = fn(u);
        store.set(uiKey, next);
        return next;
      }),
    [uiKey],
  );

  useEffect(() => {
    let alive = true;
    Promise.all([loadProgram(), get<WorkoutDetail>(`/api/workouts/${workoutId}`)])
      .then(async ([p, w]) => {
        const ids = new Set<string>(w.sets.map((s) => s.exerciseId));
        p.days.find((d) => d.id === w.programDayId)?.items.forEach((i) => ids.add(i.exerciseId));
        const l = ids.size
          ? await get<LastMap>(`/api/exercises/last?ids=${[...ids].join(',')}&exclude=${w.id}`)
          : {};
        if (!alive) return;
        setProgram(p);
        setWorkout(w);
        setLast(l);
      })
      .catch((e: Error) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, [workoutId]);

  const replaceSet = (clientId: string, next: WorkoutSet | null) =>
    setWorkout((w) => {
      if (!w) return w;
      const rest = w.sets.filter((s) => s.clientId !== clientId);
      return { ...w, sets: next ? [...rest, next] : rest };
    });

  /** Сохраняет подход (новый или правку). Сразу показывает его сохранённым, откатывает статус при ошибке. */
  const saveSet = useCallback(
    async (input: Omit<SetUpsert, 'clientId' | 'workoutId'> & { clientId?: string }) => {
      const w = workoutRef.current;
      if (!w) return;
      const existing = w.sets.find(
        (s) => s.exerciseId === input.exerciseId && s.setIndex === input.setIndex,
      );
      const clientId = input.clientId ?? existing?.clientId ?? uuid();
      const body: SetUpsert = {
        ...input,
        clientId,
        workoutId: w.id,
        completedAt: existing?.completedAt ?? Date.now(),
      };
      const optimistic: WorkoutSet = {
        id: existing?.id ?? -1,
        workoutId: w.id,
        exerciseId: input.exerciseId,
        setIndex: input.setIndex,
        weight: input.weight ?? null,
        reps: input.reps ?? null,
        durationSec: input.durationSec ?? null,
        rir: input.rir ?? null,
        completedAt: body.completedAt!,
        clientId,
      };
      replaceSet(clientId, optimistic);
      setStatus((s) => ({ ...s, [clientId]: 'saving' }));
      try {
        const saved = await api<WorkoutSet>('POST', '/api/sets', body);
        replaceSet(clientId, saved);
        setStatus(({ [clientId]: _, ...s }) => s);
      } catch {
        setStatus((s) => ({ ...s, [clientId]: 'error' }));
      }
    },
    [],
  );

  const removeSet = useCallback(async (set: WorkoutSet) => {
    replaceSet(set.clientId, null);
    try {
      if (set.id > 0) await api('DELETE', `/api/sets/${set.id}`);
    } catch {
      replaceSet(set.clientId, set);
      setStatus((s) => ({ ...s, [set.clientId]: 'error' }));
    }
  }, []);

  const patchWorkout = useCallback(async (patch: WorkoutPatch) => {
    const w = workoutRef.current;
    if (!w) return;
    const saved = await api<WorkoutDetail>('PATCH', `/api/workouts/${w.id}`, patch);
    setWorkout((cur) => (cur ? { ...cur, ...saved, sets: cur.sets } : cur));
  }, []);

  const clearUi = useCallback(() => store.remove(uiKey), [uiKey]);

  return {
    program,
    workout,
    last,
    error,
    status,
    ui,
    setUi,
    saveSet,
    removeSet,
    patchWorkout,
    clearUi,
  };
}
