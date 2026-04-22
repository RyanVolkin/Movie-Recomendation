const express = require('express')
const supabaseAdmin = require('../supabaseAdmin')

const router = express.Router()
const MOVIE_SELECT =
  'id:tconst,title,release_year,runtime,rating,numratings,genre1,genre2,genre3,likes_count:like_count'

// Using JS HDBSCAN loader below

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

// (previous Python helper removed) JS helper below

  async function runHdbscanJS(dataMatrix, minClusterSize = 2, minSamples = null) {
    // Try to load a JS HDBSCAN implementation. If not installed, return an error instructing install.
    let hdbscanModule
    try {
      hdbscanModule = require('hdbscan')
    } catch (e) {
      throw new Error('JS HDBSCAN module not found. Please run `npm install hdbscan` in the backend folder.')
    }

    function labelsToClusters(labels) {
      const clusters = {}
      labels.forEach((lab, idx) => {
        if (lab === -1) {
          clusters[`noise_${idx}`] = clusters[`noise_${idx}`] || []
          clusters[`noise_${idx}`].push(idx)
        } else {
          clusters[lab] = clusters[lab] || []
          clusters[lab].push(idx)
        }
      })
      return Object.values(clusters)
    }

    // Attempt a few common JS hdbscan module APIs
    // 1) module is a function that returns labels or an object with .labels
    if (typeof hdbscanModule === 'function') {
      const maybe = hdbscanModule(dataMatrix, { min_cluster_size: minClusterSize, min_samples: minSamples })
      if (Array.isArray(maybe)) return labelsToClusters(maybe)
      if (maybe && Array.isArray(maybe.labels)) return labelsToClusters(maybe.labels)
    }

    // 2) module exports HDBSCAN class
    if (hdbscanModule.HDBSCAN) {
      try {
        const Cls = hdbscanModule.HDBSCAN
        const inst = new Cls({ min_cluster_size: minClusterSize, min_samples: minSamples })
        if (typeof inst.fit === 'function') {
          const fitted = inst.fit(dataMatrix)
          if (Array.isArray(fitted)) return labelsToClusters(fitted)
          if (fitted && Array.isArray(fitted.labels)) return labelsToClusters(fitted.labels)
          if (Array.isArray(inst.labels)) return labelsToClusters(inst.labels)
        }
      } catch (e) {
        // fallthrough to next attempts
      }
    }

    // 3) module has .fit or .cluster static methods
    if (typeof hdbscanModule.fit === 'function') {
      const res = hdbscanModule.fit(dataMatrix, { min_cluster_size: minClusterSize, min_samples: minSamples })
      if (Array.isArray(res)) return labelsToClusters(res)
      if (res && Array.isArray(res.labels)) return labelsToClusters(res.labels)
    }

    if (typeof hdbscanModule.cluster === 'function') {
      const res = hdbscanModule.cluster(dataMatrix, { min_cluster_size: minClusterSize, min_samples: minSamples })
      if (Array.isArray(res)) return labelsToClusters(res)
      if (res && Array.isArray(res.labels)) return labelsToClusters(res.labels)
    }

    throw new Error('Unsupported JS HDBSCAN module API. Install a compatible `hdbscan` package.')
  }
