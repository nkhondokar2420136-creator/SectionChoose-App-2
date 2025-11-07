/*
Section Selector - Single-file React component (App.jsx)

Overview:
- This is a single-file React component you can drop into a Vite + React project (src/App.jsx)
- It automatically loads course data from a fixed CSV file located at: public/course_offerings.csv
  (You should place the CSV converted from your Excel sheet there before deploying to GitHub Pages.)

Features in this file:
- Fetches and parses CSV using PapaParse
- Dynamic filters: Program, Faculty, Days, Time range, Course code/title
- Results table and a simple weekly timetable grid
- Conflict detection (highlights conflicting sections)
- Save/export selected schedule as JSON

How to use (quick start):
1) Create a new Vite React project:
   npm create vite@latest section-selector -- --template react
   cd section-selector
   npm install

2) Install dependencies:
   npm install papaparse
   (Tailwind recommended — setup separately if you want Tailwind styling)

3) Replace src/App.jsx with this file's content. Put your CSV at public/course_offerings.csv
   The CSV must have headers matching: Program,Formal Code,Title,Section,Room1,Room2,Day1,Day2,Time1,Time2,Faculty Full Name,Initial,Cr.

4) Run locally:
   npm run dev

5) Deploy to GitHub Pages:
   - Build: npm run build
   - Use gh-pages or GitHub Pages from the repo settings to serve the build folder

Notes:
- This file uses minimal inline CSS so it works without Tailwind. If you add Tailwind, remove the inline styles.
- The timetable is a simple grid for Sat, Sun, Tue, Wed and time slots; customize as needed.

*/

import React, { useEffect, useState, useMemo } from "react";
import Papa from "papaparse";

// Helper: parse time string like "09:51:AM - 11:10:AM" -> {start: "09:51", end: "11:10", startMinutes: number, endMinutes: number}
function parseTimeRange(tr) {
  if (!tr || String(tr).trim() === "-" || String(tr).trim() === "") return null;
  // Example: 09:51:AM - 11:10:AM or 08:30:AM - 09:50:AM
  const parts = String(tr).split("-").map(s => s.trim());
  if (parts.length !== 2) return null;
  const toMinutes = s => {
    if (!s) return null;
    s = s.replace(/\s+/g, ""); // remove spaces
    // format like 09:51:AM or 11:10:PM
    const m = s.match(/(\d{1,2}):(\d{2}):?([AP]M)?$/i);
    if (!m) {
      // fallback: 08:30AM or 08:30
      const m2 = s.match(/(\d{1,2}):(\d{2})(AM|PM|am|pm)?/);
      if (!m2) return null;
      let hh = parseInt(m2[1], 10);
      const mm = parseInt(m2[2], 10);
      const ampm = (m2[3] || "AM").toUpperCase();
      if (ampm === "PM" && hh !== 12) hh += 12;
      if (ampm === "AM" && hh === 12) hh = 0;
      return hh * 60 + mm;
    }
    let hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const ampm = (m[3] || "AM").toUpperCase();
    if (ampm === "PM" && hh !== 12) hh += 12;
    if (ampm === "AM" && hh === 12) hh = 0;
    return hh * 60 + mm;
  };
  const startMinutes = toMinutes(parts[0]);
  const endMinutes = toMinutes(parts[1]);
  return {
    raw: tr,
    startMinutes,
    endMinutes,
    start: parts[0],
    end: parts[1]
  };
}

function timeOverlap(aStart, aEnd, bStart, bEnd) {
  if (aStart == null || aEnd == null || bStart == null || bEnd == null) return false;
  return aStart < bEnd && bStart < aEnd;
}

