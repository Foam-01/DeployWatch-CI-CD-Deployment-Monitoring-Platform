import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AlertEventType } from '@prisma/client';
import { ArrayUnique, IsArray, IsBoolean, IsEnum, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { SUPPORTED_CHANNEL_TYPES, SupportedChannelType } from '../channel-config';

export class CreateChannelDto {
  @ApiProperty({ example: '#deploys' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiProperty({ enum: SUPPORTED_CHANNEL_TYPES })
  @IsIn(SUPPORTED_CHANNEL_TYPES)
  type: SupportedChannelType;

  /** Slack incoming-webhook URL or HTTPS endpoint. Stored encrypted, never returned. */
  @ApiProperty({ example: 'https://hooks.slack.com/services/T000/B000/XXXX' })
  @IsString()
  @MaxLength(2048)
  url: string;

  @ApiPropertyOptional({ enum: AlertEventType, isArray: true, description: 'Empty = all events' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(AlertEventType, { each: true })
  events?: AlertEventType[];
}

export class UpdateChannelDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /** Only sent when replacing the destination. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string;

  @ApiPropertyOptional({ enum: AlertEventType, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(AlertEventType, { each: true })
  events?: AlertEventType[];
}
