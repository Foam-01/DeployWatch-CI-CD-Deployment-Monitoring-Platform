import { ForbiddenException } from '@nestjs/common';

/** Viewers have read-only access; reject any mutation attempt. */
export function assertWritableRole(role: string | undefined): void {
  if (!role || role === 'VIEWER') {
    throw new ForbiddenException('You do not have permission to perform this action.');
  }
}
