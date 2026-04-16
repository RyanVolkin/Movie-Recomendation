# Movie Recommendation App Starter

This workspace now includes:
- `frontend`: Vue + Vite app with login, movie search, and most-liked sections.
- `backend`: Express API that reads/writes movie data in Supabase.
- `supabase/schema.sql`: Starter SQL for profiles and movies tables.

## 1) Configure Supabase

1. Create a Supabase project.
2. In Supabase SQL Editor, run `supabase/schema.sql`.
3. Copy environment files:
   - `frontend/.env.example` -> `frontend/.env`
   - `backend/.env.example` -> `backend/.env`
4. Fill in your keys:
   - Frontend uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
   - Backend uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

## 2) Run the backend

```bash
cd backend
npm run dev
```

Backend starts on `http://localhost:3000`.

## 3) Run the frontend

```bash
cd frontend
npm run dev
```

Frontend starts on `http://localhost:5173`.

## API routes

- `GET /api/health`
- `GET /api/movies/liked?limit=10`
- `GET /api/movies/search?q=matrix`
- `POST /api/movies` (body: `{ "title": "...", "overview": "...", "poster_url": "..." }`)
- `POST /api/movies/:id/like`

## Notes

- Login/sign-up is handled by Supabase Auth on the frontend.
- The backend currently uses the service role key for movie writes.
- Movie ingestion from an external API is intentionally left out for now.
