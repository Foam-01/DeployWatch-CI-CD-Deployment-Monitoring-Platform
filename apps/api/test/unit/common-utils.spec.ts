import { ForbiddenException } from '@nestjs/common';
import { assertWritableRole } from '../../src/common/utils/assert-writable-role';
import { MAX_PAGE_LIMIT, parseLimit } from '../../src/common/utils/pagination';

describe('parseLimit', () => {
  it.each([
    [undefined, 20],
    ['', 20],
    ['abc', 20],
    ['0', 20],
    ['-5', 20],
    ['10', 10],
    ['10.9', 10],
    [String(MAX_PAGE_LIMIT), MAX_PAGE_LIMIT],
    ['5000', MAX_PAGE_LIMIT],
  ])('parseLimit(%p) → %p', (raw, expected) => {
    expect(parseLimit(raw)).toBe(expected);
  });
});

describe('assertWritableRole', () => {
  it.each(['OWNER', 'ADMIN', 'MEMBER'])('allows %s', (role) => {
    expect(() => assertWritableRole(role)).not.toThrow();
  });

  it.each(['VIEWER', undefined, ''])('forbids %p', (role) => {
    expect(() => assertWritableRole(role)).toThrow(ForbiddenException);
  });
});
