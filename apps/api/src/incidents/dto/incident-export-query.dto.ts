import { IncidentSeverity, IncidentStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class IncidentExportQueryDto {
  @IsOptional()
  @IsEnum(IncidentStatus)
  status?: IncidentStatus;

  @IsOptional()
  @IsEnum(IncidentSeverity)
  severity?: IncidentSeverity;
}
