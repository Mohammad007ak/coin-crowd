// Small helpers shared by the simulation, the renderer and the UI.

export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const chance = (p) => Math.random() < p;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a, b, k) => a + (b - a) * k;

const toFa = (s) => String(s).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
export const fa = (n) => toFa(typeof n === "number" ? Math.round(n) : n);

export const SHAPES = ["coin", "square", "tri", "hex", "star"];
export const SHAPE_NAMES = { coin: "سکه‌ای", square: "چهارگوش", tri: "سه‌گوش", hex: "شش‌گوش", star: "ستاره‌ای" };

// Head colors: bright and flat, readable with an ink outline.
export const FACES = ["#ffffff", "#ffc53d", "#ff8a73", "#8fd0ff", "#7be0a8", "#c9a7ff", "#ff9bd2", "#ffe08a", "#a0e7e5", "#f6b26b"];
export const COLONY_COLORS = ["#ff4b3e", "#0a6cff", "#16b364", "#a855f7", "#f59e0b", "#ec4899", "#0ea5a4", "#64748b"];

const FIRST = [
  "آرش", "بهار", "کاوه", "نیلوفر", "سهراب", "پریسا", "داریوش", "شیرین", "بردیا", "مهسا", "رستم", "ترانه",
  "سیاوش", "آناهیتا", "فرهاد", "گلاره", "کوروش", "یاسمن", "بابک", "رها", "امید", "نگار", "پویا", "ستاره",
  "هومن", "سارا", "مانی", "لیلا", "بیژن", "مینا", "آرمان", "شبنم", "نوید", "الهه", "سامان", "پرستو", "جمشید",
  "ماهان", "غزل", "تیرداد", "آیدا", "پژمان", "شیوا", "رامین", "هستی", "سپهر", "دلارام", "کامیار", "نسترن",
];
const COLONY_WORDS = [
  "سکه‌داران", "طلوع", "کوه‌نشینان", "برادری", "آتش", "گندم‌زار", "سپید", "ستارگان", "چشمه", "باد", "سپر",
  "آهنین", "بلوط", "رودخانه", "خورشید", "ماه", "امید", "شیر", "عقاب", "یاس",
];

export function makeName(used) {
  const free = FIRST.filter((n) => !used.has(n));
  if (free.length) return pick(free);
  return `${pick(FIRST)} ${toFa(randInt(2, 99))}`;
}
export function makeColonyName(used) {
  const free = COLONY_WORDS.filter((n) => !used.has(`قبیله‌ی ${n}`));
  return `قبیله‌ی ${free.length ? pick(free) : `${pick(COLONY_WORDS)} ${toFa(randInt(2, 9))}`}`;
}

// Things people say, by situation. `{n}` becomes the other person's name.
export const LINES = {
  greet: ["سلام {n}!", "چطوری {n}؟", "روزت بخیر", "به‌به، {n}!"],
  chat: [
    "هوا عالیه امروز", "دیروز یه سکه پیدا کردم", "به نظرت خدا ما رو می‌بینه؟", "میوه‌ها امسال شیرینن",
    "باید یه خونه‌ی بزرگ‌تر بسازم", "شنیدی چی شد؟", "کار زیاده، وقت کم", "دلم یه سفر می‌خواد",
  ],
  like: ["تو خیلی باحالی", "خوشحالم دیدمت", "دوست خوبی هستی", "هر وقت کمک خواستی بگو"],
  insult: ["برو کنار!", "از تو خوشم نمیاد", "حرف نزن با من", "دماغت بزرگه", "تو دیگه کی هستی؟"],
  propose: ["{n}، با من ازدواج می‌کنی؟ 💍"],
  accept: ["آره! 💖", "معلومه که آره!"],
  reject: ["نه… ببخشید", "هنوز آماده نیستم"],
  fight: ["حالا نشونت میدم!", "بیا جلو!", "دیگه بسه!"],
  war: ["برای قبیله!", "حمله!", "عقب نمی‌کشیم!"],
  flee: ["کمک!", "فرار!", "ولم کن!"],
  pray: ["خدایا کمکمون کن 🙏", "خدایا ما رو ببخش", "ای خدای بزرگ…", "خدایا بارون بفرست"],
  pray_angry: ["خدایا چرا با ما این کارو می‌کنی؟!", "دیگه بهت اعتقاد ندارم!"],
  gold: ["طلا! 🤑", "مال منه!", "پولدار شدم!"],
  scared: ["وای!", "خدا عصبانیه!", "یا خدا!"],
  grief: ["نه… چرا؟", "دلم براش تنگ میشه 😢"],
  hungry: ["گشنمه…", "یه چیزی بخورم"],
  tired: ["خسته‌م… خواب", "Zzz"],
  work: ["کار کار کار", "یه سکه‌ی دیگه"],
  build: ["خونه‌ی خودم!", "آجر… آجر…"],
  steal: ["هیس…", "کسی ندید؟"],
  caught: ["دزد! دزد!", "آهای! پولمو بده!"],
  gift: ["بیا، این مال تو", "هدیه‌ی کوچیکه"],
  thanks: ["مرسی!", "تو فرشته‌ای!"],
  sick: ["حالم خوب نیست…", "اَه… سرفه"],
  baby: ["بچه‌مون! 👶", "خوش اومدی کوچولو"],
  blessed: ["خدایا شکرت! ✨", "معجزه!"],
};
export const say = (kind, other) => pick(LINES[kind] ?? [""]).replace("{n}", other?.name ?? "");
