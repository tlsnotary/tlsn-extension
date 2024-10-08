import React, {
  MouseEventHandler,
  ReactElement,
  useCallback,
  useState,
} from 'react';
import Icon from '../Icon';
import browser from 'webextension-polyfill';
import classNames from 'classnames';
import { useNavigate } from 'react-router';

export function MenuIcon(): ReactElement {
  const [opened, setOpen] = useState(false);

  const toggleMenu = useCallback(() => {
    setOpen(!opened);
  }, [opened]);

  return (
    <div className="relative">
      {opened && (
        <>
          <div
            className="fixed top-0 left-0 w-screen h-screen z-10"
            onClick={toggleMenu}
          />
          <Menu opened={opened} setOpen={setOpen} />
        </>
      )}
      <Icon
        fa="fa-solid fa-bars"
        className="text-slate-500 hover:text-slate-700 active:text-slate-900 cursor-pointer z-20"
        onClick={toggleMenu}
      />
    </div>
  );
}

export default function Menu(props: {
  opened: boolean;
  setOpen: (opened: boolean) => void;
}): ReactElement {
  const navigate = useNavigate();
  const openExtensionInPage = () => {
    props.setOpen(false);
    browser.tabs.create({
      url: `chrome-extension://${chrome.runtime.id}/popup.html`,
    });
  };

  return (
    <div className="absolute top-[100%] right-0 rounded-md z-20">
      <div className="flex flex-col bg-slate-200 w-40 shadow rounded-md py">
        <MenuRow
          fa="fa-solid fa-plus"
          label="Install Plugin"
          onClick={() => {
            props.setOpen(false);
          }}
        />
        <MenuRow
          fa="fa-solid fa-toolbox"
          label="Plugins"
          className="border-b border-slate-300"
          onClick={() => {
            props.setOpen(false);
            navigate('/plugins');
          }}
        />
        <MenuRow
          className="lg:hidden"
          fa="fa-solid fa-up-right-and-down-left-from-center"
          label="Expand"
          onClick={openExtensionInPage}
        />
        <MenuRow
          fa="fa-solid fa-gear"
          label="Options"
          onClick={() => {
            props.setOpen(false);
            navigate('/options');
          }}
        />
      </div>
    </div>
  );
}

function MenuRow(props: {
  fa: string;
  label: string;
  onClick?: MouseEventHandler;
  className?: string;
}): ReactElement {
  return (
    <div
      className={classNames(
        'flex flex-row items-center py-3 px-4 gap-2 hover:bg-slate-300 cursor-pointer text-slate-800 hover:text-slate-900',
        props.className,
      )}
      onClick={props.onClick}
    >
      <Icon size={0.875} fa={props.fa} />
      <div className="font-semibold">{props.label}</div>
    </div>
  );
}
