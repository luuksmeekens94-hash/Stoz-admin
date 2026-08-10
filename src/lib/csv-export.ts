const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function neutralizeSpreadsheetCell<T>(value: T): T | string {
  if (typeof value === "string" && FORMULA_PREFIX.test(value)) {
    return `'${value}`;
  }
  return value;
}

export function sanitizeCsvRows<T extends Record<string, unknown>>(rows: T[]) {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, neutralizeSpreadsheetCell(value)]),
    ),
  );
}
