# COMMONKIT social profile set

These assets extend the approved “Kept” identity (D-040): four identical members around one shared machine. Cobalt, CK Sans, outlined typography and deliberate empty space match the app and landing page. No generated illustration, stock template, glow or gradient is used.

- `commonkit-avatar.png` — 2048 × 2048, solid background; upload as the profile image. Its symbol remains inside a circular crop.
- `commonkit-x-header.png` — 3000 × 1000, 3:1; upload as the cover and keep the full composition. The avatar overlap is accounted for in the left panel.
- `commonkit-profile-preview.png` — combined placement preview, not an upload asset.
- Matching `.svg` files are resolution-independent masters with all lettering outlined; no font installation is required to use them.

Rebuild from the repository root with `python3 packages/design/social/build.py` and `node packages/design/social/render.mjs`. Python uses FontTools and Brotli, as the existing logo tooling does; rendering uses the landing package's pinned Playwright. CK Sans derives from Mona Sans under SIL OFL 1.1; see `../fonts/OFL-mona-sans.txt`. The profile preview uses sample bio text and does not modify the account.
