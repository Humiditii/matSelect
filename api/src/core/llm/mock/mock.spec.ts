import { DesignSpec } from 'src/common/domain/domain.types';
import { demoAdjust } from './mock.candidates';
import { mockExtract } from './mock.extraction';
import { MOCK_MATERIALS } from './mock.materials';
import { validateMaterials } from 'src/engine/validate';
import { mapCustomEnvironments } from 'src/engine/environments';
import { matchCustomRatings } from 'src/core/llm/outputs/llm.outputs';

const extract = (text: string) =>
  DesignSpec.parse(mockExtract(text, 'everyday').spec);

describe('mock extraction', () => {
  it('two goals named give the balanced goal, with exchange constants for the application', () => {
    const spec = extract('A lightweight but cheap drone arm, 25 cm long');
    expect(spec.objective).toBe('balanced');
    expect(spec.penalty).toMatchObject({ alphaMass: 100, alphaCo2: 0.1 });
    expect(extract('An eco-friendly shelf 80 cm long').objective).toBe(
      'min_carbon',
    );
    expect(
      extract('A shelf holding the weight of books, cheap').objective,
    ).toBe('min_cost');
  });

  it('bookshelf: span vs depth, uniform load, cost goal', () => {
    const spec = extract(
      'A bookshelf board 90 cm long and 25 cm deep, holding about 30 kg of books. I have woodworking tools and a drill.',
    );
    expect(spec.length).toEqual({ value: 90, unit: 'cm' });
    expect(spec.sectionWidth).toEqual({ value: 25, unit: 'cm' });
    expect(spec.load).toEqual({ value: 30, unit: 'kg' });
    expect(spec).toMatchObject({
      component: 'beam',
      section: 'rect_fixed_width',
      support: 'simply_supported_uniform',
      objective: 'min_cost',
    });
    expect(spec.maxDeflection).toEqual({ value: 4.5, unit: 'mm' });
    expect(spec.environment).toEqual(['indoor']);
  });

  it('garden bench: two adults, outdoors (not marine), people-carrying, no brittle materials', () => {
    const spec = extract(
      'A garden bench seat 1.5 m long and 40 cm deep that two adults can sit on, left outside all year. Cheap please; I have a saw and a drill.',
    );
    expect(spec.length).toEqual({ value: 1.5, unit: 'm' });
    expect(spec.sectionWidth).toEqual({ value: 40, unit: 'cm' });
    expect(spec.load).toEqual({ value: 200, unit: 'kg' });
    expect(spec.environment).toEqual(['outdoor']);
    expect(spec).toMatchObject({
      safetyClass: 'carries_people',
      objective: 'min_cost',
      mustHave: ['impact_resistant'],
    });
    expect(spec.requiredProcesses.sort()).toEqual(['drill', 'hand_cut']);
  });

  it('ladder: load shared by two rails, tube section', () => {
    const spec = extract(
      'A 3 m leaning ladder for my house. It must hold a 120 kg person and live outdoors. I only have a hand saw and a drill.',
    );
    expect(spec.load).toEqual({ value: 60, unit: 'kg' });
    expect(spec.length).toEqual({ value: 3, unit: 'm' });
    expect(spec).toMatchObject({
      section: 'square_tube',
      objective: 'min_mass',
      safetyClass: 'carries_people',
    });
  });

  it('drone arm: cantilever tube, explicit deflection when stated', () => {
    const spec = extract(
      'Quadcopter arms 20 cm long, motor thrust 1.2 kg, must not bend more than 1 mm. I will drill and glue.',
    );
    expect(spec).toMatchObject({
      component: 'beam',
      support: 'cantilever_end',
      section: 'round_tube',
      objective: 'min_mass',
    });
    expect(spec.maxDeflection).toEqual({ value: 1, unit: 'mm' });
    expect(spec.length).toEqual({ value: 20, unit: 'cm' });
  });

  it('asks only questions that change the result', () => {
    const { questions } = mockExtract(
      'A strong shelf for my workshop',
      'everyday',
    );
    expect(questions.map((q) => q.field)).toEqual(['load', 'length']);
  });
});

describe('mock materials', () => {
  it('have at least 10 per family and all pass plausibility checks', () => {
    const materials = MOCK_MATERIALS.map((m, i) => ({ ...m, id: String(i) }));
    const validation = validateMaterials(materials);
    expect(validation.invalid).toEqual([]);
    expect(validation.duplicatesRemoved).toEqual([]);
    const perFamily: Record<string, number> = {};
    for (const material of materials)
      perFamily[material.family] = (perFamily[material.family] ?? 0) + 1;
    expect(Object.keys(perFamily)).toHaveLength(6);
    for (const count of Object.values(perFamily))
      expect(count).toBeGreaterThanOrEqual(10);
    for (const material of materials)
      expect(Object.keys(material.processes)).toHaveLength(12);
  });
});

