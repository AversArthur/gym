import type { ActiveProgram } from '@gym/shared';
import { get } from './api';

// Программа меняется редко: держим одну загрузку на сессию, сбрасываем после редактирования.
let cached: Promise<ActiveProgram> | null = null;

export function loadProgram(): Promise<ActiveProgram> {
  if (!cached) {
    cached = get<ActiveProgram>('/api/program/active');
    cached.catch(() => (cached = null));
  }
  return cached;
}

export function invalidateProgram() {
  cached = null;
}
