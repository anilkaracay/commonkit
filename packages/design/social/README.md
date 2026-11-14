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

## Final covers with original vector lettering and logos

Recommended: `commonkit-x-header-studio-final.png` — cool white/blue studio environment matching the website. Alternative: `commonkit-x-header-final.png` — warmer daylight scene. Both are 3000 × 1000. Use either with the unchanged `commonkit-avatar.png`.

The original, text-free scene is preserved; all final lettering is outlined CK Sans. The COMMONKIT lockup is the approved vector source; the NEAR N mark is the unmodified official asset with a separate “Built on NEAR” credit. No generated lettering remains in these final exports. The SVG masters embed the raster device scene alongside vector text/logos; they do not imply that the scene itself is vector.

Rebuild:

```sh
python3 packages/design/social/build_final.py
python3 packages/design/social/build_final.py commonkit-devices-studio-background.png commonkit-x-header-studio-final
node packages/design/logo/src/render.mjs packages/design/social/commonkit-x-header-final.html packages/design/social/commonkit-x-header-final.png 1500 500 2
node packages/design/logo/src/render.mjs packages/design/social/commonkit-x-header-studio-final.html packages/design/social/commonkit-x-header-studio-final.png 1500 500 2
```

The HTML files provide a stable export view. Preserve the full 3:1 crop; the lower-left area allows for avatar overlap. The small subtitle and technology credit are desktop details; the headline carries the message at mobile size.
