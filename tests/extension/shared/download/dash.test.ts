import { parseIso8601Duration, substituteTemplate } from '@/extension/shared/download/dash';

describe('parseIso8601Duration', () => {
  it('parses hours/minutes/seconds and fractions', () => {
    expect(parseIso8601Duration('PT10M34S')).toBe(634);
    expect(parseIso8601Duration('PT1H')).toBe(3600);
    expect(parseIso8601Duration('PT1H2M3.5S')).toBeCloseTo(3723.5, 3);
  });
  it('returns 0 for junk / empty', () => {
    expect(parseIso8601Duration('')).toBe(0);
    expect(parseIso8601Duration('nonsense')).toBe(0);
  });
});

describe('substituteTemplate', () => {
  it('substitutes each variable', () => {
    expect(substituteTemplate('init-$RepresentationID$.m4s', { RepresentationID: 'v0' })).toBe('init-v0.m4s');
    expect(substituteTemplate('seg-$Number$.m4s', { Number: 7 })).toBe('seg-7.m4s');
    expect(substituteTemplate('seg-$Time$.m4s', { Time: 12000 })).toBe('seg-12000.m4s');
    expect(substituteTemplate('b$Bandwidth$/x', { Bandwidth: 800000 })).toBe('b800000/x');
  });
  it('zero-pads $Number%0Nd$', () => {
    expect(substituteTemplate('seg-$Number%05d$.m4s', { Number: 7 })).toBe('seg-00007.m4s');
  });
  it('treats $$ as a literal $', () => {
    expect(substituteTemplate('a$$b', {})).toBe('a$b');
  });
});
