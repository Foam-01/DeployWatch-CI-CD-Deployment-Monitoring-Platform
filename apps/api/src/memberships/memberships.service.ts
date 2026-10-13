import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MemberRole, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

const MEMBER_SELECT = {
  id: true,
  role: true,
  createdAt: true,
  user: { select: { id: true, email: true, name: true, avatarUrl: true } },
} as const;

export interface Actor {
  userId: string;
  role: MemberRole;
}

/**
 * Membership rules (spec §4):
 * - Everyone in the organization can see the member list.
 * - Owners and admins manage members; only owners grant, change or remove OWNER.
 * - An organization always keeps at least one owner.
 */
@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByOrganization(organizationId: string) {
    const members = await this.prisma.membership.findMany({
      where: { organizationId },
      select: MEMBER_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    return { data: members };
  }

  async addMember(organizationId: string, actor: Actor, email: string, role: MemberRole) {
    this.assertCanManage(actor);
    if (role === 'OWNER') this.assertOwner(actor, 'Only owners can add another owner.');

    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user) {
      throw new NotFoundException('No DeployWatch account uses that email. Ask them to register first.');
    }

    try {
      const membership = await this.prisma.$transaction(async (tx) => {
        const created = await tx.membership.create({
          data: { organizationId, userId: user.id, role },
          select: MEMBER_SELECT,
        });
        await this.audit(tx, organizationId, actor, 'CREATE', created.id, { email: user.email, role });
        return created;
      });
      return { data: membership };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('That user is already a member of this organization.');
      }
      throw err;
    }
  }

  async updateRole(organizationId: string, actor: Actor, membershipId: string, role: MemberRole) {
    this.assertCanManage(actor);
    const target = await this.findInOrg(organizationId, membershipId);

    if (target.role === 'OWNER' || role === 'OWNER') {
      this.assertOwner(actor, 'Only owners can grant or change the owner role.');
    }
    if (target.role === 'OWNER' && role !== 'OWNER') await this.assertNotLastOwner(organizationId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const m = await tx.membership.update({ where: { id: membershipId }, data: { role }, select: MEMBER_SELECT });
      await this.audit(tx, organizationId, actor, 'UPDATE', membershipId, { from: target.role, to: role });
      return m;
    });
    return { data: updated };
  }

  async removeMember(organizationId: string, actor: Actor, membershipId: string) {
    this.assertCanManage(actor);
    const target = await this.findInOrg(organizationId, membershipId);
    if (target.role === 'OWNER') {
      this.assertOwner(actor, 'Only owners can remove an owner.');
      await this.assertNotLastOwner(organizationId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.membership.delete({ where: { id: membershipId } });
      await this.audit(tx, organizationId, actor, 'DELETE', membershipId, {
        role: target.role,
        userId: target.userId,
      });
    });
    return { data: { id: membershipId } };
  }

  private assertCanManage(actor: Actor) {
    if (actor.role !== 'OWNER' && actor.role !== 'ADMIN') {
      throw new ForbiddenException('Only owners and admins can manage members.');
    }
  }

  private assertOwner(actor: Actor, message: string) {
    if (actor.role !== 'OWNER') throw new ForbiddenException(message);
  }

  private async findInOrg(organizationId: string, membershipId: string) {
    const membership = await this.prisma.membership.findFirst({ where: { id: membershipId, organizationId } });
    if (!membership) throw new NotFoundException('Membership not found.');
    return membership;
  }

  private async assertNotLastOwner(organizationId: string) {
    const owners = await this.prisma.membership.count({ where: { organizationId, role: 'OWNER' } });
    if (owners <= 1) {
      throw new ConflictException('An organization must keep at least one owner. Promote someone else first.');
    }
  }

  private audit(
    tx: Prisma.TransactionClient,
    organizationId: string,
    actor: Actor,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    resourceId: string,
    metadata: Prisma.InputJsonObject,
  ) {
    return tx.auditLog.create({
      data: { organizationId, actorUserId: actor.userId, action, resourceType: 'membership', resourceId, metadata },
    });
  }
}
