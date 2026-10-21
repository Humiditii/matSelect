import {
  DesignSpec,
  DesignSpecInput,
  Material,
} from 'src/common/domain/domain.types';
import { SizingCase, sizePart } from './sizing';
import { deriveIndices, formatIndex } from './indices';
import { sectionGeometry } from './section';
import { runSelection } from './pipeline';
import { UnitError, toMetres, toNewtons, toNewtonMetres } from './units';
import { validateMaterials } from './validate';

const spec = (input: DesignSpecInput) => DesignSpec.parse(input);

const baseCase = (o: Partial<SizingCase>): SizingCase => ({
  component: 'beam',
  load: 1000,
  lengthM: 1,
  safetyFactor: 1,
  maxDeflectionM: null,
  maxTwistRad: null,
  support: 'simply_supported_center',
  endCondition: 'pinned_pinned',
  checkStiffness: false,
  checkStrength: false,
  ...o,
});

function testMaterial(
  o: Partial<Material> & { id: string; name: string },
): Material {
  return {
    family: 'metal',
    grade: null,
    density: [7800, 7900],
    E: [200, 210],
    G: [78, 82],
    strength: [250, 350],
    Kic: [50, 100],
    tMax: [350, 400],
    tMin: [-60, -40],
    lambda: [45, 55],
    alpha: [11, 13],
    price: [0.8, 1.2],
    brittle: false,
    transparent: false,
    electricalInsulator: false,
    ratings: { fresh_water: 'B', salt_water: 'C', uv: 'A', chemicals: 'B' },
    customRatings: {},
    extra: {},
    sources: [],
    co2: null,
    embodiedEnergy: null,
    recyclability: null,
    renewable: null,
    biodegradable: null,
    criticalElements: [],
    hazards: [],
    processingTips: [],
    processes: { drill: 'good', hand_cut: 'possible', weld: 'good' },
    forms: ['bar'],
    confidence: 'high',
    notes: '',
    ...o,
  };
}

