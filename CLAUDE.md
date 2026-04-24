# hermes-issues

Ranks all issues/PRs from **nousresearch/hermes-agent** by importance.
The only committed data is `rankings.yaml` — score overrides per issue number.
`content/` and `docs/` are gitignored — generated fresh every CI run.

Live output: https://lanmower.github.io/hermes-issues/

---

## Agent task: re-rank 50 issues

Every session, do this exact workflow:

### 1. Check live issues on hermes-agent (ALWAYS do this first)

```bash
curl -sH "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/nousresearch/hermes-agent/issues?state=open&per_page=100&sort=updated" \
  | jq '.[] | "#\(.number) \(.title) [\(.labels|map(.name)|join(","))] \(.comments)c"'
```

Or scan https://github.com/nousresearch/hermes-agent/issues directly.
Also check the current ranked output: https://lanmower.github.io/hermes-issues/

### 2. See current overrides

```bash
bun rank.js list
```

### 3. Re-rank 50 issues using the CLI

```bash
# Set absolute score
bun rank.js 7858 200 "blocks v2 release"

# Adjust relative to current override
bun rank.js 7858 +50
bun rank.js 7920 -20

# Show one entry
bun rank.js show 7858
```

Score guidelines:
- **150–999** critical / blocks release / data loss / crash
- **80–149** important bug / high engagement
- **40–79** useful bug/feature (auto-score range for bugs)
- **10–39** enhancement / cosmetic
- **1–9** very low / stale / near-duplicate

### 4. Commit only rankings.yaml

```bash
git add rankings.yaml
git commit -m "re-rank: <what changed and why>"
git push
```

CI rebuilds and deploys automatically.

---

## Files

| File | Purpose |
|---|---|
| `rankings.yaml` | **Only committed data** — score + note overrides keyed by issue number |
| `rank.js` | CLI: `bun rank.js <number> <score> [note]` |
| `scripts/fetch_items.js` | CI: fetches ALL issues from hermes-agent → `content/items/` (gitignored) |
| `build.js` | CI: merges rankings into fetched data, builds `docs/index.html` |
| `.github/workflows/deploy.yml` | Daily 06:00 UTC + push → fetch → build → GH Pages |

## Key rules

- `content/` is always 1:1 with hermes-agent — fetch deletes stale files automatically
- Never commit `content/` or `docs/`
- `rankings.yaml` overrides replace auto-score entirely for that issue number
- The list order is purely by score descending — higher score = more important
