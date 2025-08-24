import React from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../../reducers';
import browser from 'webextension-polyfill';

const Popup: React.FC = () => {
  const message = useSelector((state: RootState) => state.app.message);

  const handleClick = async () => {
    // Send message to background script
    const response = await browser.runtime.sendMessage({ type: 'PING' });
    console.log('Response from background:', response);
  };

  return (
    <div className="w-[400px] h-[300px] bg-white p-8">
      <div className="flex flex-col items-center justify-center h-full">
        <h1 className="text-3xl font-bold text-gray-800 mb-4">Hello World!</h1>
        <p className="text-gray-600 mb-6">{message || 'Chrome Extension Boilerplate'}</p>
        <button
          onClick={handleClick}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Test Background Script
        </button>
      </div>
    </div>
  );
};

export default Popup;