export default function App() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [program, setProgram] = useState("");
  const [faculty, setFaculty] = useState("");
  const [search, setSearch] = useState("");
  const [dayFilter, setDayFilter] = useState("");
  const [timeMin, setTimeMin] = useState(480); // minutes
  const [timeMax, setTimeMax] = useState(1020);

  // Selected schedule (list of row indexes)
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    const url = (process.env.PUBLIC_URL || "") + "/course_offerings.csv";
    // Try to fetch CSV
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error("Could not fetch CSV at " + url + ". Make sure public/course_offerings.csv exists.");
        return res.text();
      })
      .then(text => {
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: function (results) {
            const data = results.data.map((r, idx) => {
              // Normalize keys (some CSV exports add strange header whitespace)
              const get = keyCandidates => {
                for (const k of keyCandidates) {
                  if (r.hasOwnProperty(k) && r[k] != null) return r[k];
                }
                return undefined;
              };

              const rawTime1 = get(["Time1", "Time 1", "Time_1", "Time1 "]);
              const rawTime2 = get(["Time2", "Time 2", "Time_2", "Time2 "]);

              const t1 = parseTimeRange(rawTime1);
              const t2 = parseTimeRange(rawTime2);

              const formalCode = get(["Formal Code", "FormalCode", "Formal_Code", "Formal code"]);

              return {
                __id: idx,
                Program: get(["Program"]) || "",
                FormalCode: formalCode || "",
                Title: get(["Title"]) || "",
                Section: get(["Section"]) || "",
                Room1: get(["Room1"]) || get(["Room 1"]) || "",
                Room2: get(["Room2"]) || get(["Room 2"]) || "",
                Day1: get(["Day1"]) || get(["Day 1"]) || "",
                Day2: get(["Day2"]) || get(["Day 2"]) || "",
                Time1: t1,
                Time2: t2,
                FacultyFullName: get(["Faculty Full Name", "Faculty", "FacultyFullName"]) || "",
                Initial: get(["Initial"]) || "",
                Cr: get(["Cr", "Credit", "Credits"]) || ""
              };
            });
            setRows(data);
            setLoading(false);
          },
          error: function(err) {
            setError(err.message || String(err));
            setLoading(false);
          }
        });
      })
      .catch(err => {
        setError(err.message || String(err));
        setLoading(false);
      });
  }, []);

  const programs = useMemo(() => {
    const s = new Set(rows.map(r => r.Program).filter(Boolean));
    return ["", ...Array.from(s).sort()];
  }, [rows]);

  const faculties = useMemo(() => {
    const s = new Set(rows.map(r => r.FacultyFullName).filter(Boolean));
    return ["", ...Array.from(s).sort()];
  }, [rows]);

  const days = ["", "Sat-Tue", "Sun-Wed", "Sat-Tue (Lab)", "Sun-Wed (Lab)"];

  // Filtering logic
  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (program && r.Program !== program) return false;
      if (faculty && r.FacultyFullName !== faculty) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!((r.FormalCode || "").toLowerCase().includes(s) || (r.Title || "").toLowerCase().includes(s))) return false;
      }
      if (dayFilter) {
        // allow matching if either Day1+Day2 combination matches the filter in a simple way
        const combined = ((r.Day1 || "") + "-" + (r.Day2 || "")).replace(/\s+/g, "");
        if (!combined.toLowerCase().includes(dayFilter.replace(/\s+/g, "").toLowerCase())) return false;
      }
      // time filtering: check either Time1 or Time2 start within [timeMin, timeMax)
      const t1 = r.Time1;
      const t2 = r.Time2;
      const check = t => {
        if (!t) return true; // keep if no time specified
        if (t.startMinutes == null) return true;
        return t.startMinutes >= timeMin && t.endMinutes <= timeMax;
      };
      if (!check(t1) || !check(t2)) return false;
      return true;
    });
  }, [rows, program, faculty, search, dayFilter, timeMin, timeMax]);

  // Conflict detection between selected rows
  function detectConflicts(selectionRows) {
    const conflicts = new Set();
    for (let i = 0; i < selectionRows.length; i++) {
      for (let j = i + 1; j < selectionRows.length; j++) {
        const a = selectionRows[i];
        const b = selectionRows[j];
        // check day overlap (simple: if any Day value matches)
        const daysA = [a.Day1, a.Day2].filter(Boolean);
        const daysB = [b.Day1, b.Day2].filter(Boolean);
        const dayOverlap = daysA.some(da => daysB.includes(da));
        if (!dayOverlap) continue;
        // check time overlaps between any time ranges
        const timesA = [a.Time1, a.Time2].filter(Boolean);
        const timesB = [b.Time1, b.Time2].filter(Boolean);
        let timeConflict = false;
        for (const ta of timesA) {
          for (const tb of timesB) {
            if (ta && tb && timeOverlap(ta.startMinutes, ta.endMinutes, tb.startMinutes, tb.endMinutes)) {
              timeConflict = true;
            }
          }
        }
        if (timeConflict) {
          conflicts.add(a.__id);
          conflicts.add(b.__id);
        }
      }
    }
    return conflicts; // set of row ids that conflict
  }

  const selectedRows = selected.map(id => rows.find(r => r.__id === id)).filter(Boolean);
  const conflicts = detectConflicts(selectedRows);

  function toggleSelect(id) {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      return [...prev, id];
    });
  }

  function clearSelection() {
    setSelected([]);
  }

  function exportSelection() {
    const data = selectedRows;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "selection.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  // Simple timetable rendering: map days to columns, times to rows.
  const timetableDays = ["Sat", "Sun", "Tue", "Wed"];
  const timetableSlots = [
    { label: "08:30 - 09:50", start: 8 * 60 + 30, end: 9 * 60 + 50 },
    { label: "09:51 - 11:10", start: 9 * 60 + 51, end: 11 * 60 + 10 },
    { label: "11:11 - 12:30", start: 11 * 60 + 11, end: 12 * 60 + 30 },
    { label: "12:31 - 01:50", start: 12 * 60 + 31, end: 13 * 60 + 50 },
    { label: "01:51 - 03:10", start: 13 * 60 + 51, end: 15 * 60 + 10 },
    { label: "03:11 - 04:30", start: 15 * 60 + 11, end: 16 * 60 + 30 }
  ];

  function cellContents(day, slot) {
    // find selectedRows that have this day and overlap this slot
    return selectedRows.filter(r => {
      const days = [r.Day1, r.Day2].filter(Boolean);
      if (!days.includes(day)) return false;
      const times = [r.Time1, r.Time2].filter(Boolean);
      for (const t of times) {
        if (t && timeOverlap(t.startMinutes, t.endMinutes, slot.start, slot.end)) return true;
      }
      return false;
    });
  }

  return (
    <div style={{ fontFamily: 'Inter, Arial, sans-serif', padding: 20 }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Section Selector — Fall 2025</h1>
      <p style={{ marginTop: 0, color: '#555' }}>Loads data automatically from <code>public/course_offerings.csv</code>.</p>

      {loading && <div>Loading data…</div>}
      {error && <div style={{ color: 'red' }}>Error: {error}</div>}

      {!loading && !error && (
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ minWidth: 320 }}>
            <div style={{ marginBottom: 12 }}>
              <label>Program</label>
              <select value={program} onChange={e => setProgram(e.target.value)} style={{ width: '100%', padding: 8 }}>
                {programs.map(p => <option key={p} value={p}>{p || '— any —'}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label>Faculty</label>
              <select value={faculty} onChange={e => setFaculty(e.target.value)} style={{ width: '100%', padding: 8 }}>
                {faculties.map(f => <option key={f} value={f}>{f || '— any —'}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label>Search (course code or title)</label>
              <input value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', padding: 8 }} placeholder="e.g. CSE 1111 or Structured" />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label>Day filter (e.g. Sat-Tue or Sun-Wed)</label>
              <input value={dayFilter} onChange={e => setDayFilter(e.target.value)} style={{ width: '100%', padding: 8 }} placeholder="leave empty for any" />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label>Time range (minutes from midnight)</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="number" value={timeMin} onChange={e => setTimeMin(Number(e.target.value))} style={{ flex: 1, padding: 8 }} />
                <input type="number" value={timeMax} onChange={e => setTimeMax(Number(e.target.value))} style={{ flex: 1, padding: 8 }} />
              </div>
              <div style={{ color: '#666', marginTop: 6 }}>Example: 480 = 08:00, 1020 = 17:00. Leave broad to include all.</div>
            </div>

            <div style={{ marginTop: 12 }}>
              <button onClick={() => { setProgram(""); setFaculty(""); setSearch(""); setDayFilter(""); setTimeMin(480); setTimeMax(1020); }} style={{ padding: '8px 12px', marginRight: 8 }}>Reset filters</button>
              <button onClick={() => { setSelected([]); }} style={{ padding: '8px 12px' }}>Clear selection</button>
            </div>

            <hr style={{ margin: '12px 0' }} />

            <div>
              <h3>Selected Sections ({selected.length})</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={exportSelection} style={{ padding: '6px 10px' }} disabled={selected.length === 0}>Export JSON</button>
              </div>
              <ul>
                {selectedRows.map(r => (
                  <li key={r.__id} style={{ marginTop: 6, color: conflicts.has(r.__id) ? 'crimson' : '#111' }}>
                    <strong>{r.FormalCode} {r.Section}</strong> — {r.Title} (<em>{r.FacultyFullName}</em>)
                    <div style={{ fontSize: 12, color: '#444' }}>{r.Day1} {r.Time1 && r.Time1.raw} | {r.Day2} {r.Time2 && r.Time2.raw}</div>
                  </li>
                ))}
              </ul>
            </div>

          </div>

          <div style={{ flex: 1 }}>
            <h3>Matching sections ({filtered.length})</h3>
            <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid #ddd', padding: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th></th>
                    <th>Course</th>
                    <th>Section</th>
                    <th>Days</th>
                    <th>Times</th>
                    <th>Faculty</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.__id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: 6 }}>
                        <input type="checkbox" checked={selected.includes(r.__id)} onChange={() => toggleSelect(r.__id)} />
                      </td>
                      <td style={{ padding: 6 }}>{r.FormalCode} <div style={{ fontSize: 12, color: '#666' }}>{r.Title}</div></td>
                      <td style={{ padding: 6 }}>{r.Section}</td>
                      <td style={{ padding: 6 }}>{r.Day1} {r.Day2}</td>
                      <td style={{ padding: 6 }}>{r.Time1 && r.Time1.raw} {r.Time2 && r.Time2.raw}</td>
                      <td style={{ padding: 6 }}>{r.FacultyFullName}</td>
                    </tr>
                  ))}

                  {filtered.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: 10 }}>No matching sections</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <h3 style={{ marginTop: 16 }}>Timetable (Selected)</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 680 }}>
                <thead>
                  <tr>
                    <th style={{ border: '1px solid #ddd', padding: 8 }}>Time</th>
                    {timetableDays.map(d => <th key={d} style={{ border: '1px solid #ddd', padding: 8 }}>{d}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {timetableSlots.map(slot => (
                    <tr key={slot.label}>
                      <td style={{ border: '1px solid #eee', padding: 8 }}>{slot.label}</td>
                      {timetableDays.map(day => (
                        <td key={day} style={{ border: '1px solid #eee', padding: 8, verticalAlign: 'top', minHeight: 60 }}>
                          {cellContents(day, slot).map(r => (
                            <div key={r.__id} style={{ padding: 6, borderRadius: 6, marginBottom: 6, background: conflicts.has(r.__id) ? '#ffdddd' : '#eef6ff' }}>
                              <strong>{r.FormalCode} {r.Section}</strong>
                              <div style={{ fontSize: 12 }}>{r.Title}</div>
                              <div style={{ fontSize: 12 }}>{r.FacultyFullName}</div>
                              <div style={{ fontSize: 12 }}>{(r.Time1 && r.Time1.raw) || (r.Time2 && r.Time2.raw)}</div>
                            </div>
                          ))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>

        </div>
      )}

      <footer style={{ marginTop: 24, color: '#666' }}>
        <small>Built for Fall 2025 course list. Edit <code>public/course_offerings.csv</code> to update data.</small>
      </footer>
    </div>
  );
}
