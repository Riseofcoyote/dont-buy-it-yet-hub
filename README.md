# DON'T BUY IT YET — Production Hub

A free, mobile-first production tracker for the DON’T BUY IT YET product-review channel.

## What this v1 does

- Kanban pipeline: Idea → Research → Script → Voice → B-roll → Edit → Ready to Post → Published
- Big “Next Task” panel
- Per-review workspace for product link, affiliate link, script/notes, Chatterbox voice chunks, and B-roll shot list
- One-tap links to Chatterbox, audio extractor, free B-roll repos, Drive, Dropbox, CapCut, YouTube Studio, and Impact
- Offline-capable PWA
- Saves locally in the browser with `localStorage`
- YouTube publish dock: title, description, tags, final-video picker, copy buttons, Android share-sheet handoff, and YouTube Studio fallback
- Impact affiliate-link field with one-tap copy/open and automatic affiliate disclosure insertion
- JSON backup export/import
- No database, paid API, subscription, or server required

## Fastest free deployment: GitHub Pages

1. Create a new public GitHub repository, for example `dont-buy-it-yet-hub`.
2. Upload all files from this folder to the repository root.
3. In GitHub: Settings → Pages → Build and deployment → Deploy from a branch.
4. Choose `main` and `/ (root)`, then Save.
5. Open the Pages URL on your phone and use “Add to Home Screen.”

## Important v1 limitation

Projects are stored in the browser on the device where you use the app. Use **Export Backup** periodically. A later version can add Supabase/Drive sync while staying on a free tier.

## Planned v2 integrations

- Optional authenticated YouTube Data API upload (direct upload from the hub; requires Google OAuth setup)
- Optional Impact API/link-generation integration if account credentials/API access are available
- Google Drive/Dropbox asset links per project
- Script chunk copy buttons
- B-roll checklist completion
- Thumbnail/title/description fields
- Optional Supabase sync
- Optional direct TTS API integration when a free/open-source endpoint is practical

## License

This starter package is provided for your own project use. Third-party services linked by the dashboard retain their own licenses and terms.
