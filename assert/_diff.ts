// Copyright 2018-2023 the Deno authors. All rights reserved. MIT license.
// This module is browser compatible.

import {
  bgGreen,
  bgRed,
  bold,
  gray,
  green,
  red,
  white,
} from "../fmt/colors.ts";

interface FarthestPoint {
  y: number;
  id: number;
}

export enum DiffType {
  removed = "removed",
  common = "common",
  added = "added",
}

export interface DiffResult<T> {
  type: DiffType;
  value: T;
  details?: Array<DiffResult<T>>;
}

const REMOVED = 1;
const COMMON = 2;
const ADDED = 3;

function createCommon<T>(A: T[], B: T[], reverse?: boolean): T[] {
  const common = [];
  if (A.length === 0 || B.length === 0) return [];
  for (let i = 0; i < Math.min(A.length, B.length); i += 1) {
    if (
      A[reverse ? A.length - i - 1 : i] === B[reverse ? B.length - i - 1 : i]
    ) {
      common.push(A[reverse ? A.length - i - 1 : i]);
    } else {
      return common;
    }
  }
  return common;
}

function debug(a: any[], b: any[], arr: number[] | Uint32Array, m: number) {
  let out = "\n";
  out += "  " +
    Array.from(a.join("").replace(/\n/g, "").replace(/\\n/g, "")).join(" ");
  out += "\n";

  const b2 = Array.from(b.join("").replace(/\n/g, "").replace(/\\n/g, ""));

  let row = 0;
  for (let i = 0; i < arr.length; i++) {
    if (i % m === 0) {
      if (i > 0) {
        out += " ".repeat(m) + "\n";
      }
      out += b2[row];
      row++;
    }

    const char = arr[i] === DiffKind.common
      ? "↘"
      : arr[i] === DiffKind.insert
      ? "↓"
      : arr[i] === DiffKind.delete
      ? "→"
      : "-";
    out += " " + char;
  }
  out += "\n\n";

  console.log(out);
}

function debugV(v: Uint32Array, max: number) {
  const charLens = new Uint32Array(v.length);

  let out = "";
  let j = 0;
  for (let i = -max; i < max + 1; i++) {
    const s = String(i);
    charLens[j++] = s.length;
    out += s + " ";
  }

  out += "\n";
  for (let i = 0; i < v.length; i++) {
    out += String(v[i]).padStart(charLens[i], " ") + " ";
  }

  out += "\n";
  console.log(out);
}

function debugV2(v: Uint32Array, d: number) {
  let out = "  ";

  console.log(d);

  for (let i = 0; i < d; i++) {
    out += `${i} `;
  }
  out += "\n\n  ";

  for (let i = 0; i < v.length; i++) {
    if (i > 0 && i % d === 0) {
      out += "\n  ";
    }

    out += v[i] + " ";
  }

  out += "\n";
  console.log(out);
}

function printTable(m: number, n: number) {
  let f = "";
  let s = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      f += "0, ";
      s++;
    }
    f += "\n";
  }
  console.log(f);
  console.log(s);
}

enum DiffKind {
  insert = 1,
  delete = 2,
  common = 3,
}

