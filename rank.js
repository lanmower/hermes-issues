import fs from 'fs/promises'
import yaml from 'js-yaml'

const RANKINGS_FILE = 'rankings.yaml'

async function loadRankings() {
  try {
    const content = await fs.readFile(RANKINGS_FILE, 'utf8')
    return yaml.load(content) || {}
  } catch (e) {
    return {}
  }
}

async function saveRankings(rankings) {
  const content = yaml.dump(rankings, { lineWidth: -1, quotingType: '"' })
  await fs.writeFile(RANKINGS_FILE, content)
}

const args = process.argv.slice(2)
const cmd = args[0]

if (cmd === 'list') {
  const rankings = await loadRankings()
  console.log(yaml.dump(rankings))
} else if (cmd === 'show') {
  const number = args[1]
  const rankings = await loadRankings()
  console.log(yaml.dump({ [number]: rankings[number] }))
} else if (args.length >= 2) {
  const number = args[0]
  const scoreArg = args[1]
  const note = args[2]

  const rankings = await loadRankings()
  let score = parseInt(scoreArg)

  if (scoreArg.startsWith('+') || scoreArg.startsWith('-')) {
    const currentScore = rankings[number]?.score || 0
    score = currentScore + parseInt(scoreArg)
  }

  if (!rankings[number]) rankings[number] = {}
  rankings[number].score = score
  if (note !== undefined) {
    rankings[number].note = note
  }

  await saveRankings(rankings)
  console.log(`Updated #${number}: score=${score}${note !== undefined ? `, note="${note}"` : ''}`)
} else {
  console.log('Usage:')
  console.log('  bun rank.js list')
  console.log('  bun rank.js show <number>')
  console.log('  bun rank.js <number> <score> [note]')
  console.log('  bun rank.js <number> +50')
}
