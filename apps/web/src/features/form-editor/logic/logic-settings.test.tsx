import { createField, createOption, type Field } from '@formyx/shared';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EditorLayout } from '../editor-layout';
import { makeFormDetail, renderWithEditor } from '../test-utils';

const student = createOption('Student');
const employed = createOption('Employed');
const role = { ...createField('single_choice'), label: 'Role', options: [student, employed] };
const satisfaction = { ...createField('rating'), label: 'Satisfaction' };
const intro = { ...createField('statement'), label: 'A few more questions' };
const details = { ...createField('long_text'), label: 'Details' };
const FIELDS: Field[] = [role, satisfaction, intro, details];

function renderEditor(fields: Field[] = FIELDS) {
  const form = makeFormDetail(fields);
  return renderWithEditor(<EditorLayout form={form} status={null} />, form);
}

const canvas = () => screen.getByRole('list', { name: 'Questions' });

async function selectQuestion(user: ReturnType<typeof renderEditor>['user'], position: number) {
  await user.click(
    within(canvas()).getByRole('button', { name: new RegExp(`^Question ${position}:`) }),
  );
}

const optionNames = () => screen.getAllByRole('option').map((option) => option.textContent);

describe('LogicSettings', () => {
  it('explains that the first question is always shown', async () => {
    const { user } = renderEditor();
    await selectQuestion(user, 1);

    expect(screen.getByText(/The first question is always shown/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add condition' })).not.toBeInTheDocument();
  });

  it('offers only earlier questions that take answers, starting with the closest', async () => {
    const { user } = renderEditor();
    await selectQuestion(user, 4);
    expect(screen.getByText(/Always shown/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add condition' }));
    const source = screen.getByRole('combobox', { name: 'Condition 1: question' });
    expect(source).toHaveTextContent('2. Satisfaction');

    await user.click(source);
    expect(optionNames()).toEqual(['1. Role', '2. Satisfaction']);
  });

  it('fits the comparisons and the value to the question checked', async () => {
    const { user, store } = renderEditor();
    await selectQuestion(user, 4);
    await user.click(screen.getByRole('button', { name: 'Add condition' }));

    // A rating compares in order, against a rating from its scale.
    await user.click(screen.getByRole('combobox', { name: 'Condition 1: comparison' }));
    expect(optionNames()).toEqual([
      'is',
      'is not',
      'is greater than',
      'is less than',
      'is answered',
      'is not answered',
    ]);
    await user.click(screen.getByRole('option', { name: 'is less than' }));
    await user.click(screen.getByRole('combobox', { name: 'Condition 1: value' }));
    expect(optionNames()).toEqual(['1', '2', '3', '4', '5']);
    await user.click(screen.getByRole('option', { name: '3' }));

    expect(store.getState().schema.fields[3]?.conditions).toEqual([
      { sourceFieldId: satisfaction.id, operator: 'less_than', value: 3 },
    ]);

    // A choice is compared with one of its options, by id.
    await user.click(screen.getByRole('combobox', { name: 'Condition 1: question' }));
    await user.click(screen.getByRole('option', { name: '1. Role' }));
    await user.click(screen.getByRole('combobox', { name: 'Condition 1: comparison' }));
    expect(optionNames()).toEqual(['is', 'is not', 'is answered', 'is not answered']);
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('combobox', { name: 'Condition 1: value' }));
    expect(optionNames()).toEqual(['Student', 'Employed']);
    await user.click(screen.getByRole('option', { name: 'Employed' }));

    expect(store.getState().schema.fields[3]?.conditions).toEqual([
      { sourceFieldId: role.id, operator: 'equals', value: employed.id },
    ]);
  });

  it('needs no value to check whether a question was answered', async () => {
    const { user, store } = renderEditor();
    await selectQuestion(user, 4);
    await user.click(screen.getByRole('button', { name: 'Add condition' }));

    await user.click(screen.getByRole('combobox', { name: 'Condition 1: comparison' }));
    await user.click(screen.getByRole('option', { name: 'is answered' }));

    expect(screen.queryByRole('combobox', { name: 'Condition 1: value' })).not.toBeInTheDocument();
    expect(store.getState().schema.fields[3]?.conditions).toEqual([
      { sourceFieldId: satisfaction.id, operator: 'is_answered' },
    ]);
  });

  it('types text values in one undo step', async () => {
    const name = { ...createField('short_text'), label: 'Name' };
    const { user, store } = renderEditor([name, details]);
    await selectQuestion(user, 2);
    await user.click(screen.getByRole('button', { name: 'Add condition' }));

    await user.type(screen.getByRole('textbox', { name: 'Condition 1: value' }), 'Ada');

    expect(store.getState().schema.fields[1]?.conditions?.[0]?.value).toBe('Ada');
    store.getState().undo();
    expect(store.getState().schema.fields[1]?.conditions?.[0]?.value).toBeUndefined();
  });

  it('combines several conditions with all or any, and drops the choice with one left', async () => {
    const { user, store } = renderEditor();
    const conditionsOf = () => store.getState().schema.fields[3];
    await selectQuestion(user, 4);
    await user.click(screen.getByRole('button', { name: 'Add condition' }));
    expect(screen.queryByRole('group', { name: 'Conditions to meet' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add condition' }));
    const list = screen.getByRole('list', { name: 'Conditions' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('And when')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Any is true' }));
    expect(conditionsOf()?.conditionMatch).toBe('any');
    expect(within(list).getByText('Or when')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove condition 2' }));
    expect(conditionsOf()?.conditions).toHaveLength(1);
    expect(conditionsOf()).not.toHaveProperty('conditionMatch');

    await user.click(screen.getByRole('button', { name: 'Remove condition 1' }));
    expect(conditionsOf()).not.toHaveProperty('conditions');
    expect(screen.getByText(/Always shown/)).toBeInTheDocument();
  });

  it('marks questions with logic on the canvas, saying when they are shown', async () => {
    const { user } = renderEditor();
    await selectQuestion(user, 4);
    await user.click(screen.getByRole('button', { name: 'Add condition' }));

    const question = within(canvas()).getByRole('button', { name: /^Question 4:/ });
    expect(question).toHaveAccessibleDescription('Logic: Its condition is not finished yet');

    await user.click(screen.getByRole('combobox', { name: 'Condition 1: value' }));
    await user.click(screen.getByRole('option', { name: '2' }));

    expect(question).toHaveAccessibleDescription('Logic: Shown when "Satisfaction" is 2');
    expect(within(canvas()).getByText('Shown when "Satisfaction" is 2')).toBeInTheDocument();
  });
});
