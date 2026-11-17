# EchoAI

EchoAI is a Flask and SQLite personal assistant with private user accounts, multiple conversations, saved memories, a searchable document library, task management, Gemini tools, Google Search grounding, and browser voice controls.

## Run locally

1. Use Python 3.10 or newer.
2. Create and activate a virtual environment.
3. Install dependencies with `pip install -r requirements.txt`.
4. Copy `.env.example` to `.env`, then set `GOOGLE_API_KEY` and a long random `SECRET_KEY`. Keep `.env` private. `COOKIE_SECURE=0` is for local HTTP only; set it to `1` behind HTTPS.
5. Run `python app.py` from this directory and open `http://127.0.0.1:5000`.

SQLite creates `echoai.db` on first run. Schema setup uses `CREATE TABLE IF NOT EXISTS`; it does not erase existing data. The old `memory.json` is preserved because its single shared history cannot safely be assigned to an account.

## Features

- Username/email login with Werkzeug password hashing and session-based access checks.
- Separate conversations, titles based on the first message, switching, deletion, and a 10-conversation retention limit per account.
- User-scoped memories, PDF/DOCX/TXT document library with keyword search, and task CRUD.
- Gemini function calls for saving/searching memories and documents and managing tasks. Task deletion requested by Gemini waits for explicit confirmation; UI deletion actions also ask for confirmation.
- Optional Google Search grounding using the Gemini API's built-in Search tool. Search availability depends on the configured model and Google API account. Grounding usage may be billable.
- Browser speech recognition and speech synthesis where supported. Speech stays in the browser.
- Dark/light themes, responsive sidebar, loading state, attachment previews, and upload size limits.

No OCR or reminder delivery is implemented. Tasks can have due dates, but EchoAI does not schedule notifications.

## Tests

Run `pytest` from this directory. Tests use a temporary SQLite database and mock the Gemini response; they do not send requests to Google.

## Security notes

- Never expose `.env` or commit it. The generated app secret fallback is only for development and invalidates sessions after a restart; set a stable `SECRET_KEY` before using the app regularly.
- Set `COOKIE_SECURE=1` only when serving over HTTPS. Do not run Flask's development server with debug enabled in production.
- Every private data query scopes records by the signed-in user. SQLite foreign keys cascade message deletion with conversations and user deletion with owned data.
- Files are parsed in memory and extracted text is stored in SQLite. The app does not retain uploaded binary files.
- Web Search is a distinct Gemini request before the custom function call, which keeps the default Gemini 2.5 model's tool use independent. If Search is unsupported or unavailable, chat continues without web context.