export function diffSequence<T>(a: T[], b: T[]): Array<DiffResult<T>> {
  console.log(a);
  console.log(b);
  const aLen = a.length;
  const bLen = b.length;

  // Short-circuit if both sequences are empty
  if (aLen === 0 && bLen === 0) return [];

  // Optimization: We can narrow down the problem space ignoring
  // matching start and end items in both sequences. In many
  // scenarios changes only tend to happen somewhere in the middle.

  // Find matches at the start
  const commonPrefix: DiffResult<T>[] = [];
  const minLen = aLen > bLen ? bLen : aLen;
  let start = 0;
  for (start = 0; start < minLen; start++) {
    if (a[start] !== b[start]) break;
    commonPrefix.push({ type: DiffType.common, value: a[start] });
  }

  // // Find matches at the end
  const commonSuffix: DiffResult<T>[] = [];
  const endLimit = minLen - start;
  for (let i = 1; i < endLimit + 1; i++) {
    if (a[aLen - i] !== b[bLen - i]) {
      break;
    }

    commonSuffix.push({ type: DiffType.common, value: a[aLen - i] });
  }
  const end = commonSuffix.length;

  // If we consumed the length of the smaller sequence, then
  // both sequences must be equal and contain no differences.
  if (start + end === minLen) {
    return [];
  }

  // Now we need to find the differences in the remaining subsequence.
  // For that we use the algorithm described in:
  //   "An O(ND) Difference Algorithm and Its Variations'
  //   by Eugene W. Myers"

  // Ensure that we always have a portrait view grid instead of one in
  // landscape if possible, as this reduces the problem space. When
  // we do that insertions and deletions are swapped, and we need
  // to account for this during display.
  // const swapped = aLen > bLen;
  const swapped = false;

  const n = aLen - start - end;
  const m = bLen - start - end;
  const max = m + n; // max moves

  console.log("PRE + SUF");
  console.log(a.slice(start, -end));
  console.log(b.slice(start, -end));

  const trace: Array<Uint32Array> = [];

  const v = new Uint32Array(2 * max + 1);
  search: for (let d = 0; d < max; d++) {
    if (d > 0) {
      trace.push(v.slice());
    }

    // Skip calculating path that are outside of the grid
    const mMax = d - m > 0 ? d - m : 0;
    const nMax = d - n > 0 ? d - n : 0;
    for (let k = -(d - 2 * mMax); k < d - 2 * nMax + 1; k += 2) {
      let x = 0;
      let y = 0;

      if (k === -d || (k !== d && v[(k - 1) + max] < v[(k + 1) + max])) {
        x = v[(k + 1) + max];
      } else {
        x = v[max + (k - 1)] + 1;
      }

      y = x - k;

      // Check if we can move diagonally
      while (x < n && y < m && a[x + start] === b[y + start]) {
        x++;
        y++;
      }

      v[k + max] = x;

      // We reached the end
      if (x >= n && y >= m) {
        console.log("found", d, k, x, y);
        break search;
      }
    }
  }

  let s = "";
  for (let i = 0; i < 2 * max + 1; i++) {
    for (let j = 0; j < trace.length; j++) {
      s += `${trace[j][i]} `;
    }
    s += "\n";
  }

  // Trace
  console.log(s);

  return [];
}

function diffKindToType(kind: DiffKind) {
  switch (kind) {
    case DiffKind.insert:
      return DiffType.added;
    case DiffKind.delete:
      return DiffType.removed;
    case DiffKind.common:
      return DiffType.common;
  }
}

function diffRecursive<T>(a: T[], b: T[], i: number, j: number) {
  const n = a.length;
  const m = b.length;

  if (n > 0 && m > 0) {
    const l = n + m;
    const z = 2 * (n > m ? m : n) + 2;

    const w = n - m;
    const g = new Uint32Array(z);
    const p = new Uint32Array(z);

    // const limit = (l/2+(l%2!=0))+1
    // for (let h = 0; h < ; h++) {

    // }
  } else if (n > 0) {
    for (let i = 0; i < n; i++) {
      console.log("DELETE", a[i + n]);
    }
  } else {
    for (let i = 0; i < m; i++) {
      console.log("Insert", b[i + n]);
    }
  }

  return [];
}

/**
 * Renders the differences between the actual and expected values
 * @param A Actual value
 * @param B Expected value
 */
