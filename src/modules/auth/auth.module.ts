import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { RefreshTokenRepository } from './refresh-token.repository';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenService } from './token.service';

@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          // Pinned: without it, a token forged with `alg: none` or a weaker
          // algorithm could be presented for verification.
          algorithm: 'HS256',
          // Shape already guaranteed by the JWT_ACCESS_TTL regex in
          // env.validation.ts; jsonwebtoken types this as a literal union.
          expiresIn: config.get<string>('JWT_ACCESS_TTL', '15m') as JwtSignOptions['expiresIn'],
          issuer: config.getOrThrow<string>('JWT_ISSUER'),
          audience: config.getOrThrow<string>('JWT_AUDIENCE'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService, RefreshTokenRepository, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
