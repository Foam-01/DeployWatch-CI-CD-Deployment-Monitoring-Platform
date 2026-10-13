import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * OrgGuard resolves the user's active organization from memberships
 * and attaches organizationId + memberRole to the request user object.
 *
 * Requires JwtAuthGuard to run first.
 * Uses the first OWNER/ADMIN/MEMBER organization found (or picks from query/header).
 */
@Injectable()
export class OrgGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.id) {
      throw new ForbiddenException('Authentication required.');
    }

    // Allow org override via header or query param
    const orgId =
      request.headers['x-organization-id'] ||
      request.query.organizationId ||
      undefined;

    const membership = await this.prisma.membership.findFirst({
      where: {
        userId: user.id,
        ...(orgId ? { organizationId: orgId } : {}),
      },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!membership) {
      throw new NotFoundException('No organization membership found.');
    }

    // Attach to request user for downstream use
    request.user.organizationId = membership.organizationId;
    request.user.memberRole = membership.role;
    request.user.organization = membership.organization;

    return true;
  }
}
