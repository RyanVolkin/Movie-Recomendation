require('dotenv').config()

const fs = require('fs/promises')
const path = require('path')
const supabaseAdmin = require('../src/supabaseAdmin')

const VECTOR_SIZE = 28
const BATCH_SIZE = 500

function parseCsv(text) {
  const rows = []
  let row = []
  let value = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const nextChar = text[index + 1]

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        value += '"'
        index += 1
      } else if (char === '"') {
        inQuotes = false
      } else {
        value += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }

    if (char === ',') {
      row.push(value)
      value = ''
      continue
    }

    if (char === '\n') {
      row.push(value)
      if (row.some((cell) => cell.trim() !== '')) {
        rows.push(row)
      }
      row = []
      value = ''
      continue
    }

    if (char === '\r') {
      continue
    }

    value += char
  }

  row.push(value)
  if (row.some((cell) => cell.trim() !== '')) {
    rows.push(row)
  }

  return rows
}

async function main() {
  const inputPath = process.argv[2]

  if (!inputPath) {
    throw new Error('Usage: npm run import:vectors -- <path-to-csv>')
  }

  const absolutePath = path.resolve(process.cwd(), inputPath)
  const fileContents = await fs.readFile(absolutePath, 'utf8')
  const rows = parseCsv(fileContents).filter((row) => row.some((cell) => cell.trim() !== ''))

  if (!rows.length) {
    throw new Error('CSV file is empty.')
  }

  const hasHeader = String(rows[0][0] || '').trim().toLowerCase() === 'tconst'
  const dataRows = hasHeader ? rows.slice(1) : rows

  if (!dataRows.length) {
    throw new Error('CSV file does not contain any data rows.')
  }

  const records = dataRows.map((row, index) => {
    const rowNumber = hasHeader ? index + 2 : index + 1

    if (row.length !== VECTOR_SIZE + 1) {
      throw new Error(
        `Row ${rowNumber} must contain exactly ${VECTOR_SIZE + 1} columns: tconst plus ${VECTOR_SIZE} genre values.`,
      )
    }

    const tconst = row[0].trim()
    if (!tconst) {
      throw new Error(`Row ${rowNumber} is missing tconst.`)
    }

    const genreVector = row.slice(1).map((cell, genreIndex) => {
      const parsed = Number(cell.trim())
      if (!Number.isFinite(parsed)) {
        throw new Error(`Row ${rowNumber}, genre column ${genreIndex + 1} must be numeric.`)
      }
      return parsed
    })

    return {
      tconst,
      genre_vector: `[${genreVector.join(',')}]`,
    }
  })

  let processed = 0

  for (let offset = 0; offset < records.length; offset += BATCH_SIZE) {
    const batch = records.slice(offset, offset + BATCH_SIZE)

    const { error } = await supabaseAdmin.from('movie_vectors').upsert(batch, {
      onConflict: 'tconst',
    })

    if (error) {
      throw new Error(error.message)
    }

    processed += batch.length
    const percent = ((processed / records.length) * 100).toFixed(1)
    console.log(`Progress: ${processed}/${records.length} (${percent}%)`)
  }

  console.log('Progress: 100.0% complete')

  console.log(`Imported ${records.length} movie vectors into public.movie_vectors.`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
