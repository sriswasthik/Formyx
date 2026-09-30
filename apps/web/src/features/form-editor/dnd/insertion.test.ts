import { describe, expect, it } from 'vitest';
import { CANVAS_DROP_ID, getInsertionIndex } from './insertion';

const ids = ['a', 'b', 'c'];
const rect = { top: 100, height: 40 };

describe('getInsertionIndex', () => {
  it('is null when not over the form', () => {
    expect(getInsertionIndex(ids, null, 120)).toBeNull();
    expect(getInsertionIndex(ids, { id: 'unknown', rect }, 120)).toBeNull();
  });

  it('inserts before a question from its top half and after it from its bottom half', () => {
    expect(getInsertionIndex(ids, { id: 'b', rect }, 101)).toBe(1);
    expect(getInsertionIndex(ids, { id: 'b', rect }, 120)).toBe(1);
    expect(getInsertionIndex(ids, { id: 'b', rect }, 121)).toBe(2);
    expect(getInsertionIndex(ids, { id: 'c', rect }, 139)).toBe(3);
    expect(getInsertionIndex(ids, { id: 'a', rect }, 90)).toBe(0);
  });

  it('appends when over the form itself, e.g. while it is empty', () => {
    expect(getInsertionIndex([], { id: CANVAS_DROP_ID, rect }, 50)).toBe(0);
    expect(getInsertionIndex(ids, { id: CANVAS_DROP_ID, rect }, 50)).toBe(3);
  });

  it('falls back to before the question without a pointer position', () => {
    expect(getInsertionIndex(ids, { id: 'c', rect }, null)).toBe(2);
  });
});
