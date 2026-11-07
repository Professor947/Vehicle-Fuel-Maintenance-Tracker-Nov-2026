// Pure helpers of the ocr-pump edge function.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseRequest, PUMP_SCHEMA, sanitizeReading } from '../functions/ocr-pump/lib.ts';

test('parseRequest accepts base64 and rejects junk / oversized payloads', () => {
  const ok = 'A'.repeat(200);
  assert.deepEqual(parseRequest({ image_base64: ok }), { imageBase64: ok });
  assert.equal(parseRequest({ image_base64: 'short' }), null);
  assert.equal(parseRequest({ image_base64: 'not base64 !'.repeat(20) }), null);
  assert.equal(parseRequest({ image_base64: 'A'.repeat(4_000_001) }), null);
  assert.equal(parseRequest(null), null);
});

test('schema requires all three fields and allows null', () => {
  assert.deepEqual([...PUMP_SCHEMA.required].sort(), ['litres', 'rate_per_litre', 'total']);
  assert.equal(PUMP_SCHEMA.additionalProperties, false);
  assert.deepEqual(PUMP_SCHEMA.properties.litres.type, ['number', 'null']);
});

test('sanitizeReading keeps plausible values', () => {
  assert.deepEqual(sanitizeReading('{"rate_per_litre":272.89,"litres":3.66,"total":1000}'), {
    rate_per_litre: 272.89,
    litres: 3.66,
    total: 1000,
  });
});

test('sanitizeReading nulls missing, implausible or non-numeric values', () => {
  assert.deepEqual(sanitizeReading('{"rate_per_litre":27289,"litres":null,"total":"1000"}'), {
    rate_per_litre: null,
    litres: null,
    total: null,
  });
  assert.deepEqual(sanitizeReading('not json'), { rate_per_litre: null, litres: null, total: null });
});
