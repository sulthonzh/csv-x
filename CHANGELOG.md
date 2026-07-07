# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-07-07

### Fixed
- Streaming parser: CRLF (`\r\n`) split across chunks no longer produces duplicate/empty rows
- Streaming parser: `\r` at end of buffer on `flush()` now correctly terminates the row (was silently dropped)

### Added
- 42 new edge-case tests (40 → 82 tests total)
  - Input validation: TypeError on non-string input, multi-char delimiter/quote rejection
  - Stringify validation: TypeError on non-array, Date/boolean/null/custom line ending handling
  - Headers mode: empty data, extra values, empty header names
  - Relaxed mode: text after closing quote, delimiter after quote
  - Stream parser: delimiter/newline/escape-quote/CRLF splits, multi-chunk accumulation, trim/skipEmptyLines options
  - detectDelimiter: empty string, no delimiters, quoted delimiters, single column
  - Round-trip: stream parse → stringify → reparse consistency
