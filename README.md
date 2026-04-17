# Klasa Jonë

This is a shared class portal with:
- shared profiles
- chat
- money / leaderboard
- betting shop
- 1v1 duel history
- creator-only editing

## Run locally

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

## Creator login

The default creator password is set on the server as `Erik2011`.
For a real deployment, move it to an environment variable named `CREATOR_PASSWORD`.

## Full Online Setup

This app now supports a real online backend via Supabase.

1. Create a Supabase project.
2. Run the SQL in `supabase-schema.sql` in the Supabase SQL editor.
3. Set these environment variables on your Node host:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CREATOR_PASSWORD` if you want to change the creator code
4. Deploy the Node app to a host like Render, Railway, or Fly.io.

If you deploy only `index.html` to GitHub Pages, the site will not be shared because it needs the Node API.

Good hosting options:
- Render
- Railway
- Fly.io
- a VPS

## Files

- `index.html` - frontend
- `server.js` - backend API and file storage
- `supabase-schema.sql` - schema for the hosted database
