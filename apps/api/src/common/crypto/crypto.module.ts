import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SecretBox } from './secret-box';

/** Provides one SecretBox built from ENCRYPTION_KEY; the app fails to start if the key is invalid. */
@Global()
@Module({
  providers: [
    {
      provide: SecretBox,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new SecretBox(config.get<string>('ENCRYPTION_KEY')),
    },
  ],
  exports: [SecretBox],
})
export class CryptoModule {}
