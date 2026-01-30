import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-gray-800 text-white py-4 mt-auto">
      <div className="max-w-7xl mx-auto px-4 text-center">
        <p className="text-sm">
          Built with{' '}
          <a
            href="https://github.com/tlsnotary/tlsn"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300"
          >
            TLSNotary
          </a>{' '}
          | Git Hash: <code className="bg-gray-700 px-2 py-1 rounded text-xs">{__GIT_HASH__}</code>
        </p>
      </div>
    </footer>
  );
};
