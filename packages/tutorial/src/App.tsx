import React from 'react';
import { TutorialProvider, useTutorial } from './context/TutorialContext';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { Sidebar } from './components/layout/Sidebar';

// Step Pages
import { Welcome } from './pages/Welcome';
import { Setup } from './pages/Setup';
import { Concepts } from './pages/Concepts';
import { TwitterExample } from './pages/TwitterExample';
import { SwissBankBasic } from './pages/SwissBankBasic';
import { SwissBankAdvanced } from './pages/SwissBankAdvanced';
import { Challenge } from './pages/Challenge';
import { Completion } from './pages/Completion';

const StepRouter: React.FC = () => {
  const { state } = useTutorial();

  const renderStep = () => {
    switch (state.currentStep) {
      case 0:
        return <Welcome />;
      case 1:
        return <Setup />;
      case 2:
        return <Concepts />;
      case 3:
        return <TwitterExample />;
      case 4:
        return <SwissBankBasic />;
      case 5:
        return <SwissBankAdvanced />;
      case 6:
        return <Challenge />;
      case 7:
        return <Completion />;
      default:
        return <Welcome />;
    }
  };

  return <div className="flex-1 p-8 overflow-y-auto">{renderStep()}</div>;
};

const AppContent: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex flex-1">
        <Sidebar />
        <StepRouter />
      </div>
      <Footer />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <TutorialProvider>
      <AppContent />
    </TutorialProvider>
  );
};

export default App;
