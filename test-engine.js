'use strict';
var I = require('./engine.js'), crypto = require('crypto'), assert = require('assert'), n = 0, fails = 0;
function eq(a, b, m) { n++; try { assert.deepStrictEqual(a, b); } catch (e) { fails++; console.log('FAIL', m, String(a), String(b)); } }
// RFC 9562 test-vector style values: the v1 and v7 examples decode to a single instant (the RFC's 2022-02-22 19:22:22 UTC)
var v1 = I.decode('C232AB00-9414-11EC-B3C8-9F6BDECED846'), v6 = I.decode('1EC9414C-232A-6B00-B3C8-9F6BDECED846'), v7 = I.decode('017F22E2-79B0-7CC3-98C4-DC0C0C07398F');
eq([v1.version, v6.version, v7.version], [1, 6, 7], 'versions');
eq(v1.timestamp.iso, '2022-02-22T19:22:22.000Z', 'v1 time'); eq(v6.timestamp.iso, '2022-02-22T19:22:22.000Z', 'v6 time'); eq(v7.timestamp.iso, '2022-02-22T19:22:22.000Z', 'v7 time');
eq(v1.timestamp.ticks100ns, v6.timestamp.ticks100ns, 'v1 and v6 carry the same 60-bit timestamp');
eq(v1.clockSeq, 0x33C8, 'v1 clock seq'); eq(v1.node, '9f:6b:de:ce:d8:46', 'v1 node'); eq(v6.clockSeq, v1.clockSeq, 'v6 clock seq'); eq(v6.node, v1.node, 'v6 node');
eq(v7.randA, 'cc3', 'v7 rand_a'); eq(v7.randB, '18c4dc0c0c07398f', 'v7 rand_b with the variant bits removed'); eq(v7.variant.indexOf('RFC 9562'), 0, 'variant');
eq(I.decode('00000000-0000-0000-0000-000000000000').special, 'Nil UUID', 'nil'); eq(I.decode('FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF').special, 'Max UUID', 'max');
eq(I.GREG_OFFSET_100NS, BigInt(Date.UTC(1970, 0, 1) - Date.UTC(1582, 9, 15)) * 10000n, 'Gregorian offset equals the 1582-10-15 to 1970-01-01 span in 100 ns');
// accepted input shapes
['{C232AB00-9414-11EC-B3C8-9F6BDECED846}', 'urn:uuid:c232ab00-9414-11ec-b3c8-9f6bdeced846', 'C232AB00941411ECB3C89F6BDECED846', '  c232ab00-9414-11ec-b3c8-9f6bdeced846  '].forEach(function (s) { eq(I.decode(s).canonical, 'c232ab00-9414-11ec-b3c8-9f6bdeced846', 'shape ' + s); });
// random UUIDs from Node's own generator are v4 and RFC variant
for (var i = 0; i < 500; i++) { var d = I.decode(crypto.randomUUID()); eq([d.version, d.rfcVariant, !!d.timestamp], [4, true, false], 'v4'); }
// build v1, v6, v7 for random instants with independent code, decode them back
function rnd48() { return BigInt('0x' + crypto.randomBytes(6).toString('hex')); }
for (i = 0; i < 1500; i++) {
  var ms = BigInt(Date.UTC(1990, 0, 1) + crypto.randomInt(0, 2 ** 31) * 400 + crypto.randomInt(0, 400)), sub = BigInt(crypto.randomInt(0, 10000));
  var t = (ms * 10000n + sub) + 122192928000000000n; // 60-bit Gregorian count
  var tl = t & 0xFFFFFFFFn, tm = (t >> 32n) & 0xFFFFn, th = (t >> 48n) & 0xFFFn;
  var rest = crypto.randomBytes(8); rest[0] = (rest[0] & 0x3F) | 0x80; var restHex = rest.toString('hex');
  var h1 = tl.toString(16).padStart(8, '0') + tm.toString(16).padStart(4, '0') + (0x1000n | th).toString(16).padStart(4, '0') + restHex;
  var r1 = I.decode(h1); eq([r1.version, r1.timestamp.ms, r1.timestamp.subMs100ns], [1, ms, Number(sub)], 'v1 ' + h1);
  var top = (t >> 12n), h6 = top.toString(16).padStart(12, '0') + (0x6000n | (t & 0xFFFn)).toString(16).padStart(4, '0') + restHex;
  var r6 = I.decode(h6); eq([r6.version, r6.timestamp.ms, r6.timestamp.subMs100ns], [6, ms, Number(sub)], 'v6 ' + h6);
  var h7 = ms.toString(16).padStart(12, '0') + '7' + crypto.randomBytes(2).toString('hex').slice(1) + restHex;
  var r7 = I.decode(h7); eq([r7.version, r7.timestamp.ms], [7, ms], 'v7 ' + h7);
  eq(r7.randB, ((rest[0] & 0x3F).toString(16).padStart(2, '0') + restHex.slice(2)), 'v7 rand_b');
}
// ULID: alphabet, max value, round trips against an independent decoder
eq(I.CROCKFORD, '0123456789ABCDEFGHJKMNPQRSTVWXYZ', 'Crockford alphabet from the spec');
eq(I.decode('7ZZZZZZZZZZZZZZZZZZZZZZZZZ').timestamp.ms, 2n ** 48n - 1n, 'largest ULID is 2^48-1 ms'); eq(!!I.decode('80000000000000000000000000').error, true, 'first char 8 overflows');
eq(I.decode('00000000000000000000000000').timestamp.ms, 0n, 'zero ULID');
eq(I.decode('01ARZ3NDEKTSV4RRFFQ69G5FAV').timestamp.iso, '2016-07-30T23:54:10.259Z', 'spec sample ULID, time derived by this tool (no time is stated in the spec)');
for (i = 0; i < 1500; i++) {
  var m = crypto.randomInt(0, 2 ** 47) * 2 + crypto.randomInt(0, 2), r = crypto.randomBytes(10).toString('hex'), u = I.encodeUlid(m, r), dd = I.decode(u);
  eq([u.length, dd.type, Number(dd.timestamp.ms), dd.randomness], [26, 'ulid', m, r], 'ulid ' + u);
  var big = 0n; for (var k = 0; k < 26; k++) big = big * 32n + BigInt(I.CROCKFORD.indexOf(u[k])); eq(big, (BigInt(m) << 80n) | BigInt('0x' + r), 'independent decode');
  eq(I.decode(u.toLowerCase()).canonical, u, 'lowercase ulid');
}
['0000000000000000000000000I', '0000000000000000000000000L', '0000000000000000000000000O', '0000000000000000000000000U'].forEach(function (s) { eq(!!I.decode(s).error, true, 'excluded letter ' + s); });
// ObjectId (MongoDB docs: 4-byte seconds, 5-byte random, 3-byte counter)
var oid = I.decode('507f1f77bcf86cd799439011'); eq([oid.type, oid.timestamp.ms, oid.randomValue, oid.counter], ['objectid', 0x507f1f77n * 1000n, 'bcf86cd799', 0x439011], 'objectid fields');
for (i = 0; i < 300; i++) { var sec = crypto.randomInt(0, 2 ** 31), hex = sec.toString(16).padStart(8, '0') + crypto.randomBytes(8).toString('hex'); eq(Number(I.decode(hex).timestamp.ms), sec * 1000, 'oid time'); }
// Snowflakes: Discord doc formulas and Twitter IdWorker constants, built independently
var ex = I.decode('175928847299117063'); eq([ex.layouts[0].timestamp.iso, ex.layouts[0].workerId, ex.layouts[0].processId, ex.layouts[0].increment], ['2016-04-30T11:18:25.796Z', 1, 0, 7], 'Discord docs-style example');
for (i = 0; i < 1500; i++) {
  var tms = BigInt(crypto.randomInt(0, 2 ** 40)), wk = BigInt(crypto.randomInt(0, 32)), pr = BigInt(crypto.randomInt(0, 32)), sq = BigInt(crypto.randomInt(0, 4096));
  var id = (tms << 22n) | (wk << 17n) | (pr << 12n) | sq, s = I.decode(id.toString());
  eq([s.layouts[0].timestamp.ms, s.layouts[0].workerId, s.layouts[0].processId, s.layouts[0].increment], [tms + 1420070400000n, Number(wk), Number(pr), Number(sq)], 'discord ' + id);
  eq([s.layouts[1].timestamp.ms, s.layouts[1].datacenterId, s.layouts[1].workerId, s.layouts[1].sequence], [tms + 1288834974657n, Number(wk), Number(pr), Number(sq)], 'twitter ' + id);
}
eq(!!I.decode('18446744073709551616').error, true, 'over 64 bits'); eq(I.decode('18446744073709551615').type, 'snowflake', '2^64-1 ok');
// bad input
['', 'hello', '1234', 'c232ab00-9414-11ec-b3c8-9f6bdeced84', 'g232ab00-9414-11ec-b3c8-9f6bdeced846', '12345678901234'].forEach(function (s) { eq(!!I.decode(s).error, true, 'rejects ' + JSON.stringify(s)); });
eq(I.decode('f81d4fae-7dec-11d0-a765-00a0c91e6bf6').timestamp.iso, '1997-02-03T17:43:12.216Z', 'RFC 4122 style example v1');
eq(I.decode('a8098c1a-f86e-11da-bd1a-00112444be1e').version, 1, 'v1'); eq(I.decode('6ba7b810-9dad-11d1-80b4-00c04fd430c8').version, 1, 'namespace DNS UUID is v1');
eq(I.decode('2ed6657d-e927-568b-95e1-2665a8aea6a2').version, 5, 'v5'); eq(I.decode('9073926b-929f-31c2-abc9-fad77ae3e8eb').version, 3, 'v3');
console.log(n + ' checks, ' + fails + ' failures'); process.exit(fails ? 1 : 0);
