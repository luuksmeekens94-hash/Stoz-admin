import type { Prisma } from "@prisma/client";
import { HourInputError } from "@/lib/hour-entry-validation";

export async function databaseAmsterdamDateKey(tx: Prisma.TransactionClient) {
  const rows = await tx.$queryRaw<Array<{ dateKey: string }>>`
    SELECT to_char(clock_timestamp() AT TIME ZONE 'Europe/Amsterdam', 'YYYY-MM-DD') AS "dateKey"
  `;
  const dateKey = rows[0]?.dateKey;
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new HourInputError("De actuele Nederlandse registratiedag kon niet worden vastgesteld.");
  }
  return dateKey;
}
