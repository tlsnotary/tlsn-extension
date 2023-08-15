import bookmarks from "./bookmarks.json";

type Bookmark = {
  url: string;
  title: string;
  description: string;
  method: string;
  type: string;
}
export function findBookmarksByURL(url: URL | null): Bookmark[] {
  if (!url) return [];

  return bookmarks.filter(m => {
    const _url = new URL(m.url);
    return url.origin === _url.origin;
  });
}