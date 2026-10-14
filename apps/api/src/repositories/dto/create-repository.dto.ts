import { IsString, IsOptional, Matches, MaxLength, IsEnum, IsUrl, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RepositoryProvider } from '@prisma/client';

export class CreateRepositoryDto {
  @ApiProperty({ example: 'Foam-01/DeployWatch' })
  @IsString()
  @Matches(/^[^\u0000-\u001f\u007f]+$/, {
    message: 'fullName must not contain control characters.',
  })
  @MaxLength(500)
  fullName: string;

  @ApiProperty({ example: '123456789', description: 'Provider repository or job identifier' })
  @IsString()
  @MaxLength(200)
  externalRepoId: string;

  @ApiPropertyOptional({ example: 'main' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  defaultBranch?: string;

  @ApiPropertyOptional({ enum: RepositoryProvider, default: RepositoryProvider.GITHUB })
  @IsOptional()
  @IsEnum(RepositoryProvider)
  provider?: RepositoryProvider;

  @ApiPropertyOptional({ example: 'https://gitlab.com' })
  @IsOptional()
  @IsUrl({ require_tld: true, protocols: ['https:'], require_protocol: true })
  @MaxLength(2048)
  integrationUrl?: string;

  @ApiPropertyOptional({ description: 'GitLab access token or Jenkins API token; returned nowhere after creation.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  accessToken?: string;

  @ApiPropertyOptional({ description: 'Jenkins username used with its API token.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  username?: string;
}
