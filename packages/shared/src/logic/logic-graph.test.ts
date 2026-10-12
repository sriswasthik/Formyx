import { describe, expect, it } from 'vitest';
import { createEmptyForm, createField } from '../forms/factories.js';
import type { FormSchema } from '../forms/form-schema.js';
import { createEndScreen, createJump } from '../forms/logic-factories.js';
import type { FormLogic } from '../forms/logic-schema.js';
import { analyzeLogic, pageTitle } from './logic-graph.js';
import { toPublicSchema } from './public-schema.js';

const q1 = { ...createField('short_text'), id: 'q1' };
const p2 = { ...createField('page_break'), id: 'p2', label: 'Details' };
const q2 = { ...createField('short_text'), id: 'q2' };
const p3 = { ...createField('page_break'), id: 'p3', label: '' };
const q3 = { ...createField('short_text'), id: 'q3' };

function form(logic: Partial<FormLogic> = {}): FormSchema {
  const base = createEmptyForm();
  return { ...base, fields: [q1, p2, q2, p3, q3], logic: { ...base.logic, ...logic } };
}

const kinds = (schema: FormSchema) => analyzeLogic(schema).warnings.map((warning) => warning.kind);

describe('analyzeLogic', () => {
  it('links each page to the next, and the last to the end screens', () => {
    const graph = analyzeLogic(form());
    expect(graph.nodes.map((node) => (node.kind === 'page' ? node.title : node.name))).toEqual([
      'Page 1',
      'Details',
      'Page 3',
      'Default',
    ]);
    expect(graph.edges.map((edge) => `${edge.kind}:${edge.from}->${edge.to}`)).toEqual([
      'next:start->p2',
      'next:p2->p3',
      'finish:p3->end_default',
    ]);
    expect(graph.warnings).toEqual([]);
  });

  it('warns about pages an always-jump makes unreachable, and jumps after it', () => {
    const schema = form({
      pages: {
        start: {
          jumps: [
            createJump({ kind: 'page', pageKey: 'p3' }),
            createJump({ kind: 'page', pageKey: 'p2' }),
          ],
        },
      },
    });
    const graph = analyzeLogic(schema);
    expect(
      graph.edges.find((edge) => edge.from === 'start' && edge.kind === 'next'),
    ).toBeUndefined();
    expect(kinds(schema)).toEqual(['unused_jump', 'unreachable_page']);
    expect(graph.warnings[1]).toMatchObject({ pageKey: 'p2' });
  });

  it('marks conditional jumps, and keeps the way on to the next page', () => {
    const jump = {
      ...createJump({ kind: 'end', endScreenId: 'end_default' }),
      when: [{ kind: 'answer' as const, sourceFieldId: 'q1', operator: 'is_answered' as const }],
    };
    const graph = analyzeLogic(form({ pages: { start: { jumps: [jump] } } }));
    expect(graph.edges.filter((edge) => edge.from === 'start')).toEqual([
      expect.objectContaining({ kind: 'jump', toEnd: true, conditional: true, jumpId: jump.id }),
      expect.objectContaining({ kind: 'next', to: 'p2' }),
    ]);
  });

  it('warns about end screens nothing leads to, and quiz checks without a quiz', () => {
    const orphan = createEndScreen({ id: 'orphan' });
    const quizScreen = createEndScreen({
      id: 'quizzed',
      when: [{ kind: 'quiz', result: 'passed' }],
    });
    const schema = form({
      endScreens: [...createEmptyForm().logic.endScreens, orphan, quizScreen],
    });
    expect(analyzeLogic(schema).warnings).toEqual([
      expect.objectContaining({ kind: 'unreachable_end_screen', endScreenId: 'orphan' }),
      expect.objectContaining({ kind: 'quiz_without_quiz', endScreenId: 'quizzed' }),
    ]);
  });

  it('warns about empty pages and loops', () => {
    const empty: FormSchema = { ...form(), fields: [q1, p2, p3, q3] };
    expect(kinds(empty)).toEqual(['empty_page']);
    // Jumps only go forward in a valid form; a hand-edited one could loop.
    const looping = form({
      pages: { p3: { jumps: [createJump({ kind: 'page', pageKey: 'p2' })] } },
    });
    expect(kinds(looping)).toContain('loop');
  });

  it('titles the first page from the logic and others from their page break', () => {
    const schema = form({ pages: { start: { title: 'Welcome' } } });
    expect(pageTitle(schema, 'start')).toBe('Welcome');
    expect(pageTitle(schema, 'p2')).toBe('Details');
    expect(pageTitle(schema, 'p3')).toBe('Page 3');
  });
});

describe('toPublicSchema', () => {
  it('leaves out the right answers and nothing else', () => {
    const schema = form({
      quiz: {
        enabled: true,
        answers: { q1: { correct: ['Paris'], points: 1 } },
        passPercent: 50,
        showScore: true,
        revealAnswers: false,
      },
    });
    const published = toPublicSchema(schema);
    expect(published.logic.quiz).toEqual({ ...schema.logic.quiz, answers: {} });
    expect(published.fields).toBe(schema.fields);
    expect(JSON.stringify(published)).not.toContain('Paris');
  });

  it('returns forms without a quiz as they are', () => {
    const schema = form();
    expect(toPublicSchema(schema)).toBe(schema);
  });
});
