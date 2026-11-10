// Vercel serverless function: POST /api/confirm
// Sends a confirmation email to a customer who just completed the HeatFund
// eligibility check, via the Brevo transactional email API.
//
// Credentials come ONLY from the environment variable BREVO_API_KEY (a v3
// API key from Brevo: Settings -> SMTP & API -> API Keys — never
// hardcoded). Without it the function returns {ok:false,
// error:'not-configured'} with HTTP 200 and the wizard carries on — the
// lead itself has already gone through Web3Forms, so a missing key never
// blocks a submission.
//
// Brevo free plan: 300 transactional emails/day. The sender
// info@heatfund.co.uk is already a verified Brevo sender (used for the
// Gmail "Send mail as" relay).
//
// Body (JSON): {name, email, postcode, improvements, epcRating}
// Responses:
//   {ok:true}                          — confirmation sent
//   {ok:false, error:'not-configured'} — no BREVO_API_KEY set
//   {ok:false, error:'invalid'}        — bad/missing email or name,
//                                        non-POST, or off-site origin
//   {ok:false, error:'failed'}         — Brevo rejected the send
'use strict';

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: false, error: 'invalid' });
  }
  // Basic guard: only accept calls from the HeatFund site itself.
  // (An Origin/Referer check stops casual cross-site abuse; it is not
  // authentication — the endpoint is public by design, like the form.)
  var origin = String((req.headers && (req.headers.origin || req.headers.referer)) || '');
  if (origin && origin.indexOf('heatfund.co.uk') === -1) {
    return res.status(200).json({ ok: false, error: 'invalid' });
  }
  var key = process.env.BREVO_API_KEY || '';
  if (!key) {
    return res.status(200).json({ ok: false, error: 'not-configured' });
  }
  var body = (req.body && typeof req.body === 'object') ? req.body : {};
  var name = String(body.name || '').trim();
  var email = String(body.email || '').trim();
  var postcode = String(body.postcode || '').trim().toUpperCase();
  var improvements = String(body.improvements || '').trim();
  var epcRating = String(body.epcRating || '').trim();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(200).json({ ok: false, error: 'invalid' });
  }
  var firstName = name.split(/\s+/)[0];
  var subject = 'We have received your HeatFund enquiry';
  var summaryLines = [];
  if (improvements) summaryLines.push('What you asked about: ' + improvements + '.');
  if (postcode) summaryLines.push('Postcode: ' + postcode + '.');
  if (epcRating) summaryLines.push('EPC rating on record: ' + epcRating + '.');
  var text = 'Hi ' + firstName + ',\n\n'
    + 'Thanks — we have received your enquiry through HeatFund.\n\n'
    + (summaryLines.length ? summaryLines.join('\n') + '\n\n' : '')
    + 'What happens next: we will check your answers against the official scheme criteria and be in touch shortly about what your home may qualify for. No grant is promised before the full eligibility check is complete.\n\n'
    + 'If you did not make this enquiry, please ignore this email or let us know at info@heatfund.co.uk.\n\n'
    + 'Kind regards,\nSteve Smith\nHeatFund\ninfo@heatfund.co.uk\nwww.heatfund.co.uk\n\n'
    + 'HeatFund is an independent energy grants guide. We are not the government, a grant administrator or an installer.';
  var html = '<p>Hi ' + esc(firstName) + ',</p>'
    + '<p>Thanks &mdash; we have received your enquiry through HeatFund.</p>'
    + (summaryLines.length ? '<p>' + summaryLines.map(esc).join('<br>') + '</p>' : '')
    + '<p><strong>What happens next:</strong> we will check your answers against the official scheme criteria and be in touch shortly about what your home may qualify for. No grant is promised before the full eligibility check is complete.</p>'
    + '<p>If you did not make this enquiry, please ignore this email or let us know at info@heatfund.co.uk.</p>'
    + '<p>Kind regards,<br>Steve Smith<br>HeatFund<br><a href="https://www.heatfund.co.uk">www.heatfund.co.uk</a></p>'
    + '<p style="color:#666;font-size:13px">HeatFund is an independent energy grants guide. We are not the government, a grant administrator or an installer.</p>';

  try {
    var r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: 'HeatFund', email: 'info@heatfund.co.uk' },
        to: [{ email: email, name: name }],
        replyTo: { email: 'info@heatfund.co.uk', name: 'HeatFund' },
        subject: subject,
        htmlContent: html,
        textContent: text
      })
    });
    if (!r.ok) return res.status(200).json({ ok: false, error: 'failed' });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(200).json({ ok: false, error: 'failed' });
  }
};

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
