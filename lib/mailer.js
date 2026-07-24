// ───────────────────────────────────────────────────────────────
// Email notifications via the Resend HTTP API (works on Vercel's
// serverless runtime — no SMTP, no extra npm dependency; uses global
// fetch on Node 18+). If RESEND_API_KEY is unset the send is skipped
// gracefully so local dev and unconfigured deploys still work.
// ───────────────────────────────────────────────────────────────
const config = require('../config');

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Ordered [column, label] pairs for the landlord-intake summary email.
const INTAKE_FIELDS = [
  ['full_name', 'Owner name'],
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['mailing_address', 'Mailing address'],
  ['role', 'Role'],
  ['based_in', 'Currently based in'],
  ['address', 'Property address'],
  ['city', 'City'],
  ['postal_code', 'Postal code'],
  ['neighborhood', 'Neighbourhood'],
  ['property_type', 'Property type'],
  ['size', 'Size (rooms)'],
  ['bedrooms', 'Bedrooms'],
  ['bathrooms', 'Bathrooms'],
  ['sqft', 'Area (sq ft)'],
  ['floor', 'Floor'],
  ['furnished', 'Furnished'],
  ['desired_rent', 'Desired monthly rent (CAD)'],
  ['open_to_valuation', 'Wants Rentalium valuation'],
  ['lease_type', 'Lease type'],
  ['lease_term', 'Desired term'],
  ['lease_start_date', 'Available from'],
  ['rent_due_day', 'Rent due day'],
  ['occupancy', 'Current occupancy'],
  ['lowest_rent_12mo', 'Lowest rent last 12 mo'],
  ['parking_available', 'Parking available'],
  ['parking_count', 'Parking spots'],
  ['parking_type', 'Parking type'],
  ['parking_included', 'Parking included/fee'],
  ['parking_fee', 'Parking fee (CAD)'],
  ['storage_available', 'Storage locker'],
  ['storage_included', 'Locker included/fee'],
  ['storage_fee', 'Locker fee (CAD)'],
  ['appliances_included', 'Appliances included'],
  ['appliances_deposit', 'Wants appliance deposit'],
  ['appliances_notes', 'Appliance notes'],
  ['heating_included', 'Heating included'],
  ['heating_type', 'Heating type'],
  ['electricity_included', 'Electricity'],
  ['hot_water_included', 'Hot water included'],
  ['gas_service', 'Gas service'],
  ['internet_included', 'Internet included'],
  ['other_included', 'Other included'],
  ['smoking_allowed', 'Smoking allowed'],
  ['pets_allowed', 'Pets allowed'],
  ['other_restrictions', 'Other rules / by-laws'],
  ['highlights', 'Marketing highlights'],
  ['services_interested', 'Services wanted'],
  ['wants_management', 'Wants management'],
  ['notes', 'Additional notes'],
  ['lang', 'Form language'],
];

function intakeToHtml(intake) {
  const rows = INTAKE_FIELDS
    .filter(([key]) => intake[key] != null && String(intake[key]).trim() !== '')
    .map(([key, label]) => `
      <tr>
        <td style="padding:6px 12px;background:#f4f4f5;font-weight:600;color:#3f3f46;white-space:nowrap;vertical-align:top;border-bottom:1px solid #e4e4e7;">${esc(label)}</td>
        <td style="padding:6px 12px;color:#18181b;border-bottom:1px solid #e4e4e7;">${esc(intake[key]).replace(/\n/g, '<br>')}</td>
      </tr>`)
    .join('');
  return `
  <div style="font-family:Inter,-apple-system,Segoe UI,sans-serif;max-width:640px;margin:0 auto;color:#18181b;">
    <h2 style="font-size:18px;margin:0 0 4px;">New landlord submission</h2>
    <p style="font-size:13px;color:#71717a;margin:0 0 16px;">${esc(intake.address || intake.full_name || '')}</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden;">
      ${rows}
    </table>
    <p style="font-size:12px;color:#a1a1aa;margin-top:16px;">Submitted via the Rentalium landlord intake form.</p>
  </div>`;
}

// Send the landlord-intake summary. Never throws — returns { sent, skipped, error }.
async function sendLandlordIntakeEmail(intake) {
  const { resendKey, from, to } = config.notify;
  if (!resendKey) {
    console.log('[mailer] RESEND_API_KEY not set — landlord-intake email skipped.');
    return { sent: false, skipped: true };
  }
  try {
    const subjectAddr = intake.address || intake.full_name || 'new unit';
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: intake.email || undefined,
        subject: `New landlord submission — ${subjectAddr}`,
        html: intakeToHtml(intake),
      }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.error('[mailer] Resend error', resp.status, text);
      return { sent: false, error: `Resend ${resp.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error('[mailer] Failed to send landlord-intake email:', err.message);
    return { sent: false, error: err.message };
  }
}

module.exports = { sendLandlordIntakeEmail };
