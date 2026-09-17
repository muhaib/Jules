// Generic personal-finance categories. Each category has a "kind" — needs,
// wants, savings or debt — which is how the rule engine decides which
// budget group an expense counts against.
//
// A subcategory may override its parent's kind. That matters for
// "Debt Payment": it belongs under Financial for the user, but has to
// count against a rule's debt group (e.g. the 10% in 70/20/10) rather
// than against savings. Users can add custom categories and custom
// subcategories on top of these, each with a kind of their choosing.

export const KINDS = Object.freeze({
  NEEDS: 'needs',
  WANTS: 'wants',
  SAVINGS: 'savings',
  DEBT: 'debt',
});

export const KIND_LABELS = Object.freeze({
  needs: 'Needs',
  wants: 'Wants',
  savings: 'Savings',
  debt: 'Debt',
});

export const DEFAULT_CATEGORIES = Object.freeze([
  {
    id: 'needs',
    kind: KINDS.NEEDS,
    label: 'Needs',
    subcategories: [
      { name: 'Housing' },
      { name: 'Utilities' },
      { name: 'Groceries' },
      { name: 'Transportation' },
      { name: 'Healthcare' },
      { name: 'Education' },
      { name: 'Insurance' },
      { name: 'Communication' },
      { name: 'Essential subscriptions' },
      { name: 'Other' },
    ],
  },
  {
    id: 'wants',
    kind: KINDS.WANTS,
    label: 'Wants',
    subcategories: [
      { name: 'Dining out' },
      { name: 'Shopping' },
      { name: 'Entertainment' },
      { name: 'Travel' },
      { name: 'Hobbies' },
      { name: 'Non-essential subscriptions' },
      { name: 'Personal purchases' },
      { name: 'Other' },
    ],
  },
  {
    id: 'financial',
    kind: KINDS.SAVINGS,
    label: 'Financial',
    subcategories: [
      { name: 'Emergency Fund' },
      { name: 'Savings' },
      { name: 'Investments' },
      { name: 'Retirement' },
      { name: 'Debt Payment', kind: KINDS.DEBT },
      { name: 'Financial Goals' },
    ],
  },
]);

/** Normalize a subcategory entry, which may be a bare string (custom
 * categories created by the user) or a {name, kind} object. */
export function normalizeSubcategory(sub) {
  return typeof sub === 'string' ? { name: sub } : { ...sub };
}

export function subcategoryNames(category) {
  return (category?.subcategories || []).map((s) => normalizeSubcategory(s).name);
}

export function findCategory(categories, categoryId) {
  return categories.find((c) => c.id === categoryId) || null;
}

/**
 * The kind an expense counts as: the subcategory's own kind when it
 * overrides, otherwise the category's kind.
 */
export function resolveKind(categories, categoryId, subcategoryName) {
  const category = findCategory(categories, categoryId);
  if (!category) return null;
  const sub = (category.subcategories || [])
    .map(normalizeSubcategory)
    .find((s) => s.name === subcategoryName);
  return (sub && sub.kind) || category.kind;
}

export function mergeCategories(defaults, custom) {
  const byId = new Map(defaults.map((c) => [c.id, { ...c, subcategories: c.subcategories.map(normalizeSubcategory) }]));
  for (const c of custom || []) {
    const incoming = { ...c, subcategories: (c.subcategories || []).map(normalizeSubcategory) };
    if (byId.has(c.id)) {
      const existing = byId.get(c.id);
      const seen = new Set(existing.subcategories.map((s) => s.name));
      for (const sub of incoming.subcategories) {
        if (!seen.has(sub.name)) {
          existing.subcategories.push(sub);
          seen.add(sub.name);
        }
      }
    } else {
      byId.set(c.id, incoming);
    }
  }
  return Array.from(byId.values());
}
