import { useGame } from '../context';
import { Panel, ProgressBar } from '../kit';
import { PET_DEFS } from '../../pets/pets';
import { EQUIPMENT_LIST } from '../../shop/equipment';
import { ACHIEVEMENTS } from '../../achievements/achievements';
import { BOX_DEFS } from '../../shop/boxes';
import { TITLES } from '../../progression/titles';
import { collectionSkinProgress } from '../../content/skins';
import { D } from '../../core/bignum';

export function Collection() {
  const { engine } = useGame();
  const s = engine.state;
  const c = s.collection;

  // Skins: coleção progressiva — o total REAL não é revelado (mistério).
  const skinProg = collectionSkinProgress(s);

  const cats = [
    { name: 'Pets', icon: '🐾', total: PET_DEFS.length, have: c.pets.length },
    { name: 'Equipamentos', icon: '⚔️', total: EQUIPMENT_LIST.length, have: c.equipment.length },
    { name: 'Conquistas', icon: '🏆', total: ACHIEVEMENTS.length, have: Object.keys(s.achievements).length },
    { name: 'Caixas', icon: '📦', total: BOX_DEFS.length, have: c.boxes.length },
    { name: 'Títulos', icon: '🎖️', total: TITLES.length, have: c.titles.length },
    { name: 'Skins', icon: '🎨', total: skinProg.revealed, have: skinProg.revealed, mystery: true },
  ];

  const total = cats.reduce((a, c2) => a + (c2.mystery ? 0 : c2.total), 0);
  const have = cats.reduce((a, c2) => a + c2.have, 0);
  const pct = Math.round((have / Math.max(1, total)) * 100);

  return (
    <div className="screen">
      <Panel title="Coleção" icon="📚" right={<span className="muted small">{have}/{total} itens</span>}>
        <div className="collection-total">
          <div className="collection-ring" style={{ '--pct': `${pct * 3.6}deg` } as React.CSSProperties}>
            <strong>{pct}%</strong>
          </div>
          <p className="muted small">Conclusão total da coleção</p>
        </div>
      </Panel>

      {cats.map((cat) => {
        if (cat.mystery) {
          return (
            <Panel key={cat.name} title={`${cat.icon} ${cat.name}`} right={<span className="muted small">{cat.have} / ???</span>}>
              <p className="muted small">Reveladas: <strong>{cat.have}</strong> · Desconhecidas: <strong>???</strong></p>
              <ProgressBar value={D(cat.have)} max={D(Math.max(1, cat.have * 2))} color="var(--accent)" label="??" />
            </Panel>
          );
        }
        const p = Math.round((cat.have / Math.max(1, cat.total)) * 100);
        return (
          <Panel key={cat.name} title={`${cat.icon} ${cat.name}`} right={<span className="muted small">{cat.have}/{cat.total}</span>}>
            <ProgressBar value={D(cat.have)} max={D(cat.total)} color="var(--accent)" label={`${p}%`} />
          </Panel>
        );
      })}

      <p className="muted small center">Encontre pets e equipamentos abrindo caixas. Alguns itens exigem mundos mais avançados (Ascensão). Skins desconhecidas são reveladas ao desbloquear.</p>
    </div>
  );
}
