import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';

export class DashboardAnalyticsQueryDto {
  @ApiPropertyOptional({ enum: [7, 30], default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsIn([7, 30])
  days = 30;
}
