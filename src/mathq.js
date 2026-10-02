// Math questions for Race mode's Math mode. The host picks the topic.

export const MATH_TOPICS = {
  add20: 'Add & subtract (to 20)',
  add100: 'Add & subtract (to 100)',
  muldiv: 'Multiply & divide (to 12 × 12)',
  mix: 'Mixed (all four)',
};

const int = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

function addSub(max) {
  if (Math.random() < 0.5) {
    const a = int(0, max), b = int(0, max - a);
    return { text: `${a} + ${b}`, answer: a + b };
  }
  const a = int(1, max), b = int(0, a);
  return { text: `${a} − ${b}`, answer: a - b };
}

function mulDiv() {
  const a = int(1, 12), b = int(1, 12);
  if (Math.random() < 0.5) return { text: `${a} × ${b}`, answer: a * b };
  return { text: `${a * b} ÷ ${b}`, answer: a };
}

export function makeQuestion(topic) {
  switch (topic) {
    case 'add20': return addSub(20);
    case 'add100': return addSub(100);
    case 'muldiv': return mulDiv();
    default: return Math.random() < 0.5 ? addSub(100) : mulDiv();
  }
}
