import React, { MouseEventHandler, ReactElement, ReactNode } from 'react';
import Icon from '../../components/Icon';
import classNames from 'classnames';
import { useNavigate } from 'react-router';
import { useActiveTabUrl, useRequests } from '../../reducers/requests';
import { Link } from 'react-router-dom';
import bookmarks from '../../../utils/bookmark/bookmarks.json';
import { useDispatch } from 'react-redux';
import PluginDisplayBox from '../../components/PluginDisplayBox';

export default function Home(): ReactElement {
  const requests = useRequests();
  const url = useActiveTabUrl();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-4 py-4 overflow-y-auto">
      <div className="flex flex-col flex-nowrap justify-center gap-2 mx-4">
        <NavButton fa="fa-solid fa-table" onClick={() => navigate('/requests')}>
          <span>Requests</span>
          <span>{`(${requests.length})`}</span>
        </NavButton>
        <NavButton fa="fa-solid fa-hammer" onClick={() => navigate('/custom')}>
          Custom
        </NavButton>
        <NavButton
          fa="fa-solid fa-certificate"
          onClick={() => navigate('/verify')}
        >
          Verify
        </NavButton>
        <NavButton fa="fa-solid fa-list" onClick={() => navigate('/history')}>
          History
        </NavButton>
        <NavButton fa="fa-solid fa-gear" onClick={() => navigate('/options')}>
          Options
        </NavButton>
        <NavButton
          fa="fa-solid fa-people-arrows"
          onClick={() => navigate('/p2p')}
        >
          P2P
        </NavButton>
      </div>
      {!bookmarks.length && (
        <div className="flex flex-col flex-nowrap">
          <div className="flex flex-col items-center justify-center text-slate-300 cursor-default select-none">
            <div>No available notarization for {url?.hostname}</div>
            <div>
              Browse <Link to="/requests">Requests</Link>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-col px-4 gap-4">
        {bookmarks.map((bm, i) => (
          <PluginDisplayBox className="border rounded-md" key={i} {...bm} />
        ))}
      </div>
    </div>
  );
}

function NavButton(props: {
  fa: string;
  children?: ReactNode;
  onClick?: MouseEventHandler;
  className?: string;
  disabled?: boolean;
}): ReactElement {
  return (
    <button
      className={classNames(
        'flex flex-row flex-nowrap items-center justify-center',
        'text-white rounded px-2 py-1 gap-1',
        {
          'bg-primary/[.8] hover:bg-primary/[.7] active:bg-primary':
            !props.disabled,
          'bg-primary/[.5]': props.disabled,
        },
        props.className,
      )}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      <Icon className="flex-grow-0 flex-shrink-0" fa={props.fa} size={1} />
      <span className="flex-grow flex-shrink w-0 flex-grow font-bold">
        {props.children}
      </span>
    </button>
  );
}