export function diff<T>(A: T[], B: T[]): Array<DiffResult<T>> {
  return diffSequence(A, B);
  // return diffRecursive(A, B, 0, 0);
  const prefixCommon = createCommon(A, B);
  const suffixCommon = createCommon(
    A.slice(prefixCommon.length),
    B.slice(prefixCommon.length),
    true,
  ).reverse();
  A = suffixCommon.length
    ? A.slice(prefixCommon.length, -suffixCommon.length)
    : A.slice(prefixCommon.length);
  B = suffixCommon.length
    ? B.slice(prefixCommon.length, -suffixCommon.length)
    : B.slice(prefixCommon.length);
  const swapped = B.length > A.length;
  [A, B] = swapped ? [B, A] : [A, B];
  const M = A.length;
  const N = B.length;
  if (!M && !N && !suffixCommon.length && !prefixCommon.length) return [];
  if (!N) {
    return [
      ...prefixCommon.map(
        (c): DiffResult<typeof c> => ({ type: DiffType.common, value: c }),
      ),
      ...A.map(
        (a): DiffResult<typeof a> => ({
          type: swapped ? DiffType.added : DiffType.removed,
          value: a,
        }),
      ),
      ...suffixCommon.map(
        (c): DiffResult<typeof c> => ({ type: DiffType.common, value: c }),
      ),
    ];
  }
  const offset = N;
  const delta = M - N;
  const size = M + N + 1;
  const fp: FarthestPoint[] = Array.from(
    { length: size },
    () => ({ y: -1, id: -1 }),
  );
  /**
   * INFO:
   * This buffer is used to save memory and improve performance.
   * The first half is used to save route and last half is used to save diff
   * type.
   * This is because, when I kept new uint8array area to save type,performance
   * worsened.
   */
  const routes = new Uint32Array((M * N + size + 1) * 2);
  const diffTypesPtrOffset = routes.length / 2;
  let ptr = 0;
  let p = -1;

  function backTrace<T>(
    A: T[],
    B: T[],
    current: FarthestPoint,
    swapped: boolean,
  ): Array<{
    type: DiffType;
    value: T;
  }> {
    const M = A.length;
    const N = B.length;
    const result = [];
    let a = M - 1;
    let b = N - 1;
    let j = routes[current.id];
    let type = routes[current.id + diffTypesPtrOffset];
    while (true) {
      if (!j && !type) break;
      const prev = j;
      if (type === REMOVED) {
        result.unshift({
          type: swapped ? DiffType.removed : DiffType.added,
          value: B[b],
        });
        b -= 1;
      } else if (type === ADDED) {
        result.unshift({
          type: swapped ? DiffType.added : DiffType.removed,
          value: A[a],
        });
        a -= 1;
      } else {
        result.unshift({ type: DiffType.common, value: A[a] });
        a -= 1;
        b -= 1;
      }
      j = routes[prev];
      type = routes[prev + diffTypesPtrOffset];
    }
    return result;
  }

  function createFP(
    slide: FarthestPoint,
    down: FarthestPoint,
    k: number,
    M: number,
  ): FarthestPoint {
    if (slide && slide.y === -1 && down && down.y === -1) {
      return { y: 0, id: 0 };
    }
    if (
      (down && down.y === -1) ||
      k === M ||
      (slide && slide.y) > (down && down.y) + 1
    ) {
      const prev = slide.id;
      ptr++;
      routes[ptr] = prev;
      routes[ptr + diffTypesPtrOffset] = ADDED;
      return { y: slide.y, id: ptr };
    } else {
      const prev = down.id;
      ptr++;
      routes[ptr] = prev;
      routes[ptr + diffTypesPtrOffset] = REMOVED;
      return { y: down.y + 1, id: ptr };
    }
  }

  function snake<T>(
    k: number,
    slide: FarthestPoint,
    down: FarthestPoint,
    _offset: number,
    A: T[],
    B: T[],
  ): FarthestPoint {
    const M = A.length;
    const N = B.length;
    if (k < -N || M < k) return { y: -1, id: -1 };
    const fp = createFP(slide, down, k, M);
    while (fp.y + k < M && fp.y < N && A[fp.y + k] === B[fp.y]) {
      const prev = fp.id;
      ptr++;
      fp.id = ptr;
      fp.y += 1;
      routes[ptr] = prev;
      routes[ptr + diffTypesPtrOffset] = COMMON;
    }
    return fp;
  }

  while (fp[delta + offset].y < N) {
    p = p + 1;
    for (let k = -p; k < delta; ++k) {
      fp[k + offset] = snake(
        k,
        fp[k - 1 + offset],
        fp[k + 1 + offset],
        offset,
        A,
        B,
      );
    }
    for (let k = delta + p; k > delta; --k) {
      fp[k + offset] = snake(
        k,
        fp[k - 1 + offset],
        fp[k + 1 + offset],
        offset,
        A,
        B,
      );
    }
    fp[delta + offset] = snake(
      delta,
      fp[delta - 1 + offset],
      fp[delta + 1 + offset],
      offset,
      A,
      B,
    );
  }
  return [
    ...prefixCommon.map(
      (c): DiffResult<typeof c> => ({ type: DiffType.common, value: c }),
    ),
    ...backTrace(A, B, fp[delta + offset], swapped),
    ...suffixCommon.map(
      (c): DiffResult<typeof c> => ({ type: DiffType.common, value: c }),
    ),
  ];
}

/**
 * Renders the differences between the actual and expected strings
 * Partially inspired from https://github.com/kpdecker/jsdiff
 * @param A Actual string
 * @param B Expected string
 */
