import { createField, createOption, type Field, type FileAnswer } from '@formyx/shared';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnswerCell, AnswerDetail } from './answer-value';
import { answerText } from './answer-text';

function file(name: string, type: string): FileAnswer {
  return {
    url: `https://res.cloudinary.com/formyx-test/raw/upload/v1/formyx/x/${name}`,
    publicId: `formyx/x/${name}`,
    name,
    size: 2048,
    type,
  };
}

const ranking = {
  ...createField('ranking'),
  options: [createOption('Price'), createOption('Speed'), createOption('Support')],
};
const [price, speed, support] = ranking.options;

const matrix = {
  ...createField('matrix'),
  rows: [createOption('Food'), createOption('Service')],
  columns: [createOption('Poor'), createOption('Good')],
};
const [food, service] = matrix.rows;
const [poor, good] = matrix.columns;

const pictures = {
  ...createField('picture_choice'),
  options: [
    { ...createOption('Red'), imageUrl: 'https://res.cloudinary.com/x/red.png' },
    { ...createOption('Blue'), imageUrl: 'https://res.cloudinary.com/x/blue.png' },
  ],
};

describe('answerText for newer question types', () => {
  it.each<[Field, unknown, string]>([
    [createField('nps'), 9, '9 / 10'],
    [{ ...createField('opinion_scale'), start: 1, end: 5 }, 4, '4 / 5'],
    [createField('yes_no'), 'yes', 'Yes'],
    [createField('consent'), true, 'Agreed'],
    [{ ...createField('slider'), unit: 'kg' }, 72, '72 kg'],
    [ranking, [speed?.id, price?.id, support?.id], '1. Speed; 2. Price; 3. Support'],
    [
      matrix,
      { [food?.id ?? '']: good?.id, [service?.id ?? '']: poor?.id },
      'Food: Good; Service: Poor',
    ],
    [createField('phone'), '+919876543210', '+91 98765 43210'],
    [
      createField('address'),
      { line1: '12 MG Road', line2: '', pin: '560001', city: 'Bengaluru', state: 'Karnataka' },
      '12 MG Road, Bengaluru, Karnataka 560001',
    ],
  ])('writes out a %s answer', (field, value, text) => {
    expect(answerText(field, value)).toBe(text);
  });

  it('writes amounts in their currency', () => {
    expect(answerText(createField('currency'), 1500)).toMatch(/₹\s?1,500/);
  });
});

describe('AnswerDetail for newer question types', () => {
  it('lists a ranking in order', () => {
    render(<AnswerDetail field={ranking} value={[support?.id, price?.id, speed?.id]} />);
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['1.Support', '2.Price', '3.Speed']);
  });

  it('shows each matrix row with its answer', () => {
    render(<AnswerDetail field={matrix} value={{ [service?.id ?? '']: good?.id ?? '' }} />);
    expect(screen.getByText('Service')).toBeInTheDocument();
    expect(screen.getByText('Good')).toBeInTheDocument();
    expect(screen.queryByText('Food')).not.toBeInTheDocument();
  });

  it('shows picked pictures with their labels', () => {
    const { container } = render(
      <AnswerDetail
        field={{ ...pictures, multiple: true }}
        value={pictures.options.map((o) => o.id)}
      />,
    );
    expect(screen.getByText('Red')).toBeInTheDocument();
    expect(screen.getByText('Blue')).toBeInTheDocument();
    expect(container.querySelectorAll('img')).toHaveLength(2);
  });

  it('plays voice notes and offers them to download', () => {
    const note = file('note.webm', 'audio/webm');
    const { container } = render(<AnswerDetail field={createField('voice_note')} value={note} />);
    expect(container.querySelector('audio')).toHaveAttribute('src', note.url);
    expect(screen.getByRole('link', { name: 'Download note.webm, 2 KB' })).toHaveAttribute(
      'href',
      note.url,
    );
  });

  it('shows signatures as an image', () => {
    const signature = file('signature.png', 'image/png');
    render(<AnswerDetail field={createField('signature')} value={signature} />);
    expect(screen.getByRole('img', { name: 'Signature' })).toHaveAttribute('src', signature.url);
  });

  it('links web addresses, but only http and https ones', () => {
    const { unmount } = render(
      <AnswerDetail field={createField('url')} value="https://formyx.app/pricing" />,
    );
    expect(screen.getByRole('link', { name: 'https://formyx.app/pricing' })).toHaveAttribute(
      'rel',
      'noopener noreferrer nofollow',
    );
    unmount();
    render(<AnswerDetail field={createField('url')} value="javascript:alert(1)" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows NPS scores with their group, and colours as a swatch', () => {
    const { unmount } = render(<AnswerDetail field={createField('nps')} value={6} />);
    expect(screen.getByText(/Detractor/)).toBeInTheDocument();
    unmount();
    render(<AnswerCell field={createField('color')} value="#2E5AAC" />);
    expect(screen.getByText('#2E5AAC')).toBeInTheDocument();
  });

  it('shows an address on lines', () => {
    render(
      <AnswerDetail
        field={createField('address')}
        value={{
          line1: '12 MG Road',
          line2: 'Flat 4',
          pin: '560001',
          city: 'Bengaluru',
          state: 'Karnataka',
        }}
      />,
    );
    const address = screen.getByRole('group');
    expect(address).toHaveTextContent('12 MG Road');
    expect(address).toHaveTextContent('Flat 4');
    expect(address).toHaveTextContent('Bengaluru, Karnataka');
  });
});
