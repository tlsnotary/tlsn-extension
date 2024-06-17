import React, { MouseEventHandler, ReactElement, ReactNode } from 'react';
import ReactDOM from 'react-dom';
import './modal.scss';
import Icon from '../Icon';
import classNames from 'classnames';

type Props = {
  className?: string;
  onClose: MouseEventHandler;
  children: ReactNode | ReactNode[];
};

export default function Modal(props: Props): ReactElement {
  const { className, onClose, children } = props;

  const modalRoot = document.querySelector('#modal-root');

  if (!modalRoot) return <></>;

  return ReactDOM.createPortal(
    <div
      className={classNames('bg-black bg-opacity-80', 'modal__overlay')}
      onClick={(e) => {
        e.stopPropagation();
        onClose && onClose(e);
      }}
    >
      <div
        className={classNames(`modal__wrapper bg-white`, className)}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    modalRoot,
  );
}

type HeaderProps = {
  className?: string;
  onClose?: () => void;
  children?: ReactNode;
};

export function ModalHeader(props: HeaderProps): ReactElement {
  return (
    <div
      className={classNames(
        'border-b modal__header border-gray-100',
        props.className,
      )}
    >
      <div className="modal__header__title">{props.children}</div>
      <div className="modal__header__content">
        {props.onClose && (
          <div
            className={classNames(
              'flex flex-row items-center justify-center',
              'p-2 rounded-full opacity-50',
              'hover:opacity-100 text-black',
            )}
          >
            <Icon fa="fas fa-times" size={1} onClick={props.onClose} />
          </div>
        )}
      </div>
    </div>
  );
}

type ContentProps = {
  children: ReactNode;
  className?: string;
};

export function ModalContent(props: ContentProps): ReactElement {
  return (
    <div className={classNames('modal__content', props.className)}>
      {props.children}
    </div>
  );
}

type FooterProps = {
  children: ReactNode;
  className?: string;
};

export function ModalFooter(props: FooterProps): ReactElement {
  return (
    <div
      className={classNames(
        'border-t modal__footer border-gray-100 w-full',
        props.className,
      )}
    >
      {props.children}
    </div>
  );
}
