// Math questions for Race mode's Math mode. The host picks the topic.
// A question is { text, answer (a number), answerText (shown when you get it wrong),
//   keys (extra keypad keys it needs, like '/' '.' '−'), simplest (fraction must be fully reduced) }.

export const MATH_TOPICS = {
  add20: 'Add & subtract (to 20)',
  add100: 'Add & subtract (to 100)',
  muldiv: 'Multiply & divide (to 12 × 12)',
  mix: 'Mixed (+ − × ÷)',
  fractions: 'Fractions',
  decimals: 'Decimals',
  percent: 'Percentages',
  negatives: 'Negative numbers',
  order: 'Order of operations',
  everything: 'Everything (all topics)',
};

const int = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const neg = (n) => (n < 0 ? `−${-n}` : `${n}`); // nice minus sign for display

function frac(n, d) {
  const g = gcd(n, d) || 1;
  n /= g;
  d /= g;
  return d === 1 ? `${n}` : `${n}/${d}`;
}

const whole = (text, answer) => ({ text, answer, answerText: neg(answer), keys: answer < 0 ? ['−'] : [] });

// ----- whole numbers -----
function addSub(max) {
  if (Math.random() < 0.5) {
    const a = int(0, max), b = int(0, max - a);
    return whole(`${a} + ${b}`, a + b);
  }
  const a = int(1, max), b = int(0, a);
  return whole(`${a} − ${b}`, a - b);
}

function mulDiv() {
  const a = int(1, 12), b = int(1, 12);
  if (Math.random() < 0.5) return whole(`${a} × ${b}`, a * b);
  return whole(`${a * b} ÷ ${b}`, a);
}

// ----- fractions -----
function fractions() {
  const type = int(1, 5);
  if (type === 1) { // same denominator
    const d = int(3, 12);
    if (Math.random() < 0.5) {
      const a = int(1, d - 1), b = int(1, d - a);
      return { text: `${a}/${d} + ${b}/${d}`, answer: (a + b) / d, answerText: frac(a + b, d), keys: ['/'] };
    }
    const a = int(2, d), b = int(1, a - 1);
    return { text: `${a}/${d} − ${b}/${d}`, answer: (a - b) / d, answerText: frac(a - b, d), keys: ['/'] };
  }
  if (type === 2) { // fraction of a number
    const d = pick([2, 3, 4, 5, 6, 8, 10]);
    const n = d * int(1, Math.floor(60 / d));
    const a = int(1, d - 1);
    return whole(`${a}/${d} of ${n}`, (a * n) / d);
  }
  if (type === 3) { // equivalent fraction: missing numerator
    const b = int(2, 9), a = int(1, b - 1), k = int(2, 5);
    return whole(`${a}/${b} = ?/${b * k}`, a * k);
  }
  if (type === 4) { // simplify
    let a, b;
    do { b = int(2, 10); a = int(1, b - 1); } while (gcd(a, b) !== 1);
    const k = int(2, 6);
    return { text: `Simplify ${a * k}/${b * k}`, answer: a / b, answerText: `${a}/${b}`, keys: ['/'], simplest: true };
  }
  // different denominators where one is a multiple of the other
  const d = pick([2, 3, 4, 5]), m = pick([2, 3]), D = d * m;
  const a = int(1, d - 1), b = int(1, D - 1);
  if (Math.random() < 0.5 || a * m <= b) {
    return { text: `${a}/${d} + ${b}/${D}`, answer: a / d + b / D, answerText: frac(a * m + b, D), keys: ['/'] };
  }
  return { text: `${a}/${d} − ${b}/${D}`, answer: a / d - b / D, answerText: frac(a * m - b, D), keys: ['/'] };
}

// ----- decimals -----
const dec = (n, places) => Number(n.toFixed(places));
function decimals() {
  const type = int(1, 3);
  if (type === 1) {
    const a = int(1, 200) / 10, b = int(1, 200) / 10;
    return { text: `${a} + ${b}`, answer: dec(a + b, 1), answerText: `${dec(a + b, 1)}`, keys: ['.'] };
  }
  if (type === 2) {
    let a = int(1, 200) / 10, b = int(1, 200) / 10;
    if (b > a) [a, b] = [b, a];
    return { text: `${a} − ${b}`, answer: dec(a - b, 1), answerText: `${dec(a - b, 1)}`, keys: ['.'] };
  }
  const a = int(1, 999) / 100, m = pick([10, 100]);
  return { text: `${a} × ${m}`, answer: dec(a * m, 2), answerText: `${dec(a * m, 2)}`, keys: ['.'] };
}

// ----- percentages -----
function percent() {
  const p = pick([10, 20, 25, 50, 75, 5, 30, 40, 60]);
  const step = 100 / gcd(p, 100); // smallest number whose p% is whole
  const n = step * int(1, Math.max(1, Math.floor(200 / step)));
  return whole(`${p}% of ${n}`, (p * n) / 100);
}

// ----- negative numbers -----
function negatives() {
  const a = int(-20, 20), b = int(1, 20);
  if (Math.random() < 0.5) return whole(`${neg(a)} + ${b}`, a + b);
  return whole(`${neg(a)} − ${b}`, a - b);
}

// ----- order of operations -----
function order() {
  const a = int(1, 10), b = int(2, 9), c = int(2, 9);
  switch (int(1, 4)) {
    case 1: return whole(`${a} + ${b} × ${c}`, a + b * c);
    case 2: return whole(`(${a} + ${b}) × ${c}`, (a + b) * c);
    case 3: return whole(`${b} × ${c} − ${a}`, b * c - a);
    default: return whole(`${a} + ${b * c} ÷ ${c}`, a + b);
  }
}

const GENERATORS = {
  add20: () => addSub(20),
  add100: () => addSub(100),
  muldiv: mulDiv,
  mix: () => (Math.random() < 0.5 ? addSub(100) : mulDiv()),
  fractions,
  decimals,
  percent,
  negatives,
  order,
};

export function makeQuestion(topic) {
  if (topic === 'everything') {
    const all = Object.keys(GENERATORS).filter((t) => t !== 'mix' && t !== 'add20');
    return GENERATORS[pick(all)]();
  }
  return (GENERATORS[topic] || GENERATORS.mix)();
}

// Read what the player typed: whole numbers, decimals, fractions like 3/4, negatives
function parseAnswer(text) {
  const s = String(text).replace(/−/g, '-');
  let m = s.match(/^(-?\d+)\/(\d+)$/);
  if (m) {
    const n = Number(m[1]), d = Number(m[2]);
    return d === 0 ? null : { value: n / d, n, d };
  }
  m = s.match(/^-?(\d+\.?\d*|\.\d+)$/);
  return m ? { value: Number(s) } : null;
}

export function checkAnswer(q, typed) {
  const a = parseAnswer(typed);
  if (!a || Math.abs(a.value - q.answer) > 1e-9) return false;
  // "Simplify" questions need the fraction fully reduced
  if (q.simplest && a.d !== undefined && gcd(Math.abs(a.n), a.d) !== 1) return false;
  return true;
}
