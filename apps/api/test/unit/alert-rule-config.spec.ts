import { serviceDownFailureThreshold } from '../../src/common/utils/alert-rule-config';

describe('serviceDownFailureThreshold', () => {
  it('accepts integer overrides from 1 to 10', () => {
    expect(serviceDownFailureThreshold({ failureThreshold: 1 })).toBe(1);
    expect(serviceDownFailureThreshold({ failureThreshold: 10 })).toBe(10);
  });

  it('ignores missing, non-integer and out-of-range configuration', () => {
    expect(serviceDownFailureThreshold({})).toBeUndefined();
    expect(
      serviceDownFailureThreshold({ failureThreshold: '4' }),
    ).toBeUndefined();
    expect(
      serviceDownFailureThreshold({ failureThreshold: 2.5 }),
    ).toBeUndefined();
    expect(
      serviceDownFailureThreshold({ failureThreshold: 0 }),
    ).toBeUndefined();
    expect(
      serviceDownFailureThreshold({ failureThreshold: 11 }),
    ).toBeUndefined();
    expect(serviceDownFailureThreshold(null)).toBeUndefined();
  });
});
