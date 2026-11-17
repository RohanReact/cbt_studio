import { describe, expect, it } from 'vitest';
import { extractKeyEntries, parseKeyValue } from './answerKey';
import { splitOptions } from './parse';

const pairs = (t: string) => extractKeyEntries(t).map((e) => `${e.num}:${e.raw}`);

describe('extractKeyEntries', () => {
  it('reads common inline formats', () => {
    expect(pairs('1. (B)  2. (C)  3-A  4) d  Q5: B')).toEqual(['1:(B)', '2:(C)', '3:A', '4:d', '5:B']);
    expect(pairs('1-2.5 2 - 3 to 3.2 3. A,C')).toEqual(['1:2.5', '2:3 to 3.2', '3:A,C']);
  });
  it('reads a transposed table', () => {
    expect(pairs('Q.No 1 2 3 4\nAns B D A 12')).toEqual(['1:B', '2:D', '3:A', '4:12']);
  });
  it('reads a plain letter string', () => {
    expect(pairs('B C D A')).toEqual(['1:B', '2:C', '3:D', '4:A']);
  });
  it('reads GATE rows with type and marks', () => {
    const e = extractKeyEntries('1 MCQ GA B 1\n2 MSQ CS A;D 2\n3 NAT CS 2.5 to 2.7 2\n4 NAT CS 12');
    expect(e).toEqual([
      { num: 1, type: 'MCQ', raw: 'B', marks: 1 },
      { num: 2, type: 'MSQ', raw: 'A;D', marks: 2 },
      { num: 3, type: 'NAT', raw: '2.5 to 2.7', marks: 2 },
      { num: 4, type: 'NAT', raw: '12', marks: undefined },
    ]);
  });
});

describe('parseKeyValue', () => {
  it('parses letters, ranges and dropped questions', () => {
    expect(parseKeyValue('(B)')).toEqual({ kind: 'letters', values: [1], any: false });
    expect(parseKeyValue('A or C')).toEqual({ kind: 'letters', values: [0, 2], any: true });
    expect(parseKeyValue('2.7 to 2.5')).toEqual({ kind: 'number', min: 2.5, max: 2.7 });
    expect(parseKeyValue('MTA')).toEqual({ kind: 'dropped' });
  });
});

describe('splitOptions', () => {
  it('prefers the last full A-D run over references in the stem', () => {
    const r = splitOptions('Which of (A) and (B) is true?\n(A) only P (B) only Q (C) both (D) neither');
    expect(r.stem).toBe('Which of (A) and (B) is true?');
    expect(r.options).toEqual(['only P', 'only Q', 'both', 'neither']);
  });
  it('handles lowercase and numeric styles', () => {
    expect(splitOptions('Find x. a) 1 b) 2 c) 3 d) 4').options).toEqual(['1', '2', '3', '4']);
    expect(splitOptions('Find x. (1) 10 (2) 20 (3) 30 (4) 40').numeric).toBe(true);
  });
});
