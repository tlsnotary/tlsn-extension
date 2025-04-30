import React, { Children, MouseEventHandler, ReactNode } from 'react';
import Modal, {
  ModalHeader,
  ModalContent,
  ModalFooter,
} from '../../components/Modal/Modal';
import type { PluginConfig } from '../../utils/misc';
import './index.scss';
import logo from '../../assets/img/icon-128.png';
import {
  HostFunctionsDescriptions,
  MultipleParts,
  PermissionDescription,
} from '../../utils/plugins';
import classNames from 'classnames';
import DefaultPluginIcon from '../../assets/img/default-plugin-icon.png';

export function PluginInfoModalHeader(props: {
  className?: string;
  children: ReactNode | ReactNode[];
}) {
  return <div className={props.className}>{props.children}</div>;
}

export function PluginInfoModalContent(props: {
  className?: string;
  children: ReactNode | ReactNode[];
}) {
  return <div className={props.className}>{props.children}</div>;
}

export function PluginInfoModal(props: {
  pluginContent: PluginConfig;
  onClose: () => void;
  onAddPlugin?: MouseEventHandler;
  children?: ReactNode | ReactNode[];
}) {
  const { pluginContent, onClose, onAddPlugin, children } = props;

  const header = Children.toArray(children).filter(
    (c: any) => c.type.name === 'PluginInfoModalHeader',
  )[0];

  const content = Children.toArray(children).filter(
    (c: any) => c.type.name === 'PluginInfoModalContent',
  )[0];

  return (
    <Modal
      onClose={onClose}
      className="custom-modal !rounded-none flex items-center justify-center gap-4 cursor-default"
    >
      <ModalHeader className="w-full p-2 border-gray-200 text-gray-500">
        {header || (
          <div className="flex flex-row items-end justify-start gap-2">
            <img className="h-5" src={logo || DefaultPluginIcon} alt="logo" />
            <span className="font-semibold">{`Installing ${pluginContent.title}`}</span>
          </div>
        )}
      </ModalHeader>
      <ModalContent className="flex flex-col flex-grow-0 flex-shrink-0 items-center px-8 py-2 gap-2 w-full max-h-none">
        {content || (
          <>
            <img
              className="w-12 h-12"
              src={pluginContent.icon || DefaultPluginIcon}
              alt="Plugin Icon"
            />
            <span className="text-3xl text-center">
              <span>
                <span className="text-blue-600 font-semibold">
                  {pluginContent.title}
                </span>{' '}
                wants access to your browser
              </span>
            </span>
          </>
        )}
      </ModalContent>
      <div className="flex-grow flex-shrink overflow-y-auto w-full px-8">
        <PluginPermissions pluginContent={pluginContent} />
      </div>
      <ModalFooter className="flex justify-end gap-2 p-4">
        <button className="button" onClick={onClose}>
          Cancel
        </button>
        {onAddPlugin && (
          <button className="button button--primary" onClick={onAddPlugin}>
            Allow
          </button>
        )}
      </ModalFooter>
    </Modal>
  );
}

export function PluginPermissions({
  pluginContent,
  className,
}: {
  pluginContent: PluginConfig;
  className?: string;
}) {
  return (
    <div className={classNames('flex flex-col p-2 gap-5', className)}>
      {pluginContent.hostFunctions?.map((hostFunction: string) => {
        const HFComponent = HostFunctionsDescriptions[hostFunction];
        return <HFComponent key={hostFunction} {...pluginContent} />;
      })}
      {pluginContent.cookies && (
        <PermissionDescription fa="fa-solid fa-cookie-bite">
          <span className="cursor-default">
            <span className="mr-1">Access cookies from</span>
            <MultipleParts parts={pluginContent.cookies} />
          </span>
        </PermissionDescription>
      )}
      {pluginContent.headers && (
        <PermissionDescription fa="fa-solid fa-envelope">
          <span className="cursor-default">
            <span className="mr-1">Access headers from</span>
            <MultipleParts parts={pluginContent.headers} />
          </span>
        </PermissionDescription>
      )}
      {pluginContent.localStorage && (
        <PermissionDescription fa="fa-solid fa-database">
          <span className="cursor-default">
            <span className="mr-1">Access local storage storage from</span>
            <MultipleParts parts={pluginContent.localStorage} />
          </span>
        </PermissionDescription>
      )}
      {pluginContent.sessionStorage && (
        <PermissionDescription fa="fa-solid fa-database">
          <span className="cursor-default">
            <span className="mr-1">Access session storage from</span>
            <MultipleParts parts={pluginContent.sessionStorage} />
          </span>
        </PermissionDescription>
      )}
      {pluginContent.requests && (
        <PermissionDescription fa="fa-solid fa-globe">
          <span className="cursor-default">
            <span className="mr-1">Submit network requests to</span>
            <MultipleParts
              parts={pluginContent?.requests.map(({ url }) => url)}
            />
          </span>
        </PermissionDescription>
      )}
    </div>
  );
}
