const express = require('express')
const supabaseAdmin = require('../supabaseAdmin')

const router = express.Router()
const MOVIE_SELECT =
  'id:tconst,title,release_year,runtime,rating,numratings,genre1,genre2,genre3,likes_count:like_count'

function sanitizeUserId(value) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
}

async function getMovieById(id) {
  const { data, error } = await supabaseAdmin
    .from('movies')
    .select(MOVIE_SELECT)
    .eq('tconst', id)
    .single()

  return { data, error }
}

router.get('/liked', async (req, res) => {
  const limit = Number.parseInt(req.query.limit, 10) || 10

  const { data, error } = await supabaseAdmin
    .from('movies')
    .select(MOVIE_SELECT)
    .order('like_count', { ascending: false })
    .limit(limit)

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.json(data)
})

router.get('/search', async (req, res) => {
  const q = req.query.q?.trim()
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100)
  const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0)

  if (!q) {
    return res.status(400).json({ error: 'Query parameter q is required.' })
  }

  const { data, error } = await supabaseAdmin
    .from('movies')
    .select(MOVIE_SELECT)
    .ilike('title', `%${q}%`)
    .order('like_count', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.json(data)
})

router.post('/', async (req, res) => {
  const {
    tconst,
    id,
    title,
    release_year,
    runtime,
    rating,
    numratings,
    genre1,
    genre2 = '',
    genre3 = '',
  } = req.body

  const movieId = (tconst || id || '').trim()

  if (!movieId) {
    return res.status(400).json({ error: 'tconst is required.' })
  }

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'title is required.' })
  }

  if (!Number.isInteger(release_year)) {
    return res.status(400).json({ error: 'release_year must be an integer.' })
  }

  if (!Number.isInteger(runtime)) {
    return res.status(400).json({ error: 'runtime must be an integer.' })
  }

  if (typeof rating !== 'number') {
    return res.status(400).json({ error: 'rating must be a number.' })
  }

  if (!Number.isInteger(numratings)) {
    return res.status(400).json({ error: 'numratings must be an integer.' })
  }

  if (!genre1 || !genre1.trim()) {
    return res.status(400).json({ error: 'genre1 is required.' })
  }

  const { data, error } = await supabaseAdmin
    .from('movies')
    .insert({
      tconst: movieId,
      title: title.trim(),
      release_year,
      runtime,
      rating,
      numratings,
      genre1: genre1.trim(),
      genre2: genre2.trim(),
      genre3: genre3.trim(),
    })
    .select(MOVIE_SELECT)
    .single()

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.status(201).json(data)
})

router.get('/likes', async (req, res) => {
  const userId = sanitizeUserId(req.query.userId)

  if (!userId) {
    return res.status(400).json({ error: 'userId is required.' })
  }

  const { data, error } = await supabaseAdmin
    .from('user_movie_likes')
    .select('movie_id,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.json(data.map((item) => item.movie_id))
})

router.post('/:id/like', async (req, res) => {
  const id = req.params.id
  const userId = sanitizeUserId(req.body?.userId)

  if (!userId) {
    return res.status(400).json({ error: 'userId is required.' })
  }

  const { data: movie, error: movieError } = await getMovieById(id)

  if (movieError || !movie) {
    return res.status(404).json({ error: 'Movie not found.' })
  }

  const { data: insertedLikes, error: insertError } = await supabaseAdmin
    .from('user_movie_likes')
    .insert({ user_id: userId, movie_id: id }, { onConflict: 'user_id,movie_id', ignoreDuplicates: true })
    .select('user_id')

  if (insertError) {
    return res.status(500).json({ error: insertError.message })
  }

  if (!insertedLikes?.length) {
    return res.json({ liked: false, movie })
  }

  const nextLikes = (movie.likes_count || 0) + 1

  const { data: updatedMovie, error: updateError } = await supabaseAdmin
    .from('movies')
    .update({ like_count: nextLikes })
    .eq('tconst', id)
    .select(MOVIE_SELECT)
    .single()

  if (updateError) {
    return res.status(500).json({ error: updateError.message })
  }

  return res.json({ liked: true, movie: updatedMovie })
})

router.post('/:id/unlike', async (req, res) => {
  const id = req.params.id
  const userId = sanitizeUserId(req.body?.userId)

  if (!userId) {
    return res.status(400).json({ error: 'userId is required.' })
  }

  const { data: movie, error: movieError } = await getMovieById(id)

  if (movieError || !movie) {
    return res.status(404).json({ error: 'Movie not found.' })
  }

  const { data: deletedLikes, error: deleteError } = await supabaseAdmin
    .from('user_movie_likes')
    .delete()
    .eq('user_id', userId)
    .eq('movie_id', id)
    .select('movie_id')

  if (deleteError) {
    return res.status(500).json({ error: deleteError.message })
  }

  if (!deletedLikes?.length) {
    return res.json({ unliked: false, movie })
  }

  const nextLikes = Math.max((movie.likes_count || 0) - 1, 0)

  const { data: updatedMovie, error: updateError } = await supabaseAdmin
    .from('movies')
    .update({ like_count: nextLikes })
    .eq('tconst', id)
    .select(MOVIE_SELECT)
    .single()

  if (updateError) {
    return res.status(500).json({ error: updateError.message })
  }

  return res.json({ unliked: true, movie: updatedMovie })
})

module.exports = router