describe('sizing', () => {
  it('steel cantilever, 1 kN, 1 m, 5 mm deflection, solid square, E = 200 GPa gives a 44.7 mm side', () => {
    const r = sizePart(
      baseCase({
        support: 'cantilever_end',
        maxDeflectionM: 0.005,
        checkStiffness: true,
      }),
      sectionGeometry('solid_square'),
      { E: 200e9, G: null, strength: null },
    )!;
    expect(r.size * 1000).toBeCloseTo(44.7, 1);
    expect(r.governing).toBe('deflection');
  });

  it('steel tie, 10 kN, SF 2, σ = 250 MPa gives A = 80 mm² and d = 10.1 mm', () => {
    const g = sectionGeometry('solid_round');
    const r = sizePart(
      baseCase({
        component: 'tie',
        load: 10_000,
        safetyFactor: 2,
        checkStrength: true,
      }),
      g,
      { E: 200e9, G: null, strength: 250e6 },
    )!;
    const A = g.cA * r.size ** g.pA;
    expect(A * 1e6).toBeCloseTo(80, 6);
    expect(r.size * 1000).toBeCloseTo(10.1, 1);
  });

  it('pinned steel column, 2 m, 10 kN, solid round gives d = 25.3 mm', () => {
    const r = sizePart(
      baseCase({
        component: 'column',
        load: 10_000,
        lengthM: 2,
        endCondition: 'pinned_pinned',
      }),
      sectionGeometry('solid_round'),
      { E: 200e9, G: null, strength: null },
    )!;
    expect(r.size * 1000).toBeCloseTo(25.3, 1);
    expect(r.governing).toBe('buckling');
  });

  it('simply supported beam strength, 1 kN, 1 m, solid square, σ = 250 MPa gives an 18.2 mm side', () => {
    const r = sizePart(
      baseCase({ checkStrength: true }),
      sectionGeometry('solid_square'),
      { E: 200e9, G: null, strength: 250e6 },
    )!;
    expect(r.size * 1000).toBeCloseTo(18.2, 1);
    expect(r.governing).toBe('bending');
  });

  it('takes the larger size when both constraints are active and records the governing one', () => {
    const r = sizePart(
      baseCase({
        support: 'cantilever_end',
        maxDeflectionM: 0.005,
        checkStiffness: true,
        checkStrength: true,
      }),
      sectionGeometry('solid_square'),
      { E: 200e9, G: null, strength: 250e6 },
    )!;
    expect(r.governing).toBe('deflection');
    expect(Object.keys(r.bySize).sort()).toEqual(['bending', 'deflection']);
  });

  it('solid shaft shear: d = (16·T·√3·SF/(π·σ))^(1/3)', () => {
    const T = 100;
    const r = sizePart(
      baseCase({
        component: 'shaft',
        load: T,
        safetyFactor: 1.5,
        checkStrength: true,
      }),
      sectionGeometry('solid_round'),
      { E: null, G: 80e9, strength: 300e6 },
    )!;
    expect(r.size).toBeCloseTo(
      ((16 * T * Math.sqrt(3) * 1.5) / (Math.PI * 300e6)) ** (1 / 3),
      9,
    );
  });

  it('the pipeline sizes with the low end of E (conservative) for a cantilever, end to end', () => {
    const result = runSelection(
      spec({
        title: 'Cantilever',
        component: 'beam',
        criteria: ['stiffness'],
        load: { value: 1, unit: 'kN' },
        length: { value: 1, unit: 'm' },
        maxDeflection: { value: 5, unit: 'mm' },
        support: 'cantilever_end',
        section: 'solid_square',
      }),
      [testMaterial({ id: 'steel', name: 'Steel', E: [200, 215] })],
      { mcSamples: 200 },
    );
    expect(result.mode).toBe('sizing');
    expect(result.ranking[0].sizing!.sizeMm).toBeCloseTo(44.7, 1);
    // MC samples E across the whole range, so the likely mass is at or below the conservative nominal.
    expect(result.ranking[0].objectiveInterval[1]).toBeLessThanOrEqual(
      result.ranking[0].objectiveValue + 1e-9,
    );
  });
});

describe('material indices', () => {
  it('square tube beam stiffness gives E^(1/2)/ρ', () => {
    expect(
      deriveIndices('beam', ['stiffness'], 'square_tube', 'min_mass')[0]
        .expression,
    ).toBe('E^(1/2)/ρ');
  });
  it('plank stiffness gives E^(1/3)/ρ', () => {
    expect(
      deriveIndices('beam', ['stiffness'], 'rect_fixed_width', 'min_mass')[0]
        .expression,
    ).toBe('E^(1/3)/ρ');
  });
  it('solid round beam strength gives σ^(2/3)/ρ', () => {
    expect(
      deriveIndices('beam', ['strength'], 'solid_round', 'min_mass')[0]
        .expression,
    ).toBe('σ^(2/3)/ρ');
  });
  it('plank strength gives σ^(1/2)/ρ', () => {
    expect(
      deriveIndices('beam', ['strength'], 'rect_fixed_width', 'min_mass')[0]
        .expression,
    ).toBe('σ^(1/2)/ρ');
  });
  it('tie stiffness at min cost gives E/ρ·C', () => {
    expect(
      deriveIndices('tie', ['stiffness'], 'solid_round', 'min_cost')[0]
        .expression,
    ).toBe('E/ρ·C');
  });
  it('other components', () => {
    expect(
      deriveIndices('shaft', ['stiffness'], 'solid_round', 'min_mass')[0]
        .expression,
    ).toBe('G^(1/2)/ρ');
    expect(
      deriveIndices('spring', ['strength'], 'solid_round', 'min_mass')[0]
        .expression,
    ).toBe('σ^2/E·ρ');
    expect(
      deriveIndices('hinge', ['strength'], 'solid_round', 'min_mass')[0]
        .expression,
    ).toBe('σ/E');
    expect(
      deriveIndices('insulation', ['strength'], 'solid_round', 'min_mass')[0]
        .expression,
    ).toBe('1/λ');
    expect(
      deriveIndices('insulation', ['strength'], 'solid_round', 'min_cost')[0]
        .expression,
    ).toBe('1/λ·ρ·C');
    expect(
      deriveIndices('thermal_shock', ['strength'], 'solid_round', 'min_mass')[0]
        .expression,
    ).toBe('σ/E·α');
    expect(formatIndex({ E: 1 / 3, density: -1 })).toBe('E^(1/3)/ρ');
  });
  it('index-mode ranking orders by the index (CFRP beats steel and aluminium for a light stiff beam)', () => {
    const result = runSelection(
      spec({
        title: 'Stiff light beam',
        component: 'beam',
        criteria: ['stiffness'],
        section: 'solid_round',
      }),
      [
        testMaterial({
          id: 'steel',
          name: 'Steel',
          E: [200, 210],
          density: [7800, 7900],
        }),
        testMaterial({
          id: 'al',
          name: 'Aluminium',
          E: [69, 72],
          density: [2690, 2710],
        }),
        testMaterial({
          id: 'cfrp',
          name: 'CFRP',
          family: 'composite',
          E: [100, 140],
          density: [1500, 1600],
        }),
      ],
      { mcSamples: 300 },
    );
    expect(result.mode).toBe('index');
    expect(result.ranking.map((r) => r.materialId)).toEqual([
      'cfrp',
      'al',
      'steel',
    ]);
    expect(result.ranking[0].objectiveValue).toBeCloseTo(100, 6);
    expect(
      result.warnings.some((w) => w.includes('performance index only')),
    ).toBe(true);
  });
});

