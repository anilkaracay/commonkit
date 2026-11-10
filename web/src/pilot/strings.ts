/**
 * Every pilot-facing string (D-024), Turkish first, English second, in one file for review.
 * Used by /app/pilot and by the QR deep-link actions on the asset page (?action=reserve|return|fault).
 */
export type Lang = 'tr' | 'en';

export const STRINGS = {
  tr: {
    langSwitch: 'English',
    pilotEyebrow: 'pilot',
    pilotTitle: 'Üç adımda katıl',
    pilotIntro:
      'Bu bir NEAR testnet pilotu. Testnet NEAR gerçek para değildir. Eşyanın kuralları ve kasası, eşyanın kendi anahtarsız hesabında durur.',
    step1Title: '1. Testnet cüzdanı oluştur veya bağla',
    step1Body:
      'NEAR testnet destekleyen bir cüzdan seç (ör. MyNearWallet, Meteor, HOT). Yeni hesap oluştururken ağın “testnet” olduğundan emin ol.',
    connect: 'Cüzdanı bağla',
    disconnect: 'Bağlantıyı kes',
    connectedAs: 'Bağlı hesap',
    noConnector: 'Bu ortamda cüzdan bağlanamıyor.',
    step2Title: '2. Testnet NEAR al',
    step2Body:
      'Organizatörden hesabına testnet NEAR göndermesini iste. Hesap kimliğini kopyalayıp ona ilet. Rezervasyon ücreti ve depozito bununla ödenir; depozito temiz teslimde geri gelir.',
    askOrganiser: 'Organizatöre sor',
    copyId: 'Hesap kimliğini kopyala',
    copied: 'Kopyalandı',
    balance: 'Bakiye',
    funded: 'Hesabın fonlandı.',
    notFunded: 'Henüz bakiye görünmüyor.',
    step3Title: '3. Eşyanın üzerindeki QR kodu tara',
    step3Body:
      'Telefon kamerasıyla eşyanın etiketindeki QR kodu okut. Kod seni doğrudan o eşyanın sayfasına ve işleme götürür: ayırma, teslim veya arıza bildirimi.',
    orPick: 'Ya da buradan seç:',
    actionReserve: 'Ayır',
    actionReturn: 'Teslim',
    actionFault: 'Arıza bildir',
    backToAction: 'Kaldığın işleme dön',
    needWalletTitle: 'Önce cüzdanını bağla',
    needWalletBody: 'Bu işlem için bir testnet cüzdanı gerekiyor. Pilot adımlarını tamamla, sonra buraya geri dönersin.',
    goPilot: 'Pilot adımlarına git',
    returnTitle: 'Teslim',
    returnStewardOnly: 'Teslimi yalnız eşyanın sorumlusu (steward) onaylayabilir; eşyayı kullanan kişi kendi teslimini onaylayamaz.',
    returnNone: 'Teslim bekleyen kullanım yok.',
    confirmClean: 'Temiz teslimi onayla',
    reportDamage: 'Hasar bildir',
    confirmManualReturn: 'Teslimi onayla (köprü)',
    bridgeUnreachable: 'Köprüye ulaşılamadı; QR teslimleri köprü üzerinden onaylanır.',
    faultTitle: 'Arıza bildir',
    faultBody:
      'Son 14 günde bu eşyayı kullandıysan arıza bildirebilirsin. Notun yalnızca özeti (SHA-256) zincire yazılır; metin cihazından çıkmaz.',
    faultRule: 'Hangi sorun?',
    faultNote: 'Ne oldu?',
    faultSend: 'Bildir',
    faultNoRule: 'Bu eşyanın arıza kuralı yok.',
    sent: 'Gönderildi',
    simulatedNote: 'Bu eşya bir simülasyondur (SIMULATED).',
  },
  en: {
    langSwitch: 'Türkçe',
    pilotEyebrow: 'pilot',
    pilotTitle: 'Join in three steps',
    pilotIntro:
      'This is a NEAR testnet pilot. Testnet NEAR is not real money. The item’s rules and cash box live in its own keyless account.',
    step1Title: '1. Create or connect a testnet wallet',
    step1Body:
      'Pick a wallet that supports NEAR testnet (e.g. MyNearWallet, Meteor, HOT). When creating an account, make sure the network is “testnet”.',
    connect: 'Connect wallet',
    disconnect: 'Disconnect',
    connectedAs: 'Connected account',
    noConnector: 'No wallet can be connected in this environment.',
    step2Title: '2. Get testnet NEAR',
    step2Body:
      'Ask the organiser to send testnet NEAR to your account. Copy your account id and send it to them. Fees and deposits are paid from it; the deposit comes back after a clean return.',
    askOrganiser: 'Ask the organiser',
    copyId: 'Copy account id',
    copied: 'Copied',
    balance: 'Balance',
    funded: 'Your account is funded.',
    notFunded: 'No balance yet.',
    step3Title: '3. Scan the QR code on the item',
    step3Body:
      'Point your phone camera at the QR code on the item’s sticker. It opens that item’s page with the action ready: reserve, return or report a fault.',
    orPick: 'Or pick one here:',
    actionReserve: 'Reserve',
    actionReturn: 'Return',
    actionFault: 'Report a fault',
    backToAction: 'Back to your action',
    needWalletTitle: 'Connect your wallet first',
    needWalletBody: 'This action needs a testnet wallet. Finish the pilot steps, then you come straight back here.',
    goPilot: 'Go to the pilot steps',
    returnTitle: 'Return',
    returnStewardOnly: 'Only the item’s steward can confirm a return; the person who used it cannot confirm their own.',
    returnNone: 'No use is waiting for a return check.',
    confirmClean: 'Confirm clean return',
    reportDamage: 'Report damage',
    confirmManualReturn: 'Confirm return (bridge)',
    bridgeUnreachable: 'The bridge is unreachable; QR returns are confirmed through the bridge.',
    faultTitle: 'Report a fault',
    faultBody:
      'If you used this item in the last 14 days you can report a fault. Only the SHA-256 of your note goes on chain; the text never leaves your device.',
    faultRule: 'What is wrong?',
    faultNote: 'What happened?',
    faultSend: 'Report',
    faultNoRule: 'This item has no fault rule.',
    sent: 'Sent',
    simulatedNote: 'This item is a simulation (SIMULATED).',
  },
} as const;

export type Strings = { [K in keyof (typeof STRINGS)['tr']]: string };
