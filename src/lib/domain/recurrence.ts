import { createHash } from 'node:crypto';

/**
 * Stable identity for "the same problem at the same branch": branch id plus the
 * normalised checklist item text. Template edits that only change punctuation,
 * casing or spacing therefore do not reset a branch's repeat history.
 */
export function recurrenceKey(branchId: string, itemText: string) {
  const normalised = itemText
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return `${branchId}:${createHash('sha1').update(normalised).digest('hex').slice(0, 16)}`;
}