describe('screening', () => {
  const brief = spec({
    title: 'Garden bench rail',
    component: 'beam',
    criteria: ['stiffness', 'strength'],
    load: { value: 200, unit: 'kg' },
    length: { value: 1.5, unit: 'm' },
    maxDeflection: { value: 8, unit: 'mm' },
    section: 'square_tube',
    environment: ['outdoor'],
    requiredProcesses: ['drill'],
  });
  const materials: Material[] = [
    testMaterial({
      id: 'mild',
      name: 'Mild steel (uncoated)',
      ratings: { fresh_water: 'D', salt_water: 'E', uv: 'A', chemicals: 'C' },
    }),
    testMaterial({
      id: 'glass',
      name: 'Toughened glass',
      family: 'ceramic_glass',
      density: [2400, 2600],
      E: [68, 74],
      strength: [120, 200],
      brittle: true,
      ratings: { fresh_water: 'A', salt_water: 'A', uv: 'A', chemicals: 'A' },
      processes: { drill: 'no' },
    }),
    testMaterial({ id: 'mystery', name: 'Mystery alloy', E: null }),
    testMaterial({
      id: 'neg',
      name: 'Bad data plastic',
      family: 'polymer',
      density: [-5, 1200],
    }),
    testMaterial({
      id: 'al',
      name: 'Aluminium 6061-T6',
      density: [2690, 2710],
      E: [68, 70],
      strength: [240, 276],
      ratings: { fresh_water: 'A', salt_water: 'B', uv: 'A', chemicals: 'B' },
    }),
    testMaterial({
      id: 'ss',
      name: 'Stainless steel 304',
      density: [7900, 8000],
      E: [190, 200],
      strength: [205, 310],
      ratings: { fresh_water: 'A', salt_water: 'B', uv: 'A', chemicals: 'A' },
      processes: { drill: 'possible' },
    }),
    testMaterial({
      id: 'oak',
      name: 'Oak',
      family: 'wood_natural',
      density: [650, 750],
      E: [10, 13],
      strength: [80, 110],
      ratings: { fresh_water: 'C', salt_water: 'D', uv: 'C', chemicals: 'C' },
      processes: { drill: 'good' },
    }),
  ];

  const result = runSelection(brief, materials, { mcSamples: 500 });

  it('rejects a rusting steel (water rating D) outdoors', () => {
    const r = result.rejected.find((x) => x.materialId === 'mild');
    expect(r).toBeDefined();
    expect(r!.reasons.join(' ')).toMatch(/fresh water rating D/);
  });
  it('rejects a material that cannot be drilled', () => {
    const r = result.rejected.find((x) => x.materialId === 'glass');
    expect(r!.reasons.join(' ')).toMatch(/drilling \(not possible\)/);
  });
  it('sends a material with missing E to "not evaluated"', () => {
    expect(result.notEvaluated.map((x) => x.materialId)).toContain('mystery');
  });
  it('sends negative density to "invalid data"', () => {
    expect(result.invalidData.map((x) => x.materialId)).toEqual(['neg']);
  });
  it('ranks the rest, lightest first, and sizes wood as a solid section', () => {
    expect(result.mode).toBe('sizing');
    expect(result.ranking.map((r) => r.materialId).sort()).toEqual([
      'al',
      'oak',
      'ss',
    ]);
    const masses = result.ranking.map((r) => r.objectiveValue);
    expect([...masses].sort((a, b) => a - b)).toEqual(masses);
    const oak = result.ranking.find((r) => r.materialId === 'oak')!;
    expect(oak.sizing!.sectionUsed).toBe('solid_square');
    expect(result.ranking.reduce((a, r) => a + r.pBest, 0)).toBeCloseTo(1, 6);
  });
  it('two identical runs give identical rankings and probabilities', () => {
    const again = runSelection(brief, materials, { mcSamples: 500 });
    expect(again.ranking).toEqual(result.ranking);
    expect(again.seed).toBe(result.seed);
  });
  it('generates numeric reasons in code', () => {
    expect(result.ranking[0].reasons[0]).toMatch(
      /^Lightest part that meets every requirement: about [\d.]+ kg$/,
    );
    expect(result.ranking[1].reasons[0]).toMatch(/× the mass of the top pick/);
    expect(result.ranking[0].reasons.join(' ')).toMatch(
      /Works with your tools: drilling/,
    );
  });
});

