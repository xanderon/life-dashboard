"use client";
import { Pin, X } from "lucide-react";
import { useEffect, useState } from "react";
import s from "./school.module.css";
type Child = "Leon" | "Mina";
type Lesson = {
  id: string;
  child: Child;
  day: number;
  period: number;
  subject: string;
  note: string;
};
const DAYS = ["Lun", "Mar", "Mie", "Joi", "Vin"],
  TIMES = ["08:00", "09:00", "10:00", "11:00"],
  SUBJECTS = ["Română", "Matematică", "Engleză", "Științe", "Arte", "Sport"],
  KEY = "life-dashboard:school-timetable:v1";
const defaults: Lesson[] = (["Mina", "Leon"] as Child[]).flatMap((child, c) =>
  DAYS.slice(0, 5).flatMap((_, day) =>
    TIMES.map((__, period) => ({
      id: `${child}-${day}-${period}`,
      child,
      day,
      period,
      subject: SUBJECTS[(day * 2 + period + c) % SUBJECTS.length],
      note: day === 1 && period === c ? "Prezentare proiect" : "",
    })),
  ),
);
export function SchoolTimetable({ weekStart }: { weekStart: Date }) {
  const [lessons, setLessons] = useState(defaults),
    [editing, setEditing] = useState<Lesson | null>(null),
    [form, setForm] = useState({ subject: "", note: "" });
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const x = localStorage.getItem(KEY);
        if (x) setLessons(JSON.parse(x));
      } catch {}
    });
  }, []);
  useEffect(
    () => localStorage.setItem(KEY, JSON.stringify(lessons)),
    [lessons],
  );
  function edit(x: Lesson) {
    setEditing(x);
    setForm({ subject: x.subject, note: x.note });
    (
      document.getElementById("lesson-dialog") as HTMLDialogElement
    )?.showModal();
  }
  function close() {
    (document.getElementById("lesson-dialog") as HTMLDialogElement)?.close();
    setEditing(null);
  }
  function save() {
    if (!editing || !form.subject.trim()) return;
    setLessons((a) =>
      a.map((x) =>
        x.id === editing.id
          ? { ...x, subject: form.subject.trim(), note: form.note.trim() }
          : x,
      ),
    );
    close();
  }
  return (
    <section className={s.wrap}>
      <div className={s.bar}>
        <div>
          <b>Ore școală</b>
          <span>orar provizoriu · click pe o materie pentru editare</span>
        </div>
        <div>
          <i className={s.minaDot} />
          Mina
          <i className={s.leonDot} />
          Leon
        </div>
      </div>
      <div className={s.grid}>
        <div className={s.corner}>Ora</div>
        {DAYS.map((d, i) => (
          <header key={d}>
            <b>{d}</b>
            <span>{dateLabel(addDays(weekStart, i))}</span>
            <small>
              <i>Mina</i>
              <i>Leon</i>
            </small>
          </header>
        ))}
        <aside>
          {TIMES.map((_, i) => (
            <span key={i} style={{ top: `${(i / 4) * 100}%` }}>{8 + i}</span>
          ))}
        </aside>
        {DAYS.map((_, day) => (
          <div className={s.day} key={day}>
            <i className={s.divider} />
            {TIMES.map((__, period) =>
              (["Mina", "Leon"] as Child[]).map((child) => {
                const x = lessons.find(
                  (l) =>
                    l.child === child && l.day === day && l.period === period,
                );
                if (!x) return null;
                return (
                  <button
                    key={x.id}
                    className={child === "Mina" ? s.mina : s.leon}
                    style={{
                      top: `${period * 25 + 0.7}%`,
                      height: "23.6%",
                      left: child === "Mina" ? "1.5%" : "50.75%",
                    }}
                    onClick={() => edit(x)}
                    title={x.note || `Editează ${x.subject}`}
                  >
                    <strong>
                      {subjectEmoji(x.subject)} {x.subject}
                    </strong>
                    <small>
                      {TIMES[period]}–{String(9 + period).padStart(2, "0")}:00
                    </small>
                    {x.note ? (
                      <em>
                        <Pin size={10} fill="currentColor" /> {x.note}
                      </em>
                    ) : null}
                  </button>
                );
              }),
            )}
          </div>
        ))}
      </div>
      <dialog id="lesson-dialog" className={s.dialog}>
        <header>
          <div>
            <small>
              {editing
                ? `${editing.child} · ${DAYS[editing.day]} · ${TIMES[editing.period]}`
                : ""}
            </small>
            <h3>Editează materia</h3>
          </div>
          <button onClick={close}>
            <X size={18} />
          </button>
        </header>
        <label>
          Materie
          <input
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
          />
        </label>
        <label>
          Notiță / pin
          <textarea
            rows={3}
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="Test, proiect, ce trebuie adus…"
          />
        </label>
        <footer>
          <button onClick={close}>Renunță</button>
          <button className={s.save} onClick={save}>
            <Pin size={14} />
            Salvează
          </button>
        </footer>
      </dialog>
    </section>
  );
}
function subjectEmoji(x: string) {
  if (x === "Română") return "📖";
  if (x === "Matematică") return "🔢";
  if (x === "Engleză") return "🇬🇧";
  if (x === "Științe") return "🔬";
  if (x === "Arte") return "🎨";
  if (x === "Sport") return "⚽";
  return "📚";
}
function addDays(date: Date, amount: number) { const next = new Date(date); next.setDate(next.getDate() + amount); return next; }
function dateLabel(date: Date) { return new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short' }).format(date).replace('.', ''); }
