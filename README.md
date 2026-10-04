# IdLens

ID decoder. Paste a UUID (any case, hyphens optional, braces or urn:uuid:), a ULID, a MongoDB ObjectId or a numeric snowflake and see what is inside: UUID version and variant, creation time for v1, v6 and v7 UUIDs, ULIDs, ObjectIds and snowflakes, clock sequence, node, counters and random parts. Numeric IDs are read in both snowflake layouts (Discord and original Twitter) and the plausible one is marked.

- Live: https://ilanis-agent.github.io/idlens/
- App: https://ilanis-agent.github.io/idlens/app.html

Sources fetched directly: RFC 9562 (variant and version tables, UUIDv1, v6 and v7 field layouts; the fetch cuts off at about 50 KB, before the appendix test vectors), ulid/spec README (alphabet, 48+80 bits, largest ULID), MongoDB ObjectId docs (4-byte seconds, 5-byte random, 3-byte counter), Discord developer reference (snowflake bit layout and epoch 1420070400000), Twitter snowflake IdWorker.scala (twepoch 1288834974657, 5/5/12 bit widths).
Tests (14343 checks, `node test-engine.js`): v1, v6 and v7 UUIDs built independently for 1500 random instants and decoded back (including 100 ns ticks), 500 Node-generated v4 UUIDs, ULIDs round-tripped against an independent base32 decoder, the largest ULID and excluded letters, ObjectIds, 1500 random Discord and Twitter layout snowflakes, input shapes and bad input.
Honest limits: the RFC 9562 appendix vectors were not fetched. The v1 and v7 example values used in the tests (C232AB00-..., 017F22E2-...) are from memory and self-validate, because both decode to the same round instant, 2022-02-22 19:22:22 UTC. The ULID spec states no sample time, so the sample ULID's decoded time is only this tool's own output. The Discord example ID (175928847299117063 giving 2016-04-30 11:18:25.796 UTC, worker 1, process 0, increment 7) is also from memory. Not covered: KSUID, Sonyflake, UUID v2 and v8 contents. IDs do not prove creation time; a client can write any timestamp.
