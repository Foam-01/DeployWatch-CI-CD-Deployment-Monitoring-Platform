import { WorkflowConclusion, WorkflowStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class WorkflowRunExportQueryDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsEnum(WorkflowStatus)
  status?: WorkflowStatus;

  @IsOptional()
  @IsEnum(WorkflowConclusion)
  conclusion?: WorkflowConclusion;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  branch?: string;
}
