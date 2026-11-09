# PILOT — real community run

Real users are our strongest differentiator. Most competing Social Money projects state they ran only with their own test accounts.

## 1. Minimum targets (by 2026-11-14)

| Metric | Target | Actual (fill in) |
| :--- | :--- | :--- |
| Real community | 1 | |
| Real member accounts | ≥ 5 | |
| Real reservations + sessions | ≥ 10 | |
| Real maintenance (independently approved) | ≥ 1 | |
| Real training → credential | ≥ 1 | |
| Community rep quote (with consent) | 1 | |

If a target is missed, the README states the real number. Never inflate.

## 2. Setup with the community (≈ 1 hour on site)

1. Explain in 2 minutes (script below).
2. Help each member create a testnet account (or use a pre-created one they control — note which). Fund with testnet NEAR.
3. Add 3 council members to the makerlab DAO (2 team + 1 community rep).
4. Assign roles via DAO proposal: 1–2 stewards, 1–2 verifiers, 1 trainer.
5. Run real sessions with real prints. Do the maintenance when the (demo-lowered) threshold fires.
6. Record video only of people who consented.

## 3. Two-minute explanation (Turkish, for participants)

> Bu yazıcının artık kendi NEAR hesabı var. Kullanmak için telefondan rezervasyon yapıp küçük bir test ücreti ödüyorsunuz; yazıcı yalnızca rezervasyonu olanın işini basıyor. Yazıcı ne kadar çalıştığını biliyor; bakım zamanı gelince kendisi görev açıyor. Bakımı yapan ve başka bir üyenin onayını alan kişi, yazıcıyı ücretsiz kullanma hakkı kazanıyor. Lazer gibi riskli makineler için eğitim şart; eğitim veren de hak kazanıyor. Her şey test ağında, paranın gerçek değeri yok.

## 4. Consent message (Turkish, send via chat, keep the reply)

> Merhaba! COMMONKIT adlı bir NEAR Hackathon projesini test ediyoruz. Katılırsan:
> - Test ağında (gerçek değeri olmayan) bir NEAR hesabı kullanacaksın; hesap adın ve yaptığın işlemler herkese açık olarak görünecek.
> - İstersen videoda görünebilirsin; istemezsen seni çekmeyeceğiz.
> - Kişisel bilgi veya fotoğraf zincire yazılmayacak; yalnızca kanıt fotoğraflarının özetleri (hash) kaydedilecek.
> - İstediğin zaman çıkabilirsin.
> Katılmayı ve (seçersen) videoda görünmeyi kabul ediyor musun? "Evet, videoda da" / "Evet, videosuz" / "Hayır" diye yanıtlaman yeterli.

Store consents in `evidence/pilot/consents.md` with first name (or nickname), account id, choice, date. No phone numbers or emails in the repo.

## 5. Data to capture

- Every tx hash (scripts and web app log them to `evidence/pilot/*.json`).
- Printer job names (no personal content), durations.
- Before/after photo hashes for maintenance (photos stay local; only hashes on-chain and in repo).
- One short written quote from the community rep, with permission to publish.

## 6. Demo-lowered parameters

For the pilot, lower `nozzle_clean.threshold` (e.g. 30 minutes of printing) and state it in README: "Thresholds were lowered for the pilot so a maintenance cycle could happen within the hackathon week; production values are in profiles/printer_3d.json."
