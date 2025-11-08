/*
 Vanilla JS Section Planner
 - Loads course_offerings.csv from same folder (works on GitHub Pages / local server)
 - Uses PapaParse for CSV parsing (loaded via CDN in index.html)
*/

const searchInput = document.getElementById('search');
const facultySelect = document.getElementById('faculty');
const daySelect = document.getElementById('day');
const timeFrom = document.getElementById('timeFrom');
const timeTo = document.getElementById('timeTo');
const tbody = document.getElementById('tbody');
const countEl = document.getElementById('count');
const clearBtn = document.getElementById('clear');

let rows = []; // array of row objects
let columns = []; // headers

function normalize(s){ return (s||'').toString().trim().toLowerCase(); }

function timeToMinutes(t){ // t in "HH:MM" 24h format from <input type=time>
  if(!t) return null;
  const [hh,mm] = t.split(':').map(Number);
  return hh*60 + mm;
}

// parse time in CSV like "09:51:AM - 11:10:AM" -> start minutes and end minutes (0-1439)
function parseCsvTime(t){
  if(!t) return null;
  // try to extract start and end with am/pm
  const m = t.match(/(\d{1,2}:\d{2})\s*:?([AP]M)?\s*-\s*(\d{1,2}:\d{2})\s*:?([AP]M)?/i);
  if(!m) return null;
  let s = m[1], sa = m[2]||'AM', e = m[3], ea = m[4]||'AM';
  sa = sa.toUpperCase(); ea = ea.toUpperCase();
  function toMin(timeStr, ampm){
    let [hh,mm] = timeStr.split(':').map(Number);
    if(ampm==='PM' && hh!==12) hh+=12;
    if(ampm==='AM' && hh===12) hh=0;
    return hh*60 + mm;
  }
  return { start: toMin(s,sa), end: toMin(e,ea), raw: t };
}

function loadCsv(){
  // Attempt to fetch course_offerings.csv relative to current path
  Papa.parse('course_offerings.csv', {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function(results){
      columns = results.meta.fields || [];
      rows = results.data.map((r, idx)=>{
        // keep original values and some derived fields
        const t1 = parseCsvTime(r.Time1 || r['Time1'] || r['Time 1'] || r['Time  1']);
        const t2 = parseCsvTime(r.Time2 || r['Time2'] || r['Time 2'] || r['Time  2']);
        return {
          __id: idx,
          Program: r.Program || r.Program,
          Code: r['Formal Code'] || r['FormalCode'] || r['Formal Code '] || r['Formal Code'] || r['Formal_Code'],
          Title: r.Title || '',
          Section: r.Section || '',
          Room1: r.Room1 || r['Room 1'] || '',
          Room2: r.Room2 || r['Room 2'] || '',
          Day1: r.Day1 || r['Day1'] || r['Day 1'] || '',
          Day2: r.Day2 || r['Day2'] || r['Day 2'] || '',
          Time1: t1,
          Time1Raw: r.Time1 || r['Time1'] || '',
          Time2: t2,
          Time2Raw: r.Time2 || r['Time2'] || '',
          Faculty: r['Faculty Full Name'] || r.Faculty || r['Faculty Full Name '] || '',
          Initial: r.Initial || '',
          Cr: r.Cr || r.Cr. || r['Cr.'] || r.Credit || ''
        }
      });
      populateFaculty();
      render();
    },
    error: function(err){ tbody.innerHTML = `<tr><td class="p-4" colspan="7">Error loading CSV: ${err}</td></tr>`; }
  });
}

function populateFaculty(){
  const set = new Set();
  rows.forEach(r=>{ if(r.Faculty) set.add(r.Faculty); });
  const arr = Array.from(set).sort((a,b)=> a.localeCompare(b));
  facultySelect.innerHTML = '<option value=\"\">— Any faculty —</option>' + arr.map(f=>`<option value=\"${escapeHtml(f)}\">${escapeHtml(f)}</option>`).join('');
}

