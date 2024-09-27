export type Favorite = {
  host: string;
};

export class FavoritesManager {
  private static FAVORITES_KEY = 'favorites';

  async getFavorites(): Promise<Record<string, Favorite>> {
    try {
      const storage = await chrome.storage.sync.get(
        FavoritesManager.FAVORITES_KEY,
      );
      return storage[FavoritesManager.FAVORITES_KEY] || {};
    } catch (e) {
      console.error('Error getting favorites', e);
      return {};
    }
  }

  async saveFavorites(favorites: Record<string, Favorite>): Promise<void> {
    try {
      await chrome.storage.sync.set({
        [FavoritesManager.FAVORITES_KEY]: favorites,
      });
    } catch (e) {
      console.error('Error saving favorites', e);
    }
  }

  async addFavorite(host: string): Promise<void> {
    const favorites = await this.getFavorites();
    favorites[host] = { host };
    await this.saveFavorites(favorites);
  }

  async removeFavorite(host: string): Promise<void> {
    const favorites = await this.getFavorites();
    delete favorites[host];
    await this.saveFavorites(favorites);
  }

  async isFavorite(host: string): Promise<boolean> {
    const favorites = await this.getFavorites();
    return !!favorites[host];
  }

  async toggleFavorite(host: string): Promise<boolean> {
    const isFavorite = await this.isFavorite(host);
    if (isFavorite) {
      await this.removeFavorite(host);
    } else {
      await this.addFavorite(host);
    }
    return !isFavorite;
  }

  async getFavoritesList(): Promise<string[]> {
    const favorites = await this.getFavorites();
    return Object.keys(favorites);
  }
}
