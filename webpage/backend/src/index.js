require('dotenv').config()

const express = require('express')
const cors = require('cors')

const movieRoutes = require('./routes/movies')

const app = express()
const port = process.env.PORT || 3000
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'

app.use(
  cors({
    origin: frontendUrl,
  }),
)
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'movie-recommendation-api' })
})

app.use('/api/movies', movieRoutes)

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`)
})
