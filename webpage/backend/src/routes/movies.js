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
  console.log('HIT /liked/count', { userId });

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

  console.log('DEBUG liked/count:', { userId, count, data });
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

// (previous Python helper removed) JS helper below

  async function runHdbscanJS(dataMatrix, minClusterSize = 2, minSamples = null) {
    let hdbscanModule

    try {
      hdbscanModule = require('hdbscan')
    } catch (e) {
      throw new Error('JS HDBSCAN module not found. Please run `npm install hdbscan` in the backend folder.')
    }

    const HdbscanCtor = hdbscanModule.Hdbscan || hdbscanModule.default?.Hdbscan || hdbscanModule.default

    if (typeof HdbscanCtor !== 'function') {
      throw new Error('Unsupported JS HDBSCAN module API. Expected an export named `Hdbscan`.')
    }

    const instance = new HdbscanCtor(dataMatrix, minClusterSize, minSamples ?? minClusterSize)

    if (typeof instance.getClusters !== 'function') {
      throw new Error('Unsupported JS HDBSCAN module API. Expected `getClusters()` on the Hdbscan instance.')
    }

    const clusters = instance.getClusters()
    return Array.isArray(clusters) ? clusters : []
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
    let arr = []
    if (Array.isArray(v)) {
      arr = v.map((n) => Number(n))
    } else if (typeof v === 'string') {
      // Remove only leading [ and trailing ]
      arr = v.replace(/^\[|\]$/g, '').split(',').map((s) => Number(s))
    }
    return arr
  }

  const likedVectors = likedVectorsData.map((r) => ({ tconst: r.tconst, vector: parseVector(r.genre_vector) }))

  if (!likedVectors.length) {
    return res.status(400).json({ error: 'No vectors available for liked movies.' })
  }

  // Synthetic generation: create synthetic variants by swapping genres toward
  // the user's most-liked genres, then blend vectors toward the genre centroids.
  const SYNTH_K = 10 // max synthetic variants per liked movie
  const SYNTH_BLEND_AMOUNT = 0.45

  function blendVectors(source, target, amount) {
    const length = Math.max(source.length, target.length)
    const out = new Array(length)
    for (let i = 0; i < length; i += 1) {
      const s = source[i] || 0
      const t = target[i] || 0
      out[i] = s + amount * (t - s)
    }
    return out
  }

  function euclidean(a, b) {
    let s = 0
    const len = Math.max(a.length, b.length)
    for (let i = 0; i < len; i += 1) {
      const d = (a[i] || 0) - (b[i] || 0)
      s += d * d
    }
    return Math.sqrt(s)
  }

  // Synthetic generation: create interpolated vectors between liked vectors
  // and popular genre centroids across multiple blend steps. Produces a
  // smooth range of candidates per genre without persisting new movies.
  const SYNTH_STEPS = 20
  const SYNTH_STEP = 0.05
  const MAX_SYNTH_TOTAL = 400


  // Load liked movie genres, years
  const { data: likedMovieDetails, error: likedMovieDetailsError } = await supabaseAdmin
    .from('movies')
    .select('tconst,genre1,genre2,genre3,release_year')
    .in('tconst', likedIds)

  if (likedMovieDetailsError) {
    return res.status(500).json({ error: likedMovieDetailsError.message })
  }

  const genreCounts = {}
  const genreVectors = {}
  const vectById = {}
  for (const lv of likedVectors) vectById[lv.tconst] = lv.vector

  const movieGenresById = {}
  for (const m of likedMovieDetails || []) {
    const genres = [m.genre1, m.genre2, m.genre3].filter(Boolean).map((g) => g.trim())
    movieGenresById[m.tconst] = genres
    const vec = vectById[m.tconst]
    for (const g of genres) {
      genreCounts[g] = (genreCounts[g] || 0) + 1
      if (vec) {
        if (!genreVectors[g]) genreVectors[g] = []
        genreVectors[g].push(vec)
      }
    }
  }

  const genreCentroids = {}
  for (const [g, vecs] of Object.entries(genreVectors)) {
    const L = vecs.length
    if (!L) continue
    const len = vecs[0].length
    const avg = new Array(len).fill(0)
    for (const v of vecs) {
      for (let i = 0; i < len; i += 1) avg[i] += (v[i] || 0)
    }
    for (let i = 0; i < len; i += 1) avg[i] /= L
    genreCentroids[g] = avg
  }

  const popularityList = Object.keys(genreCounts).sort((a, b) => genreCounts[b] - genreCounts[a])

  const syntheticVectors = []
  let synthCount = 0

  // For each popular genre, interpolate between a set of base vectors and the
  // genre centroid at multiple blend weights to produce a smooth range.
  for (const genre of popularityList) {
    if (synthCount >= MAX_SYNTH_TOTAL) break
    const centroid = genreCentroids[genre]
    if (!centroid) continue

    // Base vectors: prefer liked movies that do NOT already have this genre
    const baseVecs = likedVectors.filter((lv) => {
      const g = movieGenresById[lv.tconst] || []
      return !g.includes(genre)
    })
    // Fallback to using all liked vectors if none without the genre
    const candidates = baseVecs.length ? baseVecs : likedVectors

    for (const b of candidates) {
      if (synthCount >= MAX_SYNTH_TOTAL) break
      for (let step = 1; step <= SYNTH_STEPS; step += 1) {
        const weight = Math.min(1 - 1e-6, step * SYNTH_STEP)
        if (weight <= 0) continue
        const synth = blendVectors(b.vector, centroid, weight)
        syntheticVectors.push({ tconst: null, vector: synth })
        synthCount += 1
        if (synthCount >= MAX_SYNTH_TOTAL) break
      }
    }
  }

  const augmentedVectors = [...likedVectors, ...syntheticVectors]
  const dataMatrix = augmentedVectors.map((r) => r.vector)

  // Cluster liked vectors using HDBSCAN (JS) with console.log suppressed
  let clusters = []
  const originalLog = console.log;
  console.log = () => {};
  try {
    clusters = await runHdbscanJS(dataMatrix, SYNTH_K, minSamples ?? minClusterSize)
  } catch (e) {
    clusters = []
  } finally {
    console.log = originalLog;
  }
  console.log(clusters);
  if (!clusters || !clusters.length) {
    clusters = [dataMatrix.map((_, i) => i)]
  }

  function medoidIndex(indices) {
    if (indices.length === 1) return indices[0]
        // Debug: log best5
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

  // Collect all candidates from all clusters
  let allCandidates = [];
  let allTconsts = new Set();

  for (const clusterIndices of clusters) {
    const medoidIdx = medoidIndex(clusterIndices);
    const repVec = augmentedVectors[medoidIdx].vector;
    const { data: closest50, error: rpcError } = await supabaseAdmin.rpc('match_movies', {
      query_embedding: repVec,
      match_threshold: 0.7,
      match_count: 50,
    });
    if (rpcError) {
      return res.status(500).json({ error: rpcError.message });
    }
    function clusterFitScore(candidateVec, clusterIndices) {
      let sum = 0;
      for (const idx of clusterIndices) {
        sum += euclidean(candidateVec, dataMatrix[idx]);
      }
      return sum;
    }
    const withFit = (closest50 || []).map((entry) => {
      const vector = Array.isArray(entry.vector)
        ? entry.vector
        : (typeof entry.vector === 'string' ? parseVector(entry.vector) : []);
      return {
        tconst: entry.tconst,
        vector,
        fitScore: clusterFitScore(vector, clusterIndices)
      };
    });
    for (const item of withFit) {
      if (!likedIds.includes(item.tconst) && !allTconsts.has(item.tconst)) {
        item.clusterSize = clusterIndices.length;
        allCandidates.push(item);
        allTconsts.add(item.tconst);
      }
    }
  }

  // Fetch movie details for all candidates
  const tconstsToFetch = Array.from(allTconsts);
  const { data: movieDetails, error: movieDetailsError } = await supabaseAdmin
    .from('movies')
    .select(MOVIE_SELECT)
    .in('tconst', tconstsToFetch);
  if (movieDetailsError) {
    return res.status(500).json({ error: movieDetailsError.message });
  }

  // Filter candidates to only those that share a with a liked movie
  const filteredCandidates = allCandidates.filter(item => {
    const details = movieDetails.find(m => m.id === item.tconst);
    return details
  });
  // Compute liked-year stats for outlier detection
  const likedYears = (likedMovieDetails || [])
    .map((m) => Number(m.release_year))
    .filter((y) => Number.isFinite(y))

  let yearMean = 0
  let yearStd = 0
  if (likedYears.length >= 2) {
    yearMean = likedYears.reduce((s, v) => s + v, 0) / likedYears.length
    const variance = likedYears.reduce((s, v) => s + Math.pow(v - yearMean, 2), 0) / (likedYears.length - 1)
    yearStd = Math.sqrt(variance)
  }

  const YEAR_Z_THRESHOLD = 2.0
  const YEAR_PENALTY = .25

  // Compute liked-rating stats for outlier detection
  const likedRatings = (likedMovieDetails || [])
    .map((m) => {
      const r = movieDetails.find((d) => d.id === m.tconst)
      return r ? Number(r.rating) : null
    })
    .filter((r) => Number.isFinite(r))

  let ratingMean = 0
  let ratingStd = 0
  if (likedRatings.length >= 2) {
    ratingMean = likedRatings.reduce((s, v) => s + v, 0) / likedRatings.length
    const variance = likedRatings.reduce((s, v) => s + Math.pow(v - ratingMean, 2), 0) / (likedRatings.length - 1)
    ratingStd = Math.sqrt(variance)
  }

  const RATING_Z_THRESHOLD = 2.0
  const RATING_PENALTY = .4

  // Add rating and yearOutlier flag to each candidate
  let candidatesToScore = filteredCandidates;
  candidatesToScore = candidatesToScore.map((item) => {
    const details = movieDetails.find((m) => m.id === item.tconst)
    const rating = details ? details.rating : 0
    let yearOutlier = false
    const year = details && details.release_year ? Number(details.release_year) : NaN
    if (likedYears.length >= 2 && Number.isFinite(year) && yearStd > 0) {
      const z = Math.abs(year - yearMean) / yearStd
      yearOutlier = z > YEAR_Z_THRESHOLD
    }
    return { ...item, rating, yearOutlier }
  })
  // Normalize fitScore to 0-1 (0=close, 1=far)
  const fitScores = candidatesToScore.map((item) => item.fitScore)
  const minFit = Math.min(...fitScores)
  const maxFit = Math.max(...fitScores)
  candidatesToScore.forEach((item) => {
    if (maxFit !== minFit) {
      item.normFitScore = (item.fitScore - minFit) / (maxFit - minFit)
    } else {
      item.normFitScore = 0
    }
  })
  // Sort using (rating)^(1-normFitScore) with year-outlier penalty applied
  candidatesToScore.sort((a, b) => {
    const aScoreBase = Math.pow(a.rating || 0, 1 - a.normFitScore)
    const bScoreBase = Math.pow(b.rating || 0, 1 - b.normFitScore)
    const aAdj = aScoreBase * (a.yearOutlier ? YEAR_PENALTY : 1)
    const bAdj = bScoreBase * (b.yearOutlier ? YEAR_PENALTY : 1)
    return bAdj - aAdj
  })
  // Return top 10 neighbors
  const top10 = candidatesToScore.slice(0, 10).map(item => {
    const details = movieDetails.find(m => m.id === item.tconst);
    return {
      ...details,
      fit_score: item.fitScore,
      norm_fit_score: item.normFitScore,
      rating: item.rating
    };
  }).filter(Boolean);
  return res.json({ neighbors: top10 });
})

module.exports = router
