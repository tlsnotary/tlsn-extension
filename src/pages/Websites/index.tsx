import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import NavButton from '../../components/NavButton';
import FavouriteStar from '../../components/SvgIcons/FavouriteStar';
import { useAllWebsites } from '../../reducers/history';
import { Favorite, FavoritesManager } from '../../reducers/favorites';
import { Bookmark, BookmarkManager } from '../../reducers/bookmarks';
import { extractHostFromUrl, extractPathFromUrl } from '../../utils/misc';

const favoritesManager = new FavoritesManager();
const bookmarkManager = new BookmarkManager();

export default function Websites({
  onlyFavorites = false,
}: {
  onlyFavorites?: boolean;
}) {
  const [favorites, setFavorites] = useState<Record<string, Favorite>>({});
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  const navigate = useNavigate();
  const websites = useAllWebsites();

  const fetchBookmarks = useCallback(async () => {
    const bookmarks = await bookmarkManager.getBookmarks();
    setBookmarks(bookmarks);
  }, []);

  useEffect(() => {
    fetchBookmarks();
  }, []);

  const emptyContainer =
    websites.filter(({ host }) => favorites.hasOwnProperty(host)).length === 0;

  useEffect(() => {
    if (!onlyFavorites) {
      setFavorites({});
      return;
    }

    (async () => {
      const favorites = await favoritesManager.getFavorites();
      setFavorites(favorites);
    })();
  }, [onlyFavorites]);

  return (
    <div className="flex flex-col gap-4 py-4 overflow-y-auto flex-1">
      {onlyFavorites && emptyContainer && (
        <div className="text-center text-gray-500 flex-1 flex items-center justify-center">
          No favorites added yet.
        </div>
      )}

      <div className="flex flex-col flex-nowrap justify-center gap-2 mx-4">
        {!onlyFavorites && (
          <NavButton
            ImageIcon={<FavouriteStar />}
            title="Favorites"
            subtitle=""
            onClick={() => navigate('/websites/favorites')}
          />
        )}
        {websites
          .filter(({ host }) => favorites.hasOwnProperty(host))
          .map(({ host, requests, faviconUrl }) => {
            return (
              <NavButton
                ImageIcon={
                  <div className="w-4 h-4 bg-transparent rounded-sm" />
                }
                key={host}
                title={host}
                subtitle={requests}
                onClick={() => {
                  if (onlyFavorites) {
                    navigate(`/websites/favorites/history/${host}`);
                    return;
                  }
                  navigate(`/websites/history/${host}`);
                }}
              />
            );
          })}
        {!onlyFavorites && bookmarks?.length && (
          <>
            <div className="text-sm font-bold mt-3">Popular</div>

            {bookmarks
              .filter((bookmark) => {
                if (
                  websites.find(
                    ({ host }) => host === extractHostFromUrl(bookmark.url),
                  ) &&
                  favorites.hasOwnProperty(extractHostFromUrl(bookmark.url))
                ) {
                  return false;
                }

                return true;
              })
              .map((bookmark) => (
                <NavButton
                  ImageIcon={
                    bookmark.icon ? (
                      <img src={bookmark.icon} className="w-4 h-4" />
                    ) : (
                      <div className="w-4 h-4 bg-transparent rounded-sm" />
                    )
                  }
                  title={bookmark.title}
                  subtitle={bookmark.description}
                  onClick={() => {
                    navigate(`/websites/favorites/bookmarks/${bookmark.id}`);
                    return;
                  }}
                />
              ))}
          </>
        )}
      </div>
    </div>
  );
}
