'use strict';

/**
 * csv-x — Zero-dependency CSV parser and serializer
 * RFC 4180 compliant with streaming support
 */

// ─── Parser ──────────────────────────────────────────────────────────────────

/**
 * Parse a CSV string into an array of rows (arrays of fields).
 *
 * @param {string} input - CSV text
 * @param {object} [opts]
 * @param {string} [opts.delimiter=','] - Field delimiter
 * @param {string} [opts.quote='"'] - Quote character
 * @param {string} [opts.escape='"'] - Escape character (usually same as quote)
 * @param {boolean} [opts.headers=false] - First row is headers
 * @param {boolean} [opts.trim=false] - Trim whitespace from unquoted fields
 * @param {boolean} [opts.skipEmptyLines=false] - Skip blank lines
 * @param {boolean} [opts.relaxed=false] - Allow unescaped quotes in fields
 * @returns {string[][]|object[]} Array of rows (arrays) or objects (if headers)
 */
function parse(input, opts = {}) {
  const {
    delimiter = ',',
    quote = '"',
    escape = '"',
    headers = false,
    trim = false,
    skipEmptyLines = false,
    relaxed = false,
  } = opts;

  if (typeof input !== 'string') throw new TypeError('Input must be a string');
  if (delimiter.length !== 1) throw new Error('Delimiter must be a single character');
  if (quote.length !== 1) throw new Error('Quote must be a single character');

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === escape && i + 1 < input.length && input[i + 1] === quote) {
        // Escaped quote
        field += quote;
        i += 2;
        continue;
      }
      if (ch === quote) {
        // Check if it's an escaped quote (doubled)
        if (i + 1 < input.length && input[i + 1] === quote) {
          field += quote;
          i += 2;
          continue;
        }
        // End of quoted field
        inQuotes = false;
        i++;
        // In relaxed mode, absorb rest of field until delimiter/newline
        if (relaxed) {
          while (i < input.length && input[i] !== delimiter && input[i] !== '\n' && input[i] !== '\r') {
            field += input[i];
            i++;
          }
        }
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    // Not in quotes
    if (ch === quote && field === '') {
      inQuotes = true;
      i++;
      continue;
    }

    if (ch === delimiter) {
      row.push(trim ? field.trim() : field);
      field = '';
      i++;
      continue;
    }

    if (ch === '\r') {
      // Handle \r\n or \r
      row.push(trim ? field.trim() : field);
      field = '';
      if (skipEmptyLines && row.length === 1 && row[0] === '' && rows.length > 0) {
        // will skip
      } else {
        rows.push(row);
      }
      row = [];
      if (i + 1 < input.length && input[i + 1] === '\n') i++;
      i++;
      // Check for empty line
      if (skipEmptyLines && i < input.length && (input[i] === '\n' || input[i] === '\r')) {
        // skip empty line handling below
      }
      continue;
    }

    if (ch === '\n') {
      row.push(trim ? field.trim() : field);
      field = '';
      if (skipEmptyLines && row.length === 1 && row[0] === '') {
        // skip empty line
        row = [];
        i++;
        continue;
      }
      rows.push(row);
      row = [];
      i++;
      continue;
    }

    field += ch;
    i++;
  }

  // Last field/row
  if (field !== '' || row.length > 0) {
    row.push(trim ? field.trim() : field);
    rows.push(row);
  }

  // Filter empty lines if requested
  let result = skipEmptyLines ? rows.filter(r => !(r.length === 1 && r[0] === '')) : rows;

  if (headers && result.length > 0) {
    const headerRow = result[0];
    return result.slice(1).map(r => {
      const obj = {};
      for (let j = 0; j < headerRow.length; j++) {
        obj[headerRow[j]] = r[j] ?? '';
      }
      return obj;
    });
  }

  return result;
}

// ─── Streaming Parser ────────────────────────────────────────────────────────

/**
 * Create a streaming CSV parser that processes chunks.
 *
 * @param {object} [opts] - Same options as parse()
 * @returns {object} Parser with .push(chunk) → rows[] and .flush() → rows[]
 */
