import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useCurrentTitle, usePageTitle } from './page-title';

function Heading() {
  return <h1>{useCurrentTitle()}</h1>;
}

function Page({ title }: { title?: string }) {
  usePageTitle(title);
  return null;
}

function Harness() {
  const [title, setTitle] = useState<string | undefined>('Customer feedback');
  const [mounted, setMounted] = useState(true);
  return (
    <>
      <Heading />
      {mounted && <Page title={title} />}
      <button
        type="button"
        onClick={() => {
          setTitle('Renamed');
        }}
      >
        Rename
      </button>
      <button
        type="button"
        onClick={() => {
          setMounted(false);
        }}
      >
        Leave
      </button>
    </>
  );
}

function renderHarness() {
  const router = createMemoryRouter([
    { path: '/', element: <Harness />, handle: { title: 'Form' } },
  ]);
  render(<RouterProvider router={router} />);
}

describe('usePageTitle', () => {
  it("overrides the route's title while the page is mounted and follows changes", async () => {
    const user = userEvent.setup();
    renderHarness();

    expect(screen.getByRole('heading')).toHaveTextContent('Customer feedback');

    await user.click(screen.getByRole('button', { name: 'Rename' }));
    expect(screen.getByRole('heading')).toHaveTextContent('Renamed');

    await user.click(screen.getByRole('button', { name: 'Leave' }));
    expect(screen.getByRole('heading')).toHaveTextContent('Form');
  });
});
