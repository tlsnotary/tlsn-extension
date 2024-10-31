import React, {
  MouseEventHandler,
  ReactElement,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import Icon from '../../components/Icon';
import classNames from 'classnames';
import { useNavigate } from 'react-router';
import { ErrorModal } from '../../components/ErrorModal';
import History from '../History';
import './index.scss';
import Requests from '../Requests';
import PluginUploadInfo from '../../components/PluginInfo';
import {
  useOnPluginClick,
  usePluginConfig,
  usePluginHashes,
} from '../../reducers/plugins';
import { fetchPluginHashes } from '../../utils/rpc';
import DefaultPluginIcon from '../../assets/img/default-plugin-icon.png';
import { useClientId } from '../../reducers/p2p';

export default function Home(props: {
  tab?: 'history' | 'network';
}): ReactElement {
  const [error, showError] = useState('');
  const [tab, setTab] = useState<'history' | 'network'>(props.tab || 'history');
  const scrollableContent = useRef<HTMLDivElement | null>(null);
  const [shouldFix, setFix] = useState(false);
  const [actionPanelElement, setActionPanelElement] =
    useState<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    fetchPluginHashes();
  }, []);

  useEffect(() => {
    const element = scrollableContent.current;
    if (!element) return;
    if (!actionPanelElement) return;

    let timer = Date.now();
    const onScroll = () => {
      const now = Date.now();
      if (now - timer > 20) {
        timer = now;
        setScrollTop(element.scrollTop);
        if (element.scrollTop >= actionPanelElement.clientHeight) {
          setFix(true);
        } else {
          setFix(false);
        }
      }
    };

    element.addEventListener('scroll', onScroll);

    return () => {
      element.removeEventListener('scroll', onScroll);
    };
  }, [scrollableContent, actionPanelElement]);

  return (
    <div
      id="home"
      ref={scrollableContent}
      className="flex flex-col flex-grow overflow-y-auto"
    >
      {error && <ErrorModal onClose={() => showError('')} message={error} />}
      <ActionPanel
        setActionPanelElement={setActionPanelElement}
        scrollTop={scrollTop}
      />
      <div
        className={classNames('flex flex-row justify-center items-center', {
          'fixed top-9 w-full bg-white shadow lg:w-[598px] lg:mt-40': shouldFix,
        })}
      >
        <TabSelector
          onClick={() => setTab('network')}
          selected={tab === 'network'}
        >
          Network
        </TabSelector>
        <TabSelector
          onClick={() => setTab('history')}
          selected={tab === 'history'}
        >
          History
        </TabSelector>
      </div>
      <div className="flex-grow">
        {tab === 'history' && <History />}
        {tab === 'network' && <Requests shouldFix={shouldFix} />}
      </div>
    </div>
  );
}

