'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabaseClient';

type PlanItem = {
  id: string;
  label: ReactNode;
};

type PlanDay = {
  key: string;
  dayLabel: string;
  dateLabel: string;
  morning: PlanItem[];
  lunch: PlanItem[];
  evening: PlanItem[];
};

const PLAN_KEY = 'cervical-2026';

const MEDS = [
  {
    icon: '🛡️🫃',
    name: 'OMEZ 20 mg',
    dose: '1 cps/zi',
    duration: '10 zile',
    note: 'Protecție gastrică - înainte de antiinflamator',
  },
  {
    icon: '💊🔥',
    name: 'TRATUL PLUS',
    dose: '1 cp/zi',
    duration: '10 zile',
    note: 'Antiinflamator - scade inflamația',
  },
  {
    icon: '🧠⚡',
    name: 'TIOBEC DOL',
    dose: '2 cp/zi',
    duration: '10 zile',
    note: 'Suport nervos - ajută nervul',
  },
  {
    icon: '💪😌',
    name: 'MYDOCALM 150 mg',
    dose: '1 cp/zi',
    duration: '5 zile',
    note: 'Relaxant muscular - reduce spasmul',
  },
  {
    icon: '🧴🔥',
    name: 'SINDOLOR GEL',
    dose: '3 aplicări/zi',
    duration: '10 zile',
    note: 'Local - antiinflamator',
  },
];

