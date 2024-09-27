import React, { useCallback, useEffect, useState } from 'react';
import Back from '../../components/SvgIcons/Back';
import Star from '../../components/SvgIcons/Star';
import { FavoritesManager } from '../../reducers/favorites';
import { SimpleToggle } from '../ToggleExtensionButton';
import { useRemoteAttestation } from '../../reducers/remote-attestation';
import { useExtensionEnabled } from '../../reducers/requests';
import logo from '../../assets/img/icon-128.png';

const favoritesManager = new FavoritesManager();

const getTitleFromPath = (path: string) => {
  const step = path.split('/').pop() || '';
  const titles: { [key: string]: string } = {
    requests: 'Requests',
    history: 'Attestations',
    bookmarks: 'Bookmarks',
    favorites: 'Favorites',
    websites: 'Websites',
    options: 'Settings',
    home: 'Home',
  };
  return titles[step] || 'Pangea';
};

const handleBackClick = (path: string, navigate: any) => {
  const steps = path.split('/');

  // special case to handle webiste history path
  if (steps.length > 2 && steps.at(-2) === 'history') {
    if (steps.at(-3) === 'favorites') {
      navigate('/websites/favorites');
      return;
    }
    if (steps.at(-3) === 'websites') {
      navigate('/websites');
      return;
    }

    if (steps.length === 3) {
      navigate('/websites');
      return;
    }
  }

  // special case to handle attestations history path
  if (steps.length > 2 && steps.at(-2) === 'attestation') {
    if (steps.at(-5) === 'favorites') {
      navigate('/websites/favorites/history/' + steps.at(-3));
      return;
    }

    if (steps.at(-5) === 'websites') {
      navigate('/websites/history/' + steps.at(-3));
      return;
    }

    if (steps.at(-4) === 'history') {
      navigate('/history');
      return;
    }
  }

  // special case to handle favorites path
  if (steps.length > 2 && steps.at(-2) === 'favorites') {
    navigate('/websites');
    return;
  }

  steps.pop();
  navigate(steps.join('/'));
};

export default function NavHeader({
  pathname,
  navigate,
}: {
  pathname: string;
  navigate: (path: string) => void;
}) {
  const { error, isValid } = useRemoteAttestation();
  const [isExtensionEnabled, setIsExtensionEnabled] = useExtensionEnabled();
  const [extensionStatus, setExtensionStatus] = useState<boolean | null>(null);

  useEffect(() => {
    setExtensionStatus(isExtensionEnabled);
  }, [isExtensionEnabled]);

  const [isFavorite, setIsFavorite] = useState(false);

  const getFavorite = useCallback(async (host: string) => {
    setIsFavorite(await favoritesManager.isFavorite(host));
  }, []);

  useEffect(() => {
    const steps = pathname.split('/');
    const host = steps.at(-2) === 'attestation' ? steps.at(-3) : steps.at(-1);
    if (steps.length > 2 && steps.at(-2) === 'history') {
      getFavorite(host || '');
    }
  }, [pathname, getFavorite]);

  const renderHeader = () => {
    const steps = pathname.split('/');
    const host = steps.at(-2) === 'attestation' ? steps.at(-3) : steps.at(-1);

    if (
      steps.length > 2 &&
      ['history', 'attestation'].includes(steps.at(-2) || '')
    ) {
      return (
        <div className="cursor-pointer leading-6 text-[1rem] flex items-center ml-auto">
          <div
            className="h-4 w-4 mr-1"
            onClick={() => {
              favoritesManager.toggleFavorite(host || '');
              setIsFavorite((f) => !f);
            }}
          >
            <Star isStarred={isFavorite} />
          </div>
          {host}
        </div>
      );
    }

    return (
      <div className="cursor-pointer leading-6 text-[1rem] ml-auto">
        {getTitleFromPath(pathname)}
      </div>
    );
  };

  const renderStatus = () => {
    if (isValid == null || extensionStatus == null) return ' ';
    if (extensionStatus) {
      if (isValid) {
        return 'Active';
      }
      return 'Error';
    }
    return 'Disabled';
  };

  return (
    <div className="flex flex-nowrap flex-shrink-0 flex-row items-center relative gap-2 py-4 cursor-default bg-white w-full border-[#E4E6EA] border-b">
      {pathname !== '/home' ? (
        <div
          className="ml-[18px] h-8 w-8 cursor-pointer hover:bg-gray-100 rounded-md border border-[#E4E6EA] flex items-center justify-center"
          onClick={() => handleBackClick(pathname, navigate)}
        >
          <Back />
        </div>
      ) : (
        <div className="w-8 h-8 ml-[18px] border border-[transparent]">
          <img src={logo} alt="logo" />
        </div>
      )}
      {renderHeader()}
      <div className="mr-[18px] ml-auto flex flex-col items-center justify-center w-8 h-7">
        <SimpleToggle onToggle={() => setExtensionStatus((p) => !p)} />
        <div className="text-[8px]">{renderStatus()}</div>
      </div>
    </div>
  );
}
