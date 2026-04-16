<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from './lib/supabase'
import { fetchMostLiked, likeMovie, searchMovies } from './lib/api'

const email = ref('')
const password = ref('')
const authMode = ref('login')
const currentUser = ref(null)
const authMessage = ref('')
const authLoading = ref(false)

const activeTab = ref('liked')
const searchInput = ref('')
const searchResults = ref([])
const mostLikedMovies = ref([])
const likedMovieIds = ref([])
const dataLoading = ref(false)
const dataMessage = ref('')

const isAuthenticated = computed(() => Boolean(currentUser.value))

const suggestionMovies = computed(() => {
  const likedSet = new Set(likedMovieIds.value)
  return mostLikedMovies.value.filter((movie) => !likedSet.has(movie.id)).slice(0, 6)
})

const movieIndex = computed(() => {
  const map = new Map()

  for (const movie of mostLikedMovies.value) {
    map.set(movie.id, movie)
  }

  for (const movie of searchResults.value) {
    map.set(movie.id, movie)
  }

  return map
})

const yourLikedMovies = computed(() => {
  return likedMovieIds.value
    .map((id) => movieIndex.value.get(id))
    .filter((movie) => Boolean(movie))
})

function likedStorageKey(userId) {
  return `frame-by-frame-liked-${userId}`
}

function loadUserLikedMovieIds(userId) {
  const raw = localStorage.getItem(likedStorageKey(userId))

  if (!raw) {
    likedMovieIds.value = []
    return
  }

  try {
    const parsed = JSON.parse(raw)
    likedMovieIds.value = Array.isArray(parsed) ? parsed : []
  } catch {
    likedMovieIds.value = []
  }
}

function saveUserLikedMovieIds(userId) {
  localStorage.setItem(likedStorageKey(userId), JSON.stringify(likedMovieIds.value))
}

async function loadMostLiked() {
  dataLoading.value = true
  dataMessage.value = ''

  try {
    mostLikedMovies.value = await fetchMostLiked(12)
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
      const { error } = await supabase.auth.signInWithPassword({
        email: email.value,
        password: password.value,
      })
      if (error) throw error
      authMessage.value = 'Logged in successfully.'
      loadUserLikedMovieIds(currentUser.value?.id || '')
      await loadMostLiked()
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
  searchResults.value = []
  mostLikedMovies.value = []
  likedMovieIds.value = []
  activeTab.value = 'liked'
}

async function runSearch() {
  if (!searchInput.value.trim()) {
    searchResults.value = []
    return
  }

  dataLoading.value = true
  dataMessage.value = ''

  try {
    searchResults.value = await searchMovies(searchInput.value)
  } catch (error) {
    dataMessage.value = error.message
  } finally {
    dataLoading.value = false
  }
}

async function likeAndRefresh(movieId) {
  try {
    await likeMovie(movieId)

    if (!likedMovieIds.value.includes(movieId)) {
      likedMovieIds.value = [movieId, ...likedMovieIds.value]
      if (currentUser.value?.id) {
        saveUserLikedMovieIds(currentUser.value.id)
      }
    }

    await Promise.all([loadMostLiked(), runSearch()])
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
    loadUserLikedMovieIds(currentUser.value.id)
    await loadMostLiked()
  }

  supabase.auth.onAuthStateChange((_event, sessionUpdate) => {
    currentUser.value = sessionUpdate?.user || null

    if (currentUser.value?.id) {
      loadUserLikedMovieIds(currentUser.value.id)
      loadMostLiked()
    } else {
      likedMovieIds.value = []
      mostLikedMovies.value = []
      searchResults.value = []
    }
  })
})
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
          @click="activeTab = 'recommendation'"
        >
          Movie recommendation
        </button>
        <button class="tab" :class="{ active: activeTab === 'explore' }" @click="activeTab = 'explore'">
          Most liked (Explore)
        </button>
      </div>

      <p v-if="dataMessage" class="status">{{ dataMessage }}</p>

      <div v-if="activeTab === 'liked'" class="tab-panel">
        <h3>Your liked movies</h3>
        <ul class="movie-list">
          <li v-for="movie in yourLikedMovies" :key="`liked-personal-${movie.id}`" class="movie-card">
            <div>
              <strong>{{ movie.title }}</strong>
              <p>{{ movie.overview || 'No description yet.' }}</p>
            </div>
            <div class="row-between">
              <span>Likes: {{ movie.likes_count }}</span>
              <button class="btn tiny" @click="likeAndRefresh(movie.id)">Like again</button>
            </div>
          </li>
          <li v-if="!yourLikedMovies.length && !dataLoading" class="empty-state">
            Like movies from other tabs and they will appear here.
          </li>
        </ul>
      </div>

      <div v-else-if="activeTab === 'recommendation'" class="tab-panel">
        <h3>Movie recommendation</h3>

        <div class="search-box">
          <input
            v-model="searchInput"
            type="search"
            placeholder="Search titles for recommendations..."
            @keyup.enter="runSearch"
          />
          <button class="btn primary" @click="runSearch">Search</button>
        </div>

        <div class="grid-columns">
          <div>
            <h3>Suggested from trends</h3>
            <ul class="movie-list">
              <li v-for="movie in suggestionMovies" :key="`suggested-${movie.id}`" class="movie-card">
                <div>
                  <strong>{{ movie.title }}</strong>
                  <p>{{ movie.overview || 'No description yet.' }}</p>
                </div>
                <div class="row-between">
                  <span>Likes: {{ movie.likes_count }}</span>
                  <button class="btn tiny" @click="likeAndRefresh(movie.id)">Like</button>
                </div>
              </li>
              <li v-if="!suggestionMovies.length && !dataLoading" class="empty-state">
                Add more movies and likes to improve recommendations.
              </li>
            </ul>
          </div>

          <div>
            <h3>Search recommendations</h3>
            <ul class="movie-list">
              <li v-for="movie in searchResults" :key="movie.id" class="movie-card">
                <div>
                  <strong>{{ movie.title }}</strong>
                  <p>{{ movie.overview || 'No description yet.' }}</p>
                </div>
                <div class="row-between">
                  <span>Likes: {{ movie.likes_count }}</span>
                  <button class="btn tiny" @click="likeAndRefresh(movie.id)">Like</button>
                </div>
              </li>
              <li v-if="!searchResults.length && !dataLoading" class="empty-state">
                Search your movie table to get recommendation candidates.
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div v-else class="tab-panel">
        <h3>Most liked movies</h3>
        <ul class="movie-list">
          <li v-for="movie in mostLikedMovies" :key="`popular-${movie.id}`" class="movie-card">
            <div>
              <strong>{{ movie.title }}</strong>
              <p>{{ movie.overview || 'No description yet.' }}</p>
            </div>
            <div class="row-between">
              <span>Likes: {{ movie.likes_count }}</span>
              <button class="btn tiny" @click="likeAndRefresh(movie.id)">Like</button>
            </div>
          </li>
          <li v-if="!mostLikedMovies.length && !dataLoading" class="empty-state">
            No movies yet. Insert rows into Supabase and refresh.
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>
