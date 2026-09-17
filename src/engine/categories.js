// Default expense categories. Each category belongs to a "kind" — needs,
// wants or savings — which is how the rule engine decides which budget
// group an expense counts against. Users can add custom categories on top
// of these (see store.js) with a kind of their choosing.

export const KINDS = Object.freeze({
  NEEDS: 'needs',
  WANTS: 'wants',
  SAVINGS: 'savings',
  DEBT: 'debt',
});

export const DEFAULT_CATEGORIES = Object.freeze([
  {
    id: 'needs',
    kind: KINDS.NEEDS,
    label: 'Needs',
    subcategories: [
      'Rent', 'Electricity', 'Gas', 'Water', 'Groceries',
      'Transportation', 'Medical', 'Education', 'Phone/Internet', 'Other',
    ],
  },
  {
    id: 'wants',
    kind: KINDS.WANTS,
    label: 'Wants',
    subcategories: [
      'Restaurants', 'Shopping', 'Entertainment', 'Travel',
      'Hobbies', 'Subscriptions', 'Other',
    ],
  },
  {
    id: 'savings',
    kind: KINDS.SAVINGS,
    label: 'Savings',
    subcategories: [
      'Emergency Fund', 'General Savings', 'Investment', 'Retirement', 'Other',
    ],
  },
  {
    id: 'debt',
    kind: KINDS.DEBT,
    label: 'Debt',
    subcategories: [
      'Loan Installment', 'Credit Card', 'Other',
    ],
  },
]);

export function findCategoryKind(categories, categoryId) {
  const cat = categories.find((c) => c.id === categoryId);
  return cat ? cat.kind : null;
}

export function mergeCategories(defaults, custom) {
  const byId = new Map(defaults.map((c) => [c.id, { ...c, subcategories: [...c.subcategories] }]));
  for (const c of custom || []) {
    if (byId.has(c.id)) {
      const existing = byId.get(c.id);
      existing.subcategories = Array.from(new Set([...existing.subcategories, ...(c.subcategories || [])]));
    } else {
      byId.set(c.id, c);
    }
  }
  return Array.from(byId.values());
}
