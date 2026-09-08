/**
 * Turns a computed score into the plain-language conclusion that closes the
 * inspection report. Pure — no database or request context — so it can be used
 * by the report generator, the submission service and the seed alike.
 */
export function buildRecommendation(
  score: {
    score: number | null;
    categories: { name: string; score: number | null }[];
    nonCompliantCount: number;
    partialCount: number;
  },
  findingCount: number,
) {
  const value = score.score ?? 0;
  const weakest = [...score.categories]
    .filter((c) => c.score !== null)
    .sort((a, b) => (a.score ?? 100) - (b.score ?? 100))
    .slice(0, 2);

  const parts: string[] = [];

  if (value >= 90) {
    parts.push(
      `The branch achieved an overall compliance score of ${value}%, which is within the Excellent band. Facility standards are being maintained consistently.`,
    );
  } else if (value >= 80) {
    parts.push(
      `The branch achieved an overall compliance score of ${value}% (Good). Standards are broadly met but specific gaps remain open.`,
    );
  } else if (value >= 70) {
    parts.push(
      `The branch achieved an overall compliance score of ${value}%, placing it in the Needs Improvement band. A follow-up inspection is recommended once corrective actions are closed.`,
    );
  } else {
    parts.push(
      `The branch achieved an overall compliance score of ${value}% (Poor). Management attention is required and a re-inspection should be scheduled after remediation.`,
    );
  }

  if (weakest.length > 0) {
    parts.push(
      `The weakest area${weakest.length > 1 ? 's were' : ' was'} ${weakest
        .map((c) => `${c.name} (${c.score}%)`)
        .join(' and ')}.`,
    );
  }

  if (findingCount > 0) {
    parts.push(
      `${findingCount} finding${findingCount === 1 ? '' : 's'} ${findingCount === 1 ? 'was' : 'were'} raised and assigned with remediation deadlines. Closure requires verified evidence, not self-declaration.`,
    );
  } else {
    parts.push('No non-compliances were recorded during this inspection.');
  }

  if (score.partialCount > 0) {
    parts.push(
      `${score.partialCount} item${score.partialCount === 1 ? ' was' : 's were'} rated partially compliant and should be monitored before they deteriorate into failures.`,
    );
  }

  return parts.join(' ');
}
