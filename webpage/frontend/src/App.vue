<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from './lib/supabase'
import { fetchMostLiked, fetchUserLikedMovieIds, fetchUserLikedMovies, likeMovie, searchMovies, unlikeMovie, fetchRecommendations, getNumberOfLikedMovies } from './lib/api'

const email = ref('')
const password = ref('')
const authMode = ref('login')
const currentUser = ref(null)
const authMessage = ref('')
const authLoading = ref(false)

const activeTab = ref('liked')
const recommendationSearchResults = ref([])
const exploreSearchInput = ref('')
const exploreSearchOffset = ref(0)
const exploreHasMoreResults = ref(false)
const mostLikedMovies = ref([])
const likedMovieIds = ref([])
const dataLoading = ref(false)
const dataMessage = ref('')
const recommendedMovies = ref([])
const numberOfLikedMovies = ref(0)
const likedMoviesOffset = ref(0)

const SEARCH_PAGE_SIZE = 10

const OMDB_POSTER_API = 'https://img.omdbapi.com/'
const OMDB_API_KEY = import.meta.env.VITE_OMDB_API_KEY || ''

const isAuthenticated = computed(() => Boolean(currentUser.value))

const suggestionMovies = computed(() => {
  const likedSet = new Set(likedMovieIds.value)
  return mostLikedMovies.value.filter((movie) => !likedSet.has(movie.id)).slice(0, 6)
})

const movieIndex = ref(new Map())

function updateMovieIndex(movies) {
  for (const movie of movies) {
    if (movie && movie.id) {
      movieIndex.value.set(movie.id, movie)
    }
  }
}

// Load more for liked movies
const LIKED_LOAD_SIZE = 10
const likedVisibleCount = ref(LIKED_LOAD_SIZE)
const pagedLikedMovies = computed(() => {
  return likedMovieIds.value
    .map((id) => movieIndex.value.get(id))
    .filter((movie) => Boolean(movie))
    .slice(0, likedVisibleCount.value)
})
async function loadMoreLiked() {
  const userId = currentUser.value?.id
  if (!userId) return

  // Fetch next slice of this user's liked movies.
  try {
    const moreMovies = await fetchUserLikedMovies(userId, LIKED_LOAD_SIZE, likedMoviesOffset.value)
    if (Array.isArray(moreMovies) && moreMovies.length) {
      updateMovieIndex(moreMovies)
      likedMoviesOffset.value += moreMovies.length
    }
  } catch (e) {
    // ignore
  }
  likedVisibleCount.value += LIKED_LOAD_SIZE
}
function resetLikedVisible() {
  likedVisibleCount.value = LIKED_LOAD_SIZE
  likedMoviesOffset.value = 0
}

function getPosterSrc(movie) {
  const movieId = movie?.id?.trim()

  if (!movieId || !movieId.startsWith('tt') || !OMDB_API_KEY) {
    return ''
  }

  return `${OMDB_POSTER_API}?i=${encodeURIComponent(movieId)}&apikey=${OMDB_API_KEY}`
}

function formatGenres(movie) {
  return [movie?.genre1, movie?.genre2, movie?.genre3].filter(Boolean).join(', ')
}

async function loadUserLikedMovieIds(userId) {
  if (!userId) {
    likedMovieIds.value = []
    resetLikedVisible()
    return
  }

  const ids = await fetchUserLikedMovieIds(userId)
  likedMovieIds.value = Array.isArray(ids) ? ids : []
  resetLikedVisible()

  try {
    const firstPage = await fetchUserLikedMovies(userId, LIKED_LOAD_SIZE, 0)
    if (Array.isArray(firstPage) && firstPage.length) {
      updateMovieIndex(firstPage)
      likedMoviesOffset.value = firstPage.length
    }
  } catch (error) {
    dataMessage.value = error.message
  }
}

async function loadNumberOfLikedMovies(userId) {
  if (!userId) {
    numberOfLikedMovies.value = 0
    return
  }

  const { count } = await getNumberOfLikedMovies(userId)
  numberOfLikedMovies.value = count || 0
}

