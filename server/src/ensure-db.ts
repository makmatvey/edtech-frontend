/**
 * Подготовка базы при запуске сервера (`npm run dev`, `npm start`) или вручную: `npm run db`.
 *
 * - нет базы → создаёт data/klasna.db в корне проекта и заполняет демо-данными;
 * - база есть → досоздаёт таблицы и добавляет программы 6, 8, 10 и 11 классов без сброса пользователей.
 *
 * Полный сброс к демо-данным на сегодняшнюю дату — отдельная команда `npm run seed`.
 */
import { DB_PATH, get, migrate } from "./db.js";
import { seed } from "./seed.js";
import { syncExtraCurricula } from "./services/curriculum-sync.js";
import { syncDemoFlipped } from "./services/flipped.js";
import { syncSeniorQuestions, syncShortQuestions } from "./services/quiz.js";
import { syncDemoTaskAssignments } from "./services/tasks.js";

export function ensureDb() {
  migrate();
  const n = Number(get("SELECT COUNT(*) AS n FROM users")?.n ?? 0);
  // Демо-аккаунты с известными паролями создаются сами только в разработке или по явному KLASNA_DEMO=1
  const autoSeed = process.env.NODE_ENV !== "production" || process.env.KLASNA_DEMO === "1";
  if (n === 0 && autoSeed) {
    console.log(`База пуста — создаю ${DB_PATH} и заполняю демо-данными…`);
    seed();
  } else if (n === 0) {
    console.warn(`База ${DB_PATH} пуста. В production демо-данные (аккаунты с паролем «demo») сами не создаются — задайте KLASNA_DEMO=1 или выполните npm run seed`);
  } else {
    syncExtraCurricula();
    syncDemoFlipped();
    syncShortQuestions();
    syncSeniorQuestions();
    syncDemoTaskAssignments();
    console.log(`База данных: ${DB_PATH} (пользователей: ${n}) — данные сохраняются между запусками`);
  }
}

if (process.argv[1] && /ensure-db\.(ts|js)$/.test(process.argv[1])) ensureDb();
