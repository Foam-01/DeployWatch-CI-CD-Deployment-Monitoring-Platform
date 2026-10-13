import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateEnvironmentDto {
  /** Must match the GitHub Environment name used by `deployment_status` events. */
  @ApiProperty({ example: 'Production' })
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9 _.-]*$/, { message: 'name may contain letters, numbers, spaces, _ . -' })
  name: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isProduction?: boolean;
}
