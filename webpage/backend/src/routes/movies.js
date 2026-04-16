const express = require('express')
const supabaseAdmin = require('../supabaseAdmin')

const router = express.Router()

router.get('/liked', async (req, res) => {
  const limit = Number.parseInt(req.query.limit, 10) || 10

  const { data, error } = await supabaseAdmin
    .from('movies')
    .select('id,title,overview,poster_url,likes_count,created_at')
    .order('likes_count', { ascending: false })
    .limit(limit)

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.json(data)
})

router.get('/search', async (req, res) => {
  const q = req.query.q?.trim()

  if (!q) {
    return res.status(400).json({ error: 'Query parameter q is required.' })
  }

  const { data, error } = await supabaseAdmin
    .from('movies')
    .select('id,title,overview,poster_url,likes_count,created_at')
    .ilike('title', `%${q}%`)
    .order('likes_count', { ascending: false })
    .limit(25)

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.json(data)
})

router.post('/', async (req, res) => {
  const { title, overview = '', poster_url = '' } = req.body

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'title is required.' })
  }

  const { data, error } = await supabaseAdmin
    .from('movies')
    .insert({ title: title.trim(), overview, poster_url })
    .select('id,title,overview,poster_url,likes_count,created_at')
    .single()

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.status(201).json(data)
})

router.post('/:id/like', async (req, res) => {
  const id = req.params.id

  const { data: movie, error: fetchError } = await supabaseAdmin
    .from('movies')
    .select('id,likes_count')
    .eq('id', id)
    .single()

  if (fetchError || !movie) {
    return res.status(404).json({ error: 'Movie not found.' })
  }

  const nextLikes = (movie.likes_count || 0) + 1

  const { data, error } = await supabaseAdmin
    .from('movies')
    .update({ likes_count: nextLikes })
    .eq('id', id)
    .select('id,title,overview,poster_url,likes_count,created_at')
    .single()

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.json(data)
})

module.exports = router
