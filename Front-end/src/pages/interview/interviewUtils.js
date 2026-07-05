export const countFillers = (text) => {
  if (!text) return 0;
  const FILLER_WORDS = ['um', 'uh', 'er', 'like', 'you know', 'basically', 'actually', 'literally', 'sort of', 'kind of'];
  let count = 0;
  const lower = text.toLowerCase();
  for (let fw of FILLER_WORDS) {
    const regex = new RegExp(`\\b${fw}\\b`, 'g');
    const matches = lower.match(regex);
    if (matches) count += matches.length;
  }
  return count;
};
