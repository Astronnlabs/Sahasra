/**
 * Reads the data out of a SQL dump (MySQL / MariaDB, PostgreSQL, SQLite, SQL Server style):
 * CREATE TABLE gives the column names, INSERT … VALUES and PostgreSQL COPY … FROM stdin give the rows.
 * Nothing in the file is ever executed — it is only read as text.
 */

export interface SqlTable {
  name: string;
  columns: string[];
  rows: unknown[][];
}

const ident = (s: string) => s.trim().replace(/^[`"[]|[`"\]]$/g, '');
/** `shop`.`products`, "public"."products", [dbo].[products] → products */
const tableName = (s: string) => ident(s.trim().split('.').pop() ?? s);

/** Splits on `sep` at the top level — not inside quotes or brackets. */
function splitTop(text: string, sep = ','): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\' && quote === "'") i++;
      else if (c === quote) {
        if (text[i + 1] === quote) i++;
        else quote = '';
      }
    } else if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === sep && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out;
}

const ESC: Record<string, string> = { n: '\n', r: '\r', t: '\t', '0': '', b: '\b', Z: '', '\\': '\\', "'": "'", '"': '"' };

/** One SQL literal → a JS value ('it''s' → it's, NULL → null, 12.5 → 12.5). */
function literal(raw: string): unknown {
  let s = raw.trim();
  if (!s || /^null$/i.test(s)) return null;
  if (/^true$/i.test(s)) return true;
  if (/^false$/i.test(s)) return false;
  // N'…', E'…', _utf8'…' prefixes and trailing casts like '…'::text
  s = s.replace(/^(?:N|E|_\w+)(?=')/i, '');
  const q = s[0];
  if (q === "'" || q === '"') {
    let out = '';
    let i = 1;
    for (; i < s.length; i++) {
      const c = s[i];
      if (c === '\\' && i + 1 < s.length) {
        out += ESC[s[i + 1]] ?? s[i + 1];
        i++;
      } else if (c === q) {
        if (s[i + 1] === q) {
          out += q;
          i++;
        } else break;
      } else out += c;
    }
    return out;
  }
  if (/^[-+]?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(s)) return Number(s);
  // Functions and expressions (NOW(), CURRENT_TIMESTAMP): keep the text.
  return s.replace(/::[\w\s]+$/, '');
}

/** Rows from "VALUES (…), (…)" up to anything that isn't a tuple (ON DUPLICATE KEY…, RETURNING…). */
function tuples(text: string): unknown[][] {
  const rows: unknown[][] = [];
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /[\s,]/.test(text[i])) i++;
    if (text[i] !== '(') break;
    let depth = 0;
    let quote = '';
    const start = i;
    for (; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (c === '\\' && quote === "'") i++;
        else if (c === quote) {
          if (text[i + 1] === quote) i++;
          else quote = '';
        }
      } else if (c === "'" || c === '"') quote = c;
      else if (c === '(') depth++;
      else if (c === ')' && --depth === 0) break;
    }
    rows.push(splitTop(text.slice(start + 1, i)).map(literal));
    i++;
  }
  return rows;
}

/** Statements split on ";" outside quotes and comments; PostgreSQL COPY data blocks kept with their COPY line. */
function statements(sql: string): { text: string; copyData?: string[] }[] {
  const out: { text: string; copyData?: string[] }[] = [];
  let cur = '';
  let quote = '';
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (quote) {
      cur += c;
      if (c === '\\' && quote === "'" && i + 1 < sql.length) cur += sql[++i];
      else if (c === quote) {
        if (sql[i + 1] === quote) cur += sql[++i];
        else quote = '';
      }
      continue;
    }
    if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      cur += '\n';
      continue;
    }
    if (c === '#' && (i === 0 || sql[i - 1] === '\n')) {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end < 0 ? sql.length : end + 1;
      cur += ' ';
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      cur += c;
      continue;
    }
    if (c === ';') {
      const text = cur.trim();
      cur = '';
      if (!text) continue;
      if (/^COPY\s/i.test(text) && /FROM\s+stdin/i.test(text)) {
        // Data lines follow until a line with just "\."
        const nl = sql.indexOf('\n', i);
        let end = sql.indexOf('\n\\.', nl);
        if (end < 0) end = sql.length;
        out.push({ text, copyData: sql.slice(nl + 1, end).split(/\r?\n/).filter((l) => l.length) });
        i = end + 3;
      } else out.push({ text });
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push({ text: cur.trim() });
  return out;
}

