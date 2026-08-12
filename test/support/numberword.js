// numberword.js — the English word for a small whole number.
//
// Two tests need this and for the same reason: this project writes its counts
// out as words ("all eighty-four constants", "offers eight one-click worlds"),
// so a test that compares a collection's size to what a document says about it
// has to spell the size before it can look for it. `test/scenarios.test.js`
// carried the first copy from v1.52; `test/prosecounts.test.js` is the general
// form of that test and would have carried the second.
//
// Zero to ninety-nine, which is every count this project has ever stated in
// prose about a collection in its own code. Anything larger throws rather than
// returning something plausible — a test that silently stops being able to
// spell the number it is checking is exactly the kind of quietly-weaker check
// v1.36 warned about.

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen",
];

const TENS = [
  "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty",
  "ninety",
];

/**
 * @param {number} n a whole number in 0..99
 * @returns {string} the English word, hyphenated where English hyphenates it
 */
export function numberWord(n) {
  if (!Number.isInteger(n) || n < 0 || n > 99) {
    throw new RangeError(`numberWord: ${n} is outside this vocabulary (0..99)`);
  }
  if (n < 20) return ONES[n];
  const tens = TENS[Math.floor(n / 10)];
  const ones = n % 10;
  return ones === 0 ? tens : `${tens}-${ONES[ones]}`;
}

/** Every word this vocabulary can produce, longest first so a regexp
 * alternation prefers "eighty-four" over "eighty". */
export const NUMBER_WORDS = Array.from({ length: 100 }, (_, i) => numberWord(i)).sort(
  (a, b) => b.length - a.length
);
