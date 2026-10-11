import { createField, type Field } from '@formyx/shared';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeFormDetail, renderWithEditor } from '../test-utils';
import { LogicPanel } from './logic-panel';

const name = { ...createField('short_text'), id: 'name', label: 'Your name' };
const pet = { ...createField('yes_no'), id: 'pet', label: 'Do you have a pet?' };
const petPage = { ...createField('page_break'), id: 'pets', label: 'About your pet' };
const petName = { ...createField('short_text'), id: 'pet_name', label: 'Pet name' };
const age = { ...createField('number'), id: 'age', label: 'Age' };

function renderPanel(fields: Field[] = [name, pet, petPage, petName, age]) {
  const result = renderWithEditor(<LogicPanel />, makeFormDetail(fields));
  return { ...result, logic: () => result.store.getState().schema.logic };
}

describe('LogicPanel', () => {
  it('lists the pages, and titles them', async () => {
    const { user, store, logic } = renderPanel();
    const pages = screen.getByRole('list', { name: 'Pages' });
    expect(within(pages).getAllByRole('listitem', { name: /^Page \d$/ })).toHaveLength(2);

    const [first, second] = within(pages).getAllByRole('textbox', { name: 'Title' });
    if (!first || !second) throw new Error('Expected two titles');
    await user.type(first, 'About you');
    expect(logic().pages.start?.title).toBe('About you');
    // Later pages take their title from their page break.
    await user.clear(second);
    await user.type(second, 'Your pet');
    expect(store.getState().schema.fields[2]?.label).toBe('Your pet');
  });

  it('adds a jump that waits for its condition, then sends respondents on', async () => {
    const { user, logic } = renderPanel();
    const firstPage = screen.getByRole('listitem', { name: 'Page 1' });
    await user.click(within(firstPage).getByRole('button', { name: 'Add jump' }));

    const [jump] = logic().pages.start?.jumps ?? [];
    // Starts on the last question so far, with its first answer.
    expect(jump).toMatchObject({
      when: [{ kind: 'answer', sourceFieldId: 'pet', operator: 'equals', value: 'yes' }],
      to: { kind: 'page', pageKey: 'pets' },
    });

    await user.click(within(firstPage).getByRole('combobox', { name: 'Go to' }));
    await user.click(screen.getByRole('option', { name: 'Default' }));
    expect(logic().pages.start?.jumps?.[0]?.to).toEqual({
      kind: 'end',
      endScreenId: 'end_default',
    });

    await user.click(within(firstPage).getByRole('button', { name: 'Remove page 1, jump 1' }));
    expect(logic().pages).toEqual({});
  });

  it('adds values and the rules that work them out', async () => {
    const { user, logic } = renderPanel();
    await user.click(screen.getByRole('button', { name: 'Add value' }));
    expect(logic().variables).toEqual([expect.objectContaining({ name: 'Score', kind: 'score' })]);

    await user.click(screen.getByRole('button', { name: 'Add rule' }));
    const [rule] = logic().rules;
    expect(rule).toMatchObject({ variableId: logic().variables[0]?.id, operation: 'add' });

    // Removing the value takes its rules with it.
    await user.click(screen.getByRole('button', { name: 'Remove Score' }));
    expect(logic()).toMatchObject({ variables: [], rules: [] });
  });

  it('marks quiz answers', async () => {
    const { user, logic } = renderPanel();
    await user.click(screen.getByRole('switch', { name: 'Quiz mode' }));
    expect(logic().quiz).toMatchObject({ enabled: true, answers: {} });
    // A new quiz shows its score on the end screens.
    expect(logic().endScreens[0]?.showScore).toBe(true);

    await user.click(screen.getByRole('switch', { name: '2. Do you have a pet?' }));
    await user.click(screen.getByRole('checkbox', { name: 'Yes' }));
    expect(logic().quiz?.answers).toEqual({ pet: { correct: ['yes'], points: 1 } });
    expect(
      screen.queryByText('Mark the right answer to at least one question'),
    ).not.toBeInTheDocument();
  });

  it('adds end screens with conditions and a redirect', async () => {
    const { user, logic } = renderPanel();
    await user.click(screen.getByRole('button', { name: 'Add end screen' }));
    const card = screen.getByRole('listitem', { name: 'End screen 2' });

    await user.click(within(card).getByRole('switch', { name: 'Redirect' }));
    await user.click(within(card).getByRole('button', { name: 'Add parameter' }));
    const screen2 = logic().endScreens[1];
    expect(screen2?.redirect).toEqual({
      url: 'https://',
      delaySeconds: 3,
      params: [{ name: '', source: { kind: 'answer', fieldId: 'name' } }],
    });
    // A screen without conditions is reached only by jumps, which the panel points out.
    expect(
      screen.getAllByText('Nothing leads here: add conditions, or a jump to it').length,
    ).toBeGreaterThan(0);
  });

  it('warns about pages nobody can reach', async () => {
    const { user } = renderPanel();
    const firstPage = screen.getByRole('listitem', { name: 'Page 1' });
    await user.click(within(firstPage).getByRole('button', { name: 'Add jump' }));
    await user.click(
      within(firstPage).getByRole('button', { name: /Remove page 1, jump 1, condition 1/ }),
    );
    // Without conditions the jump always applies, and goes past nothing here; to an end screen
    // it leaves page 2 out.
    await user.click(within(firstPage).getByRole('combobox', { name: 'Go to' }));
    await user.click(screen.getByRole('option', { name: 'Default' }));
    expect(screen.getAllByText('No route leads to this page').length).toBeGreaterThan(0);
  });
});
