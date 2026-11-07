// Vercel serverless function: GET /api/epc?postcode=SW1A%201AA&house=42
// Looks up domestic EPC certificates via the MHCLG EPC Open Data API
// (https://epc.opendatacommunities.org/api/v1/domestic/search).
//
// Credentials come ONLY from the environment variables EPC_API_EMAIL and
// EPC_API_KEY (set in the Vercel project settings) — never hardcoded.
// No API key exists yet: without those variables the function returns
// {available:false} with HTTP 200, and the wizard simply falls back to
// asking the user for their EPC rating. It never crashes and never
// invents a certificate.
//
// Responses:
//   {available:true,  certificates:[{address, postcode,
//     'current-energy-rating', 'current-energy-efficiency',
//     'lodgement-date'}]}   — one entry per matching certificate
//   {available:true,  certificates:[]}  — register reachable, no match
//   {available:false}                    — no credentials / API error
'use strict';

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  var postcode = String((req.query && req.query.postcode) || '').trim().toUpperCase();
  var house = String((req.query && req.query.house) || '').trim();
  var email = process.env.EPC_API_EMAIL || '';
  var key = process.env.EPC_API_KEY || '';

  if (!email || !key) {
    return res.status(200).json({ available: false });
  }
  if (!postcode) {
    return res.status(200).json({ available: true, certificates: [] });
  }

  try {
    var url = 'https://epc.opendatacommunities.org/api/v1/domestic/search?postcode='
      + encodeURIComponent(postcode) + '&size=100';
    var auth = Buffer.from(email + ':' + key).toString('base64');
    var r = await fetch(url, {
      headers: { Authorization: 'Basic ' + auth, Accept: 'application/json' }
    });
    if (!r.ok) return res.status(200).json({ available: false });

    var data = await r.json();
    var rows = Array.isArray(data.rows) ? data.rows : [];
    var matched = rows.filter(function (row) {
      return addressMatchesHouse(row.address || '', house);
    });
    var certs = matched.map(function (row) {
      return {
        address: row.address || '',
        postcode: row.postcode || '',
        'current-energy-rating': row['current-energy-rating'] || '',
        'current-energy-efficiency': row['current-energy-efficiency'] != null
          ? row['current-energy-efficiency'] : null,
        'lodgement-date': row['lodgement-date'] || ''
      };
    });
    return res.status(200).json({ available: true, certificates: certs });
  } catch (e) {
    return res.status(200).json({ available: false });
  }
};

// Match a house number/name against a certificate address.
// Numeric house ("42") must start the address ("42 High Street" matches,
// "142 High Street" does not). A named house ("Rose Cottage") must appear
// somewhere in the address. Empty house matches everything.
function addressMatchesHouse(address, house) {
  if (!house) return true;
  var a = String(address).toLowerCase().trim();
  var h = String(house).toLowerCase().trim();
  if (/^\d/.test(h)) {
    var num = h.match(/^\d+/)[0];
    return new RegExp('^' + num + '(\\D|$)').test(a);
  }
  return a.indexOf(h) !== -1;
}
module.exports.addressMatchesHouse = addressMatchesHouse;
