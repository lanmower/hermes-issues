import { mkdir, writeFile, readFile } from 'fs/promises'
import { readdirSync, readFileSync } from 'fs'
import yaml from 'js-yaml'

function loadYamls(dir) {
  return readdirSync(dir).filter(f => f.endsWith('.yaml')).map(f => yaml.load(readFileSync(`${dir}/${f}`, 'utf8'))).filter(Boolean)
}

const BASE = '/hermes-issues'
const DOCS = 'docs'
const BUILT = new Date().toISOString().slice(0, 10)

function badge(label, cls) {
  return `<span class="badge ${cls}">${label}</span>`
}

function row(item, rank) {
  const labelBadges = item.labels?.map(l => `<span class="label">${l}</span>`).join(' ') ?? ''
  const stateCls = item.state === 'open' ? 'open' : 'closed'
  const typeBadge = item.is_pr ? badge('PR', 'pr') : badge('Issue', 'issue')
  return `<tr>
<td class="rank">${rank}</td>
<td class="score">${item.score}</td>
<td>${typeBadge} <a href="${item.url}" target="_blank" rel="noopener">#${item.number}</a></td>
<td class="state ${stateCls}">${item.state}</td>
<td class="title"><a href="${item.url}" target="_blank" rel="noopener">${item.title}</a>${(item.note && item.note !== item.title) ? ` <em class="note">${item.note}</em>` : ''}</td>
<td class="labels">${labelBadges}</td>
<td class="meta">${item.author} · ${item.comments}💬 · ${item.reactions}👍</td>
</tr>`
}

async function main() {
  await mkdir(DOCS, { recursive: true })
  let docs = loadYamls('content/items')

  let rankings = {}
  try { rankings = yaml.load(await readFile('rankings.yaml', 'utf8')) || {} } catch {}

  // Apply overrides from rankings.yaml for items not currently in content/items (if any)
  // and ensure scores/notes in docs are up to date with rankings.yaml
  const docsMap = new Map(docs.map(d => [String(d.number), d]))
  for (const [num, override] of Object.entries(rankings)) {
    if (docsMap.has(num)) {
      const item = docsMap.get(num)
      item.score = override.score
      item.note = override.note
    } else {
      // Fallback for items that exist in rankings but not in the currently fetched items
      docs.push({
        number: parseInt(num),
        title: override.note || `Issue #${num}`,
        url: `https://github.com/nousresearch/hermes-agent/issues/${num}`,
        score: override.score,
        note: override.note,
        state: 'open',
        labels: [],
        author: 'unknown',
        comments: 0,
        reactions: 0,
        is_pr: false
      })
    }
  }

  docs.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  const rows = docs.map((item, i) => row(item, i + 1)).join('\n')
  const total = docs.length
  const open = docs.filter(d => d.state === 'open').length

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hermes Issues — Ranked</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font:13px/1.4 system-ui,sans-serif;background:#0d1117;color:#c9d1d9;padding:1rem}
h1{font-size:1.1rem;font-weight:600;margin-bottom:.5rem}
.meta-bar{color:#8b949e;font-size:.8rem;margin-bottom:.75rem}
input{width:100%;max-width:400px;padding:.3rem .5rem;background:#161b22;border:1px solid #30363d;color:#c9d1d9;border-radius:4px;margin-bottom:.75rem;font-size:.85rem}
table{width:100%;border-collapse:collapse;font-size:.8rem}
th{background:#161b22;color:#8b949e;font-weight:500;text-align:left;padding:.3rem .5rem;border-bottom:1px solid #30363d;position:sticky;top:0}
td{padding:.25rem .5rem;border-bottom:1px solid #21262d;vertical-align:top}
tr:hover td{background:#161b22}
.rank{color:#8b949e;width:2.5rem;text-align:right}
.score{color:#58a6ff;width:3rem;text-align:right;font-weight:600}
.title a{color:#c9d1d9;text-decoration:none}
.title a:hover{color:#58a6ff;text-decoration:underline}
.note{color:#8b949e;font-size:.75rem;margin-left:.4rem}
.open{color:#3fb950}.closed{color:#8b949e}
.badge{font-size:.7rem;padding:.1rem .3rem;border-radius:3px;font-weight:500}
.pr{background:#1f3757;color:#58a6ff}.issue{background:#1c2128;color:#8b949e}
.label{font-size:.65rem;padding:.1rem .25rem;border-radius:3px;background:#21262d;color:#8b949e;margin-right:.2rem}
.meta{color:#8b949e;font-size:.75rem;white-space:nowrap}
.labels{max-width:150px}
#filter-bar{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.5rem}
.filter-btn{font-size:.75rem;padding:.2rem .5rem;border:1px solid #30363d;background:#161b22;color:#8b949e;border-radius:3px;cursor:pointer}
.filter-btn.active{border-color:#58a6ff;color:#58a6ff}
</style>
</head>
<body>
<h1>Hermes Issues — Ranked by Importance</h1>
<div class="meta-bar">Built ${BUILT} · ${total} total · ${open} open · score = bug/crit weight + comments + reactions</div>
<div id="filter-bar">
<button class="filter-btn active" data-filter="all">All</button>
<button class="filter-btn" data-filter="open">Open</button>
<button class="filter-btn" data-filter="closed">Closed</button>
<button class="filter-btn" data-filter="issue">Issues only</button>
<button class="filter-btn" data-filter="pr">PRs only</button>
</div>
<input id="q" placeholder="filter by title, author, label…" autocomplete="off">
<table id="tbl">
<thead><tr><th>Rank</th><th>Score</th><th>Type</th><th>State</th><th>Title</th><th>Labels</th><th>Meta</th></tr></thead>
<tbody id="tbody">${rows}</tbody>
</table>
<script>
const tbody=document.getElementById('tbody')
const q=document.getElementById('q')
const rows=[...tbody.querySelectorAll('tr')]
let activeFilter='open'
function applyFilter(){
  const term=q.value.toLowerCase()
  rows.forEach(r=>{
    const text=r.textContent.toLowerCase()
    const stateMatch=activeFilter==='all'||r.querySelector('.state')?.textContent.trim()===activeFilter||(activeFilter==='issue'&&r.querySelector('.issue'))||(activeFilter==='pr'&&r.querySelector('.pr'))
    r.style.display=(stateMatch&&(!term||text.includes(term)))?'':'none'
  })
}
q.addEventListener('input',applyFilter)
document.getElementById('filter-bar').addEventListener('click',e=>{
  if(!e.target.matches('.filter-btn'))return
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'))
  e.target.classList.add('active')
  activeFilter=e.target.dataset.filter
  applyFilter()
})
</script>
</body>
</html>`

  await writeFile(`${DOCS}/index.html`, html)
  await writeFile(`${DOCS}/.nojekyll`, '')
  console.log(`built → ${DOCS}/index.html (${total} items)`)
}

main().catch(e => { console.error(e); process.exit(1) })
