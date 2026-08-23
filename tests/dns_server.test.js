import test from 'node:test';
import assert from 'node:assert';
import { parseDomain, buildResponse } from '../src/dns_server.js';

// Construct standard DNS A-record query for "www.google.com"
const createMockQuery = () => {
  return Buffer.from([
    0xab, 0xcd,             // Transaction ID = 0xabcd
    0x01, 0x00,             // Flags (standard query, recursion desired)
    0x00, 0x01,             // QDCOUNT = 1 question
    0x00, 0x00,             // ANCOUNT = 0 answers
    0x00, 0x00,             // NSCOUNT = 0 records
    0x00, 0x00,             // ARCOUNT = 0 additional records
    // Question name: "www.google.com"
    0x03, 0x77, 0x77, 0x77, // 3 - w - w - w
    0x06, 0x67, 0x6f, 0x6f, 0x67, 0x6c, 0x65, // 6 - g - o - o - g - l - e
    0x03, 0x63, 0x6f, 0x6d, // 3 - c - o - m
    0x00,                   // end of labels
    0x00, 0x01,             // QTYPE = A record
    0x00, 0x01              // QCLASS = IN class
  ]);
};

test('parseDomain parses DNS labels correctly', () => {
  const query = createMockQuery();
  const { domain, nextOffset } = parseDomain(query, 12);
  
  assert.strictEqual(domain, 'www.google.com');
  // Check index is updated to the end of name segment (31)
  assert.strictEqual(nextOffset, 28);
});

test('buildResponse compiles correct DNS answer fields', () => {
  const query = createMockQuery();
  const response = buildResponse(query, '1.2.3.4');
  
  // Assert Transaction ID matches
  assert.strictEqual(response[0], 0xab);
  assert.strictEqual(response[1], 0xcd);

  // Assert Response Flags are set to response mode (0x8180)
  assert.strictEqual(response[2], 0x81);
  assert.strictEqual(response[3], 0x80);

  // QDCOUNT = 1
  assert.strictEqual(response[4], 0x00);
  assert.strictEqual(response[5], 0x01);

  // ANCOUNT = 1
  assert.strictEqual(response[6], 0x00);
  assert.strictEqual(response[7], 0x01);

  // RData IP section is appended at the very end
  const length = response.length;
  assert.strictEqual(response[length - 4], 1);
  assert.strictEqual(response[length - 3], 2);
  assert.strictEqual(response[length - 2], 3);
  assert.strictEqual(response[length - 1], 4);
});