async function loadMostLiked() {
  dataLoading.value = true
  dataMessage.value = ''

  try {
    const movies = await fetchMostLiked(12, 0)
    mostLikedMovies.value = movies
    updateMovieIndex(movies)
  } catch (error) {
    dataMessage.value = error.message
  } finally {
    dataLoading.value = false
  }
}

async function submitAuth() {
  authLoading.value = true
  authMessage.value = ''

  try {
    if (authMode.value === 'signup') {
      const { error } = await supabase.auth.signUp({
        email: email.value,
        password: password.value,
      })
      if (error) throw error
      authMessage.value = 'Account created. Check your email for confirmation.'
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.value,
        password: password.value,
      })
      if (error) throw error
      currentUser.value = data.user || null
      authMessage.value = 'Logged in successfully.'
      await loadUserLikedMovieIds(currentUser.value?.id || '')
      await loadMostLiked()
      await loadNumberOfLikedMovies(currentUser.value?.id || '')

    }
  } catch (error) {
    authMessage.value = error.message
  } finally {
    authLoading.value = false
  }
}

async function logout() {
  await supabase.auth.signOut()
  currentUser.value = null
  recommendationSearchResults.value = []
  exploreSearchInput.value = ''
  exploreSearchOffset.value = 0
  exploreHasMoreResults.value = false
  mostLikedMovies.value = []
  likedMovieIds.value = []
  activeTab.value = 'liked'
}

async function runRecommendationSearch() {
  if (!exploreSearchInput.value.trim()) {
    recommendationSearchResults.value = []
    exploreSearchOffset.value = 0
    exploreHasMoreResults.value = false
    return
  }

  dataLoading.value = true
  dataMessage.value = ''

  try {
    const page = await searchMovies(exploreSearchInput.value, {
      limit: SEARCH_PAGE_SIZE,
      offset: 0,
    })

    recommendationSearchResults.value = page
    updateMovieIndex(page)
    exploreSearchOffset.value = page.length
    exploreHasMoreResults.value = page.length === SEARCH_PAGE_SIZE
  } catch (error) {
    dataMessage.value = error.message
  } finally {
    dataLoading.value = false
  }
}

async function loadMoreSearchResults() {
  if (!exploreHasMoreResults.value || !exploreSearchInput.value.trim()) {
    return
  }

  dataLoading.value = true
  dataMessage.value = ''

  try {
    const page = await searchMovies(exploreSearchInput.value, {
      limit: SEARCH_PAGE_SIZE,
      offset: exploreSearchOffset.value,
    })

    recommendationSearchResults.value = [...recommendationSearchResults.value, ...page]
    exploreSearchOffset.value += page.length
    exploreHasMoreResults.value = page.length === SEARCH_PAGE_SIZE
  } catch (error) {
    dataMessage.value = error.message
  } finally {
    dataLoading.value = false
  }
}

async function likeAndRefresh(movieId) {
  try {
    const userId = currentUser.value?.id

    if (!userId) {
      throw new Error('You must be logged in to like a movie.')
    }

    await likeMovie(movieId, userId)

    if (!likedMovieIds.value.includes(movieId)) {
      likedMovieIds.value = [movieId, ...likedMovieIds.value]
    }

    await Promise.all([
      loadMostLiked(),
      runRecommendationSearch(),
      loadRecommendations(),
      loadNumberOfLikedMovies(userId),
    ])
  } catch (error) {
    dataMessage.value = error.message
  }
}

async function unlikeAndRefresh(movieId) {
  try {
    const userId = currentUser.value?.id

    if (!userId) {
      throw new Error('You must be logged in to unlike a movie.')
    }

    await unlikeMovie(movieId, userId)

    likedMovieIds.value = likedMovieIds.value.filter((id) => id !== movieId)

    await Promise.all([
      loadMostLiked(),
      runRecommendationSearch(),
      loadRecommendations(),
      loadNumberOfLikedMovies(userId),
    ])
  } catch (error) {
    dataMessage.value = error.message
  }
}