describe('plausibility validation', () => {
  it('reorders reversed ranges, flags wide ranges, discards G > E, removes duplicates', () => {
    const v = validateMaterials([
      testMaterial({ id: 'a', name: 'A', E: [210, 200] }),
      testMaterial({ id: 'b', name: 'B', strength: [10, 900] }),
      testMaterial({ id: 'c', name: 'C', G: [300, 310] }),
      testMaterial({ id: 'a2', name: 'a' }),
      testMaterial({ id: 'd', name: 'D', price: [0.001, 1] }),
      testMaterial({ id: 'e', name: 'E', confidence: 'low' }),
    ]);
    expect(v.valid.find((m) => m.id === 'a')!.E).toEqual([200, 210]);
    expect(v.flags.get('a')![0]).toMatch(/reversed/);
    expect(v.flags.get('b')![0]).toMatch(/very wide/);
    expect(v.valid.find((m) => m.id === 'c')!.G).toBeNull();
    expect(v.duplicatesRemoved).toEqual(['a']);
    expect(v.invalid.map((x) => x.materialId)).toEqual(['d']);
    expect(v.flags.get('e')!.join()).toMatch(/confidence/);
  });
});

describe('units', () => {
  it('converts force, length and torque', () => {
    expect(toNewtons({ value: 100, unit: 'kg' })).toBeCloseTo(980.665, 3);
    expect(toNewtons({ value: 2, unit: 'kN' })).toBe(2000);
    expect(toNewtons({ value: 10, unit: 'lb' })).toBeCloseTo(44.48, 2);
    expect(toMetres({ value: 12, unit: 'in' })).toBeCloseTo(0.3048, 6);
    expect(toMetres({ value: 3, unit: 'ft' })).toBeCloseTo(0.9144, 6);
    expect(toMetres({ value: 25, unit: 'cm' })).toBeCloseTo(0.25, 9);
    expect(toNewtonMetres({ value: 10, unit: 'N·m' })).toBe(10);
    expect(toNewtonMetres({ value: 1, unit: 'lbf·ft' })).toBeCloseTo(1.3558, 4);
  });
  it('rejects unknown units with the supported list', () => {
    expect(() => toMetres({ value: 1, unit: 'furlong' })).toThrow(UnitError);
    expect(() => toMetres({ value: 1, unit: 'furlong' })).toThrow(
      /mm, cm, m, in, ft/,
    );
  });
  it('requires a torque unit for shafts', () => {
    expect(() =>
      runSelection(
        spec({
          title: 'Shaft',
          component: 'shaft',
          load: { value: 5, unit: 'kg' },
          length: { value: 1, unit: 'm' },
        }),
        [testMaterial({ id: 's', name: 'S' })],
        { mcSamples: 10 },
      ),
    ).toThrow(UnitError);
  });
});

