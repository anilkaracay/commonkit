import { useSearchParams } from 'react-router';
import { STRINGS, type Lang, type Strings } from './strings';

/** Pilot copy is Turkish by default; `?lang=en` switches to English. */
export function useLang(): { lang: Lang; t: Strings; switchHref: (path: string) => string } {
  const [params] = useSearchParams();
  const lang: Lang = params.get('lang') === 'en' ? 'en' : 'tr';
  const switchHref = (path: string) => {
    const p = new URLSearchParams(params);
    p.set('lang', lang === 'en' ? 'tr' : 'en');
    return `${path}?${p.toString()}`;
  };
  return { lang, t: STRINGS[lang], switchHref };
}
