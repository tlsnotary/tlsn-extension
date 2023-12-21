import bookmarks from './bookmarks.json';
import { RequestLog } from '../../src/entries/Background/rpc';

type Bookmark = {
  url: string;
  title: string;
  description: string;
  method: string;
  type: string;
};

export function findBookmarksByURL(url: URL | null): Bookmark[] {
  if (!url) return [];

  return bookmarks.filter((m) => {
    const _url = new URL(m.url);
    return url.host === _url.host;
  });
}

export function filterByBookmarks(requests: RequestLog[]): Bookmark[] {
  const hosts = requests
    .map((r) => r.url && new URL(r.url).host)
    .reduce((acc: { [host: string]: string }, host) => {
      acc[host] = host;
      return acc;
    }, {});

  return bookmarks.filter((bm) => {
    if (hosts[new URL(bm.url).host]) {
      return true;
    }
  });
}
