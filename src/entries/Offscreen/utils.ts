export function subtractRanges(
  ranges: { start: number; end: number },
  negatives: { start: number; end: number }[],
): { start: number; end: number }[] {
  const returnVal: { start: number; end: number }[] = [ranges];

  negatives
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .forEach(({ start, end }) => {
      const last = returnVal.pop()!;

      if (start < last.start || end > last.end) {
        console.error('invalid ranges');
        return;
      }

      if (start === last.start && end === last.end) {
        return;
      }

      if (start === last.start && end < last.end) {
        returnVal.push({ start: end, end: last.end });
        return;
      }

      if (start > last.start && end < last.end) {
        returnVal.push({ start: last.start, end: start });
        returnVal.push({ start: end, end: last.end });
        return;
      }

      if (start > last.start && end === last.end) {
        returnVal.push({ start: last.start, end: start });
        return;
      }
    });

  return returnVal;
}
