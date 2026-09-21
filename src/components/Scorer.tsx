"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Case, CaseImage, Cortex } from "@/lib/cases";

const SCALE = [
  { value: 1, label: "No callus" },
  { value: 2, label: "Callus present" },
  { value: 3, label: "Bridging" },
  { value: 4, label: "Remodeled" },
];

type Scores = Record<string, number>;
type SaveState = "saved" | "saving" | "error";

interface Props {
  cases: Case[];
  initialScores: Scores;
  email: string;
  admin: boolean;
  demo?: boolean;
}

const key = (caseId: string, cortex: Cortex) => `${caseId}:${cortex}`;
const slotsOf = (c: Case): Cortex[] => [c.ap.left, c.ap.right, c.lat.left, c.lat.right];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export default function Scorer({ cases, initialScores, email, admin, demo = false }: Props) {
  const [scores, setScores] = useState<Scores>(initialScores);
  const countDone = useCallback(
    (c: Case, s: Scores) => slotsOf(c).filter((x) => s[key(c.id, x)]).length,
    [],
  );
  const [idx, setIdx] = useState(() => {
    const i = cases.findIndex((c) => countDone(c, initialScores) < 4);
    return i === -1 ? 0 : i;
  });
  const current = cases[idx];
  const slots = useMemo(() => (current ? slotsOf(current) : []), [current]);

  const firstOpenSlot = useCallback(
    (from: number, s: Scores) => {
      for (let i = 0; i < slots.length; i++) {
        const j = (from + i) % slots.length;
        if (!s[key(current.id, slots[j])]) return j;
      }
      return -1;
    },
    [current, slots],
  );
  const [active, setActive] = useState(() => (current ? Math.max(0, firstOpenSlot(0, initialScores)) : 0));

  /* ---------- saving ---------- */
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const pending = useRef(new Map<string, { caseId: string; cortex: Cortex; value: number }>());
  const inflight = useRef(0);

  const flush = useCallback(async () => {
    const items = [...pending.current.entries()];
    if (!items.length) return;
    pending.current.clear();
    inflight.current += items.length;
    setSaveState("saving");
    let failed = false;
    await Promise.all(
      items.map(async ([k, body]) => {
        try {
          const res = await fetch("/api/scores", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (res.status === 401) {
            window.location.href = "/login";
            return;
          }
          if (!res.ok) throw new Error(String(res.status));
        } catch {
          failed = true;
          if (!pending.current.has(k)) pending.current.set(k, body);
        } finally {
          inflight.current -= 1;
        }
      }),
    );
    if (inflight.current === 0) setSaveState(failed ? "error" : "saved");
  }, []);

  const setScore = useCallback(
    (caseId: string, cortex: Cortex, value: number, slotIndex: number) => {
      setScores((prev) => {
        const next = { ...prev, [key(caseId, cortex)]: value };
        const open = firstOpenSlot(slotIndex + 1, next);
        setActive(open === -1 ? Math.min(slotIndex + 1, slots.length - 1) : open);
        return next;
      });
      pending.current.set(key(caseId, cortex), { caseId, cortex, value });
      void flush();
    },
    [firstOpenSlot, flush, slots.length],
  );

  /* ---------- navigation ---------- */
  const goTo = useCallback(
    (i: number) => {
      if (i < 0 || i >= cases.length) return;
      setIdx(i);
      const c = cases[i];
      const s = slotsOf(c);
      const open = s.findIndex((x) => !scores[key(c.id, x)]);
      setActive(open === -1 ? 0 : open);
    },
    [cases, scores],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key >= "1" && e.key <= "4" && current) {
        e.preventDefault();
        setScore(current.id, slots[active], Number(e.key), active);
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        goTo(idx + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goTo(idx - 1);
      } else if (e.key === "Tab") {
        e.preventDefault();
        setActive((a) => (a + (e.shiftKey ? slots.length - 1 : 1)) % slots.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, current, goTo, idx, setScore, slots]);

  // Warm the browser cache for the next case.
  useEffect(() => {
    const next = cases[idx + 1];
    if (!next) return;
    for (const f of [next.ap.file, next.lat.file]) {
      const img = new Image();
      img.src = `/api/image/${encodeURIComponent(f)}`;
    }
  }, [cases, idx]);

  if (!current) {
    return (
      <main className="empty">
        <p>No cases found. Add image pairs to the Images folder (e.g. 1_AP_med.jpg and 1_Lat_post.jpg).</p>
      </main>
    );
  }

  const totalDone = cases.filter((c) => countDone(c, scores) === 4).length;

  return (
    <div className="app">
      <header className="bar">
        <div className="bar-left">
          <span className="brand">mRUST Scorer</span>
        </div>

        <div className="bar-center">
          <button type="button" className="nav" onClick={() => goTo(idx - 1)} disabled={idx === 0} aria-label="Previous case">
            <span className="arrow">&larr;</span> Previous
          </button>
          <div className="case-block">
            <span className="case-label">
              Case <strong>{idx + 1}</strong> of {cases.length}
            </span>
            <div className="dots" aria-label="Case progress">
              {cases.map((c, i) => {
                const n = countDone(c, scores);
                const cls = n === 4 ? "done" : n > 0 ? "partial" : "";
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`dot ${cls} ${i === idx ? "current" : ""}`}
                    title={`Case ${i + 1}: ${n}/4 scored`}
                    onClick={() => goTo(i)}
                  />
                );
              })}
            </div>
          </div>
          <button
            type="button"
            className="nav"
            onClick={() => goTo(idx + 1)}
            disabled={idx === cases.length - 1}
            aria-label="Next case"
          >
            Next <span className="arrow">&rarr;</span>
          </button>
        </div>

        <div className="bar-right">
          <span className={`save ${saveState}`}>
            {demo && "Demo · nothing is saved"}
            {!demo && saveState === "saved" && `Saved · ${totalDone}/${cases.length} complete`}
            {!demo && saveState === "saving" && "Saving…"}
            {!demo && saveState === "error" && (
              <>
                Save failed{" "}
                <button type="button" className="link" onClick={() => void flush()}>
                  Retry
                </button>
              </>
            )}
          </span>
          <span className="user" title={email}>
            {email}
          </span>
          {admin && (
            <a className="link" href="/admin">
              Admin
            </a>
          )}
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="link">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="views">
        <Panel
          image={current.ap}
          caseId={current.id}
          scores={scores}
          activeCortex={slots[active]}
          onScore={(cortex, v) => setScore(current.id, cortex, v, slots.indexOf(cortex))}
          onFocus={(cortex) => setActive(slots.indexOf(cortex))}
        />
        <Panel
          image={current.lat}
          caseId={current.id}
          scores={scores}
          activeCortex={slots[active]}
          onScore={(cortex, v) => setScore(current.id, cortex, v, slots.indexOf(cortex))}
          onFocus={(cortex) => setActive(slots.indexOf(cortex))}
        />
      </main>
    </div>
  );
}

