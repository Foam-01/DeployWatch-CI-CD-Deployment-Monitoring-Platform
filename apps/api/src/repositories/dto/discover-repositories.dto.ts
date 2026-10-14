import { RepositoryProvider } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class DiscoverRepositoriesDto {
  @ApiProperty({ enum: [RepositoryProvider.GITLAB, RepositoryProvider.JENKINS] })
  @IsIn([RepositoryProvider.GITLAB, RepositoryProvider.JENKINS])
  provider: RepositoryProvider;

  @ApiProperty({ example: 'https://gitlab.com' })
  @IsUrl({ require_tld: true, protocols: ['https:'], require_protocol: true })
  @MaxLength(2048)
  integrationUrl: string;

  @ApiProperty({ description: 'GitLab access token or Jenkins API token.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  accessToken: string;

  @ApiProperty({ required: false, description: 'Required for Jenkins API authentication.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  username?: string;
}