const COPY_ESC: Record<string, string> = { n: '\n', r: '\r', t: '\t', '\\': '\\' };
const copyValue = (v: string) => (v === '\\N' ? null : v.replace(/\\(.)/g, (_, ch: string) => COPY_ESC[ch] ?? ch));

const NAME = String.raw`((?:[\`"\[]?[\w$ -]+[\`"\]]?\.)*[\`"\[]?[\w$ -]+[\`"\]]?)`;
const CREATE_RE = new RegExp(String.raw`^CREATE\s+(?:TEMPORARY\s+|TEMP\s+|UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?${NAME}\s*\(([\s\S]*)\)`, 'i');
const INSERT_RE = new RegExp(String.raw`^(?:INSERT|REPLACE)\s+(?:LOW_PRIORITY\s+|DELAYED\s+|HIGH_PRIORITY\s+|IGNORE\s+|OR\s+\w+\s+)*INTO\s+${NAME}\s*(?:\(([^)]*)\))?\s*VALUES\s*([\s\S]*)$`, 'i');
const COPY_RE = new RegExp(String.raw`^COPY\s+${NAME}\s*(?:\(([^)]*)\))?\s+FROM\s+stdin`, 'i');
const NOT_COLUMN = /^(PRIMARY|UNIQUE|KEY|INDEX|CONSTRAINT|FOREIGN|CHECK|FULLTEXT|SPATIAL|EXCLUDE|PERIOD)\b/i;

/** Every table in the dump with its column names (empty tables included, so nothing looks missing). */
export function parseSqlDump(sql: string): SqlTable[] {
  const tables = new Map<string, SqlTable>();
  const get = (name: string) => {
    const key = tableName(name);
    let t = tables.get(key.toLowerCase());
    if (!t) {
      t = { name: key, columns: [], rows: [] };
      tables.set(key.toLowerCase(), t);
    }
    return t;
  };
  for (const st of statements(sql.replace(/^﻿/, ''))) {
    const create = st.text.match(CREATE_RE);
    if (create) {
      const t = get(create[1]);
      t.columns = splitTop(create[2])
        .map((d) => d.trim())
        .filter((d) => d && !NOT_COLUMN.test(d))
        .map((d) => ident(d.match(/^([`"[][^`"\]]+[`"\]]|\S+)/)?.[1] ?? d));
      continue;
    }
    const insert = st.text.match(INSERT_RE);
    if (insert) {
      const t = get(insert[1]);
      const cols = insert[2] ? splitTop(insert[2]).map(ident) : null;
      for (const row of tuples(insert[3])) {
        // INSERTs that list their columns are lined up with the table's columns.
        if (cols && t.columns.length && cols.join() !== t.columns.join()) {
          for (const c of cols) if (!t.columns.includes(c)) t.columns.push(c);
          const full = t.columns.map((c) => (cols.includes(c) ? row[cols.indexOf(c)] : null));
          t.rows.push(full);
        } else {
          if (cols && !t.columns.length) t.columns = cols;
          t.rows.push(row);
        }
      }
      continue;
    }
    const copy = st.copyData && st.text.match(COPY_RE);
    if (copy && st.copyData) {
      const t = get(copy[1]);
      if (copy[2]) t.columns = splitTop(copy[2]).map(ident);
      for (const line of st.copyData) t.rows.push(line.split('\t').map(copyValue));
    }
  }
  return [...tables.values()]
    .filter((t) => t.rows.length || t.columns.length)
    .map((t) => {
      const width = Math.max(t.columns.length, ...t.rows.map((r) => r.length));
      return { ...t, columns: Array.from({ length: width }, (_, i) => t.columns[i] || `Column ${i + 1}`) };
    });
}
