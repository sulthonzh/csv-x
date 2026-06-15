#!/usr/bin/env node
'use strict';

const { parse, stringify, toJSON, fromJSON, detectDelimiter } = require('./index.js');

function usage() {
  console.log(`csv-x — Zero-dependency CSV toolkit

Usage:
  csv-x parse [file]        Parse CSV to readable output
  csv-x json [file]         Convert CSV to JSON (first row = headers)
  csv-x from-json [file]    Convert JSON array to CSV
  csv-x delimiter [file]    Detect delimiter
  csv-x demo                Show example usage

Options:
  -d, --delimiter <char>    Field delimiter (default: ,)
  -H, --headers             First row is headers
  -t, --trim                Trim unquoted fields
  -s, --skip-empty          Skip empty lines
  -o, --output <format>     Output format: table, json, raw (default: table)

Examples:
  csv-x parse data.csv -H
  cat data.csv | csv-x json
  csv-x from-json users.json -o raw
`);
}

function readInput(file) {
  if (!file || file === '-') {
    return require('fs').readFileSync(0, 'utf8');
  }
  return require('fs').readFileSync(file, 'utf8');
}

function printTable(rows) {
  if (!rows.length) return;
  const isObj = typeof rows[0] === 'object' && !Array.isArray(rows[0]);
  let data = rows;
  if (isObj) {
    const keys = [...new Set(rows.flatMap(r => Object.keys(r)))];
    console.log(keys.join(' | '));
    console.log(keys.map(() => '---').join(' | '));
    data = rows.map(r => keys.map(k => r[k] ?? ''));
  }
  // Calculate column widths
  const cols = data[0]?.length || 0;
  const widths = [];
  for (let c = 0; c < cols; c++) {
    widths[c] = Math.max(...data.map(r => String(r[c] ?? '').length), 0);
  }
  for (const row of data) {
    console.log(row.map((v, i) => String(v ?? '').padEnd(widths[i] || 0)).join(' | '));
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
    usage();
    return;
  }

  const cmd = args[0];
  let file = null;
  const opts = { delimiter: ',', headers: false, trim: false, skipEmptyLines: false };
  let outputFmt = 'table';

  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === '-d' || a === '--delimiter') { opts.delimiter = args[++i]; }
    else if (a === '-H' || a === '--headers') { opts.headers = true; }
    else if (a === '-t' || a === '--trim') { opts.trim = true; }
    else if (a === '-s' || a === '--skip-empty') { opts.skipEmptyLines = true; }
    else if (a === '-o' || a === '--output') { outputFmt = args[++i]; }
    else if (!a.startsWith('-')) { file = a; }
  }

  try {
    switch (cmd) {
      case 'parse': {
        const input = readInput(file);
        const rows = parse(input, opts);
        if (outputFmt === 'json') console.log(JSON.stringify(rows, null, 2));
        else if (outputFmt === 'raw') rows.forEach(r => console.log(Array.isArray(r) ? r.join(opts.delimiter) : r));
        else printTable(rows);
        break;
      }
      case 'json': {
        const input = readInput(file);
        const result = parse(input, { ...opts, headers: true });
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      case 'from-json': {
        const input = readInput(file);
        const csv = fromJSON(input, { delimiter: opts.delimiter });
        console.log(csv);
        break;
      }
      case 'delimiter': {
        const input = readInput(file);
        console.log(detectDelimiter(input));
        break;
      }
      case 'demo': {
        console.log('=== Parsing CSV ===\n');
        const csv = 'name,age,city\nAlice,30,"New York"\nBob,25,"San Francisco"\nCarol,35,"Los Angeles"';
        console.log('Input:\n' + csv + '\n');
        const rows = parse(csv, { headers: true });
        console.log('Parsed (headers=true):');
        console.log(JSON.stringify(rows, null, 2));
        console.log('\n=== Stringify ===\n');
        const out = stringify(rows, { headers: true });
        console.log('Output:\n' + out);
        console.log('\n=== Streaming ===\n');
        const sp = createStreamParserDemo();
        console.log(sp);
        break;
      }
      default:
        console.error(`Unknown command: ${cmd}`);
        usage();
        process.exit(1);
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

function createStreamParserDemo() {
  const { createStreamParser } = require('./index.js');
  const sp = createStreamParser({ headers: true });
  const r1 = sp.push('name,age\nAl');
  const r2 = sp.push('ice,30\nBo')
  const r3 = sp.push('b,25\n');
  const r4 = sp.flush();
  return `Chunk 1 → ${JSON.stringify(r1)}\nChunk 2 → ${JSON.stringify(r2)}\nChunk 3 → ${JSON.stringify(r3)}\nFlush  → ${JSON.stringify(r4)}`;
}

main();
