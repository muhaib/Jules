'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';

type Person = { id: string; name: string; role: string };

/**
 * The workflow controls for a finding. Which panel a user sees is driven by the
 * permissions the server already checked, so the UI never offers an action the
 * API would refuse.
 */
export function FindingActions({
  findingId,
  status,
  can,
  people,
  currentAssigneeId,
  currentDueDate,
  currentSeverity,
}: {
  findingId: string;
  status: string;
  can: { assign: boolean; respond: boolean; verify: boolean };
  people: Person[];
  currentAssigneeId: string | null;
  currentDueDate: string;
  currentSeverity: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function post(path: string, body: unknown, key: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(`/api/v1/findings/${findingId}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'The action could not be completed');
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError('Network error — check your connection and try again');
      return false;
    } finally {
      setBusy(null);
    }
  }

  const closed = status === 'CLOSED' || status === 'CANCELLED';

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-md border border-bad/25 bg-bad/10 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}

      {can.assign && !closed && (
        <AssignPanel
          people={people}
          currentAssigneeId={currentAssigneeId}
          currentDueDate={currentDueDate}
          currentSeverity={currentSeverity}
          busy={busy === 'assign'}
          onSubmit={(body) => post('/assign', body, 'assign')}
        />
      )}

      {can.respond && !closed && (
        <>
          {(status === 'OPEN' || status === 'ASSIGNED') && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => post('/start', {}, 'start')}
              className="btn-primary w-full"
            >
              {busy === 'start' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Acknowledge and start corrective action
            </button>
          )}

          {status === 'IN_PROGRESS' && (
            <SubmitEvidencePanel
              findingId={findingId}
              busy={busy === 'evidence'}
              onSubmit={(body) => post('/evidence', body, 'evidence')}
            />
          )}

          {status === 'UNDER_VERIFICATION' && (
            <p className="rounded-md border border-accent/25 bg-accent-soft px-3 py-2.5 text-sm text-accent">
              Evidence submitted. Waiting for a verifier to review it.
            </p>
          )}
        </>
      )}

      {can.verify && status === 'UNDER_VERIFICATION' && (
        <VerifyPanel busy={busy} onSubmit={(body) => post('/verify', body, 'verify')} />
      )}

      {can.verify && status === 'CLOSED' && (
        <ReopenPanel busy={busy === 'reopen'} onSubmit={(body) => post('/reopen', body, 'reopen')} />
      )}
    </div>
  );
}

function AssignPanel({
  people,
  currentAssigneeId,
  currentDueDate,
  currentSeverity,
  busy,
  onSubmit,
}: {
  people: Person[];
  currentAssigneeId: string | null;
  currentDueDate: string;
  currentSeverity: string;
  busy: boolean;
  onSubmit: (body: unknown) => Promise<boolean>;
}) {
  return (
    <form
      className="space-y-3 rounded-md border border-line bg-raised p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        await onSubmit({
          assignedToId: f.get('assignedToId'),
          dueDate: f.get('dueDate') || undefined,
          severity: f.get('severity'),
          note: f.get('note') || undefined,
        });
      }}
    >
      <p className="section-title">Assign responsibility</p>

      <div>
        <label className="label" htmlFor="assignedToId">
          Responsible person
        </label>
        <select id="assignedToId" name="assignedToId" defaultValue={currentAssigneeId ?? ''} required className="input">
          <option value="" disabled>
            Select a person
          </option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.role}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="severity">
            Severity
          </label>
          <select id="severity" name="severity" defaultValue={currentSeverity} className="input">
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="dueDate">
            Due date
          </label>
          <input
            id="dueDate"
            name="dueDate"
            type="date"
            defaultValue={currentDueDate.slice(0, 10)}
            className="input"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="note">
          Note (optional)
        </label>
        <input id="note" name="note" className="input" placeholder="Context for the owner" />
      </div>

      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Save assignment
      </button>
      <p className="text-2xs text-muted">
        Changing severity re-bases the deadline on the policy for that severity unless you set a date.
      </p>
    </form>
  );
}

function SubmitEvidencePanel({
  findingId,
  busy,
  onSubmit,
}: {
  findingId: string;
  busy: boolean;
  onSubmit: (body: unknown) => Promise<boolean>;
}) {
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setUploading(true);
    setUploadError(null);
    for (const file of Array.from(list)) {
      const form = new FormData();
      form.append('file', file);
      form.append('findingId', findingId);
      form.append('kind', 'AFTER');
      form.append('caption', file.name);
      const res = await fetch('/api/v1/evidence', { method: 'POST', body: form });
      if (res.ok) {
        const data = await res.json();
        setFiles((prev) => [...prev, { id: data.data.id, name: file.name }]);
      } else {
        const data = await res.json().catch(() => ({}));
        setUploadError(data.error ?? `Could not upload ${file.name}`);
      }
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <form
      className="space-y-3 rounded-md border border-line bg-raised p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const done = await onSubmit({
          description: f.get('description'),
          actionTaken: f.get('actionTaken') || undefined,
          evidenceIds: files.map((x) => x.id),
        });
        if (done) setFiles([]);
      }}
    >
      <p className="section-title">Submit corrective action for verification</p>

      <div>
        <label className="label" htmlFor="description">
          What was done?
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={3}
          className="input"
          placeholder="Describe the correction so a verifier can check it against the evidence."
        />
      </div>

      <div>
        <label className="label" htmlFor="actionTaken">
          Who carried it out? (optional)
        </label>
        <input id="actionTaken" name="actionTaken" className="input" placeholder="Vendor, technician, date" />
      </div>

      <div>
        <span className="label">After photos</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          capture="environment"
          onChange={(e) => upload(e.target.files)}
          className="hidden"
          id="after-photos"
        />
        <label htmlFor="after-photos" className="btn-secondary w-full cursor-pointer">
          <Camera className="h-4 w-4" aria-hidden />
          {uploading ? 'Uploading…' : 'Add photo evidence'}
        </label>
        {files.length > 0 && (
          <ul className="mt-2 space-y-1">
            {files.map((f) => (
              <li key={f.id} className="truncate text-2xs text-ok">
                ✓ {f.name}
              </li>
            ))}
          </ul>
        )}
        {uploadError && <p className="mt-1 text-2xs text-bad">{uploadError}</p>}
      </div>

      <button type="submit" disabled={busy || uploading} className="btn-primary w-full">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Submit for verification
      </button>
    </form>
  );
}

function VerifyPanel({
  busy,
  onSubmit,
}: {
  busy: string | null;
  onSubmit: (body: unknown) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<'ACCEPT' | 'REJECT' | null>(null);

  return (
    <div className="space-y-3 rounded-md border border-line bg-raised p-3">
      <p className="section-title">Verification decision</p>
      <p className="text-xs text-muted">
        Accepting closes the finding. Rejecting returns it to the branch for rework — the reason is
        recorded and sent to the owner.
      </p>

      {mode === null && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setMode('ACCEPT')} className="btn-primary">
            Accept
          </button>
          <button type="button" onClick={() => setMode('REJECT')} className="btn-danger">
            Reject
          </button>
        </div>
      )}

      {mode !== null && (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const done = await onSubmit({ decision: mode, comment: f.get('comment') || undefined });
            if (done) setMode(null);
          }}
        >
          <div>
            <label className="label" htmlFor="comment">
              {mode === 'ACCEPT' ? 'Closure note (optional)' : 'Why is this being rejected?'}
            </label>
            <textarea
              id="comment"
              name="comment"
              rows={3}
              required={mode === 'REJECT'}
              className="input"
              placeholder={
                mode === 'ACCEPT'
                  ? 'Evidence is clear and the condition is corrected.'
                  : 'e.g. Uploaded photo does not clearly show the corrected cable dressing.'
              }
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy !== null}
              className={mode === 'ACCEPT' ? 'btn-primary flex-1' : 'btn-danger flex-1'}
            >
              {busy === 'verify' && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === 'ACCEPT' ? 'Accept and close' : 'Reject and return for rework'}
            </button>
            <button type="button" onClick={() => setMode(null)} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function ReopenPanel({ busy, onSubmit }: { busy: boolean; onSubmit: (body: unknown) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary w-full">
        Reopen this finding
      </button>
    );
  }

  return (
    <form
      className="space-y-3 rounded-md border border-line bg-raised p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const done = await onSubmit({ reason: f.get('reason') });
        if (done) setOpen(false);
      }}
    >
      <p className="section-title">Reopen finding</p>
      <p className="text-xs text-muted">
        This reverses a verified closure. The reason is written to the audit trail.
      </p>
      <textarea
        name="reason"
        required
        rows={3}
        className="input"
        placeholder="Why is this being reopened?"
      />
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn-danger flex-1">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Reopen
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
