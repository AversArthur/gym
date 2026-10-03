export const DAY_CODES = ['A', 'B', 'C'] as const;
export type DayCode = (typeof DAY_CODES)[number];

export interface HealthResponse {
  ok: true;
  version: string;
}
