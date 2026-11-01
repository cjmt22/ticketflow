import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { REFRESH_COOKIE } from './auth.constants.js';
import {
  loginSchema,
  registerOrganisationSchema,
  type LoginDto,
  type RegisterOrganisationDto,
} from './auth.schemas.js';
import { AuthService } from './auth.service.js';
import type { AuthResult, AuthSession, AuthUser } from './auth.types.js';
import {
  clearRefreshCookieOptions,
  readCookie,
  refreshCookieOptions,
} from './cookies.js';
import { CurrentUser } from './current-user.decorator.js';
import { Public } from './public.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Public()
  @Post('register-organisation')
  async register(
    @Body(new ZodValidationPipe(registerOrganisationSchema))
    body: RegisterOrganisationDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResult> {
    return this.respond(res, await this.auth.registerOrganisation(body));
  }

  @Public()
  @HttpCode(200)
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResult> {
    return this.respond(res, await this.auth.login(body));
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResult> {
    const token = readCookie(req.headers.cookie, REFRESH_COOKIE);
    if (!token) {
      throw new UnauthorizedException('Missing refresh token');
    }
    return this.respond(res, await this.auth.refresh(token));
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(readCookie(req.headers.cookie, REFRESH_COOKIE));
    res.clearCookie(REFRESH_COOKIE, clearRefreshCookieOptions());
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.getProfile(user.id);
  }

  // The refresh token goes in the cookie only, never in the JSON body.
  private respond(res: Response, session: AuthSession): AuthResult {
    const { refreshToken, ...body } = session;
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
    return body;
  }
}