const PLAN_DAYS: PlanDay[] = [
  {
    key: 'day-01',
    dayLabel: 'Ziua 1',
    dateLabel: '16 Ian',
    morning: [
      { id: 'tiobec', label: '🧠 Tiobec Dol (1 cp)' },
      { id: 'mydocalm', label: '💪 Mydocalm 150 mg (1 cp)' },
      { id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' },
    ],
    lunch: [
      { id: 'omez', label: '🛡️ Omez 20 mg (1 cps)' },
      { id: 'tratul', label: '💊 TratUL Plus (1 cp)' },
      { id: 'tiobec', label: '🧠 Tiobec Dol (1 cp)' },
      { id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' },
    ],
    evening: [{ id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' }],
  },
  {
    key: 'day-02',
    dayLabel: 'Ziua 2',
    dateLabel: '17 Ian',
    morning: [
      { id: 'tiobec', label: '🧠 Tiobec Dol (1 cp)' },
      { id: 'mydocalm', label: '💪 Mydocalm 150 mg (1 cp)' },
      { id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' },
    ],
    lunch: [
      { id: 'omez', label: '🛡️ Omez 20 mg (1 cps)' },
      { id: 'tratul', label: '💊 TratUL Plus (1 cp)' },
      { id: 'tiobec', label: '🧠 Tiobec Dol (1 cp)' },
      { id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' },
    ],
    evening: [{ id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' }],
  },
  {
    key: 'day-03',
    dayLabel: 'Ziua 3',
    dateLabel: '18 Ian',
    morning: [
      { id: 'tiobec', label: '🧠 Tiobec Dol (1 cp)' },
      { id: 'mydocalm', label: '💪 Mydocalm 150 mg (1 cp)' },
      { id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' },
    ],
    lunch: [
      { id: 'omez', label: '🛡️ Omez 20 mg (1 cps)' },
      { id: 'tratul', label: '💊 TratUL Plus (1 cp)' },
      { id: 'tiobec', label: '🧠 Tiobec Dol (1 cp)' },
      { id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' },
    ],
    evening: [{ id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' }],
  },
  {
    key: 'day-04',
    dayLabel: 'Ziua 4',
    dateLabel: '19 Ian',
    morning: [
      { id: 'tiobec', label: '🧠 Tiobec Dol (1 cp)' },
      { id: 'mydocalm', label: '💪 Mydocalm 150 mg (1 cp)' },
      { id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' },
    ],
    lunch: [
      { id: 'omez', label: '🛡️ Omez 20 mg (1 cps)' },
      { id: 'tratul', label: '💊 TratUL Plus (1 cp)' },
      { id: 'tiobec', label: '🧠 Tiobec Dol (1 cp)' },
      { id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' },
    ],
    evening: [{ id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' }],
  },
  {
    key: 'day-05',
    dayLabel: 'Ziua 5',
    dateLabel: '20 Ian',
    morning: [
      { id: 'tiobec', label: '🧠 Tiobec Dol (1 cp)' },
      {
        id: 'mydocalm',
        label: (
          <span>
            💪 Mydocalm 150 mg (1 cp) <span className="pill">ultima zi</span>
          </span>
        ),
      },
      { id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' },
    ],
    lunch: [
      { id: 'omez', label: '🛡️ Omez 20 mg (1 cps)' },
      { id: 'tratul', label: '💊 TratUL Plus (1 cp)' },
      { id: 'tiobec', label: '🧠 Tiobec Dol (1 cp)' },
      { id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' },
    ],
    evening: [{ id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' }],
  },
  {
    key: 'day-06',
    dayLabel: 'Ziua 6',
    dateLabel: '21 Ian',
    morning: [
      { id: 'tiobec', label: '🧠 Tiobec Dol (1 cp)' },
      { id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' },
    ],
    lunch: [
      { id: 'omez', label: '🛡️ Omez 20 mg (1 cps)' },
      { id: 'tratul', label: '💊 TratUL Plus (1 cp)' },
      { id: 'tiobec', label: '🧠 Tiobec Dol (1 cp)' },
      { id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' },
    ],
    evening: [{ id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' }],
  },
  {
    key: 'day-07',
    dayLabel: 'Ziua 7',
    dateLabel: '22 Ian',
    morning: [
      { id: 'tiobec', label: '🧠 Tiobec Dol (1 cp)' },
      { id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' },
    ],
    lunch: [
      { id: 'omez', label: '🛡️ Omez 20 mg (1 cps)' },
      { id: 'tratul', label: '💊 TratUL Plus (1 cp)' },
      { id: 'tiobec', label: '🧠 Tiobec Dol (1 cp)' },
      { id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' },
    ],
    evening: [{ id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' }],
  },
  {
    key: 'day-08',
    dayLabel: 'Ziua 8',
    dateLabel: '23 Ian',
    morning: [
      { id: 'tiobec', label: '🧠 Tiobec Dol (1 cp)' },
      { id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' },
    ],
    lunch: [
      { id: 'omez', label: '🛡️ Omez 20 mg (1 cps)' },
      { id: 'tratul', label: '💊 TratUL Plus (1 cp)' },
      { id: 'tiobec', label: '🧠 Tiobec Dol (1 cp)' },
      { id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' },
    ],
    evening: [{ id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' }],
  },
  {
    key: 'day-09',
    dayLabel: 'Ziua 9',
    dateLabel: '24 Ian',
    morning: [
      { id: 'tiobec', label: '🧠 Tiobec Dol (1 cp)' },
      { id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' },
    ],
    lunch: [
      { id: 'omez', label: '🛡️ Omez 20 mg (1 cps)' },
      { id: 'tratul', label: '💊 TratUL Plus (1 cp)' },
      { id: 'tiobec', label: '🧠 Tiobec Dol (1 cp)' },
      { id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' },
    ],
    evening: [{ id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' }],
  },
  {
    key: 'day-10',
    dayLabel: 'Ziua 10',
    dateLabel: '25 Ian',
    morning: [
      { id: 'tiobec', label: '🧠 Tiobec Dol (1 cp)' },
      { id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' },
    ],
    lunch: [
      { id: 'omez', label: '🛡️ Omez 20 mg (1 cps)' },
      { id: 'tratul', label: '💊 TratUL Plus (1 cp)' },
      { id: 'tiobec', label: '🧠 Tiobec Dol (1 cp)' },
      { id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' },
    ],
    evening: [{ id: 'sindolor', label: '🧴 Sindolor gel (1 aplicare)' }],
  },
];

export default function TratamentCervicalPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (!alive) return;
      if (userErr || !userData.user) {
        setErr('Nu ești autentificat.');
        setLoading(false);
        return;
      }
      setUserId(userData.user.id);

      const { data, error } = await supabase
        .from('treatment_checkmarks')
        .select('item_key,checked')
        .eq('user_id', userData.user.id)
        .eq('plan_key', PLAN_KEY);

      if (!alive) return;
      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }

      const next: Record<string, boolean> = {};
      (data ?? []).forEach((row: any) => {
        next[row.item_key] = Boolean(row.checked);
      });
      setCheckedMap(next);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const handleToggle = async (itemKey: string, checked: boolean) => {
    setCheckedMap((prev) => ({ ...prev, [itemKey]: checked }));
    if (!userId) return;

    const { error } = await supabase.from('treatment_checkmarks').upsert(
      {
        user_id: userId,
        plan_key: PLAN_KEY,
        item_key: itemKey,
        checked,
      },
      { onConflict: 'user_id,plan_key,item_key' }
    );

    if (error) {
      setErr(error.message);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--bg)]">
      <div className="treatmentPage">
        <div className="page">
          <div className="topbar">
            <Link className="backlink" href="/">
              ← Înapoi
            </Link>
            <div className="status">
              {loading ? 'Se încarcă…' : err ? 'Eroare' : 'Sincronizat'}
            </div>
          </div>

          {err ? <div className="error">{err}</div> : null}

          <h1>
            📋 Plan tratament - 10 zile <span className="pill">Ziua 1 = 16 ianuarie</span>
          </h1>
          <div className="sub">Afectiune disc cervical 2026</div>

          <div className="meds">
            <h2>Medicație</h2>
            {MEDS.map((med) => (
              <div className="med" key={med.name}>
                <span className="medIcon">{med.icon}</span>
                <b>{med.name}</b> - <b>{med.dose}</b>, <b>{med.duration}</b>
                <span className="small">{med.note}</span>
              </div>
            ))}
          </div>

          <table>
            <thead>
              <tr>
                <th className="day">Ziua</th>
                <th className="col">Dimineața</th>
                <th className="col">Prânz</th>
                <th className="col">Seara</th>
              </tr>
            </thead>
            <tbody>
              {PLAN_DAYS.map((day) => (
                <tr key={day.key}>
                  <td className="day">
                    {day.dayLabel}
                    <br />
                    <span className="pill">{day.dateLabel}</span>
                  </td>
                  <td>
                    {day.morning.map((item) => {
                      const itemKey = `${day.key}-morning-${item.id}`;
                      return (
                        <label className="cellline" key={itemKey}>
                          <input
                            type="checkbox"
                            checked={Boolean(checkedMap[itemKey])}
                            onChange={(e) => handleToggle(itemKey, e.target.checked)}
                            disabled={loading}
                          />
                          <span>{item.label}</span>
                        </label>
                      );
                    })}
                  </td>
                  <td>
                    {day.lunch.map((item) => {
                      const itemKey = `${day.key}-lunch-${item.id}`;
                      return (
                        <label className="cellline" key={itemKey}>
                          <input
                            type="checkbox"
                            checked={Boolean(checkedMap[itemKey])}
                            onChange={(e) => handleToggle(itemKey, e.target.checked)}
                            disabled={loading}
                          />
                          <span>{item.label}</span>
                        </label>
                      );
                    })}
                  </td>
                  <td>
                    {day.evening.map((item) => {
                      const itemKey = `${day.key}-evening-${item.id}`;
                      return (
                        <label className="cellline" key={itemKey}>
                          <input
                            type="checkbox"
                            checked={Boolean(checkedMap[itemKey])}
                            onChange={(e) => handleToggle(itemKey, e.target.checked)}
                            disabled={loading}
                          />
                          <span>{item.label}</span>
                        </label>
                      );
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <style jsx>{`
        .treatmentPage {
          color: var(--text);
          font: 14px/1.35 var(--font-geist-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI',
            Roboto, Arial, Helvetica, sans-serif;
          padding: 24px;
        }

        .page {
          max-width: 980px;
          margin: 0 auto;
          background: linear-gradient(160deg, rgba(27, 66, 66, 0.9), rgba(9, 38, 53, 0.95));
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 20px;
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
        }

        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }

        .backlink {
          font-size: 13px;
          text-decoration: underline;
          color: var(--accent);
        }

        .status {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--muted);
        }

        .error {
          margin: 8px 0 14px 0;
          padding: 10px 12px;
          border: 1px solid rgba(255, 123, 123, 0.6);
          background: rgba(255, 123, 123, 0.12);
          color: var(--danger);
          border-radius: 8px;
          font-size: 12px;
        }

        h1 {
          font-size: 22px;
          margin: 0 0 12px 0;
          letter-spacing: 0.2px;
        }

        .sub {
          margin: 0 0 18px 0;
          color: var(--muted);
          font-size: 13px;
        }

        .meds {
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 14px 14px 10px 14px;
          margin: 0 0 18px 0;
          background: var(--panel-2);
        }

        .meds h2 {
          font-size: 15px;
          margin: 0 0 10px 0;
        }

        .med {
          margin: 0 0 8px 0;
          padding: 8px 10px;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--panel);
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
        }

        .med b {
          font-weight: 700;
        }

        .medIcon {
          font-size: 16px;
        }

        .med .small {
          color: var(--muted);
          font-size: 12px;
          margin-left: 6px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
          background: var(--panel);
        }

        thead th {
          background: rgba(21, 53, 54, 0.9);
          font-weight: 700;
          text-align: left;
          padding: 10px;
          border-bottom: 1px solid var(--border);
          font-size: 13px;
        }

        tbody td {
          vertical-align: top;
          padding: 10px;
          border-top: 1px solid var(--border);
          border-right: 1px solid var(--border);
          white-space: pre-line;
        }

        tbody td:last-child {
          border-right: none;
        }

        .day {
          width: 16%;
          font-weight: 700;
        }

        .col {
          width: 28%;
        }

        .cellline {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          margin: 0 0 6px 0;
        }

        .cellline:last-child {
          margin-bottom: 0;
        }

        .cellline input[type='checkbox'] {
          width: 18px;
          height: 18px;
          margin-top: 1px;
          accent-color: var(--accent);
          cursor: pointer;
          flex: 0 0 auto;
        }

        .pill {
          display: inline-block;
          border: 1px solid var(--border);
          border-radius: 999px;
          padding: 2px 8px;
          font-size: 12px;
          color: var(--text);
          background: var(--panel-2);
          margin-left: 6px;
          white-space: nowrap;
        }

        @media print {
          .treatmentPage {
            padding: 0;
          }
          .page {
            max-width: none;
            margin: 0;
            padding: 18mm 14mm;
            box-shadow: none;
          }
          table {
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
        }
      `}</style>
    </main>
  );
}
