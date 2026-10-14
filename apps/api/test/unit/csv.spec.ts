import { toCsv } from '../../src/common/utils/csv';

describe('toCsv', () => {
  it('quotes fields, escapes quotes and preserves embedded line breaks', () => {
    expect(toCsv(['title', 'description'], [['An "incident"', 'line one\r\nline two']])).toBe(
      '\uFEFF"title","description"\r\n"An ""incident""","line one\r\nline two"\r\n',
    );
  });

  it.each(['=1+1', '+SUM(A1:A2)', '-2+3', '@HYPERLINK("x")', ' \t=cmd'])(
    'neutralizes spreadsheet formulas in string fields: %s',
    (value) => {
      expect(toCsv(['value'], [[value]])).toContain(`"'${value.replace(/"/g, '""')}"`);
    },
  );

  it('leaves numeric cells numeric and empty cells blank', () => {
    expect(toCsv(['duration', 'message'], [[-2, null]])).toBe('\uFEFF"duration","message"\r\n"-2",""\r\n');
  });
});
