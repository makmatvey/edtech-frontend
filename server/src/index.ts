import { createApp } from "./app.js";
import { scheduleAuditPrune } from "./audit.js";
import { BACKUP_DIR, backupIntervalHours, scheduleBackups } from "./backup.js";
import { ensureDb } from "./ensure-db.js";
import { MATERIALS_DIR, ensureDemoMaterials, ensureMaterialFolders, sectionsSummary } from "./services/materials.js";

ensureDb();
ensureMaterialFolders();
ensureDemoMaterials();
scheduleAuditPrune();
if (scheduleBackups()) console.log(`Резервные копии базы: каждые ${backupIntervalHours()} ч → ${BACKUP_DIR}`);
console.log(`Материалы: ${MATERIALS_DIR} (${sectionsSummary().map((s) => `${s.title}: ${s.count}`).join(", ")})`);

const PORT = Number(process.env.PORT ?? 3001);
createApp().listen(PORT, () => console.log(`API «Класны»: http://localhost:${PORT}`));
