import { useEffect, useRef, useState } from "react";
import { Camera, Check, Lock, Pin, Trash2 } from "lucide-react";
import { useApi, useTitle } from "../lib/hooks";
import { useAuth } from "../lib/auth";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { Load, PageHead, Panel } from "../components/ui";
import { Medal, ProfileBg, Showcase, UserAvatar } from "../components/ProfileBits";
import { days, plural } from "../lib/format";

type Ach = { id: string; group: string; title: string; hint: string; tier: string; target: number; value: number; earned: boolean };
type Frame = { id: string; title: string; hint: string; short: string; progress: string; unlocked: boolean };
type Bg = { id: string; title: string; target: number; value: number; unlocked: boolean };
type Data = {
  avatar: string | null; frame: string | null; showcase: string[]; background: string | null;
  stats?: { best: number; tasks: number; hwDone: number; checks: number; exams: number; avg: number; xp: number };
  achievements: Ach[]; frames: Frame[]; backgrounds: Bg[]; maxShowcase?: number;
};
type Look = { avatar: string | null; frame: string | null; showcase: string[]; background: string | null };
type Tab = "bg" | "frame";

/** Фото → квадрат 192×192 (центр кадра), JPEG — лёгкий data URL для базы */
async function toAvatar(file: File): Promise<string> {
  if (!/^image\//.test(file.type)) throw new Error("Выберите картинку: JPG, PNG или WebP");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error("Не получилось открыть картинку"));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement("canvas");
    c.width = c.height = 192;
    c.getContext("2d")!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 192, 192);
    return c.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Телефон: превью профиля компактное (меньше аватар) */
function useNarrow() {
  const q = "(max-width: 900px)";
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setNarrow(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return narrow;
}

const tasksWord = (n: number) => `${n} ${plural(n, "задание", "задания", "заданий")}`;

export default function ProfilePage() {
  const { user, patchUser } = useAuth();
  useTitle("Профиль");
  const toast = useToast();
  const state = useApi<Data>("/profile");
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("bg");
  const narrow = useNarrow();
  if (!user) return null;
  const student = user.role === "student";

  async function save(body: Partial<Look>, ok?: string) {
    setBusy(true);
    try {
      const look = await api<Look>("/profile", { method: "PUT", body });
      patchUser(look);
      state.setData((d) => d && { ...d, ...look });
      if (ok) toast(ok);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не получилось сохранить", true);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    try {
      await save({ avatar: await toAvatar(f) }, "Фото обновлено");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не получилось загрузить фото", true);
    } finally {
      if (file.current) file.current.value = "";
    }
  }

  return (
    <>
      <PageHead title="Профиль" />
      <Load state={state}>
        {(d) => {
          const max = d.maxShowcase ?? 3;
          const earned = d.achievements.filter((a) => a.earned);
          const toggleShow = (a: Ach) => {
            if (!a.earned) { toast(`«${a.title}»: ${a.hint.toLowerCase()} — ${a.value} из ${a.target}`); return; }
            const on = d.showcase.includes(a.id);
            const next = on ? d.showcase.filter((x) => x !== a.id) : [...d.showcase, a.id];
            if (next.length > max) { toast(`На витрине ${max} места — сначала уберите одно`, true); return; }
            save({ showcase: next });
          };
          const preview = (
            <div className="pf-card">
              <ProfileBg id={d.background} className="pf-banner" />
              <div className="pf-body">
                <div className="pf-ava"><UserAvatar name={user.shortName} id={user.id} src={d.avatar} frame={d.frame} size={narrow && user.role === "student" ? 60 : 96} /></div>
                <h2>{user.shortName}</h2>
                <p className="muted small">{student ? `${user.className} класс` : user.className ? `Учитель · кл. рук. ${user.className}` : "Учитель"}</p>
                {student && <div className="pf-show">{d.showcase.length ? <Showcase ids={d.showcase} size={34} /> : <span className="tiny muted">витрина пуста</span>}</div>}
                {student && d.stats && (
                  <div className="pf-stats">
                    <span><b className="num">{days(d.stats.best)}</b><small>лучшая серия</small></span>
                    <span><b className="num">{earned.length}</b><small>достижений</small></span>
                    <span><b className="num">{d.stats.tasks}</b><small>заданий</small></span>
                  </div>
                )}
                <div className="row wrap" style={{ gap: 8, justifyContent: "center", marginTop: 14 }}>
                  <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => onFile(e.target.files?.[0])} />
                  <button className="btn btn-sm" disabled={busy} onClick={() => file.current?.click()}><Camera size={15} /> {d.avatar ? "Сменить фото" : "Добавить фото"}</button>
                  {d.avatar && <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => save({ avatar: null }, "Фото удалено")} aria-label="Удалить фото"><Trash2 size={15} /></button>}
                </div>
              </div>
            </div>
          );
          if (!student) return <div className="pf-top teacher">{preview}</div>;

          return (
            <div className="stack" style={{ gap: 20 }}>
              <div className="pf-top">
                {preview}
                <section className="pf-custom" aria-label="Оформление профиля">
                  <div className="pf-tabs" role="tablist">
                    {([["bg", "Фон"], ["frame", "Рамка"]] as [Tab, string][]).map(([k, l]) => (
                      <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
                    ))}
                  </div>
                  <p className="pf-note">
                    {tab === "bg" && <>Открываются за задания — у вас <b>{tasksWord(d.stats?.tasks ?? 0)}</b></>}
                    {tab === "frame" && <>Открываются за отметки этой четверти</>}
                  </p>

                  {tab === "bg" && (
                    <ul className="pf-opts bgs">
                      {d.backgrounds.map((b) => {
                        const on = (d.background ?? "grid") === b.id;
                        return (
                          <li key={b.id}>
                            <button type="button" className={`pf-opt ${on ? "on" : ""} ${b.unlocked ? "" : "locked"}`} disabled={busy}
                              title={b.unlocked ? b.title : `${b.title}: откроется за ${tasksWord(b.target)}`}
                              onClick={() => b.unlocked ? save({ background: b.id }) : toast(`«${b.title}» откроется за ${tasksWord(b.target)} — у вас ${b.value}`)}>
                              <ProfileBg id={b.id} className="pf-swatch">{!b.unlocked && <span className="pf-lockmark"><Lock size={14} /></span>}{on && <span className="pf-check"><Check size={14} /></span>}</ProfileBg>
                              <span className="pf-opt-t">{b.title}</span>
                              {!b.unlocked && <span className="pf-opt-s">{b.value}/{b.target}</span>}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {tab === "frame" && (
                    <ul className="pf-opts frames">
                      <li>
                        <button type="button" className={`pf-opt ${!d.frame ? "on" : ""}`} disabled={busy} onClick={() => save({ frame: null })}>
                          <span className="pf-fr"><UserAvatar name={user.shortName} id={user.id} src={d.avatar} size={46} /></span>
                          <span className="pf-opt-t">Без рамки</span>
                        </button>
                      </li>
                      {d.frames.map((f) => (
                        <li key={f.id}>
                          <button type="button" className={`pf-opt ${d.frame === f.id ? "on" : ""} ${f.unlocked ? "" : "locked"}`} disabled={busy}
                            title={f.unlocked ? f.title : `${f.title}: ${f.hint.toLowerCase()} (${f.progress})`}
                            onClick={() => f.unlocked ? save({ frame: f.id }) : toast(`«${f.title}»: ${f.hint.toLowerCase()} — ${f.progress}`)}>
                            <span className="pf-fr"><UserAvatar name={user.shortName} id={user.id} src={d.avatar} frame={f.id} size={46} />{!f.unlocked && <span className="pf-lockmark"><Lock size={12} /></span>}</span>
                            <span className="pf-opt-t">{f.title}</span>
                            {!f.unlocked && <span className="pf-opt-s">{f.short}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                </section>
              </div>

              <Panel className="note" title="Достижения" hint={`${earned.length} из ${d.achievements.length}`} pad>
                <p className="pf-note ach-note"><Pin size={13} /> Нажмите на полученное достижение — оно встанет на витрину (до {max}). Её видят одноклассники.</p>
                <ul className="ach-grid">
                  {[...d.achievements].sort((x, y) => Number(y.earned) - Number(x.earned)).map((a) => {
                    const on = d.showcase.includes(a.id);
                    return (
                      <li key={a.id}>
                        <button type="button" className={`ach ${a.earned ? "" : "locked"} ${on ? "on" : ""}`} disabled={busy}
                          onClick={() => toggleShow(a)} title={`${a.hint}${a.earned ? (on ? " · на витрине" : " · нажмите, чтобы поставить на витрину") : ` · ${a.value} из ${a.target}`}`}
                          aria-label={`${a.title}: ${a.hint}`}>
                          <span className="ach-ic"><Medal id={a.id} size={52} locked={!a.earned} />{on && <span className="ach-pin"><Pin size={11} /></span>}</span>
                          <b>{a.title}</b>
                          {!a.earned && <small className="ach-n">{a.value} / {a.target}</small>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            </div>
          );
        }}
      </Load>
    </>
  );
}
