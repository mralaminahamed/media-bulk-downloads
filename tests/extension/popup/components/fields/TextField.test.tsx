import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TextField } from '@/extension/popup/components/fields/TextField';

describe('TextField', () => {
  it('renders a labelled input described by its hint', () => {
    render(
      <TextField id="name" name="name" label="Your name" value="Ada" onChange={vi.fn()} hint="As it appears" />,
    );
    const input = screen.getByLabelText('Your name');
    expect(input).toHaveValue('Ada');
    expect(input).toHaveAttribute('aria-describedby', 'name-hint');
    const hint = screen.getByText('As it appears');
    expect(hint).toHaveAttribute('id', 'name-hint');
  });

  it('omits aria-describedby when there is no hint', () => {
    render(<TextField id="q" name="q" label="Query" value="" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Query')).not.toHaveAttribute('aria-describedby');
  });

  it('forwards changes to onChange', () => {
    const onChange = vi.fn();
    render(<TextField id="q" name="q" label="Query" value="" onChange={onChange} placeholder="Search" />);
    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'x' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
