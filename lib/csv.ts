/**
 * One CSV cell. Text that a spreadsheet would run as a formula (starts with = + - @ tab or CR) gets a
 * leading ' so it is shown as text (OWASP CSV injection guidance); real numbers and plain numeric
 * strings like "-12.50" are left alone. Cells containing a quote, comma, CR or LF are quoted.
 */
export const cell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Downloads rows as a CSV that Excel opens correctly (UTF-8 BOM so ₹ and names survive). */
export function downloadCSV(filename: string, header: string[], rows: unknown[][]) {
  const text = [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
