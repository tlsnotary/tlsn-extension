import React from 'react';
import { Button } from '../components/shared/Button';
import { useTutorial } from '../context/TutorialContext';

export const Completion: React.FC = () => {
  const { actions } = useTutorial();

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-8 animate-slide-in-up text-center">
        <div className="text-6xl mb-6">🏆</div>
        <h1 className="text-4xl font-bold mb-6 gradient-text">Tutorial Complete!</h1>

        <p className="text-xl text-gray-700 mb-8">
          Congratulations! You've mastered the fundamentals of TLSNotary plugin development.
        </p>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8 text-left">
          <h3 className="text-xl font-bold text-blue-900 mb-4">Skills You've Learned:</h3>
          <ul className="list-disc list-inside space-y-2 text-gray-700">
            <li>Understanding zkTLS and MPC-TLS architecture</li>
            <li>Setting up TLSNotary development environment</li>
            <li>Reading and analyzing example plugins</li>
            <li>Creating custom reveal handlers</li>
            <li>Working with RECV and SENT data types</li>
            <li>Using REVEAL and PEDERSEN commitments</li>
            <li>Understanding verifier-side validation importance</li>
          </ul>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-8 text-left">
          <h3 className="text-xl font-bold text-green-900 mb-4">What's Next?</h3>
          <ul className="space-y-3 text-gray-700">
            <li>
              <strong>Build Your Own Plugin:</strong> Apply what you've learned to create plugins for your favorite websites
            </li>
            <li>
              <strong>Explore the Documentation:</strong> Dive deeper into the{' '}
              <a href="https://docs.tlsnotary.org" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                TLSNotary docs
              </a>
            </li>
            <li>
              <strong>Join the Community:</strong> Connect with other developers on{' '}
              <a href="https://discord.gg/tlsnotary" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                Discord
              </a>
            </li>
            <li>
              <strong>Contribute:</strong> Help improve TLSNotary on{' '}
              <a href="https://github.com/tlsnotary/tlsn" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                GitHub
              </a>
            </li>
          </ul>
        </div>

        <div className="flex justify-center gap-4">
          <Button onClick={actions.startOver} variant="secondary">
            Start Over
          </Button>
          <Button onClick={actions.resetProgress} variant="danger">
            Reset All Progress
          </Button>
        </div>
      </div>
    </div>
  );
};
