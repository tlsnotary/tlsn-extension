import React from 'react';
import { InteractiveQuiz } from '../components/challenges/InteractiveQuiz';
import { useStepProgress } from '../hooks/useStepProgress';
import { QuizQuestion } from '../types';

const questions: QuizQuestion[] = [
  {
    question: 'What is the verifier\'s role in TLSNotary?',
    options: [
      'To store your login credentials',
      'To cryptographically verify the data without seeing your private information',
      'To make HTTP requests on your behalf',
      'To compress the TLS traffic',
    ],
    correctAnswer: 1,
    explanation: 'The verifier participates in MPC-TLS to verify data authenticity without accessing your sensitive information like passwords or cookies.',
  },
  {
    question: 'What does PEDERSEN commitment do in TLSNotary handlers?',
    options: [
      'Hashes data for commitment without revealing the plaintext',
      'Encrypts data with AES-256',
      'Reveals data in plaintext to the verifier',
      'Compresses the data before sending',
    ],
    correctAnswer: 0,
    explanation: 'PEDERSEN creates a cryptographic commitment to data without revealing it in plaintext, useful for privacy-preserving proofs.',
  },
  {
    question: 'What does a handler with type: "RECV" mean?',
    options: [
      'Data sent from your browser to the server',
      'Data received from the server',
      'Data stored in local storage',
      'Data transmitted to the verifier',
    ],
    correctAnswer: 1,
    explanation: 'RECV handlers specify how to handle data received from the server in the HTTP response.',
  },
];

export const Concepts: React.FC = () => {
  const { complete, isCompleted } = useStepProgress(2);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-8 animate-slide-in-up mb-6">
        <h1 className="text-3xl font-bold mb-6 gradient-text">Step 2: TLSNotary Concepts</h1>

        <p className="text-lg text-gray-700 mb-6">
          Before writing code, let's understand how TLSNotary works. Complete this quiz to test your knowledge.
        </p>

        <div className="mb-6">
          <h3 className="text-xl font-bold text-gray-800 mb-3">Key Concepts</h3>

          <div className="space-y-4">
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="font-bold text-blue-900 mb-2">MPC-TLS (Multi-Party Computation TLS)</h4>
              <p className="text-gray-700">
                The verifier participates in the TLS handshake alongside your browser, enabling them to verify data authenticity without seeing sensitive information.
              </p>
            </div>

            <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
              <h4 className="font-bold text-purple-900 mb-2">Handler Types</h4>
              <ul className="list-disc list-inside text-gray-700 space-y-1">
                <li><strong>SENT:</strong> Data sent from your browser to the server (HTTP request)</li>
                <li><strong>RECV:</strong> Data received from the server (HTTP response)</li>
              </ul>
            </div>

            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <h4 className="font-bold text-green-900 mb-2">Handler Actions</h4>
              <ul className="list-disc list-inside text-gray-700 space-y-1">
                <li><strong>REVEAL:</strong> Show data in plaintext in the proof</li>
                <li><strong>PEDERSEN:</strong> Create a hash commitment without revealing plaintext</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {!isCompleted ? (
        <InteractiveQuiz questions={questions} onComplete={complete} />
      ) : (
        <div className="bg-green-50 border border-green-300 rounded-lg p-6 text-center">
          <p className="text-xl font-bold text-green-900 mb-2">Quiz Completed! ✓</p>
          <p className="text-gray-700">You've mastered the TLSNotary concepts. Ready to move on!</p>
        </div>
      )}
    </div>
  );
};
