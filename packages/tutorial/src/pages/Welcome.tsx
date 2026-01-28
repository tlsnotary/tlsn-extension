import React from 'react';
import { Button } from '../components/shared/Button';
import { useStepProgress } from '../hooks/useStepProgress';

export const Welcome: React.FC = () => {
  const { complete } = useStepProgress(0);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-8 animate-slide-in-up">
        <h1 className="text-4xl font-bold mb-6 gradient-text">
          Welcome to the TLSNotary Browser Extension Plugin Tutorial
        </h1>

        <p className="text-lg text-gray-700 mb-6">
          This interactive tutorial will guide you through creating and running TLSNotary plugins.
          You'll learn how to:
        </p>

        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-8">
          <li>Set up the TLSNotary browser extension and a verifier server</li>
          <li>Understand the fundamentals of zkTLS and TLSNotary architecture</li>
          <li>Test your setup with the example Twitter plugin</li>
          <li>Create and test your own Swiss Bank plugin</li>
          <li>Challenge yourself to complete extra challenges</li>
        </ul>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
          <h3 className="text-xl font-bold text-blue-900 mb-3">How does TLSNotary work?</h3>
          <p className="text-gray-700 mb-4">In TLSNotary, there are three key components:</p>
          <ul className="list-disc list-inside space-y-2 text-gray-700">
            <li>
              <strong>Prover (Your Browser)</strong>: Makes requests to websites and generates
              cryptographic proofs
            </li>
            <li>
              <strong>Server (Twitter/Swiss Bank)</strong>: The website that serves the data you
              want to prove
            </li>
            <li>
              <strong>Verifier</strong>: Independently verifies that the data really came from the
              server
            </li>
          </ul>

          <p className="text-gray-700 mt-4">
            <strong>The key innovation:</strong> TLSNotary uses Multi-Party Computation (MPC-TLS)
            where the verifier participates in the TLS session alongside your browser. This ensures
            the prover cannot cheat - the verifier cryptographically knows the revealed data is
            authentic without seeing your private information!
          </p>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-8">
          <h3 className="text-xl font-bold text-green-900 mb-3">What you'll build:</h3>
          <p className="text-gray-700">
            By the end of this tutorial, you'll understand how to create plugins that can prove data
            from any website, opening up possibilities for verified credentials, authenticated data
            sharing, and trustless applications.
          </p>
        </div>

        <div className="flex justify-center">
          <Button onClick={complete} variant="primary">
            Start Tutorial →
          </Button>
        </div>
      </div>
    </div>
  );
};
