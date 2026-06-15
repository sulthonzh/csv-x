# csv-x

Zero-dependency CSV parser and serializer for Node.js. RFC 4180 compliant with streaming support, custom delimiters, and a CLI.

## Why

Every CSV library I've used either pulls in 20+ dependencies, doesn't handle streaming, or chokes on edge cases like embedded newlines and escaped quotes. `csv-x` is a single file, zero dependencies, handles the full RFC 4180 spec, and includes a streaming parser for large files.

## Install

```bash
npm install csv-x
```

## Quick Start

```javascript
const { parse, stringify } = require('csv-x');

// Parse
const rows = parse('name,age,city\nAlice,30,"New York"');
// → [['name', 'age', 'city'], ['Alice', '30', 'New York']]

// Parse with headers
const users = parse('name,age\nAlice,30\nBob,25', { headers: true });
// → [{ name: 'Alice', age: '30' }, { name: 'Bob', age: '25' }]

// Stringify
const csv = stringify([
  { name: 'Alice', age: 30 },
  { name: 'Bob', age: 25 }
], { headers: true });
// → 'name,age\nAlice,30\nBob,25\n'
```

## API

### `parse(input, opts?)`

Parse CSV text into rows.

| Option | Default | Description |
|--------|---------|-------------|
| `delimiter` | `','` | Field delimiter |
| `quote` | `'"'` | Quote character |
| `escape` | `'"'` | Escape character |
| `headers` | `false` | Treat first row as column names → returns objects |
| `trim` | `false` | Trim whitespace from unquoted fields |
| `skipEmptyLines` | `false` | Skip blank lines |
| `relaxed` | `false` | Allow unescaped quotes in fields |

```javascript
parse('"hello ""world""",b')  // → [['hello "world"', 'b']]
parse('a;b;c', { delimiter: ';' })  // → [['a', 'b', 'c']]
```

### `createStreamParser(opts?)`

Returns a streaming parser for chunked processing.

```javascript
const sp = createStreamParser({ headers: true });

// Feed chunks
const batch1 = sp.push('name,age\nAl');
const batch2 = sp.push('ice,30\nBob,25\n');
const remaining = sp.flush();

// batch1 → []
// batch2 → [{ name: 'Alice', age: '30' }, { name: 'Bob', age: '25' }]
// remaining → []
```

Handles fields split across chunks, including quotes spanning chunk boundaries.

### `stringify(data, opts?)`

Serialize arrays into CSV.

```javascript
// Array of arrays
stringify([['a', 'b'], ['c', 'd']])  // → 'a,b\nc,d\n'

// Array of objects (with headers)
stringify([{ x: 1, y: 2 }], { headers: true })  // → 'x,y\n1,2\n'
```

Automatically quotes fields containing delimiters, quotes, or newlines.

### `toJSON(csv, opts?)`

Convert CSV directly to a JSON string (forces `headers: true`).

### `fromJSON(json, opts?)`

Convert a JSON array of objects back to CSV.

### `detectDelimiter(input)`

Detect the most likely delimiter (`,`, `\t`, `;`, `|`) from sample text.

```javascript
detectDelimiter('a;b;c\n1;2;3')  // → ';'
```

## CLI

```bash
# Parse CSV to table view
csv-x parse data.csv -H

# Convert to JSON
csv-x json data.csv

# Convert JSON to CSV
csv-x from-json users.json

# Detect delimiter
csv-x delimiter data.csv

# Demo
csv-x demo
```

### Options

- `-d, --delimiter <char>` — Field delimiter (default: `,`)
- `-H, --headers` — First row is headers
- `-t, --trim` — Trim unquoted fields
- `-s, --skip-empty` — Skip empty lines
- `-o, --output <format>` — `table`, `json`, or `raw`

## Streaming Large Files

```javascript
const { createReadStream } = require('fs');
const { createStreamParser } = require('csv-x');

const sp = createStreamParser({ headers: true });
const stream = createReadStream('large.csv');

stream.on('data', (chunk) => {
  const rows = sp.push(chunk.toString());
  // Process batch of rows
  rows.forEach(row => console.log(row));
});

stream.on('end', () => {
  const leftover = sp.flush();
  leftover.forEach(row => console.log(row));
});
```

## RFC 4180 Compliance

- ✅ Fields with embedded delimiters are quoted
- ✅ Fields with embedded newlines are quoted
- ✅ Quotes inside fields are escaped by doubling
- ✅ CRLF and LF line endings supported
- ✅ Empty fields preserved
- ✅ Fields may be quoted even when not required

## Zero Dependencies

No `node_modules`. Just one file.

## License

MIT