interface PanelProps {
  image: CaseImage;
  caseId: string;
  scores: Scores;
  activeCortex: Cortex;
  onScore: (cortex: Cortex, value: number) => void;
  onFocus: (cortex: Cortex) => void;
}

function Panel({ image, caseId, scores, activeCortex, onScore, onFocus }: PanelProps) {
  const col = (cortex: Cortex) => (
    <div
      className={`cortex ${cortex === activeCortex ? "active" : ""}`}
      onMouseEnter={() => onFocus(cortex)}
    >
      <div className="cortex-name">{cap(cortex)}</div>
      {SCALE.map((s) => {
        const selected = scores[key(caseId, cortex)] === s.value;
        return (
          <button
            key={s.value}
            type="button"
            className={`score ${selected ? "selected" : ""}`}
            onClick={() => onScore(cortex, s.value)}
            aria-pressed={selected}
            aria-label={`${cap(cortex)} ${s.value}: ${s.label}`}
          >
            <span className="num">{s.value}</span>
            <span className="lbl">{s.label}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <section className="panel">
      <div className="panel-title">{image.view === "AP" ? "AP" : "Lateral"}</div>
      <div className="panel-body">
        {col(image.left)}
        <img src={`/api/image/${encodeURIComponent(image.file)}`} alt={`Case ${caseId} ${image.view}`} draggable={false} />
        {col(image.right)}
      </div>
    </section>
  );
}
