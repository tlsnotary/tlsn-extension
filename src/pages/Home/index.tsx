import React, {
  MouseEventHandler,
  ReactElement,
  ReactNode,
  useState,
} from 'react';
import Icon from '../../components/Icon';
import classNames from 'classnames';
import { useNavigate } from 'react-router';
import { useRequests } from '../../reducers/requests';
import { PluginList } from '../../components/PluginList';
import PluginUploadInfo from '../../components/PluginInfo';
import { ErrorModal } from '../../components/ErrorModal';
import { Globe, FileText, Search, Settings } from 'lucide-react';

export default function Home(): ReactElement {
  const requests = useRequests();
  const navigate = useNavigate();
  const [error, showError] = useState('');

  return (
    <div className="flex flex-col flex-nowrap justify-center gap-2 mx-4">
      {/* <NavButton fa="fa-solid fa-hammer" onClick={() => navigate('/custom')}>
          Custom
        </NavButton> */}
      {/* <NavButton
          fa="fa-solid fa-certificate"
          onClick={() => navigate('/verify')}
        >
          Verify
        </NavButton> */}

      {/* <NavButton className="relative" fa="fa-solid fa-plus">
          <PluginUploadInfo />
          Add a plugin
        </NavButton> */}

      {error && <ErrorModal onClose={() => showError('')} message={error} />}

      <div className=" bg-white shadow-lg rounded-lg overflow-hidden">
        <nav className="p-2">
          <button
            onClick={() => navigate('/bookmarks')}
            className="w-full flex items-center p-3 text-gray-700 hover:bg-blue-50 rounded transition-colors duration-200"
          >
            <Globe className="w-5 h-5 mr-3 text-blue-600" />
            <span>Providers</span>
          </button>
          <button
            onClick={() => navigate('/history')}
            className="w-full flex items-center p-3 text-gray-700 hover:bg-blue-50 rounded transition-colors duration-200"
          >
            <FileText className="w-5 h-5 mr-3 text-blue-600" />
            <span>Attestations</span>
          </button>
          <button
            onClick={() => navigate('/requests')}
            className="w-full flex items-center p-3 text-gray-700 hover:bg-blue-50 rounded transition-colors duration-200"
          >
            <Search className="w-5 h-5 mr-3 text-blue-600" />
            <span>Search Requests</span>
            <span className="ml-auto bg-blue-100 text-blue-600 text-xs font-semibold px-2 py-1 rounded-full">
              {`(${requests.length})`}
            </span>
          </button>
          <button
            onClick={() => navigate('/options')}
            className="w-full flex items-center p-3 text-gray-700 hover:bg-blue-50 rounded transition-colors duration-200"
          >
            <Settings className="w-5 h-5 mr-3 text-blue-600" />
            <span>Options</span>
          </button>
        </nav>
      </div>
      {/* <PluginList className="mx-4" /> */}
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
