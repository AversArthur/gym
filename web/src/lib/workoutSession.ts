// Идущая тренировка, local-first: источник правды — копия в IndexedDB,
// каждое изменение кладётся в очередь и уходит на сервер, когда есть сеть.
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
import { get } from './api';
import { loadLastAll, loadProgram } from './program';
import { store } from './storage';
import { localWorkouts, type LocalWorkout } from './offline/idb';
import { enqueue } from './offline/outbox';

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

/** Начать тренировку: локальная запись + операция в очереди. Работает без сети. */
export async function startWorkout(program: ActiveProgram, dayId: number): Promise<string> {
  const day = program.days.find((d) => d.id === dayId)!;
  const lastAll = await loadLastAll(program);
  const last: LastMap = Object.fromEntries(
    day.items.map((i) => [i.exerciseId, lastAll[i.exerciseId] ?? null]),
  );
  const w: LocalWorkout = {
    clientId: uuid(),
    programDayId: day.id,
    dayCode: day.code,
    startedAt: Date.now(),
    finishedAt: null,
    notes: null,
    sets: [],
    last,
  };
  await localWorkouts.put(w);
  await enqueue({
    op: 'workout.create',
    clientId: w.clientId,
    programDayId: day.id,
    startedAt: w.startedAt,
  });
  return w.clientId;
}

/** Тренировка с сервера → локальная копия (например, начатая на другом устройстве). */
async function fromServer(clientId: string): Promise<LocalWorkout> {
  const w = await get<WorkoutDetail>(`/api/workouts/by-client/${clientId}`);
  const p = await loadProgram();
  const ids = new Set(w.sets.map((s) => s.exerciseId));
  p.days.find((d) => d.id === w.programDayId)?.items.forEach((i) => ids.add(i.exerciseId));
  const last = ids.size
    ? await get<LastMap>(`/api/exercises/last?ids=${[...ids].join(',')}&exclude=${w.id}`)
    : {};
  return {
    clientId,
    serverId: w.id,
    programDayId: w.programDayId,
    dayCode: w.dayCode,
    startedAt: w.startedAt,
    finishedAt: w.finishedAt,
    notes: w.notes,
    sets: w.sets,
    last,
  };
}

export async function loadLocalOrServer(clientId: string): Promise<LocalWorkout> {
  const local = await localWorkouts.get(clientId);
  if (local) return local;
  const w = await fromServer(clientId);
  if (w.finishedAt == null) await localWorkouts.put(w);
  return w;
}

export function useWorkoutSession(clientId: string) {
  const [program, setProgram] = useState<ActiveProgram>();
  const [workout, setWorkout] = useState<LocalWorkout>();
  const [error, setError] = useState<Error>();
  const uiKey = `workout-ui:${clientId}`;
  const [ui, setUiState] = useState<UiState>(() => store.get<UiState>(uiKey) ?? emptyUi());
  const ref = useRef<LocalWorkout | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    Promise.all([loadProgram(), loadLocalOrServer(clientId)])
      .then(([p, w]) => {
        if (!alive) return;
        ref.current = w;
        setProgram(p);
        setWorkout(w);
      })
      .catch((e: Error) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, [clientId]);

  const setUi = useCallback(
    (fn: (u: UiState) => UiState) =>
      setUiState((u) => {
        const next = fn(u);
        store.set(uiKey, next);
        return next;
      }),
    [uiKey],
  );

  /** Обновить локальную копию: состояние React + IndexedDB. */
  const commit = useCallback((fn: (w: LocalWorkout) => LocalWorkout) => {
    const cur = ref.current;
    if (!cur) return;
    const next = fn(cur);
    ref.current = next;
    setWorkout(next);
    void localWorkouts.put(next);
  }, []);

  const saveSet = useCallback(
    async (input: Omit<SetUpsert, 'clientId' | 'workoutId' | 'workoutClientId'>) => {
      const w = ref.current;
      if (!w) return;
      const existing = w.sets.find(
        (s) => s.exerciseId === input.exerciseId && s.setIndex === input.setIndex,
      );
      const set: WorkoutSet = {
        id: existing?.id ?? -1,
        workoutId: w.serverId ?? -1,
        exerciseId: input.exerciseId,
        setIndex: input.setIndex,
        weight: input.weight ?? null,
        reps: input.reps ?? null,
        durationSec: input.durationSec ?? null,
        rir: input.rir ?? null,
        completedAt: existing?.completedAt ?? Date.now(),
        clientId: existing?.clientId ?? uuid(),
      };
      commit((cur) => ({
        ...cur,
        sets: [...cur.sets.filter((s) => s.clientId !== set.clientId), set],
      }));
      await enqueue({
        op: 'set.upsert',
        set: {
          clientId: set.clientId,
          workoutClientId: w.clientId,
          exerciseId: set.exerciseId,
          setIndex: set.setIndex,
          weight: set.weight,
          reps: set.reps,
          durationSec: set.durationSec,
          rir: set.rir,
          completedAt: set.completedAt,
        },
      });
    },
    [commit],
  );

  const removeSet = useCallback(
    async (set: WorkoutSet) => {
      commit((cur) => ({ ...cur, sets: cur.sets.filter((s) => s.clientId !== set.clientId) }));
      await enqueue({ op: 'set.delete', clientId: set.clientId });
    },
    [commit],
  );

  const patchWorkout = useCallback(
    async (patch: WorkoutPatch) => {
      const w = ref.current;
      if (!w) return;
      commit((cur) => ({
        ...cur,
        ...(patch.finishedAt !== undefined ? { finishedAt: patch.finishedAt } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      }));
      await enqueue({ op: 'workout.update', clientId: w.clientId, patch });
    },
    [commit],
  );

  const discard = useCallback(async () => {
    await localWorkouts.delete(clientId);
    await enqueue({ op: 'workout.delete', clientId });
    store.remove(uiKey);
  }, [clientId, uiKey]);

  const clearUi = useCallback(() => store.remove(uiKey), [uiKey]);

  return {
    program,
    workout,
    last: workout?.last ?? {},
    error,
    status: {} as Record<string, SetStatus>,
    ui,
    setUi,
    saveSet,
    removeSet,
    patchWorkout,
    discard,
    clearUi,
  };
}
