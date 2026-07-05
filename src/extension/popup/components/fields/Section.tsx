import React from 'react';
import { SectionProps } from '@/types';

export const Section: React.FC<SectionProps> = ({ title, children }) => (
  <section className="space-y-3">
    <span className="eyebrow block border-b hairline pb-2">{title}</span>
    {children}
  </section>
);
