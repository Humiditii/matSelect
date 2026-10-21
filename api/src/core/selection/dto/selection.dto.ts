import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmptyObject, IsObject } from 'class-validator';
import { AUDIENCES, Audience } from 'src/common/domain/domain.types';

export class CreateSelectionDto {
  @ApiProperty({
    description:
      'The confirmed design brief (DesignSpec). Validated in depth by the domain model; usually the `spec` returned by POST /specs/extract, possibly edited.',
    example: {
      title: 'Brake pad',
      component: 'custom',
      objective: 'min_mass',
      customProperties: [
        {
          key: 'friction_coefficient',
          label: 'Friction coefficient',
          symbol: 'μ',
          unit: '',
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
        {
          property: 'tMax',
          min: 400,
          max: null,
          reason: 'pad surface temperature',
        },
      ],
      customObjective: {
        description: 'Longest life',
        terms: [{ property: 'wear_rate', exponent: -1 }],
      },
      environment: ['outdoor'],
    },
  })
  @IsObject()
  @IsNotEmptyObject()
  spec: Record<string, unknown>;
}

export class ExplainSelectionDto {
  @ApiProperty({ example: 'engineer', enum: AUDIENCES })
  @IsIn(AUDIENCES)
  audience: Audience;
}
