import './styles.css';

interface PluginResultProps {
  pluginName: string;
  resultHtml: string;
  debugJson: string;
}

export function PluginResult({ pluginName, resultHtml, debugJson }: PluginResultProps) {
  return (
    <>
      <h3>{pluginName} Results:</h3>
      <div className="result" dangerouslySetInnerHTML={{ __html: resultHtml }} />
      <div className="debug">{debugJson}</div>
    </>
  );
}
