import { useMemo, useState } from 'react';
import { useGame } from '../context';
import { Modal, Panel, EmptyState } from '../kit';
import {
  SKINS, SKIN_CATEGORIES, equippedSkin, skinStatus, isSkinRevealed,
  mysteryLabel, premiumLockLabel,
  type SkinDef, type SkinCategory,
} from '../../content/skins';
import { skinRarity, SKIN_RARITIES, type SkinRarityId } from '../../content/skinRarities';
import { EventManager } from '../../liveops/EventManager';
import { audio } from '../../audio/audio';

function SkinRarityBadge({ id }: { id: SkinRarityId }) {
  const r = skinRarity(id);
  return (
    <span className="rarity-badge skin-rarity-badge" style={{ color: r.color, borderColor: r.color, textShadow: r.textShadow }}>
      {r.name}
    </span>
  );
}

/** Preview visual da skin conforme a categoria. */
function SkinPreview({ skin }: { skin: SkinDef }) {
  const v = skin.visual;
  if (v.core) {
    return (
      <div className="skin-preview-stage">
        <div className="skin-orb-lg" style={{ background: `radial-gradient(circle at 32% 30%, ${v.core.color}, ${v.core.color2})`, boxShadow: `0 0 40px ${v.core.glow}` }}>⚡</div>
      </div>
    );
  }
  if (v.background) {
    return <div className="skin-preview-stage"><div className="skin-bg-sample" style={{ background: v.background }}>🌌</div></div>;
  }
  if (v.cursorEmoji) {
    return <div className="skin-preview-stage"><span className="skin-cursor-sample">{v.cursorEmoji}</span><span className="muted small">Cursor do jogo</span></div>;
  }
  if (v.numbers) {
    return (
      <div className="skin-preview-stage">
        <span className={`float-num ${v.numbers} static-preview`}>1.234.567</span>
      </div>
    );
  }
  if (v.particle) {
    return <div className="skin-preview-stage"><span className="skin-particle-sample" style={{ background: v.particle }} /><span className="muted small">Cor das partículas</span></div>;
  }
  if (v.accent) {
    return <div className="skin-preview-stage"><span className="skin-accent-sample" style={{ background: v.accent }} /><span className="muted small">Cor de destaque da interface</span></div>;
  }
  if (v.profile) {
    return (
      <div className="skin-preview-stage">
        <div className={`avatar avatar-frame ${v.profile.frame}`} style={{ borderColor: v.profile.border }}>👤</div>
      </div>
    );
  }
  if (v.banner) {
    return <div className="skin-preview-stage"><div className="skin-banner-sample" style={{ background: v.banner.bg, color: v.banner.text }}>BANNER DO JOGADOR</div></div>;
  }
  if (v.petTag) {
    return <div className="skin-preview-stage"><span className="skin-pet-sample">🐾 {v.petTag}</span><span className="muted small">Aura visual dos pets</span></div>;
  }
  return <div className="skin-preview-stage"><span style={{ fontSize: 64 }}>{skin.icon}</span></div>;
}

type Filter = 'all' | 'owned' | 'unowned' | 'favorites';

