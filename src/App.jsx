import { useState, useEffect, useRef, useCallback } from "react";

// ---------- design tokens ----------
const T = {
  bg: "#0b0c0f",
  panel: "#12141a",
  panel2: "#171a21",
  line: "#22252d",
  ink: "#e9eaee",
  dim: "#7f8592",
  pro: "#5fb6f0",
  con: "#f0785c",
};

// cell pen colors: none, dropped, winning, flag, voter
const PENS = [
  { name: "no color", bg: "transparent", dot: "#3a3f4a", border: "transparent" },
  { name: "dropped", bg: "rgba(229,84,66,0.13)", dot: "#e55442", border: "rgba(229,84,66,0.45)" },
  { name: "winning", bg: "rgba(78,199,138,0.12)", dot: "#4ec78a", border: "rgba(78,199,138,0.45)" },
  { name: "flag", bg: "rgba(232,193,90,0.12)", dot: "#e8c15a", border: "rgba(232,193,90,0.45)" },
  { name: "voter", bg: "rgba(176,140,240,0.13)", dot: "#b08cf0", border: "rgba(176,140,240,0.45)" },
];

// public forum speech columns for each flow sheet
const COLS = {
  pro: [
    { label: "pro case", side: "pro" },
    { label: "con rebuttal", side: "con" },
    { label: "pro summary", side: "pro" },
    { label: "con summary", side: "con" },
    { label: "pro final focus", side: "pro" },
    { label: "con final focus", side: "con" },
  ],
  con: [
    { label: "con case", side: "con" },
    { label: "pro rebuttal", side: "pro" },
    { label: "con summary", side: "con" },
    { label: "pro summary", side: "pro" },
    { label: "con final focus", side: "con" },
    { label: "pro final focus", side: "pro" },
  ],
};

const SPEECH_TIMES = [
  { label: "constructive", secs: 240 },
  { label: "rebuttal", secs: 240 },
  { label: "summary", secs: 180 },
  { label: "final focus", secs: 120 },
  { label: "crossfire", secs: 180 },
  { label: "grand crossfire", secs: 180 },
];

const uid = () => Math.random().toString(36).slice(2, 10);

const newRow = (label = "") => ({
  id: uid(),
  label,
  cells: Array.from({ length: 6 }, () => ({ t: "", c: 0 })),
});

const newRound = (n = 1) => ({
  id: uid(),
  name: `round ${n}`,
  topic: "",
  flows: {
    pro: { rows: [newRow("contention 1"), newRow("contention 2")] },
    con: { rows: [newRow("contention 1"), newRow("contention 2")] },
  },
  cx: { cx1: "", cx2: "", gcx: "" },
  judge: { points: { pro1: "", pro2: "", con1: "", con2: "" }, winner: "", rfd: "" },
  prep: { pro: 180, con: 180 },
});

// migrate older saved rounds to the current shape
const normalizeRound = (r) => ({
  ...r,
  cx: typeof r.cx === "string" ? { cx1: r.cx || "", cx2: "", gcx: "" } : { cx1: "", cx2: "", gcx: "", ...(r.cx || {}) },
  judge: r.judge || { points: { pro1: "", pro2: "", con1: "", con2: "" }, winner: "", rfd: "" },
});

const CX_SECTIONS = [
  { key: "cx1", label: "first crossfire", hint: "after constructives — first speakers" },
  { key: "cx2", label: "second crossfire", hint: "after rebuttals — second speakers" },
  { key: "gcx", label: "grand crossfire", hint: "after summaries — all four speakers" },
];

const SPEAKERS = [
  { key: "pro1", label: "pro speaker 1", side: "pro" },
  { key: "pro2", label: "pro speaker 2", side: "pro" },
  { key: "con1", label: "con speaker 1", side: "con" },
  { key: "con2", label: "con speaker 2", side: "con" },
];

