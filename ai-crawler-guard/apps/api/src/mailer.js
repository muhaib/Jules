/**
 * Optional SMTP notification for licensing inquiries.
 *
 * Inquiries are always stored and always visible in the dashboard. Email is a
 * convenience on top: if SMTP is not configured the API says so once at boot
 * and carries on, rather than failing an inquiry the site owner would
 * otherwise have received.
 */
import nodemailer from 'nodemailer';

let transport;
let announced = false;

export function mailerConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM);
}

function getTransport() {
  if (transport) return transport;
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
  return transport;
}

function textBody(inquiry, site, dashboardUrl) {
  return [
    `New AI content-licensing inquiry for ${site.name}.`,
    '',
    `From:         ${inquiry.name} <${inquiry.email}>`,
    `Organisation: ${inquiry.organization || '-'}`,
    `Intended use: ${inquiry.intended_use || '-'}`,
    `Crawler:      ${inquiry.crawler_id || 'unknown'}`,
    `Page:         ${inquiry.requested_path || '-'}`,
    '',
    'Message:',
    inquiry.message || '(none)',
    '',
    dashboardUrl ? `Open in the dashboard: ${dashboardUrl}` : '',
    '',
    'No payment was taken and no account was created; reply directly to the sender to continue.',
  ].filter(Boolean).join('\n');
}

/** @returns {Promise<boolean>} whether a notification was actually sent. */
export async function notifyInquiry({ inquiry, site, owner, dashboardUrl, log = console }) {
  if (!mailerConfigured()) {
    if (!announced) {
      log.warn?.('[mail] SMTP is not configured; inquiries are stored and shown in the dashboard only.');
      announced = true;
    }
    return false;
  }
  const to = site.notify_email || owner?.email;
  if (!to) return false;
  await getTransport().sendMail({
    from: process.env.MAIL_FROM,
    to,
    replyTo: `${inquiry.name} <${inquiry.email}>`,
    subject: `AI licensing inquiry: ${inquiry.organization || inquiry.name} (${site.name})`,
    text: textBody(inquiry, site, dashboardUrl),
  });
  return true;
}

/** Test seam. */
export function __setTransport(value) {
  transport = value;
}
