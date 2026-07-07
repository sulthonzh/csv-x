'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parse, createStreamParser, stringify, toJSON, fromJSON, detectDelimiter } = require('../src/index.js');

// ─── Edge-case: input validation ─────────────────────────────

test('parse: throws TypeError on non-string input', () => {
  assert.throws(() => parse(123), TypeError);
  assert.throws(() => parse(null), TypeError);
  assert.throws(() => parse(undefined), TypeError);
  assert.throws(() => parse([]), TypeError);
});

test('parse: throws on multi-char delimiter', () => {
  assert.throws(() => parse('a,b', { delimiter: ';;' }), /single character/);
});

test('parse: throws on multi-char quote', () => {
  assert.throws(() => parse('a,b', { quote: '""' }), /single character/);
});

// ─── Edge-case: stringify validation ─────────────────────────

test('stringify: throws TypeError on non-array', () => {
  assert.throws(() => stringify('hello'), TypeError);
  assert.throws(() => stringify({ a: 1 }), TypeError);
  assert.throws(() => stringify(null), TypeError);
});

test('stringify: empty array returns empty string', () => {
  assert.equal(stringify([]), '\n');
});

test('stringify: handles Date objects by String()', () => {
  const d = new Date('2024-01-01');
  const out = stringify([[d]]);
  assert.equal(out, String(d) + '\n');
});

test('stringify: boolean values converted', () => {
  assert.equal(stringify([[true, false]]), 'true,false\n');
});

test('stringify: custom line ending', () => {
  assert.equal(stringify([['a','b']], { lineEnd: '\r\n' }), 'a,b\r\n');
});

test('stringify: plain objects get Object.values', () => {
  // Without headers flag, objects in a row get Object.values()'d
  const out = stringify([{ a: 1, b: 2 }, { a: 3, b: 4 }]);
  assert.equal(out, '1,2\n3,4\n');
});

// ─── Edge-case: parse with only whitespace ───────────────────

test('parse: whitespace-only input', () => {
  assert.deepEqual(parse('   '), [['   ']]);
});

test('parse: single trailing field without newline', () => {
  assert.deepEqual(parse('hello'), [['hello']]);
});

// ─── Edge-case: skipEmptyLines variations ────────────────────

test('parse: skipEmptyLines with CRLF blank lines', () => {
  assert.deepEqual(parse('a,b\r\n\r\nc,d', { skipEmptyLines: true }), [['a','b'],['c','d']]);
});

test('parse: skipEmptyLines with multiple consecutive blanks', () => {
  assert.deepEqual(parse('a,b\n\n\n\nc,d', { skipEmptyLines: true }), [['a','b'],['c','d']]);
});

test('parse: skipEmptyLines trailing blank', () => {
  assert.deepEqual(parse('a,b\nc,d\n\n', { skipEmptyLines: true }), [['a','b'],['c','d']]);
});

// ─── Edge-case: headers mode edge cases ──────────────────────

test('parse: headers with empty data rows', () => {
  const result = parse('a,b,c', { headers: true });
  assert.deepEqual(result, []);
});

test('parse: headers with extra values beyond headers', () => {
  const result = parse('a,b\n1,2,3', { headers: true });
  assert.deepEqual(result, [{ a: '1', b: '2' }]);
  // Extra value '3' is dropped (no header for it)
});

test('parse: headers preserves empty header names', () => {
  const result = parse('a,,c\n1,2,3', { headers: true });
  assert.deepEqual(result, [{ a: '1', '': '2', c: '3' }]);
});

// ─── Edge-case: relaxed mode ─────────────────────────────────

test('parse: relaxed mode with text after closing quote', () => {
  const result = parse('"hello" extra,b', { relaxed: true });
  assert.equal(result[0][0], 'hello extra');
});

test('parse: relaxed mode with delimiter after quote', () => {
  const result = parse('"hello",b', { relaxed: true });
  assert.equal(result[0][0], 'hello');
});

// ─── Edge-case: stream parser advanced ───────────────────────

test('streamParser: split at delimiter boundary', () => {
  const sp = createStreamParser();
  assert.deepEqual(sp.push('a'), []);
  assert.deepEqual(sp.push(',b\n'), [['a','b']]);
});

test('streamParser: split at newline boundary', () => {
  const sp = createStreamParser();
  assert.deepEqual(sp.push('a,b'), []);
  assert.deepEqual(sp.push('\nc,d\n'), [['a','b'],['c','d']]);
});

test('streamParser: escaped quote split across chunks', () => {
  const sp = createStreamParser();
  assert.deepEqual(sp.push('"she said '), []);
  assert.deepEqual(sp.push('""hi""'), []);
  assert.deepEqual(sp.push('",b\n'), [['she said "hi"','b']]);
});

