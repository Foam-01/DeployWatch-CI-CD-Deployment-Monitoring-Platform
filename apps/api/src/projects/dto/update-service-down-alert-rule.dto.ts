import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, Max, Min } from 'class-validator';

export class UpdateServiceDownAlertRuleDto {
  @ApiProperty({
    description:
      'Use this project-level failure threshold for every monitored service.',
  })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ minimum: 1, maximum: 10, example: 4 })
  @IsInt()
  @Min(1)
  @Max(10)
  failureThreshold: number;
}
