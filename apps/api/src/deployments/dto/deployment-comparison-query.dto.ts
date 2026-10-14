import { IsUUID } from 'class-validator';

export class DeploymentComparisonQueryDto {
  @IsUUID()
  leftEnvironmentId!: string;

  @IsUUID()
  rightEnvironmentId!: string;
}
