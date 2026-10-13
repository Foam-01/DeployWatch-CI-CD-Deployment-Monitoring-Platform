import { IsString, IsOptional, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRepositoryDto {
  @ApiProperty({ example: 'Foam-01/DeployWatch' })
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, { message: 'fullName must be in "owner/repo" format.' })
  @MaxLength(200)
  fullName: string;

  @ApiProperty({ example: '123456789', description: 'GitHub numeric repository ID' })
  @IsString()
  @Matches(/^\d+$/, { message: 'externalRepoId must be numeric.' })
  externalRepoId: string;

  @ApiPropertyOptional({ example: 'main' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  defaultBranch?: string;
}
