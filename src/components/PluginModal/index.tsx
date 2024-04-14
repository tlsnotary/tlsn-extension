import React, { ReactElement, useCallback } from 'react';
import bookmarks from '../../../utils/bookmark/bookmarks.json';
import Modal, { ModalContent, ModalHeader } from '../Modal/Modal';
import PluginDisplayBox, { type PluginParams } from '../PluginDisplayBox';
import './index.scss';

type Props = {
  onClose: () => void;
  onSelect?: (plugin: PluginParams) => void;
};

export default function PluginModal(props: Props): ReactElement {
  const onClick = useCallback(
    (plugin: PluginParams) => {
      if (props.onSelect) props.onSelect(plugin);
    },
    [props.onSelect],
  );

  return (
    <Modal className="plugin-modal" onClose={props.onClose}>
      <ModalHeader onClose={props.onClose}>Choose a plugin</ModalHeader>
      <ModalContent>
        {bookmarks.map((bookmark, i) => (
          <PluginDisplayBox
            key={i}
            className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
            onClick={() => onClick(bookmark)}
            {...bookmark}
            hideAction
          />
        ))}
      </ModalContent>
    </Modal>
  );
}
