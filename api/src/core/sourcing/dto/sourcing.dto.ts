import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class FindSourcesDto {
  @ApiProperty({
    example: 'NG',
    description: 'Two-letter ISO 3166-1 country code',
  })
  @IsString()
  @Matches(/^[A-Z]{2}$/, {
    message: 'country must be a two-letter code, e.g. NG',
  })
  country: string;

  @ApiPropertyOptional({
    example: 'Lagos',
    description: 'Optional city, to prefer nearby suppliers',
  })
  @IsOptional()
  @IsString()
  @Length(2, 60)
  city?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Search again instead of returning the saved result',
  })
  @IsOptional()
  @IsBoolean()
  refresh?: boolean;
}
