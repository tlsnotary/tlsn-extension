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
import { useRequests } from '../../reducers/requests';
import { ErrorModal } from '../../components/ErrorModal';
import History from '../History';
import './index.scss';
import Requests from '../Requests';

export default function Home(props: {
  tab?: 'history' | 'network';
}): ReactElement {
  const navigate = useNavigate();
  const [error, showError] = useState('');
  const [tab, setTab] = useState<'history' | 'network'>(props.tab || 'history');
  const scrollableContent = useRef<HTMLDivElement | null>(null);
  const [shouldFix, setFix] = useState(false);

  useEffect(() => {
    const element = scrollableContent.current;
    if (!element) return;
    let timer = Date.now();
    const onScroll = () => {
      const now = Date.now();
      if (now - timer > 20) {
        timer = now;
        console.log(element.scrollTop);
        if (element.scrollTop >= 95) {
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
  }, [scrollableContent]);

  return (
    <div
      id="home"
      ref={scrollableContent}
      className="flex flex-col flex-grow overflow-y-auto"
    >
      {error && <ErrorModal onClose={() => showError('')} message={error} />}
      <div className="flex flex-row flex-nowrap justify-start items-center gap-4 p-4 border-b">
        {/*<NavButton*/}
        {/*  className="lg:hidden"*/}
        {/*  fa="fa-solid fa-table"*/}
        {/*  onClick={() => navigate('/requests')}*/}
        {/*>*/}
        {/*  <span>Network</span>*/}
        {/*</NavButton>*/}
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
        {/*<NavButton fa="fa-solid fa-list" onClick={() => navigate('/history')}>*/}
        {/*  History*/}
        {/*</NavButton>*/}
        {/*<NavButton className="relative" fa="fa-solid fa-plus">*/}
        {/*  <PluginUploadInfo />*/}
        {/*  Install Plugin*/}
        {/*</NavButton>*/}
      </div>
      <div
        className={classNames('flex flex-row justify-center items-center', {
          'fixed top-9 w-full bg-white shadow': shouldFix,
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
  disabled?: boolean;
}): ReactElement {
  return (
    <button
      className={classNames(
        'flex flex-col flex-nowrap items-center justify-center',
        'text-white px-2 py-1 gap-1 opacity-90 hover:opacity-100',
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
      <span className="font-bold text-primary w-12 overflow-hidden text-ellipsis">
        {props.children}
      </span>
    </button>
  );
}
