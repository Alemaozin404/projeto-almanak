import { useState } from 'react';
import { useGame } from '../context';
import { Panel } from '../kit';
import { DEBUG_ACTIONS } from '../../debug/debug';

export function Debug() {
  const { engine } = useGame();
  const [log, setLog] = useState<string[]>([]);

  function run(actionId: string) {
    const action = DEBUG_ACTIONS.find((a) => a.id === actionId);
    if (!action) return;
    const result = action.run(engine);
    if (result instanceof Promise) {
      void result.then((msg) => setLog((prev) => [msg, ...prev].slice(0, 20)));
    } else {
      setLog((prev) => [result, ...prev].slice(0, 20));
    }
  }

  return (
    <div className="screen">
      <Panel title="Debug / Desenvolvedor" icon="🛠️" right={<span className="muted small">Apenas para testes — desative no envio final</span>}>
        <div className="debug-grid">
          {DEBUG_ACTIONS.map((a) => (
            <button key={a.id} className="btn debug-btn" onClick={() => run(a.id)}>
              {a.icon} {a.label}
            </button>
          ))}
        </div>
        {log.length > 0 && (
          <div className="debug-log">
            {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
      </Panel>
    </div>
  );
}