export function diffstr(A: string, B: string) {
  function unescape(string: string): string {
    // unescape invisible characters.
    // ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String#escape_sequences
    return string
      .replaceAll("\b", "\\b")
      .replaceAll("\f", "\\f")
      .replaceAll("\t", "\\t")
      .replaceAll("\v", "\\v")
      .replaceAll( // does not remove line breaks
        /\r\n|\r|\n/g,
        (str) => str === "\r" ? "\\r" : str === "\n" ? "\\n\n" : "\\r\\n\r\n",
      );
  }

  function tokenize(string: string, { wordDiff = false } = {}): string[] {
    if (wordDiff) {
      // Split string on whitespace symbols
      const tokens = string.split(/([^\S\r\n]+|[()[\]{}'"\r\n]|\b)/);
      // Extended Latin character set
      const words =
        /^[a-zA-Z\u{C0}-\u{FF}\u{D8}-\u{F6}\u{F8}-\u{2C6}\u{2C8}-\u{2D7}\u{2DE}-\u{2FF}\u{1E00}-\u{1EFF}]+$/u;

      // Join boundary splits that we do not consider to be boundaries and merge empty strings surrounded by word chars
      for (let i = 0; i < tokens.length - 1; i++) {
        if (
          !tokens[i + 1] && tokens[i + 2] && words.test(tokens[i]) &&
          words.test(tokens[i + 2])
        ) {
          tokens[i] += tokens[i + 2];
          tokens.splice(i + 1, 2);
          i--;
        }
      }
      return tokens.filter((token) => token);
    } else {
      // Split string on new lines symbols
      const tokens = [], lines = string.split(/(\n|\r\n)/);

      // Ignore final empty token when text ends with a newline
      if (!lines[lines.length - 1]) {
        lines.pop();
      }

      // Merge the content and line separators into single tokens
      for (let i = 0; i < lines.length; i++) {
        if (i % 2) {
          tokens[tokens.length - 1] += lines[i];
        } else {
          tokens.push(lines[i]);
        }
      }
      return tokens;
    }
  }

  // Create details by filtering relevant word-diff for current line
  // and merge "space-diff" if surrounded by word-diff for cleaner displays
  function createDetails(
    line: DiffResult<string>,
    tokens: Array<DiffResult<string>>,
  ) {
    return tokens.filter(({ type }) =>
      type === line.type || type === DiffType.common
    ).map((result, i, t) => {
      if (
        (result.type === DiffType.common) && (t[i - 1]) &&
        (t[i - 1]?.type === t[i + 1]?.type) && /\s+/.test(result.value)
      ) {
        return {
          ...result,
          type: t[i - 1].type,
        };
      }
      return result;
    });
  }

  // Compute multi-line diff
  const diffResult = diff(
    tokenize(`${unescape(A)}\n`),
    tokenize(`${unescape(B)}\n`),
  );

  const added = [], removed = [];
  for (const result of diffResult) {
    if (result.type === DiffType.added) {
      added.push(result);
    }
    if (result.type === DiffType.removed) {
      removed.push(result);
    }
  }

  // Compute word-diff
  const aLines = added.length < removed.length ? added : removed;
  const bLines = aLines === removed ? added : removed;
  for (const a of aLines) {
    let tokens = [] as Array<DiffResult<string>>,
      b: undefined | DiffResult<string>;
    // Search another diff line with at least one common token
    while (bLines.length) {
      b = bLines.shift();
      tokens = diff(
        tokenize(a.value, { wordDiff: true }),
        tokenize(b?.value ?? "", { wordDiff: true }),
      );
      if (
        tokens.some(({ type, value }) =>
          type === DiffType.common && value.trim().length
        )
      ) {
        break;
      }
    }
    // Register word-diff details
    a.details = createDetails(a, tokens);
    if (b) {
      b.details = createDetails(b, tokens);
    }
  }

  return diffResult;
}

/**
 * Colors the output of assertion diffs
 * @param diffType Difference type, either added or removed
 */
function createColor(
  diffType: DiffType,
  { background = false } = {},
): (s: string) => string {
  // TODO(@littledivy): Remove this when we can detect
  // true color terminals.
  // https://github.com/denoland/deno_std/issues/2575
  background = false;
  switch (diffType) {
    case DiffType.added:
      return (s: string): string =>
        background ? bgGreen(white(s)) : green(bold(s));
    case DiffType.removed:
      return (s: string): string => background ? bgRed(white(s)) : red(bold(s));
    default:
      return white;
  }
}

/**
 * Prefixes `+` or `-` in diff output
 * @param diffType Difference type, either added or removed
 */
function createSign(diffType: DiffType): string {
  switch (diffType) {
    case DiffType.added:
      return "+   ";
    case DiffType.removed:
      return "-   ";
    default:
      return "    ";
  }
}

export function buildMessage(
  diffResult: ReadonlyArray<DiffResult<string>>,
  { stringDiff = false } = {},
): string[] {
  const messages: string[] = [], diffMessages: string[] = [];
  messages.push("");
  messages.push("");
  messages.push(
    `    ${gray(bold("[Diff]"))} ${red(bold("Actual"))} / ${
      green(bold("Expected"))
    }`,
  );
  messages.push("");
  messages.push("");
  diffResult.forEach((result: DiffResult<string>) => {
    const c = createColor(result.type);
    const line = result.details?.map((detail) =>
      detail.type !== DiffType.common
        ? createColor(detail.type, { background: true })(detail.value)
        : detail.value
    ).join("") ?? result.value;
    diffMessages.push(c(`${createSign(result.type)}${line}`));
  });
  messages.push(...(stringDiff ? [diffMessages.join("")] : diffMessages));
  messages.push("");

  return messages;
}
