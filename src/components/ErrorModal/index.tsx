import React, { ReactElement } from 'react';
import Modal, { ModalContent } from '../Modal/Modal';

export function ErrorModal(props: {
  onClose: () => void;
  message: string;
}): ReactElement {
  const { onClose, message } = props;

  return (
    <Modal
      className="flex flex-col gap-4 items-center text-base cursor-default justify-center !w-auto mx-4 my-[50%] min-h-24 p-4 border border-red-500 !bg-red-100"
      onClose={onClose}
    >
      <ModalContent className="flex justify-center items-center text-red-500">
        {message || 'Something went wrong :('}
      </ModalContent>
      <button
        className="m-0 w-24 bg-red-200 text-red-400 hover:bg-red-200 hover:text-red-500"
        onClick={onClose}
      >
        OK
      </button>
    </Modal>
  );
}
