import React, {
  ChangeEvent,
  MouseEventHandler,
  ReactElement,
  ReactNode,
  useCallback,
  useState,
} from 'react';
import Icon from '../../components/Icon';
import classNames from 'classnames';
import { useNavigate } from 'react-router';
import { useRequests } from '../../reducers/requests';
import { makePlugin, getPluginConfig } from '../../utils/misc';
import { useDispatch } from 'react-redux';
import {
  getMaxRecv,
  getMaxSent,
  getNotaryApi,
  getProxyApi,
} from '../../utils/storage';
import createPlugin, { CallContext } from '@extism/extism';
import { addPlugin, getCookiesByHost, getHeadersByHost } from '../../utils/rpc';
import { PluginList } from '../../components/PluginList';
import { ErrorModal } from '../../components/ErrorModal';

export default function Home(): ReactElement {
  const requests = useRequests();
  const navigate = useNavigate();
  const [error, showError] = useState('');

  const onAddPlugin = useCallback(
    async (evt: ChangeEvent<HTMLInputElement>) => {
      if (!evt.target.files) return;
      try {
        const [file] = evt.target.files;
        const arrayBuffer = await file.arrayBuffer();
        const plugin = await makePlugin(arrayBuffer);
        await getPluginConfig(plugin);
        await addPlugin(Buffer.from(arrayBuffer).toString('hex'));
      } catch (e: any) {
        showError(e?.message || 'Invalid Plugin');
      }
    },
    [],
  );

  return (
    <div className="flex flex-col gap-4 py-4 overflow-y-auto">
      {error && <ErrorModal onClose={() => showError('')} message={error} />}
      <div className="flex flex-col flex-nowrap justify-center gap-2 mx-4">
        <NavButton fa="fa-solid fa-table" onClick={() => navigate('/requests')}>
          <span>Requests</span>
          <span>{`(${requests.length})`}</span>
        </NavButton>
        <NavButton
          fa="fa-solid fa-magnifying-glass"
          onClick={() => navigate('/custom')}
        >
          Custom
        </NavButton>
        <NavButton
          fa="fa-solid fa-magnifying-glass"
          onClick={() => navigate('/verify')}
        >
          Verify
        </NavButton>
        <NavButton fa="fa-solid fa-list" onClick={() => navigate('/history')}>
          History
        </NavButton>
        <NavButton className="relative" fa="fa-solid fa-plus">
          <input
            className="opacity-0 absolute top-0 right-0 h-full w-full"
            type="file"
            onChange={onAddPlugin}
          />
          Add a plugin
        </NavButton>
        <NavButton fa="fa-solid fa-gear" onClick={() => navigate('/options')}>
          Options
        </NavButton>
      </div>
      <PluginList className="mx-4" />
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
