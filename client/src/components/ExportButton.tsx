import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { downloadFile } from "../lib/download";
import { ApiError } from "../lib/api";
import { useToast } from "../lib/toast";

/** Кнопка «Скачать для Excel»: CSV с точкой с запятой и BOM — открывается в Excel без настроек. */
export function ExportButton({ path, fallbackName, disabled }: { path: string | null; fallbackName: string; disabled?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!path || busy) return;
    setBusy(true);
    try {
      const name = await downloadFile(path, fallbackName);
      toast(`Файл «${name}» скачан`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не удалось скачать файл", true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className="btn btn-sm" onClick={run} disabled={disabled || !path || busy} aria-busy={busy}
      title="Таблица CSV — открывается в Excel и Google Таблицах">
      {busy ? <Loader2 size={15} className="spin" /> : <FileSpreadsheet size={15} />}
      Скачать для Excel
    </button>
  );
}
