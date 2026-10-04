(function (root) {
  'use strict';
  var CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  var GREG_OFFSET_100NS = 122192928000000000n; // 100 ns intervals from 1582-10-15 to 1970-01-01
  var TWITTER_EPOCH = 1288834974657n, DISCORD_EPOCH = 1420070400000n;
  var VERSIONS = { 0: 'Unused', 1: 'Gregorian time-based', 2: 'DCE Security (reserved)', 3: 'Name-based, MD5', 4: 'Random', 5: 'Name-based, SHA-1', 6: 'Reordered Gregorian time-based', 7: 'Unix Epoch time-based', 8: 'Custom (vendor-specific)', 9: 'Reserved', 10: 'Reserved', 11: 'Reserved', 12: 'Reserved', 13: 'Reserved', 14: 'Reserved', 15: 'Reserved' };

  function iso(ms) { // ms as BigInt or Number; returns ISO string or null if outside the JS Date range
    var n = Number(ms); var d = new Date(n); return isNaN(d.getTime()) ? null : d.toISOString();
  }
  function variantOf(b8) {
    if ((b8 & 0x80) === 0) return { name: 'NCS (reserved, includes the Nil UUID)', rfc: false };
    if ((b8 & 0xC0) === 0x80) return { name: 'RFC 9562 (variant 10xx)', rfc: true };
    if ((b8 & 0xE0) === 0xC0) return { name: 'Microsoft (reserved)', rfc: false };
    return { name: 'Reserved for future definition (includes the Max UUID)', rfc: false };
  }
  function hexBytes(hex) { var o = []; for (var i = 0; i < hex.length; i += 2) o.push(parseInt(hex.substr(i, 2), 16)); return o; }
  function hx(bytes, a, b) { return bytes.slice(a, b).map(function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join(''); }

  function decodeUuid(hex32) {
    var by = hexBytes(hex32), v = by[6] >> 4, va = variantOf(by[8]);
    var r = { type: 'uuid', canonical: hx(by, 0, 4) + '-' + hx(by, 4, 6) + '-' + hx(by, 6, 8) + '-' + hx(by, 8, 10) + '-' + hx(by, 10, 16), version: v, versionName: VERSIONS[v], variant: va.name, rfcVariant: va.rfc, notes: [] };
    if (hex32 === '00000000000000000000000000000000') { r.special = 'Nil UUID'; return r; }
    if (hex32 === 'ffffffffffffffffffffffffffffffff') { r.special = 'Max UUID'; return r; }
    if (!va.rfc) { r.notes.push('The variant bits are not the RFC 9562 variant, so the version digit may not mean what it says.'); }
    else if (v === 0 || v >= 9) r.notes.push('Version ' + v + ' is not assigned a layout in RFC 9562.');
    if (va.rfc && (v === 1 || v === 6)) {
      var t;
      if (v === 1) t = (BigInt('0x' + hx(by, 6, 8)) & 0x0FFFn) << 48n | BigInt('0x' + hx(by, 4, 6)) << 32n | BigInt('0x' + hx(by, 0, 4));
      else t = BigInt('0x' + hx(by, 0, 6)) << 12n | (BigInt('0x' + hx(by, 6, 8)) & 0x0FFFn);
      var unix100 = t - GREG_OFFSET_100NS, ms = unix100 >= 0n ? unix100 / 10000n : -((-unix100 + 9999n) / 10000n);
      r.timestamp = { ms: ms, iso: iso(ms), ticks100ns: t.toString(), subMs100ns: Number(((unix100 % 10000n) + 10000n) % 10000n), source: 'Gregorian 100 ns count since 1582-10-15' };
      r.clockSeq = ((by[8] & 0x3F) << 8) | by[9]; r.node = hx(by, 10, 16).replace(/(..)(?=.)/g, '$1:');
    } else if (va.rfc && v === 7) {
      var ms7 = BigInt('0x' + hx(by, 0, 6));
      r.timestamp = { ms: ms7, iso: iso(ms7), source: 'first 48 bits, Unix milliseconds' };
      r.randA = hx(by, 6, 8).slice(1); r.randB = hx(by, 8, 16);
      r.randB = ((by[8] & 0x3F).toString(16).padStart(2, '0')) + hx(by, 9, 16);
    } else if (va.rfc && v === 4) r.notes.push('122 random bits: no time or machine information inside.');
    else if (va.rfc && (v === 3 || v === 5)) r.notes.push('Derived by hashing a namespace and a name; the same inputs always give the same UUID. No time inside.');
    else if (va.rfc && v === 8) r.notes.push('Version 8 is vendor-defined; the layout is not knowable from the bits alone.');
    return r;
  }
  function decodeUlid(s) {
    var u = s.toUpperCase(), n = 0n;
    for (var i = 0; i < 26; i++) n = n * 32n + BigInt(CROCKFORD.indexOf(u[i]));
    var ts = n >> 80n, rnd = n & ((1n << 80n) - 1n);
    if (ts > 0xFFFFFFFFFFFFn) return { error: 'Not a valid ULID: the first character must be 0 to 7 (the largest ULID is 7ZZZZZZZZZZZZZZZZZZZZZZZZZ, a 48-bit timestamp).' };
    return { type: 'ulid', canonical: u, timestamp: { ms: ts, iso: iso(ts), source: 'first 10 characters, 48-bit Unix milliseconds' }, randomness: rnd.toString(16).padStart(20, '0'), notes: ['Sorts as text in time order. The 80 random bits carry no meaning.'] };
  }
  function decodeObjectId(h) {
    var secs = BigInt('0x' + h.slice(0, 8)), ms = secs * 1000n;
    return { type: 'objectid', canonical: h.toLowerCase(), timestamp: { ms: ms, iso: iso(ms), source: 'first 4 bytes, Unix seconds' }, randomValue: h.slice(8, 18).toLowerCase(), counter: parseInt(h.slice(18), 16), notes: ['5 bytes random per process, then a 3-byte counter.'] };
  }
  function decodeSnowflake(str) {
    var n = BigInt(str);
    if (n >= (1n << 64n)) return { error: 'Larger than 64 bits (18446744073709551615).' };
    var tsRaw = n >> 22n, out = { type: 'snowflake', canonical: n.toString(), layouts: [] };
    var dts = tsRaw + DISCORD_EPOCH, tts = tsRaw + TWITTER_EPOCH;
    out.layouts.push({ name: 'Discord', timestamp: { ms: dts, iso: iso(dts), source: '(id >> 22) + 1420070400000' }, workerId: Number((n >> 17n) & 31n), processId: Number((n >> 12n) & 31n), increment: Number(n & 4095n), epoch: 'Discord epoch 2015-01-01' });
    out.layouts.push({ name: 'Twitter (original Snowflake)', timestamp: { ms: tts, iso: iso(tts), source: '(id >> 22) + 1288834974657' }, datacenterId: Number((n >> 17n) & 31n), workerId: Number((n >> 12n) & 31n), sequence: Number(n & 4095n), epoch: 'twepoch 1288834974657 (2010-11-04)' });
    return out;
  }
  function decode(input) {
    var s = String(input).trim();
    if (!s) return { error: 'Paste an ID: a UUID, ULID, MongoDB ObjectId or a numeric snowflake.' };
    var u = s.replace(/^urn:uuid:/i, '').replace(/^\{(.*)\}$/, '$1');
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(u)) return decodeUuid(u.replace(/-/g, '').toLowerCase());
    if (/^[0-9a-f]{32}$/i.test(u)) return decodeUuid(u.toLowerCase());
    if (/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(s)) return decodeUlid(s);
    if (/^[0-9a-f]{24}$/i.test(s)) return decodeObjectId(s);
    if (/^\d{15,20}$/.test(s)) return decodeSnowflake(s);
    if (/^[0-9A-Za-z]{26}$/.test(s)) return { error: 'Looks like 26 characters but contains I, L, O or U, which ULID leaves out of its alphabet.' };
    if (/^[0-9a-f-]{30,40}$/i.test(u)) return { error: 'Looks like a UUID but the grouping or length is wrong: expected 8-4-4-4-12 hex digits (32 in all).' };
    return { error: 'Not recognized. Supported: UUID (any case, hyphens optional, braces or urn:uuid: allowed), ULID (26 characters), MongoDB ObjectId (24 hex digits), numeric snowflake (15 to 20 digits).' };
  }
  // helpers used by tests and the app
  function encodeUlid(ms, randHex20) { var n = (BigInt(ms) << 80n) | BigInt('0x' + randHex20), s = ''; for (var i = 0; i < 26; i++) { s = CROCKFORD[Number(n & 31n)] + s; n >>= 5n; } return s; }
  var api = { decode: decode, encodeUlid: encodeUlid, CROCKFORD: CROCKFORD, GREG_OFFSET_100NS: GREG_OFFSET_100NS, TWITTER_EPOCH: TWITTER_EPOCH, DISCORD_EPOCH: DISCORD_EPOCH };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.IdLens = api;
})(typeof window !== 'undefined' ? window : this);