describe('safety', () => {
  it('raises the safety factor for carries_people, warns when lowered, and always adds the safety note', () => {
    const base = {
      title: 'Ladder rail',
      component: 'column' as const,
      load: { value: 100, unit: 'kg' },
      length: { value: 2, unit: 'm' },
      section: 'round_tube' as const,
      safetyClass: 'carries_people' as const,
    };
    const defaultFactor = runSelection(
      spec(base),
      [testMaterial({ id: 'al', name: 'Al' })],
      {
        mcSamples: 10,
      },
    );
    expect(defaultFactor.safetyFactor).toBe(2.5);
    expect(defaultFactor.safetyNotes[0]).toMatch(/not a certified design/);
    const loweredFactor = runSelection(
      spec({ ...base, safetyFactor: 1.2 }),
      [testMaterial({ id: 'al', name: 'Al' })],
      { mcSamples: 10 },
    );
    expect(loweredFactor.safetyFactor).toBe(1.2);
    expect(loweredFactor.warnings.join(' ')).toMatch(
      /lower than the usual 2.5/,
    );
  });
  it('estimates G from E for shafts and flags it', () => {
    const r = runSelection(
      spec({
        title: 'Shaft',
        component: 'shaft',
        criteria: ['stiffness'],
        load: { value: 50, unit: 'N·m' },
        length: { value: 0.5, unit: 'm' },
        maxTwistDeg: 2,
        section: 'solid_round',
      }),
      [testMaterial({ id: 's', name: 'S', G: null })],
      { mcSamples: 10 },
    );
    expect(r.ranking[0].dataFlags.join()).toMatch(/estimated as E\/2.6/);
  });
});

describe('custom environments', () => {
  const brief = spec({
    title: 'Pool-side rail',
    component: 'beam',
    load: { value: 100, unit: 'kg' },
    length: { value: 1, unit: 'm' },
    maxDeflection: { value: 5, unit: 'mm' },
    customEnvironments: ['Next to a chlorinated pool'],
  });
  const key = 'next to a chlorinated pool';
  const result = runSelection(
    brief,
    [
      testMaterial({ id: 'ok', name: 'Good', customRatings: { [key]: 'A' } }),
      testMaterial({ id: 'bad', name: 'Bad', customRatings: { [key]: 'D' } }),
      testMaterial({ id: 'unknown', name: 'Unknown' }),
    ],
    { mcSamples: 50 },
  );
  it('ranks materials rated B or better, rejects worse, and never guesses missing ratings', () => {
    expect(result.ranking.map((r) => r.materialId)).toEqual(['ok']);
    expect(result.rejected[0].reasons[0]).toBe(
      'Not suited to “Next to a chlorinated pool”: rating D (needs B or better)',
    );
    expect(result.notEvaluated[0].reasons[0]).toMatch(
      /rating for “Next to a chlorinated pool”/,
    );
    expect(result.activeConstraints).toContain(
      'Suited to “Next to a chlorinated pool”: rating B or better',
    );
    expect(result.ranking[0].reasons.join(' ')).toMatch(
      /“Next to a chlorinated pool” A/,
    );
  });
});

