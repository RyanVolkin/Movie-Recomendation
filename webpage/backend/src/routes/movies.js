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
router.get('/liked/count', async (req, res) => {
  const userId = sanitizeUserId(req.query.userId)

  if (!userId) {
    return res.status(400).json({ error: 'userId is required.' })
  }
  const { data, count, error } = await supabaseAdmin
    .from('user_movie_likes')
    .select('movie_id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.json({ count: count || 0 })
});

router.get('/liked', async (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 10, 1), 100)
  const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0)
  const userId = sanitizeUserId(req.query.userId)

  // If userId is provided, paginate this user's liked movies by like recency.
  if (userId) {
    const { data: likesPage, error: likesError } = await supabaseAdmin
      .from('user_movie_likes')
      .select('movie_id,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (likesError) {
      return res.status(500).json({ error: likesError.message })
    }

    const movieIds = (likesPage || []).map((row) => row.movie_id)
    if (!movieIds.length) {
      return res.json([])
    }

    const { data: movies, error: moviesError } = await supabaseAdmin
      .from('movies')
      .select(MOVIE_SELECT)
      .in('tconst', movieIds)

    if (moviesError) {
      return res.status(500).json({ error: moviesError.message })
    }

    const movieById = (movies || []).reduce((acc, movie) => {
      acc[movie.id] = movie
      return acc
    }, {})

    const ordered = movieIds.map((id) => movieById[id]).filter(Boolean)
    return res.json(ordered)
  }

  const { data, error } = await supabaseAdmin
    .from('movies')
    .select(MOVIE_SELECT)
    .order('like_count', { ascending: false })
    .range(offset, offset + limit - 1)

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

  // Query for exact matches (no limit)
  const { data: exactData, error: exactError } = await supabaseAdmin
    .from('movies')
    .select(MOVIE_SELECT)
    .eq('title', q)
    .order('like_count', { ascending: false });

  if (exactError) {
    return res.status(500).json({ error: exactError.message })
  }
  // Query for partial matches (with limit/offset), excluding exact matches
  const { data: partialData, error: partialError } = await supabaseAdmin
    .from('movies')
    .select(MOVIE_SELECT)
    .ilike('title', `%${q}%`)
    .neq('title', q)
    .order('like_count', { ascending: false })
    .range(offset, offset + limit - 1);

  if (partialError) {
    return res.status(500).json({ error: partialError.message })
  }

  return res.json(exactData.concat(partialData))
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

function parseVector(value) {
  if (Array.isArray(value)) {
    return value.map((n) => Number(n)).filter((n) => Number.isFinite(n))
  }

  if (typeof value === 'string') {
    return value
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((n) => Number.isFinite(n))
  }

  return []
}

function euclideanDistance(a, b) {
  const length = Math.max(a.length, b.length)
  let sum = 0

  for (let index = 0; index < length; index += 1) {
    const delta = (a[index] || 0) - (b[index] || 0)
    sum += delta * delta
  }

  return Math.sqrt(sum)
}

async function runHdbscanJS(dataMatrix, minClusterSize = 2, minSamples = null) {
  try {
    const hdbscanModule = require('hdbscan')
    const HdbscanCtor = hdbscanModule.Hdbscan || hdbscanModule.default?.Hdbscan || hdbscanModule.default

    if (typeof HdbscanCtor !== 'function') {
      return []
    }

    const instance = new HdbscanCtor(dataMatrix, minClusterSize, minSamples ?? minClusterSize)

    if (typeof instance.getClusters !== 'function') {
      return []
    }

    const clusters = instance.getClusters()
    return Array.isArray(clusters) ? clusters.filter((cluster) => Array.isArray(cluster) && cluster.length) : []
  } catch (error) {
    return []
  }
}

function buildCentroids(itemsByGenre) {
  const centroids = {}

  for (const [genre, vectors] of Object.entries(itemsByGenre)) {
    if (!vectors.length) {
      continue
    }

    const length = vectors[0].length
    const centroid = new Array(length).fill(0)

    for (const vector of vectors) {
      for (let index = 0; index < length; index += 1) {
        centroid[index] += vector[index] || 0
      }
    }

    for (let index = 0; index < length; index += 1) {
      centroid[index] /= vectors.length
    }

    centroids[genre] = centroid
  }

  return centroids
}

function medoidIndex(indices, vectors) {
  if (indices.length <= 1) {
    return indices[0] ?? 0
  }

  let bestIndex = indices[0]
  let bestDistance = Infinity

  for (const candidateIndex of indices) {
    let totalDistance = 0

    for (const otherIndex of indices) {
      if (candidateIndex === otherIndex) {
        continue
      }

      totalDistance += euclideanDistance(vectors[candidateIndex], vectors[otherIndex])
    }

    if (totalDistance < bestDistance) {
      bestDistance = totalDistance
      bestIndex = candidateIndex
    }
  }

  return bestIndex
}

