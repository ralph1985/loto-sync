export type ResultLineInput = {
  lineIndex: number;
  mainNumbers: number[];
  starNumbers: number[];
  elMillionCode?: string | null;
};

export type ComputedLineResult = {
  lineIndex: number;
  matchesMain: number;
  matchesStars: number;
  elMillionMatch: boolean | null;
};

export const computeLineResults = (
  lines: ResultLineInput[],
  winningNumbers: number[],
  winningStars: number[],
  winningElMillionCode?: string | null,
  legacyElMillionCode?: string | null
): ComputedLineResult[] => {
  const hasLineCodes = lines.some((line) => Boolean(line.elMillionCode));
  return lines.map((line, index) => ({
    lineIndex: line.lineIndex || index + 1,
    matchesMain: line.mainNumbers.filter((value) => winningNumbers.includes(value)).length,
    matchesStars: line.starNumbers.filter((value) => winningStars.includes(value)).length,
    elMillionMatch: winningElMillionCode && (line.elMillionCode || (!hasLineCodes && index === 0 ? legacyElMillionCode : null))
      ? (line.elMillionCode || legacyElMillionCode) === winningElMillionCode
      : null
  }));
};

export const hasAnyElMillionMatch = (results: ComputedLineResult[]) => {
  const values = results.map((result) => result.elMillionMatch).filter((value): value is boolean => value !== null);
  return values.length > 0 ? values.some(Boolean) : null;
};