describe('general parts: property limits and custom index', () => {
  const brief = spec({
    title: 'Brake pad',
    component: 'custom',
    customProperties: [
      {
        key: 'friction_coefficient',
        label: 'Friction coefficient',
        symbol: 'μ',
        higherIsBetter: true,
      },
      {
        key: 'wear_rate',
        label: 'Specific wear rate',
        symbol: 'k',
        unit: 'mm³/N·m',
        higherIsBetter: false,
      },
    ],
    propertyLimits: [
      {
        property: 'friction_coefficient',
        min: 0.3,
        max: 0.5,
        reason: 'steady braking',
      },
      { property: 'tMax', min: 400 },
    ],
    customObjective: {
      description: 'Longest life',
      terms: [{ property: 'wear_rate', exponent: -1 }],
    },
  });
  const frictionAndWear = (mu: [number, number], k: [number, number]) => ({
    friction_coefficient: mu,
    wear_rate: k,
  });
  const result = runSelection(
    brief,
    [
      testMaterial({
        id: 'ceramic',
        name: 'Ceramic pad',
        tMax: [500, 650],
        extra: frictionAndWear([0.3, 0.4], [1e-6, 5e-6]),
      }),
      testMaterial({
        id: 'semi',
        name: 'Semi-metallic pad',
        tMax: [450, 550],
        extra: frictionAndWear([0.35, 0.45], [2e-6, 8e-6]),
      }),
      testMaterial({
        id: 'cc',
        name: 'Carbon-carbon',
        tMax: [500, 600],
        extra: frictionAndWear([0.2, 0.6], [2e-7, 2e-6]),
      }),
      testMaterial({
        id: 'nao',
        name: 'Organic pad',
        tMax: [250, 350],
        extra: frictionAndWear([0.35, 0.45], [5e-6, 2e-5]),
      }),
      testMaterial({
        id: 'slippy',
        name: 'Slippy',
        tMax: [500, 600],
        extra: frictionAndWear([0.05, 0.1], [1e-7, 2e-7]),
      }),
      testMaterial({ id: 'steel', name: 'Steel' }),
    ],
    { mcSamples: 300 },
  );
  it('ranks by the custom index using the conservative end of each range', () => {
    expect(result.mode).toBe('index');
    expect(result.index.expression).toBe('1/k');
    // 1/k at the high (worst) end of k: C/C 1/2e-6 > ceramic 1/5e-6 > semi-metallic 1/8e-6
    expect(result.ranking.map((r) => r.materialId)).toEqual([
      'cc',
      'ceramic',
      'semi',
    ]);
  });
  it('rejects ranges that fail entirely, flags ranges that straddle a limit', () => {
    const why = Object.fromEntries(
      result.rejected.map((r) => [r.materialId, r.reasons.join(' ')]),
    );
    expect(why.nao).toMatch(
      /Max service temperature about 250–350 °C; needs at least 400 °C/,
    );
    expect(why.slippy).toMatch(
      /Friction coefficient about 0.05–0.1; needs at least 0.3 \(steady braking\)/,
    );
    expect(
      result.ranking.find((r) => r.materialId === 'cc')!.dataFlags.join(),
    ).toMatch(/Only part of its friction coefficient range/);
  });
  it('sends materials without the custom data to "not evaluated" (never guessed)', () => {
    expect(result.notEvaluated.map((x) => x.materialId)).toEqual(['steel']);
    expect(result.notEvaluated[0].reasons[0]).toMatch(
      /Missing data: .*Friction coefficient/,
    );
    expect(result.notEvaluated[0].reasons[0]).toMatch(/Specific wear rate/);
  });
  it('states the requirements and shows the property values in the reasons', () => {
    expect(result.activeConstraints).toContain(
      'Friction coefficient between 0.3 and 0.5 — steady braking',
    );
    expect(result.ranking[0].reasons.join(' | ')).toMatch(
      /Friction coefficient: about 0.2–0.6/,
    );
  });
  it('rejects requirements on unknown properties', () => {
    expect(() =>
      spec({
        title: 'x',
        component: 'custom',
        propertyLimits: [{ property: 'magic', min: 1 }],
      }),
    ).toThrow(/unknown property/);
  });
});

