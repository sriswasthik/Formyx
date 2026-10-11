import { describe, expect, it } from 'vitest';
import { applyFormat, toggleList, wrapSelection } from './rich-text-edits';

describe('wrapSelection', () => {
  it('wraps the selected text and keeps it selected', () => {
    const edit = wrapSelection('Read the terms', 9, 14, '**', '**', 'bold text');
    expect(edit.text).toBe('Read the **terms**');
    expect(edit.text.slice(edit.selectionStart, edit.selectionEnd)).toBe('terms');
  });

  it('inserts placeholder text, selected, when nothing is selected', () => {
    const edit = wrapSelection('See ', 4, 4, '[', '](https://)', 'link text');
    expect(edit.text).toBe('See [link text](https://)');
    expect(edit.text.slice(edit.selectionStart, edit.selectionEnd)).toBe('link text');
  });
});

describe('toggleList', () => {
  it('starts every selected line with "- "', () => {
    const text = 'Intro\nFirst\nSecond';
    const edit = toggleList(text, 7, text.length);
    expect(edit.text).toBe('Intro\n- First\n- Second');
  });

  it('takes the marks off when every selected line has one', () => {
    const text = '- First\n- Second';
    expect(toggleList(text, 0, text.length).text).toBe('First\nSecond');
  });

  it('lists the line the caret is on', () => {
    expect(toggleList('One\nTwo', 5, 5).text).toBe('One\n- Two');
  });
});

describe('applyFormat', () => {
  it('uses the rich-text marks respondents see formatted', () => {
    expect(applyFormat('bold', 'a', 0, 1).text).toBe('**a**');
    expect(applyFormat('italic', 'a', 0, 1).text).toBe('*a*');
    expect(applyFormat('link', 'a', 0, 1).text).toBe('[a](https://)');
    expect(applyFormat('list', 'a', 0, 1).text).toBe('- a');
  });
});
