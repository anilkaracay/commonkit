# COMMONKIT five-image story

A device-led visual explanation of shared use, community money, contribution rewards and inspectable NEAR evidence. Scenes are brand illustrations; the paired copy describes the actual testnet scope. The series does not represent photographs of installed equipment.

| Image | Topic |
| --- | --- |
| `01-shared-machines.png` | Shared machines and community rules |
| `02-book-access.png` | Reservations, usage fees and refundable deposits |
| `03-community-budget.png` | Capped machine float, DAO surplus and larger purchases |
| `04-earned-access.png` | Independent approval, earned access and zero usage fee with deposit |
| `05-inspect-proof.png` | Live views, recorded transactions and read-only verification |

Each final PNG is **2400 × 1650**. Use one image per post, in numerical order, starting as a reply to the [published demo video](https://x.com/usecommonkit/status/2121587837816730030). `commonkit-thread-preview.png` is the combined placement preview; upload the individual images.

Scenes were made with OpenAI built-in image generation from the existing COMMONKIT device illustration as a style reference. Final lettering uses outlined CK Sans; the COMMONKIT logo and official unmodified NEAR mark come from the repository's vector sources. The figures on the last panel are authored typography, not generated labels. Fonts and NEAR mark terms are documented in the parent design folder. `PROMPTS.md` records art direction and panel specifications.

Rebuild from the repository root:

```sh
python3 packages/design/social/thread/build.py
node packages/design/social/thread/render.mjs
```

The renderer uses the landing package's pinned Playwright; Python uses the same FontTools/Brotli setup as the existing logo tooling. Generated scenes remain separate from the vector lettering, making future copy edits reproducible. The `*.svg` files contain the vector foreground; the matching HTML files combine it with its numbered scene.
