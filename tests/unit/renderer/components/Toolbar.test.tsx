import { render, screen } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Toolbar } from '../../../../src/renderer/components/Toolbar';

describe('Toolbar', () => {
  it('shows save and copy only in output mode', () => {
    const noop = vi.fn();

    const { rerender } = render(
      <Toolbar
        paneMode="input"
        themeMode="light"
        hasContent
        searchQuery=""
        onNew={noop}
        onTogglePane={noop}
        onCollapseAll={noop}
        onExpandAll={noop}
        onSave={noop}
        onCopy={noop}
        onSearchChange={noop}
        onToggleTheme={noop}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument();

    rerender(
      <Toolbar
        paneMode="output"
        themeMode="light"
        hasContent
        searchQuery=""
        onNew={noop}
        onTogglePane={noop}
        onCollapseAll={noop}
        onExpandAll={noop}
        onSave={noop}
        onCopy={noop}
        onSearchChange={noop}
        onToggleTheme={noop}
      />,
    );

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('emits search value changes', async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();

    const Harness = () => {
      const [searchQuery, setSearchQuery] = useState('');
      return (
        <Toolbar
          paneMode="input"
          themeMode="light"
          hasContent
          searchQuery={searchQuery}
          onNew={vi.fn()}
          onTogglePane={vi.fn()}
          onCollapseAll={vi.fn()}
          onExpandAll={vi.fn()}
          onSave={vi.fn()}
          onCopy={vi.fn()}
          onSearchChange={(next) => {
            setSearchQuery(next);
            onSearchChange(next);
          }}
          onToggleTheme={vi.fn()}
        />
      );
    };

    render(<Harness />);

    await user.type(screen.getByTestId('search-input'), 'abc');

    expect(onSearchChange).toHaveBeenLastCalledWith('abc');
  });
});
