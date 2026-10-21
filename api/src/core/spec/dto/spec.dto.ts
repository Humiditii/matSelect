import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { AUDIENCES, Audience } from 'src/common/domain/domain.types';

export class ExtractSpecDto {
  @ApiProperty({
    example: 'I want to design a brake pad for my motorbike',
    description: 'What the user wants to build, in their own words',
  })
  @IsString()
  @Length(5, 2000, { message: 'text must be between 5 and 2000 characters' })
  text: string;

  @ApiPropertyOptional({
    example: 'everyday',
    enum: AUDIENCES,
    description: 'Who the explanation is written for',
  })
  @IsOptional()
  @IsIn(AUDIENCES)
  audience?: Audience;
}