router.get('/:id/recommend', async (req, res) => {
  const userId = sanitizeUserId(req.params.id)

  if (!userId) {
    return res.status(400).json({ error: 'userId is required.' })
  }

  const limitPerCluster = Math.max(Number.parseInt(req.query.limitPerCluster, 10) || 5, 1)
  const minClusterSize = Math.max(Number.parseInt(req.query.minClusterSize, 10) || 2, 1)
  const minSamples = req.query.minSamples !== undefined ? Number.parseInt(req.query.minSamples, 10) : null

  // Get liked movie ids
  const { data: likes, error: likesError } = await supabaseAdmin
    .from('user_movie_likes')
    .select('movie_id')
    .eq('user_id', userId)

  if (likesError) {
    return res.status(500).json({ error: likesError.message })
  }

  const likedIds = (likes || []).map((r) => r.movie_id)

  if (!likedIds.length) {
    return res.status(400).json({ error: 'No liked movies found for user.' })
  }

  // Fetch vectors for liked movies
  const { data: likedVectorsData, error: vectorsError } = await supabaseAdmin
    .from('movie_vectors')
    .select('tconst,genre_vector')
    .in('tconst', likedIds)

  if (vectorsError) {
    return res.status(500).json({ error: vectorsError.message })
  }

  function parseVector(v) {
    if (Array.isArray(v)) return v.map((n) => Number(n))
    if (typeof v === 'string') {
      return v.replace(/^[\[\]]|\s/g, '').split(',').map((s) => Number(s))
    }
    return []
  }

  const likedVectors = likedVectorsData.map((r) => ({ tconst: r.tconst, vector: parseVector(r.genre_vector) }))

  if (!likedVectors.length) {
    return res.status(400).json({ error: 'No vectors available for liked movies.' })
  }

  const dataMatrix = likedVectors.map((r) => r.vector)

  // Cluster liked vectors using HDBSCAN (JS). If clustering fails or returns none,
  // fall back to single cluster containing all liked vectors.
  let clusters = []
  try {
    clusters = await runHdbscanJS(dataMatrix, minClusterSize, minSamples)
  } catch (e) {
    clusters = []
  }

  if (!clusters || !clusters.length) {
    clusters = [dataMatrix.map((_, i) => i)]
  }

  function euclidean(a, b) {
    let s = 0
    for (let i = 0; i < a.length; i += 1) {
      const d = (a[i] || 0) - (b[i] || 0)
      s += d * d
    }
    return Math.sqrt(s)
  }

  function medoidIndex(indices) {
    if (indices.length === 1) return indices[0]
    let best = indices[0]
    let bestSum = Infinity
    for (const i of indices) {
      let sum = 0
      for (const j of indices) {
        if (i === j) continue
        sum += euclidean(dataMatrix[i], dataMatrix[j])
      }
      if (sum < bestSum) {
        bestSum = sum
        best = i
      }
    }
    return best
  }

  // Get all movie vectors to search neighbors (note: may be heavy for very large datasets)
  const { data: allVectorsData, error: allVecsError } = await supabaseAdmin
    .from('movie_vectors')
    .select('tconst,genre_vector')

  if (allVecsError) {
    return res.status(500).json({ error: allVecsError.message })
  }

  const allVectors = allVectorsData.map((r) => ({ tconst: r.tconst, vector: parseVector(r.genre_vector) }))

  const results = []

  for (const clusterIndices of clusters) {
    const medoidIdx = medoidIndex(clusterIndices)
    const medoid = likedVectors[medoidIdx]
    const repVec = medoid.vector

    // compute distances to all vectors, exclude movies the user already liked
    const distances = []
    for (const mv of allVectors) {
      if (likedIds.includes(mv.tconst)) continue
      const d = euclidean(repVec, mv.vector)
      distances.push({ tconst: mv.tconst, distance: d, vector: mv.vector })
    }

    // Find the 50 closest neighbors to the medoid
    distances.sort((a, b) => a.distance - b.distance)
    const closest50 = distances.slice(0, 50)

    // For each of the 50, compute fit to cluster: sum of distances to all cluster members
    function clusterFitScore(candidateVec, clusterIndices) {
      let sum = 0
      for (const idx of clusterIndices) {
        sum += euclidean(candidateVec, dataMatrix[idx])
      }
      return sum
    }

    // Compute fit score for each of the 50
    const withFit = closest50.map((entry) => ({
      ...entry,
      fitScore: clusterFitScore(entry.vector, clusterIndices)
    }))

    // Sort by fit score (lower is better), pick top 5
    withFit.sort((a, b) => a.fitScore - b.fitScore)
    const best5 = withFit.slice(0, limitPerCluster)

    // Fetch movie details for neighbors (and medoid if available)
    const tconstsToFetch = [...new Set([medoid.tconst, ...best5.map(d => d.tconst)])]
    const { data: movieDetails, error: movieDetailsError } = await supabaseAdmin
      .from('movies')
      .select(MOVIE_SELECT)
      .in('tconst', tconstsToFetch)

    if (movieDetailsError) {
      return res.status(500).json({ error: movieDetailsError.message })
    }

    const byId = (movieDetails || []).reduce((acc, m) => {
      acc[m.id] = m
      return acc
    }, {})

    results.push({
      medoid: medoid.tconst,
      medoid_movie: byId[medoid.tconst] || null,
      neighbors: best5.map(({ tconst, distance, fitScore }) => {
        const movie = byId[tconst]
        if (!movie) return null
        return { ...movie, distance_to_medoid: distance, fit_score: fitScore }
      }).filter(Boolean),
    })
  }

  return res.json({ clusters: results })
})

module.exports = router
