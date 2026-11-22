/** All dates are shown in India time, whatever the device timezone is. */
export const TIME_ZONE = "Asia/Kolkata";
/** IST is a fixed UTC+05:30 (no daylight saving), so day/hour maths can use a constant offset. */
const IST_OFFSET_MS = 330 * 60 * 1000;

const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Indian grouping. Whole-rupee amounts show no decimals (₹1,200); anything else always shows
 * exactly 2 (₹27,801.60, never ₹27,801.6). -0 and values that round to 0 show as ₹0.
 */
export const formatINR = (n: number) => {
  const paise = Math.round(n * 100) || 0;
  return paise % 100 === 0 ? inr0.format(paise / 100 || 0) : inr2.format(paise / 100);
};

/** Whole rupees, for headline numbers. Never "-₹0". */
export const formatINR0 = (n: number) => inr0.format(Math.round(n) || 0);

const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
/** e.g. "19 Dec 2026, 10:30 pm" in India time. */
export const formatDate = (d: string | Date) => dateTimeFmt.format(new Date(d));

/** Shift an instant so its UTC fields read as IST wall-clock time. */
const istFields = (d: string | Date) => new Date(new Date(d).getTime() + IST_OFFSET_MS);

/** India calendar day of an instant, as "YYYY-MM-DD". */
export const dayKeyIST = (d: string | Date) => istFields(d).toISOString().slice(0, 10);

/** India wall-clock hour (0-23) of an instant. */
export const hourIST = (d: string | Date) => istFields(d).getUTCHours();

const dayLabelFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "short" });
/**
 * Short day label like "19 Dec". Accepts either a "YYYY-MM-DD" day key (already an IST day)
 * or an instant (converted to its IST day first). Same output on every device.
 */
export const dayLabelIST = (d: string | Date) => {
  const key = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : dayKeyIST(d);
  return dayLabelFmt.format(new Date(key + "T00:00:00Z"));
};