function escapeHtml(s){ return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }

function matchesSearch(row, q){
  if(!q) return true;
  q = q.toLowerCase();
  // check all properties
  for(const key in row){
    if(Object.prototype.hasOwnProperty.call(row,key)){
      const val = row[key];
      if(val == null) continue;
      if(typeof val === 'object'){ // check raw fields inside object
        if(val.raw && val.raw.toLowerCase().includes(q)) return true;
        continue;
      }
      if(String(val).toLowerCase().includes(q)) return true;
    }
  }
  return false;
}

function matchesDay(row, day){
  if(!day) return true;
  return normalize(row.Day1) === day.toLowerCase() || normalize(row.Day2) === day.toLowerCase();
}

function matchesFaculty(row, fac){
  if(!fac) return true;
  return row.Faculty && row.Faculty.toLowerCase() === fac.toLowerCase();
}

function matchesTimeRange(row, fromMin, toMin){
  if(fromMin == null && toMin == null) return true;
  // if any time range overlaps with [fromMin, toMin], it's a match
  const times = [];
  if(row.Time1) times.push(row.Time1);
  if(row.Time2) times.push(row.Time2);
  if(times.length===0) return true;
  for(const t of times){
    if(!t) continue;
    const a = t.start, b = t.end;
    if(a==null || b==null) return true;
    if(fromMin==null) fromMin = 0;
    if(toMin==null) toMin = 24*60-1;
    if(a < toMin && fromMin < b) return true;
  }
  return false;
}

function highlight(text, q){
  if(!q) return escapeHtml(text);
  q = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(' + q + ')', 'ig');
  return escapeHtml(text).replace(re, '<mark class="bg-yellow-200">$1</mark>');
}

function render(){
  const q = normalize(searchInput.value);
  const fac = facultySelect.value;
  const day = daySelect.value;
  const fromMin = timeToMinutes(timeFrom.value);
  const toMin = timeToMinutes(timeTo.value);
  const filtered = rows.filter(r=> matchesSearch(r,q) && matchesFaculty(r,fac) && matchesDay(r,day) && matchesTimeRange(r,fromMin,toMin));
  countEl.textContent = `${filtered.length} results`;
  if(filtered.length===0){
    tbody.innerHTML = '<tr><td class="p-4" colspan="7">No matching sections</td></tr>';
    return;
  }
  const html = filtered.map(r=>{
    const course = `${r.Code || ''}`.trim();
    const times = `${r.Time1Raw || ''}${r.Time1Raw && r.Time2Raw ? ' | ' : ''}${r.Time2Raw || ''}`;
    const days = `${r.Day1||''}${r.Day1 && r.Day2 ? ' / ' : ''}${r.Day2||''}`;
    return `<tr class="hover:bg-slate-50 ">
      <td class="p-2 align-top">${highlight(course,q)}<div class="text-sm text-slate-500">${highlight(r.Title||'',q)}</div></td>
      <td class="p-2 align-top">${highlight(r.Section||'',q)}</td>
      <td class="p-2 align-top">${highlight(days,q)}</td>
      <td class="p-2 align-top">${highlight(times,q)}</td>
      <td class="p-2 align-top">${highlight(r.Room1||r.Room2||'',q)}</td>
      <td class="p-2 align-top">${highlight(r.Faculty||'',q)}</td>
      <td class="p-2 align-top">${highlight(r.Cr||'',q)}</td>
    </tr>`;
  }).join('');
  tbody.innerHTML = html;
}

// Events
[searchInput, facultySelect, daySelect, timeFrom, timeTo].forEach(el=> el.addEventListener('input', render));
clearBtn.addEventListener('click', ()=>{
  searchInput.value=''; facultySelect.value=''; daySelect.value=''; timeFrom.value=''; timeTo.value=''; render();
});

// init
loadCsv();