describe('footprint, sustainability and processability', () => {
  const beam = {
    title: 'Rail',
    component: 'beam' as const,
    criteria: ['stiffness' as const],
    load: { value: 1, unit: 'kN' },
    length: { value: 1, unit: 'm' },
    maxDeflection: { value: 5, unit: 'mm' },
    support: 'cantilever_end' as const,
    section: 'solid_square' as const,
  };
  const steel = testMaterial({
    id: 'steel',
    name: 'Steel',
    co2: [1.6, 2.4],
    embodiedEnergy: [20, 30],
    recyclability: 'good',
    criticalElements: ['Manganese'],
  });
  const alu = testMaterial({
    id: 'alu',
    name: 'Aluminium',
    density: [2690, 2710],
    E: [69, 71],
    co2: [8, 16],
    embodiedEnergy: [180, 220],
    recyclability: 'good',
    criticalElements: ['aluminium', 'Mg', 'chromium'],
    processes: {
      hand_cut: 'good',
      power_cut: 'good',
      drill: 'good',
      machine: 'good',
      glue: 'good',
      fasten: 'good',
    },
  });

  it('"lowest carbon" ranks by part mass × CO₂ per kg (steel beats aluminium on carbon, not on mass)', () => {
    const byMass = runSelection(spec(beam), [steel, alu], { mcSamples: 100 });
    expect(byMass.ranking[0].materialId).toBe('alu');
    const byCarbon = runSelection(
      spec({ ...beam, objective: 'min_carbon' }),
      [steel, alu],
      { mcSamples: 100 },
    );
    expect(byCarbon.objectiveUnit).toBe('kg CO₂e');
    expect(byCarbon.ranking[0].materialId).toBe('steel');
    const r = byCarbon.ranking[0];
    expect(r.objectiveValue).toBeCloseTo(
      r.sizing!.massKg * Math.sqrt(1.6 * 2.4),
      6,
    );
    expect(r.footprint).toMatchObject({ basis: 'part' });
    expect(r.footprint!.co2Kg![0]).toBeCloseTo(r.sizing!.massKg * 1.6, 6);
    expect(r.reasons.join(' | ')).toMatch(/Lowest-carbon part .* kg CO₂e/);
  });

  it('index mode uses CO₂ per kg in the index and reports footprint per kg', () => {
    const result = runSelection(
      spec({
        title: 'x',
        component: 'beam',
        criteria: ['stiffness'],
        objective: 'min_carbon',
      }),
      [steel, alu],
      { mcSamples: 50 },
    );
    expect(result.index.expression).toBe('E^(1/2)/ρ·CO₂');
    expect(result.ranking[0].footprint).toMatchObject({
      basis: 'kg',
      co2Kg: [1.6, 2.4],
    });
  });

  it('"balanced" ranks by the penalty Z = cost + α_m·mass + α_CO₂·CO₂ and reports its parts', () => {
    const carbonHeavy = runSelection(
      spec({
        ...beam,
        objective: 'balanced',
        penalty: { alphaMass: 0, alphaCo2: 10, rationale: '' },
      }),
      [steel, alu],
      { mcSamples: 100 },
    );
    expect(carbonHeavy.objectiveUnit).toBe('USD eq.');
    expect(carbonHeavy.ranking[0].materialId).toBe('steel');
    const massHeavy = runSelection(
      spec({
        ...beam,
        objective: 'balanced',
        penalty: { alphaMass: 1000, alphaCo2: 0, rationale: '' },
      }),
      [steel, alu],
      { mcSamples: 100 },
    );
    expect(massHeavy.ranking[0].materialId).toBe('alu');
    const r = massHeavy.ranking[0];
    expect(r.penalty!.z).toBeCloseTo(
      r.penalty!.material + r.penalty!.mass + r.penalty!.carbon,
      9,
    );
    expect(r.penalty!.mass).toBeCloseTo(1000 * r.sizing!.massKg, 6);
    expect(r.objectiveValue).toBeCloseTo(r.penalty!.z, 6);
    expect(r.tradeoff).toMatchObject({ basis: 'part', mass: r.sizing!.massKg });
    expect(r.reasons[0]).toMatch(
      /Best balance of cost, mass and carbon: penalty about/,
    );
  });

  it('"balanced" without exchange constants uses the defaults and says so', () => {
    const result = runSelection(
      spec({ ...beam, objective: 'balanced' }),
      [steel, alu],
      { mcSamples: 20 },
    );
    expect(result.warnings.join(' ')).toMatch(
      /\$1 per kg saved and \$0.1 per kg CO₂e/,
    );
    expect(result.ranking[0].penalty).toMatchObject({
      alphaMass: 1,
      alphaCo2: 0.1,
    });
  });

  it('"balanced" in index mode divides the mass index by the penalty per kg; trade-off is relative to the lightest', () => {
    const result = runSelection(
      spec({
        title: 'x',
        component: 'beam',
        criteria: ['stiffness'],
        objective: 'balanced',
        penalty: { alphaMass: 5, alphaCo2: 0.1, rationale: '' },
      }),
      [steel, alu],
      { mcSamples: 20 },
    );
    expect(result.index.expression).toBe('E^(1/2)/ρ·(C + α_m + α_CO₂·CO₂)');
    const masses = result.ranking.map((r) => r.tradeoff!.mass);
    expect(Math.min(...masses)).toBeCloseTo(1, 9);
    expect(result.ranking.every((r) => r.tradeoff!.basis === 'relative')).toBe(
      true,
    );
  });

  it('matches critical raw materials against the EU list in code, ignoring others', () => {
    const result = runSelection(spec(beam), [alu], { mcSamples: 10 });
    expect(result.ranking[0].sustainability.criticalRawMaterials).toEqual([
      'aluminium/bauxite',
      'magnesium',
    ]);
    expect(result.ranking[0].reasons.join(' | ')).toMatch(
      /EU critical raw materials: aluminium\/bauxite, magnesium/,
    );
  });

  it('rates processability from the workshop process ratings', () => {
    const result = runSelection(spec(beam), [alu, steel], { mcSamples: 10 });
    const a = result.ranking.find((r) => r.materialId === 'alu')!;
    expect(a.processability.level).toBe('easy');
    const steelResult = result.ranking.find((r) => r.materialId === 'steel')!;
    expect(steelResult.processability.level).toBe(null); // only 3 rated processes, 2 of them workshop ones
  });

  it('applies the recyclable and renewable must-haves, never guessing unknowns', () => {
    const wood = testMaterial({
      id: 'wood',
      name: 'Pine',
      family: 'wood_natural',
      recyclability: 'good',
      renewable: true,
    });
    const cfrp = testMaterial({
      id: 'cfrp',
      name: 'CFRP',
      family: 'composite',
      recyclability: 'difficult',
      renewable: false,
    });
    const unknown = testMaterial({ id: 'unk', name: 'Unknown' });
    const result = runSelection(
      spec({ ...beam, mustHave: ['recyclable', 'renewable'] }),
      [wood, cfrp, unknown],
      { mcSamples: 10 },
    );
    expect(result.ranking.map((r) => r.materialId)).toEqual(['wood']);
    expect(result.rejected[0].reasons).toEqual([
      'Hard to recycle (recyclability: difficult)',
      'Not made from a renewable source',
    ]);
    expect(result.notEvaluated[0].reasons[0]).toMatch(
      /recyclability, whether it is renewable/,
    );
  });
});
