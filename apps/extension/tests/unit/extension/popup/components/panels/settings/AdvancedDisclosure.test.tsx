import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdvancedDisclosure } from '@/extension/popup/components/panels/settings/AdvancedDisclosure';

describe('AdvancedDisclosure', () => {
  it('hides children until expanded and flips aria-expanded', () => {
    render(
      <AdvancedDisclosure id="adv-x">
        <p>secret knob</p>
      </AdvancedDisclosure>,
    );
    const trigger = screen.getByRole('button', { name: /advanced/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('secret knob')).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('secret knob')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Advanced' })).toBeInTheDocument();
  });

  it('starts open when defaultOpen is set', () => {
    render(
      <AdvancedDisclosure id="adv-y" defaultOpen>
        <p>visible knob</p>
      </AdvancedDisclosure>,
    );
    expect(screen.getByRole('button', { name: /advanced/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('visible knob')).toBeInTheDocument();
  });

  it('uses a custom title for the region and trigger', () => {
    render(
      <AdvancedDisclosure id="adv-z" title="More options">
        <p>k</p>
      </AdvancedDisclosure>,
    );
    expect(screen.getByRole('button', { name: /more options/i })).toBeInTheDocument();
  });
});
