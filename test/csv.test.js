'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parse, createStreamParser, stringify, toJSON, fromJSON, detectDelimiter } = require('../src/index.js');

test('parse: basic CSV', () => {
  assert.deepEqual(parse('a,b,c\n1,2,3'), [['a','b','c'],['1','2','3']]);
});

test('parse: single row', () => {
  assert.deepEqual(parse('a,b,c'), [['a','b','c']]);
});

test('parse: empty string', () => {
  assert.deepEqual(parse(''), []);
});

test('parse: quoted fields', () => {
  assert.deepEqual(parse('"hello",world'), [['hello','world']]);
});

test('parse: quoted with delimiter inside', () => {
  assert.deepEqual(parse('"a,b",c'), [['a,b','c']]);
});

test('parse: quoted with newline inside', () => {
  assert.deepEqual(parse('"line1\nline2",b'), [['line1\nline2','b']]);
});

test('parse: escaped quotes (doubled)', () => {
  assert.deepEqual(parse('"she said ""hi""",b'), [['she said "hi"','b']]);
});

test('parse: headers option', () => {
  const result = parse('name,age\nAlice,30', { headers: true });
  assert.deepEqual(result, [{ name: 'Alice', age: '30' }]);
});

test('parse: headers with missing values', () => {
  const result = parse('a,b,c\n1,2', { headers: true });
  assert.deepEqual(result, [{ a: '1', b: '2', c: '' }]);
});

test('parse: custom delimiter', () => {
  assert.deepEqual(parse('a;b;c', { delimiter: ';' }), [['a','b','c']]);
});

test('parse: tab delimiter', () => {
  assert.deepEqual(parse('a\tb\tc', { delimiter: '\t' }), [['a','b','c']]);
});

test('parse: trim option', () => {
  assert.deepEqual(parse('  a  , b ', { trim: true }), [['a','b']]);
});

test('parse: skipEmptyLines', () => {
  assert.deepEqual(parse('a,b\n\nc,d', { skipEmptyLines: true }), [['a','b'],['c','d']]);
});

test('parse: CRLF line endings', () => {
  assert.deepEqual(parse('a,b\r\nc,d'), [['a','b'],['c','d']]);
});

test('parse: CR line endings', () => {
  assert.deepEqual(parse('a,b\rc,d'), [['a','b'],['c','d']]);
});

test('parse: trailing newline', () => {
  assert.deepEqual(parse('a,b\n'), [['a','b']]);
});

test('parse: single column', () => {
  assert.deepEqual(parse('a\nb\nc'), [['a'],['b'],['c']]);
});

test('parse: empty fields', () => {
  assert.deepEqual(parse('a,,c'), [['a','','c']]);
});

test('parse: relaxed mode handles unescaped quotes', () => {
  const result = parse('"hello" world,b', { relaxed: true });
  assert.equal(result[0][0], 'hello world');
});

// ─── Stream Parser ──────────────────────────────────────────

test('streamParser: basic chunked parsing', () => {
  const sp = createStreamParser();
  assert.deepEqual(sp.push('a,b\n'), [['a','b']]);
  assert.deepEqual(sp.push('c,d\n'), [['c','d']]);
  assert.deepEqual(sp.flush(), []);
});

test('streamParser: split across field boundary', () => {
  const sp = createStreamParser();
  assert.deepEqual(sp.push('he'), []);
  assert.deepEqual(sp.push('llo,world\n'), [['hello','world']]);
});

test('streamParser: split inside quotes', () => {
  const sp = createStreamParser();
  assert.deepEqual(sp.push('"hel'), []);
  assert.deepEqual(sp.push('lo",b\n'), [['hello','b']]);
});

test('streamParser: with headers', () => {
  const sp = createStreamParser({ headers: true });
  sp.push('name,age\n');
  const rows = sp.push('Alice,30\n');
  assert.deepEqual(rows, [{ name: 'Alice', age: '30' }]);
});

test('streamParser: flush remaining field', () => {
  const sp = createStreamParser();
  sp.push('a,b\n');
  sp.push('c,d');
  const remaining = sp.flush();
  assert.deepEqual(remaining, [['c','d']]);
});

// ─── Stringify ──────────────────────────────────────────────

test('stringify: basic array', () => {
  assert.equal(stringify([['a','b'],['c','d']]), 'a,b\nc,d\n');
});

test('stringify: with special chars', () => {
  assert.equal(stringify([['a,b','c']]), '"a,b",c\n');
});

test('stringify: escaped quotes', () => {
  assert.equal(stringify([['say "hi"']]), '"say ""hi"""' + '\n');
});

test('stringify: objects with headers', () => {
  const out = stringify([{ name: 'Alice', age: '30' }], { headers: true });
  assert.equal(out, 'name,age\nAlice,30\n');
});

test('stringify: newlines in fields', () => {
  assert.equal(stringify([['line1\nline2']]), '"line1\nline2"\n');
});

test('stringify: null values', () => {
  assert.equal(stringify([[null, undefined]]), ',\n');
});

test('stringify: custom delimiter', () => {
  assert.equal(stringify([['a','b']], { delimiter: ';' }), 'a;b\n');
});

test('stringify: numbers converted', () => {
  assert.equal(stringify([[1, 2.5]]), '1,2.5\n');
});

// ─── Utilities ──────────────────────────────────────────────

test('toJSON: converts CSV to JSON', () => {
  const json = toJSON('name,age\nAlice,30');
  assert.deepEqual(JSON.parse(json), [{ name: 'Alice', age: '30' }]);
});

test('fromJSON: converts JSON to CSV', () => {
  const csv = fromJSON('[{"a":"1","b":"2"}]');
  assert.equal(csv, 'a,b\n1,2\n');
});

test('detectDelimiter: comma', () => {
  assert.equal(detectDelimiter('a,b,c\n1,2,3'), ',');
});

test('detectDelimiter: tab', () => {
  assert.equal(detectDelimiter('a\tb\tc\n1\t2\t3'), '\t');
});

test('detectDelimiter: semicolon', () => {
  assert.equal(detectDelimiter('a;b;c\n1;2;3'), ';');
});

test('detectDelimiter: pipe', () => {
  assert.equal(detectDelimiter('a|b|c\n1|2|3'), '|');
});

// ─── Round-trip ─────────────────────────────────────────────

test('round-trip: parse then stringify', () => {
  const original = 'name,age,city\nAlice,30,"New York"\nBob,25,"San Francisco"';
  const parsed = parse(original, { headers: true });
  const out = stringify(parsed, { headers: true });
  const reparsed = parse(out, { headers: true });
  assert.deepEqual(parsed, reparsed);
});

test('round-trip: special characters', () => {
  const data = [
    { name: 'John "JD" Doe', note: 'has, comma' },
    { name: 'Jane\nDoe', note: 'multi\nline' },
  ];
  const csv = stringify(data, { headers: true });
  const parsed = parse(csv, { headers: true });
  assert.deepEqual(parsed, data);
});
