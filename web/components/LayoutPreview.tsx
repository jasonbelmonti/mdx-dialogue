import type { Accent, Density, Layout } from '../../shared/dialogue.js';

export function LayoutPreview({
  layout,
  accent = 'violet',
  density = 'comfortable',
}: {
  layout: Layout;
  accent?: Accent;
  density?: Density;
}) {
  return (
    <div
      className={`layout-preview preview-${layout} accent-${accent} density-${density}`}
      aria-label={`${layout} layout, ${accent} accent, ${density} spacing`}
    >
      <div className="preview-nav">
        <span className="preview-dot" />
        Field notes<span className="preview-nav-end">Explore / 01</span>
      </div>
      <div className="preview-body">
        <div className="preview-article">
          <span className="preview-eyebrow">An idea, made tangible</span>
          <strong>Room to think.</strong>
          <p>An explanation that stays connected to the choices you make.</p>
          <div className="text-line" />
          <div className="text-line short" />
        </div>
        <div className="preview-controls">
          <span>Shape your view</span>
          <div className="preview-control">
            <i />
            Focus on the details
          </div>
          <div className="preview-control">
            <i />
            Keep the context close
          </div>
          <div className="preview-action">Explore the idea</div>
        </div>
      </div>
    </div>
  );
}
