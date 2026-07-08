# Gemini Project Context

This file contains project-specific instructions, preferences, and context for Gemini.

## Tech Stack
- Frontend: React + Vite + Tailwind CSS
- Backend: Python + FastAPI
- Database: MongoDB

## Preferences
- Use `React.lazy()` for all heavy frontend components to ensure fast loading times.
- Ensure all backend routes that do not contain `await` are defined as `def` (not `async def`) to utilize FastAPI's native thread pool.
- Use `run_in_threadpool` for synchronous blocking operations inside WebSocket endpoints.
