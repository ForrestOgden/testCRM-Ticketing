import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import jwt, { type JwtPayload } from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { DatabaseService } from "../common/database.module";
import { IS_PUBLIC_KEY } from "./public.decorator";
import type { AuthenticatedUser } from "./auth.types";

interface EntraClaims extends JwtPayload {
  oid?: string;
  preferred_username?: string;
  email?: string;
  name?: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly jwks = jwksClient({
    jwksUri: `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID ?? "common"}/discovery/v2.0/keys`,
    cache: true,
    cacheMaxAge: 60 * 60 * 1000,
    rateLimit: true,
    jwksRequestsPerMinute: 10
  });

  constructor(
    private readonly reflector: Reflector,
    private readonly database: DatabaseService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: AuthenticatedUser;
    }>();

    if ((process.env.AUTH_MODE ?? "development") === "development") {
      request.user = await this.developmentUser();
      return true;
    }

    const authHeader = request.headers.authorization;
    const raw = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    const token = raw?.startsWith("Bearer ") ? raw.slice(7) : undefined;
    if (!token) throw new UnauthorizedException("Missing bearer token.");

    const claims = await this.verifyEntraToken(token);
    if (!claims.oid) throw new UnauthorizedException("Token is missing oid.");
    const email = claims.preferred_username ?? claims.email;
    if (!email) throw new UnauthorizedException("Token is missing user email.");

    const user = await this.database.prisma.user.upsert({
      where: { entraObjectId: claims.oid },
      update: {
        email: email.toLowerCase(),
        displayName: claims.name ?? email,
        isActive: true
      },
      create: {
        entraObjectId: claims.oid,
        email: email.toLowerCase(),
        displayName: claims.name ?? email
      },
      include: {
        roleAssignments: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } }
              }
            }
          }
        }
      }
    });

    if (!user.isActive) throw new UnauthorizedException("User is disabled.");

    request.user = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      entraObjectId: user.entraObjectId,
      permissions: [
        ...new Set(
          user.roleAssignments.flatMap((assignment) =>
            assignment.role.permissions.map((item) => item.permission.key)
          )
        )
      ]
    };
    return true;
  }

  private async developmentUser(): Promise<AuthenticatedUser> {
    const email = (process.env.DEV_USER_EMAIL ?? "admin@mspcrm.local").toLowerCase();
    const entraObjectId = process.env.DEV_USER_OID ?? "00000000-0000-0000-0000-000000000001";
    const user = await this.database.prisma.user.upsert({
      where: { email },
      update: {
        displayName: process.env.DEV_USER_NAME ?? "Local Administrator",
        isActive: true
      },
      create: {
        entraObjectId,
        email,
        displayName: process.env.DEV_USER_NAME ?? "Local Administrator"
      }
    });

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      entraObjectId: user.entraObjectId,
      permissions: ["*"]
    };
  }

  private async verifyEntraToken(token: string): Promise<EntraClaims> {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === "string" || !decoded.header.kid) {
      throw new UnauthorizedException("Invalid token header.");
    }

    const key = await this.jwks.getSigningKey(decoded.header.kid);
    const publicKey = key.getPublicKey();
    const tenantId = process.env.ENTRA_TENANT_ID;
    const audience = process.env.ENTRA_CLIENT_ID;
    if (!tenantId || !audience) {
      throw new UnauthorizedException("Entra authentication is not configured.");
    }

    try {
      return jwt.verify(token, publicKey, {
        algorithms: ["RS256"],
        audience,
        issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`
      }) as EntraClaims;
    } catch {
      throw new UnauthorizedException("Token validation failed.");
    }
  }
}