const fmt = (s) => {
  const m = Math.floor(Math.abs(s) / 60);
  const r = Math.abs(s) % 60;
  return `${s < 0 ? "-" : ""}${m}:${String(r).padStart(2, "0")}`;
};

// ---------- beep ----------
let audioCtx = null;
const beep = () => {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach((d) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = 880;
      o.type = "sine";
      g.gain.setValueAtTime(0.15, audioCtx.currentTime + d);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + d + 0.2);
      o.connect(g).connect(audioCtx.destination);
      o.start(audioCtx.currentTime + d);
      o.stop(audioCtx.currentTime + d + 0.22);
    });
  } catch (e) {}
};

// ---------- auto-growing textarea ----------
function Cell({ value, color, onText, onColor, onNewRow, placeholder }) {
  const ref = useRef(null);
  const grow = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.max(72, el.scrollHeight) + "px";
  };
  useEffect(grow, [value]);
  const pen = PENS[color] || PENS[0];
  return (
    <div
      className="relative border-r border-b group"
      style={{ borderColor: T.line, background: pen.bg }}
    >
      <textarea
        ref={ref}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onText(e.target.value)}
        onInput={grow}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            onNewRow();
          }
        }}
        spellCheck={false}
        className="w-full resize-none bg-transparent px-2.5 pt-3 pb-2 text-[13px] leading-snug outline-none focus:ring-1"
        style={{ color: T.ink, minHeight: 72, caretColor: pen.dot === PENS[0].dot ? T.ink : pen.dot }}
      />
      <button
        title={`pen: ${pen.name} (tap to change)`}
        onClick={() => onColor((color + 1) % PENS.length)}
        className="absolute top-1.5 right-1.5 h-3.5 w-3.5 rounded-full border transition-transform hover:scale-125"
        style={{
          background: color === 0 ? "transparent" : pen.dot,
          borderColor: color === 0 ? "#3a3f4a" : pen.dot,
          opacity: color === 0 ? 0.5 : 1,
        }}
      />
    </div>
  );
}

