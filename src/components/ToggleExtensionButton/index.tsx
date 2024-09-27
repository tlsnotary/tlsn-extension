import React, {
  ChangeEvent,
  Children,
  MouseEventHandler,
  ReactElement,
  ReactNode,
  useCallback,
  useState,
  useEffect,
} from 'react';
import { useExtensionEnabled } from '../../reducers/requests';
import Icon from '../Icon';
import { set } from '../../utils/storage';
export default function ToggleExtensionButton(): ReactElement {
  return (
    <div className="absolute right-2 flex flex-nowrap flex-row items-center gap-1 justify-center w-fit cursor-pointer">
      <SimpleToggle onToggle={() => ''} />
    </div>
  );
}

export function SimpleToggle({ onToggle }: { onToggle: () => void }) {
  //const [isOn, setIsOn] = useState<boolean | null>(null);
  const [isOn, setIsEnabled] = useExtensionEnabled();
  const toggle = () => {
    setIsEnabled(!isOn);
    onToggle();
    chrome.storage.sync.set({ 'enable-extension': !isOn });
  };

  if (isOn === null) {
    return <></>;
  }

  return (
    <button
      className={`rrelative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
        isOn ? 'bg-green-600' : 'bg-gray-200'
      }`}
      onClick={toggle}
      role="switch"
      aria-checked={isOn}
    >
      <span className="sr-only">Toggle switch</span>
      <span
        className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
          isOn ? 'translate-x-[13px]' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
