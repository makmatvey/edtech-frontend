/** Демо-школа: ГУО «Средняя школа № 12 г. Минска» (вымышленная). */
export const SCHOOL_NAME = "Средняя школа № 12 г. Минска";

export const TEACHERS = [
  { login: "teacher", full: "Ковальчук Ирина Петровна", short: "Ковальчук И. П.", room: "214" },
  { login: "novik", full: "Новик Татьяна Сергеевна", short: "Новик Т. С.", room: "301" },
  { login: "lukashevich", full: "Лукашевич Ольга Викторовна", short: "Лукашевич О. В.", room: "305" },
  { login: "zhuk", full: "Жук Андрей Николаевич", short: "Жук А. Н.", room: "118" },
  { login: "melnik", full: "Мельник Дмитрий Александрович", short: "Мельник Д. А.", room: "207" },
  { login: "klimovich", full: "Климович Наталья Ивановна", short: "Климович Н. И.", room: "303" },
  { login: "savitskaya", full: "Савицкая Елена Михайловна", short: "Савицкая Е. М.", room: "121" },
];

export const CLASSES = [
  { name: "5А", grade: 5, homeroom: "novik", size: 22 },
  { name: "7Б", grade: 7, homeroom: "teacher", size: 24 },
  { name: "9А", grade: 9, homeroom: "melnik", size: 23 },
  { name: "11А", grade: 11, homeroom: "zhuk", size: 20 },
];

/** [класс, предмет, учитель, часов в неделю] */
export const ASSIGNMENTS: [string, string, string, number][] = [
  ["5А", "math", "teacher", 5],
  ["5А", "russian", "novik", 4],
  ["5А", "belarusian", "klimovich", 3],
  ["5А", "english", "lukashevich", 3],

  ["7Б", "algebra", "teacher", 3],
  ["7Б", "geometry", "teacher", 2],
  ["7Б", "russian", "novik", 3],
  ["7Б", "belarusian", "klimovich", 2],
  ["7Б", "english", "lukashevich", 3],
  ["7Б", "physics", "zhuk", 2],
  ["7Б", "history_by", "melnik", 2],
  ["7Б", "biology", "savitskaya", 2],

  ["9А", "algebra", "teacher", 3],
  ["9А", "geometry", "teacher", 2],
  ["9А", "russian", "novik", 2],
  ["9А", "belarusian", "klimovich", 2],
  ["9А", "english", "lukashevich", 3],
  ["9А", "physics", "zhuk", 2],
  ["9А", "history_by", "melnik", 2],
  ["9А", "biology", "savitskaya", 2],

  ["11А", "algebra", "teacher", 3],
  ["11А", "geometry", "teacher", 2],
  ["11А", "russian", "novik", 2],
  ["11А", "belarusian", "klimovich", 2],
  ["11А", "english", "lukashevich", 3],
  ["11А", "physics", "zhuk", 2],
  ["11А", "history_by", "melnik", 2],
  ["11А", "biology", "savitskaya", 2],
];

/** Расписание звонков */
export const BELLS: Record<number, [string, string]> = {
  1: ["08:30", "09:15"],
  2: ["09:25", "10:10"],
  3: ["10:25", "11:10"],
  4: ["11:25", "12:10"],
  5: ["12:20", "13:05"],
  6: ["13:15", "14:00"],
  7: ["14:10", "14:55"],
};

/** Демо-ученик (логин student) — 7Б */
export const DEMO_STUDENT = { full: "Шевчук Алеся Андреевна", short: "Алеся Шевчук", className: "7Б" };
/** Демо-ученик 11 класса (логин student11) — для подготовки к ЦТ/ЦЭ */
export const DEMO_STUDENT_11 = { full: "Карпович Даниил Сергеевич", short: "Даниил Карпович", className: "11А", login: "student11" };

const MALE_FIRST = ["Артём", "Максим", "Матвей", "Иван", "Михаил", "Даниил", "Кирилл", "Егор", "Никита", "Владислав", "Тимофей", "Глеб", "Алексей", "Марк", "Ярослав", "Павел", "Денис", "Захар"];
const FEMALE_FIRST = ["Анастасия", "Мария", "София", "Дарья", "Полина", "Виктория", "Варвара", "Ева", "Алиса", "Ксения", "Елизавета", "Арина", "Вероника", "Милана", "Ульяна", "Яна", "Диана", "Василиса"];
/** Фамилии, одинаковые для обоих полов (типично белорусские) */
const NEUTRAL_LAST = ["Ковальчук", "Шевчук", "Мартинкевич", "Савчук", "Левчук", "Бондаренко", "Кравченко", "Лукашевич", "Жук", "Карпович", "Мисюк", "Шумский", "Гриневич", "Дубовик", "Юрченко", "Петрович", "Сидорович", "Мороз", "Сокол", "Борисевич", "Ярошевич", "Ткачук", "Козлович", "Радкевич", "Якимович", "Олешкевич", "Гурин", "Пашкевич"];
const GENDERED_LAST: [string, string][] = [["Новиков", "Новикова"], ["Кузнецов", "Кузнецова"], ["Соколовский", "Соколовская"], ["Белов", "Белова"], ["Захаров", "Захарова"], ["Высоцкий", "Высоцкая"]];
const MALE_PATR = ["Андреевич", "Сергеевич", "Александрович", "Дмитриевич", "Игоревич", "Викторович", "Олегович", "Николаевич"];
const FEMALE_PATR = ["Андреевна", "Сергеевна", "Александровна", "Дмитриевна", "Игоревна", "Викторовна", "Олеговна", "Николаевна"];

export function makeName(rand: () => number, used: Set<string>) {
  for (;;) {
    const female = rand() < 0.5;
    const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
    const first = pick(female ? FEMALE_FIRST : MALE_FIRST);
    let last: string;
    if (rand() < 0.8) last = pick(NEUTRAL_LAST);
    else last = pick(GENDERED_LAST)[female ? 1 : 0];
    const patr = pick(female ? FEMALE_PATR : MALE_PATR);
    const full = `${last} ${first} ${patr}`;
    if (used.has(`${last} ${first}`)) continue;
    used.add(`${last} ${first}`);
    return { full, short: `${first} ${last}` };
  }
}