export function Wardrobe() {
  const { engine } = useGame();
  const s = engine.state;
  const [filter, setFilter] = useState<Filter>('all');
  const [cat, setCat] = useState<SkinCategory | 'all'>('all');
  const [rarity, setRarity] = useState<SkinRarityId | 'all'>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'rarity' | 'name' | 'date'>('rarity');
  const [preview, setPreview] = useState<SkinDef | null>(null);

  const equipped = equippedSkin(s);
  const reveal = s.settings.revealPremiumRewards;
  const premiumOwned = s.premiumPass.owned;

  const list = useMemo(() => {
    let arr = SKINS.filter((sk) => {
      const owned = isSkinRevealed(s, sk.id);
      if (filter === 'owned' && !owned) return false;
      if (filter === 'unowned' && owned) return false;
      if (filter === 'favorites' && !s.skins.favorites.includes(sk.id)) return false;
      if (cat !== 'all' && sk.category !== cat) return false;
      if (rarity !== 'all' && sk.rarity !== rarity) return false;
      if (query) {
        // skins ocultas não podem ser encontradas por nome/descrição
        if (!owned) {
          if (!mysteryLabel(sk.id).toLowerCase().includes(query.toLowerCase())) return false;
        } else if (!`${sk.name} ${sk.desc} ${sk.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())) return false;
      }
      return true;
    });
    arr = arr.slice();
    arr.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'date') return (b.releaseAt ?? 0) - (a.releaseAt ?? 0);
      return skinRarity(b.rarity).order - skinRarity(a.rarity).order;
    });
    return arr;
  }, [s, filter, cat, rarity, query, sort]);

  const ownedCount = SKINS.filter((sk) => isSkinRevealed(s, sk.id)).length;
  const total = SKINS.length;

  return (
    <div className="screen">
      <Panel title="Armário" icon="🎨" right={<span className="muted small">{ownedCount}/{total} reveladas</span>}>
        <p className="muted small">
          Skins são cosméticas. Skins que você ainda não possui ficam <strong>ocultas</strong> — descubra-as em eventos, passes e conquistas.
        </p>
        <div className="wardrobe-controls">
          <input className="wardrobe-search" placeholder="🔎 Buscar skin…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="wardrobe-select" value={cat} onChange={(e) => setCat(e.target.value as SkinCategory | 'all')}>
            <option value="all">Todas as categorias</option>
            {SKIN_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
          <select className="wardrobe-select" value={rarity} onChange={(e) => setRarity(e.target.value as SkinRarityId | 'all')}>
            <option value="all">Todas as raridades</option>
            {[...SKIN_RARITIES].reverse().map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select className="wardrobe-select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="rarity">Ordenar: raridade</option>
            <option value="name">Ordenar: nome</option>
            <option value="date">Ordenar: lançamento</option>
          </select>
        </div>
        <div className="chip-filter" style={{ marginTop: 10 }}>
          {([['all', 'Todas'], ['owned', 'Possuídas'], ['unowned', '🔒 Desconhecidas'], ['favorites', '⭐ Favoritas']] as [Filter, string][]).map(([id, label]) => (
            <button key={id} className={`chip-btn ${filter === id ? 'active' : ''}`} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
      </Panel>

      {list.length === 0 ? (
        <EmptyState icon="🎨" text="Nenhuma skin encontrada. Ajuste os filtros." />
      ) : (
        <div className="wardrobe-grid">
          {list.map((skin) => {
            const owned = isSkinRevealed(s, skin.id);
            const isEquipped = equipped.id === skin.id;
            const isFav = s.skins.favorites.includes(skin.id);
            const status = skinStatus(skin);
            if (!owned) {
              // ── skin não adquirida: conteúdo misterioso (regra absoluta) ──
              const isPass = skin.obtain === 'pass';
              const showPremiumLock = isPass && (!reveal || !premiumOwned);
              return (
                <div key={skin.id} className={`wardrobe-card locked mystery-card`} onClick={() => setPreview(skin)}>
                  <div className="wardrobe-card-top">
                    <div className="mystery-silhouette"><span>?</span></div>
                  </div>
                  <strong className="wardrobe-name mystery-name">{showPremiumLock ? premiumLockLabel() : mysteryLabel(skin.id)}</strong>
                  <span className="muted small">Raridade: ???</span>
                  <div className="wardrobe-actions" onClick={(e) => e.stopPropagation()}>
                    <span className="locked-text">🔒 BLOQUEADA</span>
                  </div>
                </div>
              );
            }
            return (
              <div key={skin.id} className={`wardrobe-card ${isEquipped ? 'equipped' : ''}`} onClick={() => setPreview(skin)}>
                <div className="wardrobe-card-top">
                  <SkinPreviewSmall skin={skin} />
                  {isFav && <span className="wardrobe-fav">⭐</span>}
                  {status === 'ended' && <span className="wardrobe-ended">ENCERRADA</span>}
                  {status === 'limited' && <span className="wardrobe-limited">LIMITADA</span>}
                </div>
                <strong className="wardrobe-name">{skin.name}</strong>
                <SkinRarityBadge id={skin.rarity} />
                <span className="muted small wardrobe-cat">{SKIN_CATEGORIES.find((c) => c.id === skin.category)?.icon} {SKIN_CATEGORIES.find((c) => c.id === skin.category)?.name}</span>
                <div className="wardrobe-actions" onClick={(e) => e.stopPropagation()}>
                  <button className={`btn btn-xs ${isEquipped ? 'ghost' : 'btn-primary'}`} disabled={isEquipped} onClick={() => { engine.equipSkin(skin.id); audio.buy(); }}>
                    {isEquipped ? 'Equipada' : 'Equipar'}
                  </button>
                  <button className="btn btn-xs ghost" onClick={() => engine.toggleSkinFavorite(skin.id)}>{isFav ? '⭐' : '☆'}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={preview !== null} onClose={() => setPreview(null)} title={preview ? `${preview.icon} ${preview.name}` : ''} width={480}>
        {preview && (() => {
          const owned = isSkinRevealed(s, preview.id);
          const isEquipped = equipped.id === preview.id;
          const status = skinStatus(preview);
          const ev = preview.eventId ? EventManager.byId(preview.eventId) : undefined;
          const r = skinRarity(preview.rarity);

          if (!owned) {
            // ── preview de skin oculta: nada revelador ──
            const isPass = preview.obtain === 'pass';
            const showPremiumLock = isPass && (!reveal || !premiumOwned);
            return (
              <div className="skin-modal">
                <div className="skin-preview-stage"><div className="mystery-silhouette big"><span>?</span></div></div>
                <h3 className="center mystery-name">{showPremiumLock ? premiumLockLabel() : mysteryLabel(preview.id)}</h3>
                <p className="muted small center">Skin desconhecida — descubra o que é ao desbloqueá-la.</p>
                <div className="skin-modal-details">
                  <div><span>Raridade</span><strong>???</strong></div>
                  <div><span>Origem</span><strong>???</strong></div>
                  <div><span>Lançamento</span><strong>???</strong></div>
                </div>
                <p className="locked-text center">🔒 BLOQUEADA — skin ainda não revelada</p>
              </div>
            );
          }

          return (
            <div className="skin-modal">
              <SkinPreview skin={preview} />
              <div className="skin-modal-meta">
                <SkinRarityBadge id={preview.rarity} />
                <span className="muted small">{SKIN_CATEGORIES.find((c) => c.id === preview.category)?.icon} {SKIN_CATEGORIES.find((c) => c.id === preview.category)?.name}</span>
              </div>
              <p className="muted small">{preview.desc}</p>
              <div className="skin-modal-details">
                <div><span>Raridade</span><strong style={{ color: r.color }}>{r.name}</strong></div>
                {ev && <div><span>Evento</span><strong>{ev.icon} {ev.name}</strong></div>}
                {preview.seasonId && <div><span>Temporada</span><strong>{preview.seasonId}</strong></div>}
                <div><span>Obtenção</span><strong>{OBTAIN_LABEL[preview.obtain]}</strong></div>
                {preview.releaseAt && <div><span>Lançamento</span><strong>{new Date(preview.releaseAt).toLocaleDateString('pt-BR')}</strong></div>}
                {preview.expiresAt && (
                  <div>
                    <span>Disponível até</span>
                    <strong>{new Date(preview.expiresAt).toLocaleDateString('pt-BR')} {new Date(preview.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong>
                  </div>
                )}
                {preview.bonus && <div><span>Bônus</span><strong className="muted small">Pequeno bônus cosmético ativo</strong></div>}
              </div>
              {status === 'ended' ? (
                <p className="locked-text center">⚠ EVENTO ENCERRADO — skin indisponível</p>
              ) : status === 'limited' ? (
                <p className="locked-text center">⏳ Skin limitada — adquira antes do fim!</p>
              ) : null}
              <div className="modal-actions">
                <button className="btn" onClick={() => engine.toggleSkinFavorite(preview.id)}>{s.skins.favorites.includes(preview.id) ? '⭐ Favorita' : '☆ Favoritar'}</button>
                <button className={`btn ${isEquipped ? 'ghost' : 'btn-primary'}`} disabled={isEquipped} onClick={() => { engine.equipSkin(preview.id); audio.buy(); }}>
                  {isEquipped ? 'Equipada' : 'Equipar'}
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

const OBTAIN_LABEL: Record<string, string> = {
  shop: 'Loja', event: 'Evento', season: 'Temporada', founder: 'Fundador',
  achievement: 'Conquista', challenge: 'Desafio', secret: 'Secreta',
  reward: 'Recompensa', code: 'Código', prestige: 'Progressão', pass: 'Passe Premium',
};

/** Card pequeno de preview (reutilizado no grid). */
function SkinPreviewSmall({ skin }: { skin: SkinDef }) {
  const v = skin.visual;
  if (v.core) {
    return <div className="wardrobe-orb" style={{ background: `radial-gradient(circle at 32% 30%, ${v.core.color}, ${v.core.color2})`, boxShadow: `0 0 14px ${v.core.glow}` }}>⚡</div>;
  }
  if (v.background) return <div className="wardrobe-tile" style={{ background: v.background }}>🌌</div>;
  if (v.cursorEmoji) return <div className="wardrobe-tile">{v.cursorEmoji}</div>;
  if (v.numbers) return <div className="wardrobe-tile num-gold">1.2M</div>;
  if (v.particle) return <div className="wardrobe-tile"><span className="skin-particle-sample" style={{ background: v.particle }} /></div>;
  if (v.accent) return <div className="wardrobe-tile"><span className="skin-accent-sample" style={{ background: v.accent }} /></div>;
  if (v.profile) return <div className="wardrobe-tile avatar-frame" style={{ borderColor: v.profile.border }}>👤</div>;
  if (v.banner) return <div className="wardrobe-tile" style={{ background: v.banner.bg, color: v.banner.text, fontSize: 9 }}>BANNER</div>;
  if (v.petTag) return <div className="wardrobe-tile">🐾 {v.petTag}</div>;
  return <div className="wardrobe-tile">{skin.icon}</div>;
}
