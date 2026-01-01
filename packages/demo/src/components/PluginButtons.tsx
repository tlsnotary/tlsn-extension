import { Plugin } from '../types';
import './styles.css';

interface PluginButtonsProps {
  plugins: Record<string, Plugin>;
  runningPlugins: Set<string>;
  completedPlugins: Set<string>;
  allChecksPass: boolean;
  onRunPlugin: (pluginKey: string) => void;
}

export function PluginButtons({
  plugins,
  runningPlugins,
  completedPlugins,
  allChecksPass,
  onRunPlugin,
}: PluginButtonsProps) {
  return (
    <div className="plugin-buttons">
      {Object.entries(plugins).map(([key, plugin]) => {
        if (completedPlugins.has(key)) return null;

        const isRunning = runningPlugins.has(key);
        return (
          <button
            key={key}
            disabled={!allChecksPass || isRunning}
            onClick={() => onRunPlugin(key)}
            title={!allChecksPass ? 'Please complete all system checks first' : ''}
          >
            {isRunning ? 'Running...' : `Run ${plugin.name}`}
          </button>
        );
      })}
    </div>
  );
}
