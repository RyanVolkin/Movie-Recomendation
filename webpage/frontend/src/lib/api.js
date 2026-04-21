const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error || 'Request failed.')
  }

  return response.json()
}

export function fetchMostLiked(limit = 10) {
  return request(`/movies/liked?limit=${limit}`)
}

export function searchMovies(query, options = {}) {
  const limit = options.limit ?? 50
  const offset = options.offset ?? 0

  return request(
    `/movies/search?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`,
  )
}

export function fetchUserLikedMovieIds(userId) {
  return request(`/movies/likes?userId=${encodeURIComponent(userId)}`)
}

export function likeMovie(id, userId) {
  return request(`/movies/${id}/like`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  })
}

export function unlikeMovie(id, userId) {
  return request(`/movies/${id}/unlike`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  })
}
