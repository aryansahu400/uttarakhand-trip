export const CATEGORIES = [
  { value: "food", label: "Food & drinks", color: "#2a78d6" },
  { value: "travel", label: "Fuel & travel", color: "#eb6834" },
  { value: "stay", label: "Stay", color: "#1baf7a" },
  { value: "activities", label: "Activities", color: "#eda100" },
  { value: "shopping", label: "Shopping", color: "#e87ba4" },
  { value: "other", label: "Other", color: "#008300" },
] as const;

export type Category = (typeof CATEGORIES)[number]["value"];
export const CATEGORY_VALUES = CATEGORIES.map((c) => c.value) as [Category, ...Category[]];
export const categoryOf = (v: string | null | undefined) => CATEGORIES.find((c) => c.value === v) ?? CATEGORIES[5];

const KEYWORDS: Record<Exclude<Category, "other">, RegExp> = {
  food: /\b(food|dinner|lunch|breakfast|snack|maggi|tea|chai|coffee|cafe|dhaba|restaurant|meal|water|drinks?|beer|momos?|paratha|thali|ice ?cream)\b/i,
  travel: /\b(petrol|diesel|fuel|cab|taxi|bus|train|flight|toll|parking|tempo|auto|uber|ola|ticket|travel|ride)\b/i,
  stay: /\b(hotel|stay|room|hostel|homestay|camp|tent|resort|airbnb|lodge|night)\b/i,
  activities: /\b(rafting|trek|trekking|bungee|zipline|paragliding|activity|activities|entry|guide|ropeway|safari|camping)\b/i,
  shopping: /\b(shop|shopping|jacket|gloves|souvenir|clothes|shoes|cap|socks|medicine|pharmacy)\b/i,
};

/** Best-guess category from the description; null if nothing matches. */
export function guessCategory(description: string): Category | null {
  for (const [cat, re] of Object.entries(KEYWORDS)) if (re.test(description)) return cat as Category;
  return null;
}
