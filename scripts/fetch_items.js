import fs from 'fs/promises'
import { readdirSync } from 'fs'
import yaml from 'js-yaml'

const REPO = 'nousresearch/hermes-agent'
const CONTENT_DIR = 'content/items'
const RANKINGS_FILE = 'rankings.yaml'

async function ghFetch(url, token) {
  const headers = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'hermes-issues' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`)
  return {
    data: await res.json(),
    link: res.headers.get('link')
  }
}

async function fetchAll(endpoint, token) {
  const items = []
  let nextUrl = `https://api.github.com/${endpoint}&per_page=100`

  while (nextUrl) {
    const { data, link } = await ghFetch(nextUrl, token)
    if (!Array.isArray(data) || !data.length) break
    items.push(...data)

    nextUrl = null
    if (link) {
      const match = link.match(/<([^>]+)>;\s*rel="next"/)
      if (match) nextUrl = match[1]
    }
  }
  return items
}

function autoScore(item) {
  const labels = (item.labels || []).map(l => (typeof l === 'string' ? l : l.name).toLowerCase())
  const text = (item.title + ' ' + (item.body || '')).toLowerCase()
  let s = 0
  if (labels.includes('bug') || labels.includes('regression')) s += 40
  if (labels.includes('critical') || text.includes('crash') || text.includes('broken')) s += 30
  if (text.includes('urgent') || text.includes('fails') || text.includes('error')) s += 10
  if (labels.includes('enhancement') || labels.includes('feature')) s += 5
  s += Math.min((item.comments || 0) * 2, 20)
  s += Math.min((item.reactions?.total_count || 0), 10)
  if (item.state === 'open') s += 5
  return s
}

async function main() {
  const token = process.env.GITHUB_TOKEN
  await fs.mkdir(CONTENT_DIR, { recursive: true })

  // GitHub /issues endpoint returns both issues and PRs with state=all
  const raw = await fetchAll(`repos/${REPO}/issues?state=all`, token)

  let rankings = {}
  try { rankings = yaml.load(await fs.readFile(RANKINGS_FILE, 'utf8')) || {} } catch {}

  const fetched = new Set()
  const items = raw.map(item => {
    const slug = `item-${item.number}`
    fetched.add(`${slug}.yaml`)
    return {
      id: slug,
      slug,
      number: item.number,
      title: item.title,
      state: item.state,
      author: item.user.login,
      labels: item.labels.map(l => (typeof l === 'string' ? l : l.name)),
      is_pr: !!item.pull_request,
      url: item.html_url,
      comments: item.comments,
      reactions: item.reactions?.total_count || 0,
      body: (item.body || '').slice(0, 2000),
      created_at: item.created_at,
      score: rankings[item.number]?.score ?? autoScore(item),
      note: rankings[item.number]?.note ?? '',
    }
  })

  // Delete stale files (issues closed/deleted upstream)
  let stale = 0
  try {
    const existing = readdirSync(CONTENT_DIR).filter(f => f.endsWith('.yaml'))
    await Promise.all(existing.filter(f => !fetched.has(f)).map(f => {
      stale++
      return fs.unlink(`${CONTENT_DIR}/${f}`)
    }))
  } catch {}

  await Promise.all(items.map(item =>
    fs.writeFile(`${CONTENT_DIR}/${item.slug}.yaml`, yaml.dump(item, { lineWidth: -1 }))
  ))

  console.log(`synced ${items.length} items (removed ${stale} stale) → ${CONTENT_DIR}`)
}

main().catch(e => { console.error(e); process.exit(1) })