describe('custom environments', () => {
  it('maps free text onto built-in environments in demo mode, and says when it cannot', () => {
    const input = DesignSpec.parse({
      title: 'x',
      component: 'beam',
      customEnvironments: ['Next to a chlorinated pool', 'On Mars'],
    });
    const { spec, notes } = mapCustomEnvironments(input);
    expect(spec.environment.sort()).toEqual(['chemical', 'wet']);
    expect(spec.customEnvironments).toEqual([]);
    expect(notes[0]).toMatch(/checked as: wet conditions \+ chemicals/);
    expect(notes[1]).toMatch(/NOT checked/);
  });
  it('matches Claude ratings by text, falling back to order when paraphrased', () => {
    expect(
      matchCustomRatings(
        [{ environment: 'next to a chlorinated  POOL', rating: 'B' }],
        ['Next to a chlorinated pool'],
      ),
    ).toEqual({ 'next to a chlorinated pool': 'B' });
    expect(
      matchCustomRatings(
        [{ environment: 'chlorine pool area', rating: 'C' }],
        ['Next to a chlorinated pool'],
      ),
    ).toEqual({ 'next to a chlorinated pool': 'C' });
  });
  it('de-duplicates custom environments ignoring case and spacing', () => {
    expect(
      DesignSpec.parse({
        title: 'x',
        component: 'beam',
        customEnvironments: ['In a sauna', 'in a  SAUNA'],
      }).customEnvironments,
    ).toEqual(['in a  SAUNA']);
  });
});

describe('general parts (not load-bearing)', () => {
  it('brake pad: no load questions; friction, temperature and wear requirements', () => {
    const extracted = mockExtract(
      'I want to design a brake pad for my motorbike',
      'everyday',
    );
    const spec = DesignSpec.parse(extracted.spec);
    const questions = extracted.questions;
    expect(questions).toEqual([]);
    expect(spec).toMatchObject({
      component: 'custom',
      load: null,
      length: null,
      title: 'Brake pad',
    });
    expect(spec.propertyLimits.map((l) => l.property)).toEqual([
      'friction_coefficient',
      'tMax',
    ]);
    expect(spec.customObjective!.terms).toEqual([
      { property: 'wear_rate', exponent: -1 },
    ]);
    expect(spec.mustHave).toEqual([]);
  });
  it('unknown parts become general parts with a single "what matters most" question', () => {
    const { spec, questions } = mockExtract(
      'I want to make a phone case',
      'everyday',
    );
    expect(DesignSpec.parse(spec)).toMatchObject({
      component: 'custom',
      title: 'Phone case',
    });
    expect(questions.map((q) => q.field)).toEqual(['customObjective']);
  });
  it('demo mode drops custom properties it has no data for, and says so', () => {
    const input = DesignSpec.parse({
      title: 'x',
      component: 'custom',
      customProperties: [{ key: 'hardness', label: 'Hardness', unit: 'HV' }],
      propertyLimits: [
        { property: 'hardness', min: 500 },
        { property: 'tMax', min: 100 },
      ],
      customObjective: {
        description: 'hard',
        terms: [{ property: 'hardness', exponent: 1 }],
      },
    });
    const { spec, notes } = demoAdjust(input);
    expect(spec.propertyLimits.map((l) => l.property)).toEqual(['tMax']);
    expect(spec.customObjective).toBeNull();
    expect(notes[0]).toMatch(/no values for hardness/);
  });
});

describe('plain-word refinements', () => {
  it('reads temperature, budget and must-haves from extra sentences', () => {
    const spec = DesignSpec.parse(
      mockExtract(
        'I want to design a brake pad\nit must survive 600 °C and cost under $20',
        'everyday',
      ).spec,
    );
    expect(spec.propertyLimits.find((l) => l.property === 'tMax')!.min).toBe(
      600,
    );
    expect(spec.budgetPerPart).toBe(20);
    const cover = DesignSpec.parse(
      mockExtract(
        "A see-through cover that won't shatter, under $5 per kg",
        'everyday',
      ).spec,
    );
    expect(cover.mustHave.sort()).toEqual(['impact_resistant', 'transparent']);
    expect(cover.maxPricePerKg).toBe(5);
  });
});

describe('demo footprint and sustainability data', () => {
  it('every demo material has plausible footprint data and a recyclability rating', () => {
    for (const m of MOCK_MATERIALS) {
      expect(m.co2).not.toBeNull();
      expect(m.embodiedEnergy).not.toBeNull();
      expect(m.co2![0]).toBeLessThanOrEqual(m.co2![1]);
      expect(m.recyclability).not.toBeNull();
      expect(m.processingTips.length).toBeGreaterThan(0);
    }
    const validation = validateMaterials(
      MOCK_MATERIALS.map((m, i) => ({ ...m, id: String(i) })),
    );
    expect(validation.invalid).toEqual([]);
  });
});