onMounted(async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  currentUser.value = session?.user || null

    if (currentUser.value?.id) {
      await loadUserLikedMovieIds(currentUser.value.id)
      await loadMostLiked()
      await loadRecommendations()
      await loadNumberOfLikedMovies(currentUser.value.id)
    }

  supabase.auth.onAuthStateChange(async (_event, sessionUpdate) => {
    currentUser.value = sessionUpdate?.user || null

    if (currentUser.value?.id) {
      await loadUserLikedMovieIds(currentUser.value.id)
      await loadMostLiked()
      await loadRecommendations()
      await loadNumberOfLikedMovies(currentUser.value.id)
    } else {
      likedMovieIds.value = []
      mostLikedMovies.value = []
      recommendationSearchResults.value = []
      exploreSearchInput.value = ''
      exploreSearchOffset.value = 0
      exploreHasMoreResults.value = false
      numberOfLikedMovies.value = 0
    }
  })
})

async function loadRecommendations() {
  recommendedMovies.value = []

  const userId = currentUser.value?.id
  if (!userId) return

  dataLoading.value = true
  dataMessage.value = ''

  try {
    const data = await fetchRecommendations(userId)
    // Accept new API: data.neighbors is a flat array of movies
    if (Array.isArray(data?.neighbors)) {
      recommendedMovies.value = [
        ...data.neighbors
      ]
    } 
  } catch (error) {
    dataMessage.value = error.message
  } finally {
    dataLoading.value = false
  }
}

async function openRecommendationTab() {
  activeTab.value = 'recommendation'
  await loadRecommendations()
}
</script>

