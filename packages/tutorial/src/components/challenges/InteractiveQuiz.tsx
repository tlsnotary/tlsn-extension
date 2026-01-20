import React, { useState } from 'react';
import { QuizQuestion } from '../../types';
import { Button } from '../shared/Button';

interface InteractiveQuizProps {
  questions: QuizQuestion[];
  onComplete: () => void;
}

export const InteractiveQuiz: React.FC<InteractiveQuizProps> = ({ questions, onComplete }) => {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>(Array(questions.length).fill(-1));
  const [showExplanation, setShowExplanation] = useState(false);

  const question = questions[currentQuestion];
  const isAnswered = selectedAnswers[currentQuestion] !== -1;
  const isCorrect = selectedAnswers[currentQuestion] === question.correctAnswer;
  const allAnswered = selectedAnswers.every((answer) => answer !== -1);
  const allCorrect = selectedAnswers.every((answer, index) => answer === questions[index].correctAnswer);

  const handleSelectAnswer = (optionIndex: number) => {
    const newAnswers = [...selectedAnswers];
    newAnswers[currentQuestion] = optionIndex;
    setSelectedAnswers(newAnswers);
    setShowExplanation(true);
  };

  const handleNext = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
      setShowExplanation(selectedAnswers[currentQuestion + 1] !== -1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
      setShowExplanation(selectedAnswers[currentQuestion - 1] !== -1);
    }
  };

  const handleComplete = () => {
    if (allCorrect) {
      onComplete();
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-bold text-gray-800">
            Question {currentQuestion + 1} of {questions.length}
          </h3>
          <div className="text-sm text-gray-600">
            {selectedAnswers.filter((a) => a !== -1).length} / {questions.length} answered
          </div>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="gradient-bg h-2 rounded-full transition-all duration-300"
            style={{ width: `${((currentQuestion + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="mb-6">
        <p className="text-lg font-medium text-gray-800 mb-4">{question.question}</p>

        <div className="space-y-3">
          {question.options.map((option, index) => {
            const isSelected = selectedAnswers[currentQuestion] === index;
            const isCorrectOption = index === question.correctAnswer;
            const showCorrectness = isAnswered;

            return (
              <button
                key={index}
                onClick={() => !isAnswered && handleSelectAnswer(index)}
                disabled={isAnswered}
                className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all ${
                  isSelected && showCorrectness
                    ? isCorrectOption
                      ? 'border-green-500 bg-green-50'
                      : 'border-red-500 bg-red-50'
                    : isSelected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                } ${isAnswered ? 'cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div className="flex items-center justify-between">
                  <span>{option}</span>
                  {isSelected && showCorrectness && (
                    <span className="text-xl">{isCorrectOption ? '✅' : '❌'}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {showExplanation && (
        <div
          className={`p-4 rounded-lg mb-4 ${
            isCorrect ? 'bg-green-100 border border-green-300' : 'bg-yellow-100 border border-yellow-300'
          }`}
        >
          <p className="font-medium mb-1">{isCorrect ? 'Correct!' : 'Not quite right.'}</p>
          <p className="text-sm text-gray-700">{question.explanation}</p>
        </div>
      )}

      <div className="flex justify-between">
        <Button onClick={handlePrevious} disabled={currentQuestion === 0} variant="secondary">
          Previous
        </Button>

        {currentQuestion < questions.length - 1 ? (
          <Button onClick={handleNext} disabled={!isAnswered}>
            Next
          </Button>
        ) : (
          <Button onClick={handleComplete} disabled={!allAnswered || !allCorrect} variant="success">
            Complete Quiz
          </Button>
        )}
      </div>
    </div>
  );
};