function createStreamParser(opts = {}) {
  const { delimiter = ',', quote = '"', headers = false, trim = false, skipEmptyLines = false } = opts;

  let buffer = '';
  let rows = [];
  let headerRow = null;
  let field = '';
  let row = [];
  let inQuotes = false;
  let started = false;

  function processText(text, isFinal = false) {
    buffer += text;
    const collected = [];
    let i = 0;

    while (i < buffer.length) {
      const ch = buffer[i];

      if (inQuotes) {
        if (ch === quote) {
          if (i + 1 < buffer.length && buffer[i + 1] === quote) {
            field += quote;
            i += 2;
            continue;
          }
          inQuotes = false;
          i++;
          continue;
        }
        field += ch;
        i++;
        continue;
      }

      if (ch === quote && field === '') {
        inQuotes = true;
        i++;
        continue;
      }

      if (ch === delimiter) {
        row.push(trim ? field.trim() : field);
        field = '';
        i++;
        continue;
      }

      if (ch === '\r') {
        row.push(trim ? field.trim() : field);
        field = '';
        if (!(skipEmptyLines && row.length === 1 && row[0] === '')) {
          collected.push(row);
        }
        row = [];
        if (i + 1 < buffer.length && buffer[i + 1] === '\n') i++;
        i++;
        continue;
      }

      if (ch === '\n') {
        row.push(trim ? field.trim() : field);
        field = '';
        if (!(skipEmptyLines && row.length === 1 && row[0] === '')) {
          collected.push(row);
        }
        row = [];
        i++;
        continue;
      }

      field += ch;
      i++;
    }

    // Keep unprocessed remainder in buffer
    if (i < buffer.length) {
      buffer = buffer.slice(i);
    } else {
      // All consumed — clear buffer, state (field/row/inQuotes) preserved
      buffer = '';
      if (isFinal && (field !== '' || row.length > 0 || inQuotes)) {
        row.push(trim ? field.trim() : field);
        field = '';
        inQuotes = false;
        if (!(skipEmptyLines && row.length === 1 && row[0] === '')) {
          collected.push(row);
        }
        row = [];
      }
    }

    // Handle headers
    let output = collected;
    if (headers && !headerRow && collected.length > 0) {
      headerRow = collected[0];
      output = collected.slice(1);
    }

    if (headers && headerRow) {
      output = output.map(r => {
        const obj = {};
        for (let j = 0; j < headerRow.length; j++) {
          obj[headerRow[j]] = r[j] ?? '';
        }
        return obj;
      });
    }

    return output;
  }

  return {
    push(chunk) {
      return processText(typeof chunk === 'string' ? chunk : chunk.toString());
    },
    flush() {
      return processText('', true);
    },
  };
}

// ─── Serializer ──────────────────────────────────────────────────────────────

/**
 * Serialize data into CSV format.
 *
 * @param {string[][]|object[]} data - Rows to serialize
 * @param {object} [opts]
 * @param {string} [opts.delimiter=','] - Field delimiter
 * @param {string} [opts.quote='"'] - Quote character
 * @param {boolean} [opts.headers=false] - Include headers (for object data)
 * @param {string} [opts.lineEnd='\n'] - Line ending
 * @returns {string} CSV text
 */
function stringify(data, opts = {}) {
  const {
    delimiter = ',',
    quote = '"',
    headers = false,
    lineEnd = '\n',
  } = opts;

  if (!Array.isArray(data)) throw new TypeError('Data must be an array');

  const escapeField = (val) => {
    const str = val == null ? '' : String(val);
    if (str.includes(quote) || str.includes(delimiter) || str.includes('\n') || str.includes('\r')) {
      return quote + str.replace(new RegExp(quote, 'g'), quote + quote) + quote;
    }
    return str;
  };

  const lines = [];

  if (headers && data.length > 0 && typeof data[0] === 'object' && !Array.isArray(data[0])) {
    const keys = Object.keys(data[0]);
    lines.push(keys.map(escapeField).join(delimiter));
    for (const row of data) {
      lines.push(keys.map(k => escapeField(row[k])).join(delimiter));
    }
  } else {
    for (const row of data) {
      if (Array.isArray(row)) {
        lines.push(row.map(escapeField).join(delimiter));
      } else if (typeof row === 'object' && row !== null) {
        lines.push(Object.values(row).map(escapeField).join(delimiter));
      } else {
        lines.push(escapeField(row));
      }
    }
  }

  return lines.join(lineEnd) + lineEnd;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Convert CSV to JSON string.
 * @param {string} csv - CSV text
 * @param {object} [opts] - Parse options (headers forced true)
 * @returns {string} JSON string
 */
function toJSON(csv, opts = {}) {
  return JSON.stringify(parse(csv, { ...opts, headers: true }), null, 2);
}

/**
 * Convert JSON string to CSV.
 * @param {string} json - JSON text (array of objects)
 * @param {object} [opts] - Stringify options (headers forced true)
 * @returns {string} CSV text
 */
function fromJSON(json, opts = {}) {
  const data = JSON.parse(json);
  return stringify(data, { ...opts, headers: true });
}

/**
 * Detect the most likely delimiter in a CSV string.
 * @param {string} input - CSV text (first few lines enough)
 * @returns {string} Detected delimiter
 */
function detectDelimiter(input) {
  const candidates = [',', '\t', ';', '|'];
  const firstLine = input.split('\n')[0] || '';
  let best = ',';
  let bestCount = 0;

  for (const d of candidates) {
    // Count occurrences outside quotes
    let count = 0;
    let inQ = false;
    for (let i = 0; i < firstLine.length; i++) {
      if (firstLine[i] === '"') { inQ = !inQ; continue; }
      if (!inQ && firstLine[i] === d) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }

  return best;
}

module.exports = {
  parse,
  createStreamParser,
  stringify,
  toJSON,
  fromJSON,
  detectDelimiter,
};