function toMovieLookup(rows) {
  return (rows || []).reduce((lookup, row) => {
    lookup[row.id] = row
    return lookup
  }, {})
}

function logTiming(label, startTime) {
  // Debug timing output removed
  return Date.now()
}

async function runHdbscanJSQuiet(dataMatrix, minClusterSize = 2, minSamples = null) {
  const originalLog = console.log
  const originalWarn = console.warn
  try {
    console.log = () => {}
    console.warn = () => {}
    return await runHdbscanJS(dataMatrix, minClusterSize, minSamples)
  } finally {
    console.log = originalLog
    console.warn = originalWarn
  }
}

router.get('/:id/recommend', async (req, res) => {
  const startTime = Date.now()
  const userId = sanitizeUserId(req.params.id)

  if (!userId) {
    return res.status(400).json({ error: 'userId is required.' })
  }

  const minClusterSize = Math.max(Number.parseInt(req.query.minClusterSize, 10) || 2, 1)

  const { data: likes, error: likesError } = await supabaseAdmin
    .from('user_movie_likes')
    .select('movie_id')
    .eq('user_id', userId)

  if (likesError) {
    return res.status(500).json({ error: likesError.message })
  }

  const likedIds = [...new Set((likes || []).map((row) => row.movie_id).filter(Boolean))]

  if (!likedIds.length) {
    return res.status(400).json({ error: 'No liked movies found for user.' })
  }

  let currentTime = Date.now()
  const [likedVectorsResponse, likedDetailsResponse] = await Promise.all([
    supabaseAdmin.from('movie_vectors').select('tconst,genre_vector').in('tconst', likedIds),
    supabaseAdmin.from('movies').select('tconst,genre1,genre2,genre3,release_year,numratings').in('tconst', likedIds),
  ])

  currentTime = logTiming('Fetch liked vectors & details', currentTime)

  if (likedVectorsResponse.error) {
    return res.status(500).json({ error: likedVectorsResponse.error.message })
  }

  if (likedDetailsResponse.error) {
    return res.status(500).json({ error: likedDetailsResponse.error.message })
  }

  const likedVectors = (likedVectorsResponse.data || [])
    .map((row) => ({ tconst: row.tconst, vector: parseVector(row.genre_vector) }))
    .filter((row) => row.vector.length)

  if (!likedVectors.length) {
    return res.status(400).json({ error: 'No vectors available for liked movies.' })
  }

  const likedDetailsById = toMovieLookup(likedDetailsResponse.data || [])
  const likedVectorById = likedVectors.reduce((lookup, row) => {
    lookup[row.tconst] = row.vector
    return lookup
  }, {})

  const likedYears = (likedDetailsResponse.data || [])
    .map((movie) => Number(movie.release_year))
    .filter((year) => Number.isFinite(year))
  const minLikedYear = likedYears.length ? Math.min(...likedYears) : null

  const likedNumRatings = (likedDetailsResponse.data || [])
    .map((movie) => Number(movie.numratings))
    .filter((numRatings) => Number.isFinite(numRatings))
  const minLikedNumRatings = likedNumRatings.length ? Math.min(...likedNumRatings) : null

  const genreVectors = {}
  const genreCounts = {}
  const genresByMovieId = {}

  for (const likedMovie of likedDetailsResponse.data || []) {
    const genres = [likedMovie.genre1, likedMovie.genre2, likedMovie.genre3]
      .filter((genre) => typeof genre === 'string' && genre.trim())
      .map((genre) => genre.trim())

    genresByMovieId[likedMovie.tconst] = genres

    const vector = likedVectorById[likedMovie.tconst]
    for (const genre of genres) {
      genreCounts[genre] = (genreCounts[genre] || 0) + 1
      if (!vector) {
        continue
      }

      if (!genreVectors[genre]) {
        genreVectors[genre] = []
      }

      genreVectors[genre].push(vector)
    }
  }

  currentTime = logTiming('Build genre lookups', currentTime)

  const genreCentroids = buildCentroids(genreVectors)
  const topGenres = Object.entries(genreCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([genre]) => genre)

  currentTime = logTiming('Build genre centroids', currentTime)

  const GLOBAL_SYNTHETIC_CAP = 100
  const SYTHETIC_K = Math.max(1, Math.min(8, Math.floor(GLOBAL_SYNTHETIC_CAP / likedVectors.length)))
  const syntheticVectors = []
  const syntheticBlend = 0.35
  const syntheticCountByMovie = {}

  for (const genre of topGenres) {
    const centroid = genreCentroids[genre]
    if (!centroid) continue

    for (const likedVector of likedVectors) {

      const movieId = likedVector.tconst
      const genres = genresByMovieId[movieId] || []
      if (genres.includes(genre)) continue

      const currentCount = syntheticCountByMovie[movieId] || 0
      if (currentCount >= SYTHETIC_K) continue

      syntheticVectors.push({
        tconst: null,
        vector: likedVector.vector.map((value, index) => value + syntheticBlend * ((centroid[index] || 0) - value)),
      })

      syntheticCountByMovie[movieId] = currentCount + 1
    }
  }

  currentTime = logTiming('Generate synthetic vectors', currentTime)

  const augmentedVectors = [...likedVectors, ...syntheticVectors]
  const dataMatrix = augmentedVectors.map((row) => row.vector)
  const clusters = (await runHdbscanJSQuiet(dataMatrix, SYTHETIC_K * 1.5)) 
  currentTime = logTiming('HDBSCAN clustering', currentTime)
    const clusterList = clusters.length ? clusters : [dataMatrix.map((_, index) => index)]

  const candidateMap = new Map()
  const likedIdSet = new Set(likedIds)
  let rpcCallCount = 0

  const rpcPromises = clusterList
    .sort((a, b) => b.length - a.length)
    .slice(0, 5)
    .map((clusterIndices) => {
      const medoidIdx = medoidIndex(clusterIndices, dataMatrix)
      const repVec = augmentedVectors[medoidIdx]?.vector

      if (!repVec || !repVec.length) {
        return Promise.resolve(null)
      }

      return supabaseAdmin.rpc('match_movies', {
        query_embedding: repVec,
        match_threshold: 0.5,
        match_count: 10,
        min_release_year: minLikedYear === null ? null : minLikedYear - 5,
        min_numratings: minLikedNumRatings === null ? null : Math.ceil(minLikedNumRatings * 0.8),
      }).then(result => ({ clusterIndices, result }))
    })

  const rpcResults = await Promise.all(rpcPromises)

  for (const rpcData of rpcResults) {
    if (!rpcData) continue

    const { clusterIndices, result } = rpcData
    const { data: matches, error: rpcError } = result

    if (rpcError) {
      return res.status(500).json({ error: rpcError.message })
    }

    rpcCallCount++
    for (const match of matches || []) {
      if (!match?.tconst || likedIdSet.has(match.tconst) || candidateMap.has(match.tconst)) {
        continue
      }

      const vector = parseVector(match.vector)
      if (!vector.length) {
        continue
      }

      const fitScore = clusterIndices.reduce(
        (sum, clusterIndex) => sum + euclideanDistance(vector, dataMatrix[clusterIndex]),
        0,
      )

      candidateMap.set(match.tconst, {
        tconst: match.tconst,
        vector,
        fitScore,
      })
    }
  }

  currentTime = logTiming(`RPC calls (${rpcCallCount} clusters)`, currentTime)

  const candidates = [...candidateMap.values()]

  if (!candidates.length) {
    return res.json({ neighbors: [] })
  }

  const candidateIds = candidates.map((candidate) => candidate.tconst)
  const { data: movieDetails, error: movieDetailsError } = await supabaseAdmin
    .from('movies')
    .select(MOVIE_SELECT)
    .in('tconst', candidateIds)

  if (movieDetailsError) {
    return res.status(500).json({ error: movieDetailsError.message })
  }

  currentTime = logTiming('Fetch candidate movie details', currentTime)

  const movieDetailsById = toMovieLookup(movieDetails || [])

  let filteredCandidates = candidates.filter((candidate) => movieDetailsById[candidate.tconst])

  if (minLikedYear !== null) {
    filteredCandidates = filteredCandidates.filter((candidate) => {
      const details = movieDetailsById[candidate.tconst]
      return Number(details.release_year) >= minLikedYear - 5
    })
  }

  if (minLikedNumRatings !== null) {
    filteredCandidates = filteredCandidates.filter((candidate) => {
      const details = movieDetailsById[candidate.tconst]
      return Number(details.numratings) >= minLikedNumRatings * 0.8
    })
  }

  currentTime = logTiming('Apply year/numratings filters', currentTime)

  if (!filteredCandidates.length) {
    return res.json({ neighbors: [] })
  }

  const fitScores = filteredCandidates.map((candidate) => candidate.fitScore)
  const minFit = Math.min(...fitScores)
  const maxFit = Math.max(...fitScores)

  const scoredCandidates = filteredCandidates
    .map((candidate) => {
      const details = movieDetailsById[candidate.tconst]
      const rating = Number(details.rating) || 0
      const normFitScore = maxFit === minFit ? 0 : (candidate.fitScore - minFit) / (maxFit - minFit)
      const score = rating * (1 - normFitScore)

      return {
        ...details,
        fit_score: candidate.fitScore,
        norm_fit_score: normFitScore,
        score,
      }
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      if ((right.rating || 0) !== (left.rating || 0)) {
        return (right.rating || 0) - (left.rating || 0)
      }

      return left.fit_score - right.fit_score
    })


  currentTime = logTiming('Score and sort candidates', currentTime)
  const finalResult = scoredCandidates.slice(0, 10)
  logTiming('TOTAL RECOMMEND REQUEST', startTime)

  return res.json({ neighbors: finalResult })
})

module.exports = router
