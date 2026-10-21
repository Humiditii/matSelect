import { checkGrounding, extractNumbers } from './grounding.util';

const payload = {
  ranked: [
    {
      name: 'Aluminium alloy',
      grade: '6061-T6',
      objectiveValue: 3.14,
      likelyRangeP10P90: [2.81, 3.02],
      chanceBestPercent: 62,
      size: {
        description: 'Ø 38.2 mm round tube, 2.55 mm wall',
        massKg: 3.14,
        materialCostUsd: [7.85, 12.6],
      },
      reasons: ['About 1.6× the mass of the top pick (4.97 kg)'],
      properties: { density_kg_m3: [2690, 2720] },
    },
  ],
  safetyFactor: 2.5,
  pBest: 0.418,
};

describe('grounding check', () => {
  it('accepts payload numbers, including rounding, percentages and unit changes', () => {
    const text =
      'Use aluminium 6061-T6: the part weighs about 3.1 kg (likely 2.8–3.0 kg), a Ø 38 mm tube with a 2.6 mm wall. ' +
      'It is best in 62% of simulations (42% for the runner-up), costs $7.85–$12.60, and 1.6× lighter than steel at 4.97 kg. ' +
      'Density about 2,700 kg/m³ is within 2690–2720. Safety factor 2.5. A 38.2mm tube is 0.0382 m.';
    const check = checkGrounding(text, payload);
    expect(check.unverifiedNumbers).toEqual([]);
    expect(check.grounded).toBe(true);
  });

  it('flags invented numbers', () => {
    const check = checkGrounding(
      'Aluminium has a density of 2700 kg/m³ and a yield strength of 276 MPa.',
      {
        ranked: [{ massKg: 3.1 }],
      },
    );
    expect(check.grounded).toBe(false);
    expect(check.unverifiedNumbers).toEqual(['2700', '276']);
  });

  it('ignores grades and material names, and small integers', () => {
    expect(
      extractNumbers(
        'Grade 6061-T6, S355, PA66, Ti-6Al-4V and 316L stainless; p10–p90; σ^(2/3)/ρ',
      ).map((n) => n.value),
    ).toEqual([]);
    const check = checkGrounding(
      'Pick 7075-T6 or AISI 304 over 3 alternatives, with 2 options.',
      { x: 1 },
      ['AISI 304'],
    );
    expect(check.grounded).toBe(true);
  });

  it('separates units glued to numbers', () => {
    expect(
      extractNumbers('a 25mm tube weighing 3.1kg at 50°C').map((n) => n.value),
    ).toEqual([25, 3.1, 50]);
  });
});