function ActionPanel({
  setActionPanelElement,
  scrollTop,
}: {
  scrollTop: number;
  setActionPanelElement: (el: HTMLDivElement) => void;
}) {
  const pluginHashes = usePluginHashes();
  const navigate = useNavigate();
  const clientId = useClientId();
  const container = useRef<HTMLDivElement | null>(null);
  const [isOverflow, setOverflow] = useState(false);
  const [expanded, setExpand] = useState(false);

  const onCheckSize = useCallback(() => {
    const element = container.current;

    if (!element) return;

    setActionPanelElement(element);

    if (element.scrollWidth > element.clientWidth) {
      setOverflow(true);
    } else {
      setOverflow(false);
    }
  }, [container]);

  useEffect(() => {
    onCheckSize();

    window.addEventListener('resize', onCheckSize);

    return () => {
      window.removeEventListener('resize', onCheckSize);
    };
  }, [onCheckSize, pluginHashes]);

  useEffect(() => {
    const element = container.current;

    if (!element) return;

    if (scrollTop >= element.clientHeight) {
      setExpand(false);
    }
  }, [container, scrollTop]);

  return (
    <div
      ref={container}
      className={classNames(
        'flex flex-row justify-start items-center gap-4 p-4 border-b relative',
        {
          'flex-wrap': expanded,
          'flex-nowrap': !expanded,
        },
      )}
    >
      <NavButton
        fa="fa-solid fa-hammer"
        onClick={() => navigate('/custom')}
        title="Build a custom request"
      >
        Custom
      </NavButton>
      <NavButton
        fa="fa-solid fa-certificate"
        onClick={() => navigate('/verify')}
        title="Visualize an attestation"
      >
        Verify
      </NavButton>
      <NavButton
        className={'relative'}
        fa="fa-solid fa-circle"
        iconSize={0.5}
        iconClassName={classNames({
          '!text-green-500': clientId,
        })}
        onClick={() => navigate('/p2p')}
      >
        P2P
      </NavButton>
      {pluginHashes.map((hash) => (
        <PluginIcon hash={hash} onCheckSize={onCheckSize} />
      ))}
      <button
        className={
          'flex flex-row shrink-0 items-center justify-center self-start rounded relative border-2 border-dashed border-slate-300 hover:border-slate-400 text-slate-300 hover:text-slate-400 h-16 w-16 mx-1'
        }
        title="Install a plugin"
      >
        <PluginUploadInfo />
        <Icon fa="fa-solid fa-plus" />
      </button>
      <button
        className={classNames(
          'absolute right-0 top-0 w-6 h-full bg-slate-100 hover:bg-slate-200 font-semibold',
          'flex flex-row items-center justify-center gap-2 text-slate-500 hover:text-slate-700',
          {
            hidden: !isOverflow || expanded,
          },
        )}
        onClick={() => setExpand(true)}
      >
        <Icon fa="fa-solid fa-caret-down" size={0.875} />
      </button>
    </div>
  );
}

function PluginIcon({
  hash,
  onCheckSize,
}: {
  hash: string;
  onCheckSize: () => void;
}) {
  const config = usePluginConfig(hash);
  const onPluginClick = useOnPluginClick(hash);

  const onClick = useCallback(() => {
    if (!config) return;
    onPluginClick();
  }, [onPluginClick, config]);

  if (!config) return null;

  return (
    <button
      ref={() => {
        onCheckSize();
      }}
      className={classNames(
        'flex flex-col flex-nowrap items-center justify-center',
        'text-white px-2 py-1 gap-1 opacity-90 hover:opacity-100 w-18',
      )}
      onClick={onClick}
    >
      <Icon
        className="rounded-full flex flex-row items-center justify-center flex-grow-0 flex-shrink-0"
        url={config?.icon || DefaultPluginIcon}
        size={2}
      />
      <span className="font-bold text-primary h-10 w-14 overflow-hidden text-ellipsis">
        {config?.title}
      </span>
    </button>
  );
}

function TabSelector(props: {
  children: string;
  className?: string;
  selected?: boolean;
  onClick: MouseEventHandler;
}): ReactElement {
  return (
    <button
      onClick={props.onClick}
      className={classNames(
        'flex flex-grow items-center justify-center p-2 font-semibold hover:text-slate-700 border-b-2 ',
        {
          'font-semibold text-slate-400 border-white': !props.selected,
          'font-bold text-primary border-primary': props.selected,
        },
        props.className,
      )}
    >
      {props.children}
    </button>
  );
}

function NavButton(props: {
  fa: string;
  children?: ReactNode;
  onClick?: MouseEventHandler;
  className?: string;
  title?: string;
  iconClassName?: string;
  disabled?: boolean;
  iconSize?: number;
}): ReactElement {
  return (
    <button
      className={classNames(
        'flex flex-col flex-nowrap items-center justify-center',
        // {
        //   'bg-primary/[.8] hover:bg-primary/[.7] active:bg-primary':
        //     !props.disabled,
        //   'bg-primary/[.5]': props.disabled,
        // },
        'text-white px-2 py-1 gap-1 opacity-90 hover:opacity-100 w-18',
        props.className,
      )}
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
    >
      <Icon
        className="w-8 h-8 rounded-full bg-primary flex flex-row items-center justify-center flex-grow-0 flex-shrink-0"
        fa={props.fa}
        size={0.875}
      />
      <span className="font-bold text-primary h-10 w-14 overflow-hidden text-ellipsis">
        {props.children}
      </span>
    </button>
  );
}
