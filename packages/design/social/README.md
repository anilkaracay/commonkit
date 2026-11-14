# COMMONKIT social profile set

These assets extend the approved “Kept” identity (D-040): four identical members around one shared machine. Cobalt, CK Sans, outlined typography and deliberate empty space match the app and landing page. No generated illustration, stock template, glow or gradient is used.

- `commonkit-avatar.png` — 2048 × 2048, solid background; upload as the profile image. Its symbol remains inside a circular crop.
- `commonkit-x-header.png` — 3000 × 1000, 3:1; upload as the cover and keep the full composition. The avatar overlap is accounted for in the left panel.
- `commonkit-profile-preview.png` — combined placement preview, not an upload asset.
- Matching `.svg` files are resolution-independent masters with all lettering outlined; no font installation is required to use them.

Rebuild from the repository root with `python3 packages/design/social/build.py` and `node packages/design/social/render.mjs`. Python uses FontTools and Brotli, as the existing logo tooling does; rendering uses the landing package's pinned Playwright. CK Sans derives from Mona Sans under SIL OFL 1.1; see `../fonts/OFL-mona-sans.txt`. The profile preview uses sample bio text and does not modify the account.

## Device campaign cover

`commonkit-x-header-devices.png` is the alternative campaign cover (2172 × 724, native 3:1). It shows an FDM printer, laser cutter, washer and community fridge. These are AI-generated brand illustrations, not photographs of installed equipment or deployment evidence. The original text-free scene is `commonkit-devices-background.png`. Built-in image generation was used for the scene and its typography pass; the original vector avatar remains unchanged.

Art direction: a restrained industrial product still life, physically grounded on one studio floor; ivory/graphite materials with selective cobalt panels and a small orange printer detail; quiet left space for two lines “Shared things.” / “Kept running.”, with “COMMONKIT” and “Maintain the tools. Earn the access.”; no coins, network effects or neon. Image generation prompts and edit invariants are recorded in `image-prompts.md`.
