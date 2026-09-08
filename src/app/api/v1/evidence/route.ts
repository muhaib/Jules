import { z } from 'zod';

import { prisma } from '@/lib/db';
import { fail, ok, route } from '@/lib/api';
import { badRequest, forbidden, notFound, requireApi } from '@/lib/auth/guard';
import { MAX_UPLOAD_BYTES } from '@/lib/env';
import { ALLOWED_MIME, storeEvidence } from '@/lib/storage';
import { audit } from '@/lib/audit';
import { requestMeta } from '@/lib/auth/session';

const metaSchema = z.object({
  responseId: z.string().optional(),
  findingId: z.string().optional(),
  correctiveActionId: z.string().optional(),
  kind: z.enum(['INSPECTION', 'BEFORE', 'AFTER', 'VERIFICATION']).default('INSPECTION'),
  caption: z.string().max(500).optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  capturedAt: z.coerce.date().optional(),
});

/**
 * POST /api/v1/evidence — multipart upload.
 *
 * The file is stored exactly as received. Evidence is never re-encoded or
 * downscaled: a compressed photo that no longer shows the defect is worthless
 * as proof, which is the whole point of the record.
 */
export const POST = route(async (req) => {
  const user = await requireApi();
  const meta = await requestMeta();

  const form = await req.formData().catch(() => null);
  if (!form) throw badRequest('Expected a multipart/form-data upload');

  const file = form.get('file');
  if (!(file instanceof File)) throw badRequest('No file was uploaded');

  if (file.size === 0) throw badRequest('The uploaded file is empty');
  if (file.size > MAX_UPLOAD_BYTES()) {
    return fail(413, `File exceeds the ${Math.round(MAX_UPLOAD_BYTES() / 1024 / 1024)} MB limit`);
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    throw badRequest(`Unsupported file type "${file.type || 'unknown'}"`);
  }

  const parsed = metaSchema.parse({
    responseId: form.get('responseId') ?? undefined,
    findingId: form.get('findingId') ?? undefined,
    correctiveActionId: form.get('correctiveActionId') ?? undefined,
    kind: form.get('kind') ?? undefined,
    caption: form.get('caption') ?? undefined,
    latitude: form.get('latitude') ?? undefined,
    longitude: form.get('longitude') ?? undefined,
    capturedAt: form.get('capturedAt') ?? undefined,
  });

  if (!parsed.responseId && !parsed.findingId) {
    throw badRequest('Evidence must be attached to a checklist response or a finding');
  }

  // Ownership checks — evidence can only be attached to rows in the caller's org.
  if (parsed.responseId) {
    const response = await prisma.inspectionResponse.findFirst({
      where: { id: parsed.responseId, inspection: { organizationId: user.organizationId } },
      include: { inspection: { select: { inspectorId: true, status: true } } },
    });
    if (!response) throw notFound('Checklist item not found');
    if (response.inspection.status === 'SUBMITTED') {
      throw badRequest('This inspection has been submitted; its evidence can no longer be changed');
    }
    if (response.inspection.inspectorId !== user.id && user.role !== 'SUPER_ADMIN') {
      throw forbidden('Only the assigned inspector can add evidence to this inspection');
    }
  }

  if (parsed.findingId) {
    const finding = await prisma.finding.findFirst({
      where: { id: parsed.findingId, organizationId: user.organizationId },
    });
    if (!finding) throw notFound('Finding not found');
    if (finding.status === 'CLOSED' || finding.status === 'CANCELLED') {
      throw badRequest('This finding is closed; new evidence cannot be attached');
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await storeEvidence(user.organizationId, 'evidence', buffer, file.type);

  const evidence = await prisma.evidence.create({
    data: {
      organizationId: user.organizationId,
      responseId: parsed.responseId ?? null,
      findingId: parsed.findingId ?? null,
      correctiveActionId: parsed.correctiveActionId ?? null,
      kind: parsed.kind,
      mediaType: file.type.startsWith('video/')
        ? 'VIDEO'
        : file.type === 'application/pdf'
          ? 'DOCUMENT'
          : 'PHOTO',
      storageKey: stored.key,
      fileName: file.name || 'evidence',
      mimeType: file.type,
      sizeBytes: stored.size,
      checksum: stored.checksum,
      caption: parsed.caption ?? null,
      capturedAt: parsed.capturedAt ?? new Date(),
      latitude: parsed.latitude ?? null,
      longitude: parsed.longitude ?? null,
      uploadedById: user.id,
    },
  });

  await audit(user, {
    action: 'evidence.uploaded',
    entityType: 'Evidence',
    entityId: evidence.id,
    summary: `Uploaded ${evidence.kind.toLowerCase()} evidence (${file.name || 'file'})`,
    after: { findingId: parsed.findingId, responseId: parsed.responseId, checksum: stored.checksum },
    ...meta,
  });

  return ok(
    {
      data: {
        id: evidence.id,
        kind: evidence.kind,
        caption: evidence.caption,
        url: `/api/v1/evidence/${evidence.id}`,
        sizeBytes: evidence.sizeBytes,
        capturedAt: evidence.capturedAt,
      },
    },
    { status: 201 },
  );
});