test('streamParser: CRLF split across chunks', () => {
  // \r at end of chunk is treated as potential CRLF — \n at start of next chunk should be consumed
  const sp = createStreamParser();
  const r1 = sp.push('a,b\r');
  const r2 = sp.push('\nc,d\n');
  // Should yield [['a','b'],['c','d']] across both chunks
  assert.deepEqual([...r1, ...r2], [['a','b'],['c','d']]);
});

test('streamParser: flush empty buffer', () => {
  const sp = createStreamParser();
  sp.push('a,b\n');
  assert.deepEqual(sp.flush(), []);
});

test('streamParser: multiple chunks accumulate correctly', () => {
  const sp = createStreamParser({ headers: true });
  sp.push('name');
  sp.push(',age');
  sp.push('\n');
  sp.push('Alice');
  sp.push(',30');
  const rows = sp.push('\n');
  assert.deepEqual(rows, [{ name: 'Alice', age: '30' }]);
});

test('streamParser: skipEmptyLines', () => {
  const sp = createStreamParser({ skipEmptyLines: true });
  assert.deepEqual(sp.push('a,b\n\n'), [['a','b']]);
  assert.deepEqual(sp.push('c,d\n'), [['c','d']]);
});

test('streamParser: CR-only at end resolves on flush', () => {
  const sp = createStreamParser();
  assert.deepEqual(sp.push('a,b\r'), []);
  assert.deepEqual(sp.flush(), [['a','b']]);
});

test('streamParser: CR at end followed by LF in next chunk', () => {
  const sp = createStreamParser();
  assert.deepEqual(sp.push('a,b\r'), []);
  assert.deepEqual(sp.push('\nc,d\n'), [['a','b'],['c','d']]);
});

test('streamParser: trim option', () => {
  const sp = createStreamParser({ trim: true });
  assert.deepEqual(sp.push('  a  , b \n'), [['a','b']]);
});

// ─── Edge-case: detectDelimiter edge cases ───────────────────

test('detectDelimiter: empty string returns comma', () => {
  assert.equal(detectDelimiter(''), ',');
});

test('detectDelimiter: no delimiters found returns comma', () => {
  assert.equal(detectDelimiter('hello'), ',');
});

test('detectDelimiter: handles quoted delimiters', () => {
  // Semicolons inside quotes shouldn't count
  assert.equal(detectDelimiter('"a;b;c",x,y'), ',');
});

test('detectDelimiter: single column (no delimiters)', () => {
  assert.equal(detectDelimiter('just_text'), ',');
});

// ─── Edge-case: toJSON / fromJSON round-trips ────────────────

test('toJSON: with custom delimiter', () => {
  const json = toJSON('name;age\nAlice;30', { delimiter: ';' });
  assert.deepEqual(JSON.parse(json), [{ name: 'Alice', age: '30' }]);
});

test('fromJSON: round-trip with toJSON', () => {
  const csv = 'name,age\nAlice,30\n';
  const json = toJSON(csv);
  const back = fromJSON(json);
  assert.equal(back, 'name,age\nAlice,30\n');
});

test('fromJSON: invalid JSON throws', () => {
  assert.throws(() => fromJSON('not json'), SyntaxError);
});

// ─── Edge-case: stringify edge cases ─────────────────────────

test('stringify: field with \r\n', () => {
  assert.equal(stringify([['line1\r\nline2']]), '"line1\r\nline2"\n');
});

test('stringify: field equal to quote char', () => {
  assert.equal(stringify([['"']]), '""""\n');
});

test('stringify: field equal to delimiter', () => {
  assert.equal(stringify([[',']]), '","\n');
});

test('stringify: mixed types in array rows', () => {
  assert.equal(stringify([[1, 'a', true, null]]), '1,a,true,\n');
});

test('stringify: object array without headers flag', () => {
  const out = stringify([{ a: 1, b: 2 }]);
  // Without headers, objects get Object.values()
  assert.equal(out, '1,2\n');
});

// ─── Round-trip: streaming + stringify ────────────────────────

test('round-trip: stream parse then stringify', () => {
  const sp = createStreamParser({ headers: true });
  const csv = 'name,age,city\nAlice,30,"New York"\nBob,25,"San Francisco"';
  const chunk1 = sp.push(csv.slice(0, 20));
  const chunk2 = sp.push(csv.slice(20));
  const chunk3 = sp.flush();
  const allRows = [...chunk1, ...chunk2, ...chunk3];
  const out = stringify(allRows, { headers: true });
  const reparsed = parse(out, { headers: true });
  assert.deepEqual(reparsed, allRows);
});

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
