import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class VerifyApiKeyDto {
  @ApiProperty({
    example: 'sk-ant-api03-…',
    description: "The user's own Claude API key (checked, never stored)",
  })
  @IsString()
  @Length(20, 300)
  apiKey: string;
}
