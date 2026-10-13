import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({ example: 'My Web App' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'Main production web application', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
