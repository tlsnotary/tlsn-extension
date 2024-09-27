import React from 'react';
import { ReactElement, ReactNode, MouseEventHandler } from 'react';
import classNames from 'classnames';
import ChevronRight from '../SvgIcons/ChevronRight';

export default function NavButton(props: {
  ImageIcon: ReactNode;
  title: string;
  subtitle: string;

  onClick?: MouseEventHandler;
  className?: string;
  disabled?: boolean;
}): ReactElement {
  const { ImageIcon, title, subtitle, onClick, className, disabled } = props;
  return (
    <button
      className={classNames(
        'flex flex-row flex-nowrap items-center overflow-hidden',
        'rounded-xl px-4 py-4 border border-[#E4E6EA]',
        'bg-white hover:bg-gray-100 cursor-pointer',
        className,
      )}
      onClick={onClick}
      disabled={disabled}
    >
      <div className="flex justify-center items-center h-8 w-8">
        {ImageIcon}
      </div>

      <div className="flex flex-col flex-nowrap items-start mx-4 flex-1 overflow-hidden">
        <span className="text-sm text-textGray">{title}</span>
        <span className="text-xs text-textGrayLight truncate max-w-full">
          {subtitle}
        </span>
      </div>

      <div className="flex items-center h-5 w-5">
        <ChevronRight />
      </div>
    </button>
  );
}