// ---------- timer hook ----------
function useCountdown(initial) {
  const [secs, setSecs] = useState(initial);
  const [running, setRunning] = useState(false);
  const beeped = useRef(false);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSecs((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  useEffect(() => {
    if (secs === 0 && running && !beeped.current) {
      beeped.current = true;
      beep();
    }
    if (secs > 0) beeped.current = false;
  }, [secs, running]);
  return { secs, setSecs, running, setRunning };
}

export default function App() {
  const [data, setData] = useState(null); // {rounds:[], activeId}
  const [tab, setTab] = useState("pro"); // pro | con | cx
  const [saved, setSaved] = useState("ready");
  const [showHelp, setShowHelp] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const scrollRef = useRef(null);
  const saveTimer = useRef(null);
  const loaded = useRef(false);

  // load
  useEffect(() => {
    (async () => {
      let init = null;
      try {
        const res = await window.storage.get("pf-flows-v1");
        if (res && res.value) init = JSON.parse(res.value);
      } catch (e) {}
      if (!init || !init.rounds || !init.rounds.length) {
        const r = newRound(1);
        init = { rounds: [r], activeId: r.id };
      } else {
        init = { ...init, rounds: init.rounds.map(normalizeRound) };
      }
      setData(init);
      loaded.current = true;
    })();
  }, []);

  // debounced save
  useEffect(() => {
    if (!data || !loaded.current) return;
    setSaved("saving…");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await window.storage.set("pf-flows-v1", JSON.stringify(data));
        setSaved("saved");
      } catch (e) {
        setSaved("in memory only");
      }
    }, 800);
    return () => clearTimeout(saveTimer.current);
  }, [data]);

  // timers
  const speech = useCountdown(240);
  const [speechIdx, setSpeechIdx] = useState(0);
  const [prepRunning, setPrepRunning] = useState(null); // "pro" | "con" | null
  useEffect(() => {
    if (!prepRunning) return;
    const t = setInterval(() => {
      setData((d) => {
        if (!d) return d;
        const rounds = d.rounds.map((r) =>
          r.id === d.activeId
            ? { ...r, prep: { ...r.prep, [prepRunning]: Math.max(0, r.prep[prepRunning] - 1) } }
            : r
        );
        return { ...d, rounds };
      });
    }, 1000);
    return () => clearInterval(t);
  }, [prepRunning]);

  if (!data)
    return (
      <div className="flex h-screen items-center justify-center lowercase" style={{ background: T.bg, color: T.dim, fontFamily: "ui-monospace, monospace" }}>
        loading your flows…
      </div>
    );

  const round = data.rounds.find((r) => r.id === data.activeId) || data.rounds[0];

  const patchRound = (fn) =>
    setData((d) => ({
      ...d,
      rounds: d.rounds.map((r) => (r.id === round.id ? fn(r) : r)),
    }));

  const patchRows = (side, fn) =>
    patchRound((r) => ({ ...r, flows: { ...r.flows, [side]: { rows: fn(r.flows[side].rows) } } }));

  const addRow = (side, afterIdx = null) =>
    patchRows(side, (rows) => {
      const next = [...rows];
      const row = newRow(`argument ${rows.length + 1}`);
      afterIdx === null ? next.push(row) : next.splice(afterIdx + 1, 0, row);
      return next;
    });

  const moveRow = (side, i, dir) =>
    patchRows(side, (rows) => {
      const j = i + dir;
      if (j < 0 || j >= rows.length) return rows;
      const next = [...rows];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const exportFlow = () => {
    const lines = [`# ${round.name}${round.topic ? " — " + round.topic : ""}`, ""];
    ["pro", "con"].forEach((side) => {
      lines.push(`## ${side} flow`);
      round.flows[side].rows.forEach((row) => {
        lines.push(`\n### ${row.label || "(untitled)"}`);
        row.cells.forEach((c, i) => {
          if (c.t.trim()) {
            const tag = c.c ? ` [${PENS[c.c].name}]` : "";
            lines.push(`- ${COLS[side][i].label}${tag}: ${c.t.trim()}`);
          }
        });
      });
      lines.push("");
    });
    const cxLines = CX_SECTIONS.filter((s) => (round.cx[s.key] || "").trim());
    if (cxLines.length) {
      lines.push("## crossfire notes");
      cxLines.forEach((s) => lines.push(`\n### ${s.label}`, round.cx[s.key].trim()));
      lines.push("");
    }
    const j = round.judge;
    const hasBallot = j.winner || j.rfd.trim() || Object.values(j.points).some((p) => p !== "");
    if (hasBallot) {
      lines.push("## ballot");
      if (j.winner) lines.push(`- winner: ${j.winner}`);
      SPEAKERS.forEach((s) => {
        if (j.points[s.key] !== "") lines.push(`- ${s.label}: ${j.points[s.key]}`);
      });
      if (j.rfd.trim()) lines.push("", "### reason for decision", j.rfd.trim());
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${round.name.replace(/\s+/g, "-")}-flow.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const jumpToCol = (i) => {
    const el = scrollRef.current;
    if (!el) return;
    const colW = el.querySelector("[data-col='0']")?.offsetWidth || 180;
    const labelW = el.querySelector("[data-labelcol]")?.offsetWidth || 120;
    el.scrollTo({ left: labelW + colW * i - 8, behavior: "smooth" });
  };

  const sideColor = (s) => (s === "pro" ? T.pro : T.con);
  const isFlow = tab === "pro" || tab === "con";
  const cols = isFlow ? COLS[tab] : [];
  const rows = isFlow ? round.flows[tab].rows : [];

  const chip = "rounded px-2 py-1 text-[11px] tracking-wide transition-colors";

  return (
    <div
      className="min-h-screen lowercase"
      style={{ background: T.bg, color: T.ink, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}
    >
      {/* header */}
      <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2" style={{ borderColor: T.line }}>
        <div className="mr-1 flex items-baseline gap-1.5">
          <span className="text-[15px] font-semibold tracking-tight">flowsheet</span>
          <span className="text-[10px]" style={{ color: T.dim }}>public forum</span>
        </div>

        {/* round switcher */}
        <div className="flex items-center gap-1 rounded border px-1 py-0.5" style={{ borderColor: T.line, background: T.panel }}>
          <select
            value={round.id}
            onChange={(e) => setData((d) => ({ ...d, activeId: e.target.value }))}
            className="bg-transparent text-[12px] outline-none lowercase"
            style={{ color: T.ink }}
          >
            {data.rounds.map((r) => (
              <option key={r.id} value={r.id} style={{ background: T.panel, color: T.ink }}>
                {r.name}
              </option>
            ))}
          </select>
          <button
            className={chip}
            style={{ color: T.dim }}
            title="rename round"
            onClick={() => setRenaming((v) => !v)}
          >
            rename
          </button>
          <button
            className={chip}
            style={{ color: T.dim }}
            title="new round"
            onClick={() => {
              const r = newRound(data.rounds.length + 1);
              setData((d) => ({ ...d, rounds: [...d.rounds, r], activeId: r.id }));
            }}
          >
            + round
          </button>
          {data.rounds.length > 1 && (
            <button
              className={chip}
              style={{ color: "#e55442" }}
              title="delete this round"
              onClick={() => {
                if (!confirm(`delete "${round.name}"? this can't be undone.`)) return;
                setData((d) => {
                  const rounds = d.rounds.filter((r) => r.id !== round.id);
                  return { rounds, activeId: rounds[0].id };
                });
              }}
            >
              delete
            </button>
          )}
        </div>

        {renaming && (
          <input
            autoFocus
            value={round.name}
            onChange={(e) => patchRound((r) => ({ ...r, name: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && setRenaming(false)}
            onBlur={() => setRenaming(false)}
            className="rounded border bg-transparent px-2 py-1 text-[12px] outline-none"
            style={{ borderColor: T.line }}
          />
        )}

        <input
          value={round.topic}
          onChange={(e) => patchRound((r) => ({ ...r, topic: e.target.value }))}
          placeholder="resolution / topic…"
          className="min-w-[140px] flex-1 rounded border bg-transparent px-2 py-1 text-[12px] outline-none placeholder:opacity-40"
          style={{ borderColor: T.line, color: T.ink }}
        />

        <button className={chip} style={{ color: T.dim, border: `1px solid ${T.line}` }} onClick={exportFlow}>
          export .txt
        </button>
        <button className={chip} style={{ color: T.dim, border: `1px solid ${T.line}` }} onClick={() => setShowHelp((v) => !v)}>
          {showHelp ? "close help" : "help"}
        </button>
        <span className="text-[10px]" style={{ color: T.dim }}>{saved}</span>
      </header>

      {showHelp && (
        <div className="border-b px-4 py-3 text-[12px] leading-relaxed" style={{ borderColor: T.line, background: T.panel, color: T.dim }}>
          <p><span style={{ color: T.ink }}>flowing:</span> each row is an argument. columns follow the speech order, so responses line up left → right across the round.</p>
          <p><span style={{ color: T.ink }}>pens:</span> tap the dot in a cell's corner to cycle colors — red = dropped, green = winning, yellow = flag, purple = voter.</p>
          <p><span style={{ color: T.ink }}>shortcuts:</span> ctrl/cmd + enter inside a cell adds a new row below it. everything autosaves.</p>
          <p><span style={{ color: T.ink }}>timers:</span> pick a speech to load its time. prep clocks count each team's 3:00 — tap to start or pause.</p>
        </div>
      )}

      {/* timer strip */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2" style={{ borderColor: T.line, background: T.panel }}>
        <select
          value={speechIdx}
          onChange={(e) => {
            const i = +e.target.value;
            setSpeechIdx(i);
            speech.setRunning(false);
            speech.setSecs(SPEECH_TIMES[i].secs);
          }}
          className="rounded border bg-transparent px-1.5 py-1 text-[11px] outline-none lowercase"
          style={{ borderColor: T.line, color: T.ink }}
        >
          {SPEECH_TIMES.map((s, i) => (
            <option key={s.label} value={i} style={{ background: T.panel }}>
              {s.label} · {fmt(s.secs)}
            </option>
          ))}
        </select>
        <button
          onClick={() => speech.setRunning((r) => !r)}
          className="rounded px-3 py-1 text-[13px] font-semibold tabular-nums tracking-wider"
          style={{
            border: `1px solid ${speech.secs <= 0 ? "#e55442" : speech.secs <= 30 ? "#e8c15a" : T.line}`,
            color: speech.secs <= 0 ? "#e55442" : speech.secs <= 30 ? "#e8c15a" : T.ink,
            background: T.panel2,
          }}
        >
          {fmt(speech.secs)} {speech.running ? "⏸" : "▶"}
        </button>
        <button
          className={chip}
          style={{ color: T.dim }}
          onClick={() => {
            speech.setRunning(false);
            speech.setSecs(SPEECH_TIMES[speechIdx].secs);
          }}
        >
          reset
        </button>

        <div className="mx-1 h-5 w-px" style={{ background: T.line }} />

        {["pro", "con"].map((side) => (
          <button
            key={side}
            onClick={() => setPrepRunning((p) => (p === side ? null : side))}
            className="rounded px-2.5 py-1 text-[12px] tabular-nums"
            style={{
              border: `1px solid ${prepRunning === side ? sideColor(side) : T.line}`,
              color: sideColor(side),
              background: prepRunning === side ? T.panel2 : "transparent",
            }}
            title={`${side} prep — tap to ${prepRunning === side ? "pause" : "run"}`}
          >
            {side} prep {fmt(round.prep[side])} {prepRunning === side ? "⏸" : "▶"}
          </button>
        ))}
        <button
          className={chip}
          style={{ color: T.dim }}
          onClick={() => {
            setPrepRunning(null);
            patchRound((r) => ({ ...r, prep: { pro: 180, con: 180 } }));
          }}
        >
          reset prep
        </button>
      </div>

      {/* flow tabs */}
      <div className="flex items-center gap-1 border-b px-3 pt-2" style={{ borderColor: T.line }}>
        {[
          { id: "pro", label: "pro flow" },
          { id: "con", label: "con flow" },
          { id: "cx", label: "crossfire" },
          { id: "judge", label: "ballot" },
        ].map((t) => {
          const active = tab === t.id;
          const c = t.id === "pro" ? T.pro : t.id === "con" ? T.con : t.id === "cx" ? "#b08cf0" : "#e8c15a";
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="rounded-t px-3 py-1.5 text-[12px] tracking-wide"
              style={{
                color: active ? c : T.dim,
                borderBottom: `2px solid ${active ? c : "transparent"}`,
                background: active ? T.panel : "transparent",
              }}
            >
              {t.label}
            </button>
          );
        })}

        {isFlow && (
          <div className="ml-auto hidden gap-1 pb-1 sm:flex">
            {PENS.slice(1).map((p) => (
              <span key={p.name} className="flex items-center gap-1 text-[10px]" style={{ color: T.dim }}>
                <span className="h-2 w-2 rounded-full" style={{ background: p.dot }} />
                {p.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* crossfire tab — in round order */}
      {tab === "cx" && (
        <div className="grid gap-3 p-3 md:grid-cols-3">
          {CX_SECTIONS.map((s, i) => (
            <div key={s.key} className="flex flex-col rounded border" style={{ borderColor: T.line, background: T.panel }}>
              <div className="flex items-baseline justify-between border-b px-3 py-2" style={{ borderColor: T.line }}>
                <span className="text-[12px] font-semibold" style={{ color: "#b08cf0" }}>
                  {i + 1} · {s.label}
                </span>
                <span className="text-[10px]" style={{ color: T.dim }}>{s.hint}</span>
              </div>
              <textarea
                value={round.cx[s.key]}
                onChange={(e) => patchRound((r) => ({ ...r, cx: { ...r.cx, [s.key]: e.target.value } }))}
                placeholder="concessions, admissions, questions to ask…"
                spellCheck={false}
                className="min-h-[40vh] w-full flex-1 resize-y bg-transparent p-3 text-[13px] leading-relaxed outline-none placeholder:opacity-40 md:min-h-[55vh]"
                style={{ color: T.ink }}
              />
            </div>
          ))}
        </div>
      )}

      {/* ballot / judge tab */}
      {tab === "judge" && (
        <div className="mx-auto max-w-2xl p-3">
          <div className="rounded border" style={{ borderColor: T.line, background: T.panel }}>
            <div className="border-b px-3 py-2 text-[12px] font-semibold" style={{ borderColor: T.line, color: "#e8c15a" }}>
              winner
            </div>
            <div className="flex gap-2 p-3">
              {["pro", "con"].map((side) => {
                const active = round.judge.winner === side;
                return (
                  <button
                    key={side}
                    onClick={() =>
                      patchRound((r) => ({ ...r, judge: { ...r.judge, winner: active ? "" : side } }))
                    }
                    className="flex-1 rounded px-3 py-2 text-[13px] font-semibold tracking-wide"
                    style={{
                      border: `1px solid ${active ? sideColor(side) : T.line}`,
                      color: sideColor(side),
                      background: active ? T.panel2 : "transparent",
                      boxShadow: active ? `inset 0 -2px 0 ${sideColor(side)}` : "none",
                    }}
                  >
                    {side} {active ? "✓" : ""}
                  </button>
                );
              })}
            </div>

            <div className="border-b border-t px-3 py-2 text-[12px] font-semibold" style={{ borderColor: T.line, color: "#e8c15a" }}>
              speaker points <span className="font-normal" style={{ color: T.dim }}>(20–30)</span>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
              {SPEAKERS.map((s) => (
                <label key={s.key} className="flex flex-col gap-1">
                  <span className="text-[10px]" style={{ color: sideColor(s.side) }}>{s.label}</span>
                  <input
                    type="number"
                    min={20}
                    max={30}
                    step={0.1}
                    value={round.judge.points[s.key]}
                    onChange={(e) =>
                      patchRound((r) => ({
                        ...r,
                        judge: { ...r.judge, points: { ...r.judge.points, [s.key]: e.target.value } },
                      }))
                    }
                    placeholder="—"
                    className="rounded border bg-transparent px-2 py-1.5 text-[13px] tabular-nums outline-none placeholder:opacity-40"
                    style={{ borderColor: T.line, color: T.ink }}
                  />
                </label>
              ))}
            </div>

            <div className="border-b border-t px-3 py-2 text-[12px] font-semibold" style={{ borderColor: T.line, color: "#e8c15a" }}>
              reason for decision
            </div>
            <textarea
              value={round.judge.rfd}
              onChange={(e) => patchRound((r) => ({ ...r, judge: { ...r.judge, rfd: e.target.value } }))}
              placeholder="what decided the round — key voters, dropped arguments, weighing…"
              spellCheck={false}
              className="min-h-[30vh] w-full resize-y bg-transparent p-3 text-[13px] leading-relaxed outline-none placeholder:opacity-40"
              style={{ color: T.ink }}
            />
          </div>
        </div>
      )}

      {isFlow && (
        <>
          {/* mobile column jump */}
          <div className="flex gap-1 overflow-x-auto px-3 py-2 md:hidden">
            {cols.map((c, i) => (
              <button
                key={i}
                onClick={() => jumpToCol(i)}
                className="whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px]"
                style={{ borderColor: T.line, color: sideColor(c.side) }}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* the grid */}
          <div ref={scrollRef} className="overflow-x-auto pb-24">
            <div style={{ minWidth: 120 + cols.length * 190 }}>
              {/* column headers */}
              <div className="sticky top-0 z-20 flex" style={{ background: T.bg }}>
                <div
                  data-labelcol
                  className="sticky left-0 z-10 w-[120px] shrink-0 border-b border-r px-2 py-2 text-[10px]"
                  style={{ borderColor: T.line, background: T.bg, color: T.dim }}
                >
                  arguments
                </div>
                {cols.map((c, i) => (
                  <div
                    key={i}
                    data-col={i}
                    className="w-[190px] shrink-0 border-b border-r px-2.5 py-2 text-[11px] font-semibold tracking-wide"
                    style={{ borderColor: T.line, color: sideColor(c.side), boxShadow: `inset 0 -2px 0 ${sideColor(c.side)}` }}
                  >
                    {c.label}
                  </div>
                ))}
              </div>

              {/* rows */}
              {rows.map((row, ri) => (
                <div key={row.id} className="group/row flex">
                  {/* sticky label */}
                  <div
                    className="sticky left-0 z-10 flex w-[120px] shrink-0 flex-col border-b border-r px-1.5 py-2"
                    style={{ borderColor: T.line, background: T.panel }}
                  >
                    <textarea
                      value={row.label}
                      onChange={(e) =>
                        patchRows(tab, (rs) => rs.map((r, i) => (i === ri ? { ...r, label: e.target.value } : r)))
                      }
                      spellCheck={false}
                      rows={2}
                      className="w-full resize-none bg-transparent text-[12px] font-semibold leading-tight outline-none"
                      style={{ color: T.ink }}
                    />
                    <div className="mt-auto flex gap-1 pt-1 opacity-40 transition-opacity group-hover/row:opacity-100">
                      <button title="move up" className="text-[11px]" style={{ color: T.dim }} onClick={() => moveRow(tab, ri, -1)}>↑</button>
                      <button title="move down" className="text-[11px]" style={{ color: T.dim }} onClick={() => moveRow(tab, ri, 1)}>↓</button>
                      <button title="add row below" className="text-[11px]" style={{ color: T.dim }} onClick={() => addRow(tab, ri)}>＋</button>
                      <button
                        title="delete row"
                        className="ml-auto text-[11px]"
                        style={{ color: "#e55442" }}
                        onClick={() => {
                          if (row.cells.some((c) => c.t.trim()) && !confirm(`delete "${row.label || "this row"}"?`)) return;
                          patchRows(tab, (rs) => rs.filter((_, i) => i !== ri));
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* cells */}
                  {row.cells.map((cell, ci) => (
                    <div key={ci} className="w-[190px] shrink-0">
                      <Cell
                        value={cell.t}
                        color={cell.c}
                        placeholder={ri === 0 && ci === 0 ? "start flowing…" : ""}
                        onText={(t) =>
                          patchRows(tab, (rs) =>
                            rs.map((r, i) =>
                              i === ri ? { ...r, cells: r.cells.map((c, j) => (j === ci ? { ...c, t } : c)) } : r
                            )
                          )
                        }
                        onColor={(c) =>
                          patchRows(tab, (rs) =>
                            rs.map((r, i) =>
                              i === ri ? { ...r, cells: r.cells.map((cc, j) => (j === ci ? { ...cc, c } : cc)) } : r
                            )
                          )
                        }
                        onNewRow={() => addRow(tab, ri)}
                      />
                    </div>
                  ))}
                </div>
              ))}

              {/* add row */}
              <div className="flex">
                <button
                  onClick={() => addRow(tab)}
                  className="sticky left-0 m-2 rounded border border-dashed px-3 py-1.5 text-[12px]"
                  style={{ borderColor: T.line, color: T.dim }}
                >
                  + add argument
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
