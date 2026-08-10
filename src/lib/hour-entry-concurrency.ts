export interface HourEntryCasSnapshot {
  id: string;
  status: string;
  updatedAt: Date;
}

export class HourEntryConcurrencyError extends Error {
  constructor() {
    super("De urenregistratie is gelijktijdig gewijzigd. Vernieuw de pagina en probeer opnieuw.");
    this.name = "HourEntryConcurrencyError";
  }
}

export function buildHourEntryCasWhere<TStatus extends string>(snapshot: {
  id: string;
  status: TStatus;
  updatedAt: Date;
}) {
  return {
    id: snapshot.id,
    status: snapshot.status,
    updatedAt: snapshot.updatedAt,
  };
}

export function buildHourEntryBulkCasWhere<TStatus extends string>(
  snapshots: Array<{ id: string; status: TStatus; updatedAt: Date }>,
) {
  return { OR: snapshots.map(buildHourEntryCasWhere) };
}

export function assertHourEntryCasUpdated(count: number, expectedCount = 1) {
  if (count !== expectedCount) throw new HourEntryConcurrencyError();
}
