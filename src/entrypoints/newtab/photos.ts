import type { PhotoSize } from '@/lib/lead-photo';

const TIMEOUT_MS = 10_000;

/** Load each picture (as the page's <img> would) and read its natural size; 0 × 0 if it fails. */
export function measurePhotos(urls: string[]): Promise<PhotoSize[]> {
  return Promise.all(
    urls.map(
      (url) =>
        new Promise<PhotoSize>((resolve) => {
          const img = new Image();
          const done = (ok: boolean) => {
            clearTimeout(timer);
            img.onload = img.onerror = null;
            resolve(
              ok
                ? { url, width: img.naturalWidth, height: img.naturalHeight }
                : { url, width: 0, height: 0 },
            );
          };
          const timer = setTimeout(() => {
            done(false);
            img.src = '';
          }, TIMEOUT_MS);
          img.referrerPolicy = 'no-referrer';
          img.onload = () => done(true);
          img.onerror = () => done(false);
          img.src = url;
        }),
    ),
  );
}
