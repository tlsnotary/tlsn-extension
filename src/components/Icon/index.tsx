import React, { MouseEventHandler, ReactElement, ReactNode } from 'react';
import classNames from 'classnames';
import './icon.scss';

type Props = {
  url?: string;
  fa?: string;
  className?: string;
  size?: number;
  onClick?: MouseEventHandler;
  children?: ReactNode;
};

export default function Icon(props: Props): ReactElement {
  const { url, size = 1, className = '', fa, onClick, children } = props;

  return (
    <div
      className={classNames(
        'bg-contain bg-center bg-no-repeat icon',
        {
          'cursor-pointer': onClick,
        },
        className,
      )}
      style={{
        backgroundImage: url ? `url(${url})` : undefined,
        width: !fa ? `${size}rem` : undefined,
        height: !fa ? `${size}rem` : undefined,
      }}
      onClick={onClick}
    >
      {!url && !!fa && <i className={fa} style={{ fontSize: `${size}rem` }} />}
      {children}
    </div>
  );
}
