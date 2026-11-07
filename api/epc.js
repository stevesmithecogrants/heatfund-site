// Vercel serverless function: GET /api/epc?postcode=SW1A%201AA&house=42
// Looks up domestic EPC certificates via the MHCLG Energy Performance of
// Buildings Data API (base https://api.get-energy-performance-data.
// communities.gov.uk, GET /api/domestic/search?postcode=...).
//
// Credentials come ONLY from the environment variable EPC_API_TOKEN (the
// free bearer token issued on the "My account" page of
// get-energy-performance-data.communities.gov.uk, set in the Vercel
// project settings) — never hardcoded. Without it the function returns
// {available:false} with HTTP 200, and the wizard simply falls back to
// asking the user for their EPC rating. It never crashes and never
// invents a certificate.
//
// Responses:
//   {available:true,  certificates:[{address, postcode,
//     'current-energy-rating', 'current-energy-efficiency',
//     'lodgement-date'}]}   — one entry per matching certificate
//     (the search endpoint returns the A–G band and registration date;
//      no numeric score, so 'current-energy-efficiency' is null)
//   {available:true,  certificates:[]}  — register reachable, no match
//     (the API answers 404 when no certificates exist for the postcode)
//   {available:false}                    — no token / API error
'use strict';

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  var postcode = String((req.query && req.query.postcode) || '').trim().toUpperCase();
  var house = String((req.query && req.query.house) || '').trim();
  var token = process.env.EPC_API_TOKEN || '';

  if (!token) {
    return res.status(200).json({ available: false });
  }
  if (!postcode) {
    return res.status(200).json({ available: true, certificates: [] });
  }

  try {
    var url = 'https://api.get-energy-performance-data.communities.gov.uk'
      + '/api/domestic/search?postcode=' + encodeURIComponent(postcode)
      + '&page_size=100';
    var r = await fetch(url, {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }
    });
    // 404 is the API's honest "no certificates for that postcode" answer.
    if (r.status === 404) {
      return res.status(200).json({ available: true, certificates: [] });
    }
    if (!r.ok) return res.status(200).json({ available: false });

    var data = await r.json();
    var rows = Array.isArray(data.data) ? data.data : [];
    var matched = rows.filter(function (row) {
      return addressMatchesHouse(fullAddress(row), house)
        || addressMatchesHouse(row.addressLine2 || '', house);
    });
    var certs = matched.map(function (row) {
      return {
        address: fullAddress(row),
        postcode: row.postcode || '',
        'current-energy-rating': row.currentEnergyEfficiencyBand || '',
        'current-energy-efficiency': null,
        'lodgement-date': row.registrationDate || ''
      };
    });
    return res.status(200).json({ available: true, certificates: certs });
  } catch (e) {
    return res.status(200).json({ available: false });
  }
};

function fullAddress(row) {
  var parts = [row.addressLine1, row.addressLine2, row.addressLine3, row.addressLine4]
    .filter(function (p) { return p; });
  return parts.join(', ');
}

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