<template>
  <div class="layout">
    <header class="topbar">
      <h1>Frame by Frame</h1>
      <p>Movie recommendations with your own Supabase data.</p>
    </header>

    <section v-if="!isAuthenticated" class="panel auth-panel">
      <h2>{{ authMode === 'login' ? 'Login' : 'Create account' }}</h2>
      <form @submit.prevent="submitAuth" class="form-grid">
        <label>
          Email
          <input v-model="email" type="email" autocomplete="email" required />
        </label>
        <label>
          Password
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            minlength="6"
          />
        </label>
        <button :disabled="authLoading" type="submit" class="btn primary">
          {{ authLoading ? 'Working...' : authMode === 'login' ? 'Login' : 'Sign up' }}
        </button>
      </form>
      <button
        type="button"
        class="btn subtle"
        @click="authMode = authMode === 'login' ? 'signup' : 'login'"
      >
        {{ authMode === 'login' ? 'Need an account? Sign up' : 'Already have one? Login' }}
      </button>
      <p v-if="authMessage" class="status">{{ authMessage }}</p>
    </section>

    <section v-else class="panel app-panel">
      <div class="row-between">
        <h2>Welcome, {{ currentUser.email }}</h2>
        <button class="btn subtle" @click="logout">Logout</button>
      </div>

      <div class="tabs">
        <button class="tab" :class="{ active: activeTab === 'liked' }" @click="activeTab = 'liked'">
          Your liked movies
        </button>
        <button
          class="tab"
          :class="{ active: activeTab === 'recommendation' }"
          @click="openRecommendationTab"
        >
          Recommendation
        </button>
        <button class="tab" :class="{ active: activeTab === 'explore' }" @click="activeTab = 'explore'">
          Explore
        </button>
      </div>

      <p v-if="dataMessage" class="status">{{ dataMessage }}</p>

      <div v-if="activeTab === 'liked'" class="tab-panel">
        <h3>Your liked movies</h3>
        {{numberOfLikedMovies}} liked {{ numberOfLikedMovies === 1 ? 'movie' : 'movies' }}
        <ul class="movie-list">
          <li v-for="movie in pagedLikedMovies" :key="`liked-personal-${movie.id}`" class="movie-card">
            <img
              v-if="getPosterSrc(movie)"
              class="movie-poster"
              :src="getPosterSrc(movie)"
              :alt="`${movie.title} poster`"
              loading="lazy"
            />
            <div>
              <strong>{{ movie.title }}</strong>
              <p>{{ formatGenres(movie) || 'No genres yet.' }}</p>
            </div>
            <div class="row-between">
              <span>Rating: {{ movie.rating }} / 10</span>
            </div>
            <div class="row-between">
              <span>Likes: {{ movie.likes_count }}</span>
              <button class="btn tiny" @click="unlikeAndRefresh(movie.id)">Unlike</button>
            </div>
          </li>
          <li v-if="!pagedLikedMovies.length && !dataLoading" class="empty-state">
            Like movies from other tabs and they will appear here.
          </li>
        </ul>
        <button
          v-if="pagedLikedMovies.length < numberOfLikedMovies"
          class="btn subtle"
          type="button"
          :disabled="dataLoading"
          @click="loadMoreLiked"
        >
          {{ dataLoading ? 'Loading...' : 'Load more' }}
        </button>
      </div>

      <div v-else-if="activeTab === 'recommendation'" class="tab-panel">
        <h3>Movie recommendation</h3>
        <div v-if="dataLoading" class="status">Loading recommendations...</div>
        <ul v-else class="movie-list">
              <li v-for="movie in recommendedMovies" :key="`rec-${movie.id}`" class="movie-card">
                <img
                  v-if="getPosterSrc(movie)"
                  class="movie-poster"
                  :src="getPosterSrc(movie)"
                  :alt="`${movie.title} poster`"
                  loading="lazy"
                />
                <div>
                  <strong>{{ movie.title }}</strong>
                  <p>{{ formatGenres(movie) || 'No genres yet.' }}</p>
                </div>
                <div class="row-between">
                  <span>Rating: {{ movie.rating }} / 10</span>
                </div>
                <div class="row-between">
                  <span>Likes: {{ movie.likes_count }}</span>
                  <button class="btn tiny" @click="likeAndRefresh(movie.id)">Like</button>
                </div>
              </li>
        </ul>
      </div>

      <div v-else class="tab-panel">
        <h3>Search</h3>

        <div class="search-box">
          <input
            v-model="exploreSearchInput"
            type="search"
            placeholder="Search movies..."
            @keyup.enter="runRecommendationSearch"
          />
          <button class="btn primary" type="button" @click="runRecommendationSearch" :disabled="dataLoading">
            Search
          </button>
        </div>

        <ul class="movie-list">
          <li v-for="movie in recommendationSearchResults" :key="`search-${movie.id}`" class="movie-card">
            <img
              v-if="getPosterSrc(movie)"
              class="movie-poster"
              :src="getPosterSrc(movie)"
              :alt="`${movie.title} poster`"
              loading="lazy"
            />
            <div>
              <strong>{{ movie.title }}</strong>
              <p>{{ formatGenres(movie) || 'No genres yet.' }}</p>
            </div>
            <div class="row-between">
              <span>Rating: {{ movie.rating }} / 10</span>
            </div>
            <div class="row-between">
              <span>Likes: {{ movie.likes_count }}</span>
              <button class="btn tiny" @click="likeAndRefresh(movie.id)">Like</button>
            </div>
          </li>
          <li v-if="!recommendationSearchResults.length && !dataLoading && exploreSearchInput.trim()" class="empty-state">
            No movies match that search.
          </li>
          <li v-if="!exploreSearchInput.trim()" class="empty-state">
            Enter a search term to find movies.
          </li>
        </ul>

        <button
          v-if="exploreHasMoreResults && recommendationSearchResults.length"
          class="btn subtle"
          type="button"
          :disabled="dataLoading"
          @click="loadMoreSearchResults"
        >
          {{ dataLoading ? 'Loading...' : 'Load more' }}
        </button>
      </div>
    </section>
  </div>
</template>
