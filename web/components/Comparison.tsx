import { useDialogue } from '../dialogue-context.js';
import { LayoutPreview } from './LayoutPreview.js';
export function Comparison() {
  const { doc, selected, select, busy, waiting } = useDialogue();
  return (
    <fieldset className="comparison" disabled={busy || waiting}>
      <legend>Choose a starting point</legend>
      <div className="choices">
        {doc.options.map((option, index) => (
          <label
            className={`choice ${selected === option.id ? 'is-selected' : ''}`}
            key={option.id}
          >
            <input
              type="radio"
              name="layout"
              value={option.id}
              checked={selected === option.id}
              onChange={() => select(option.id)}
            />
            <div className="choice-heading">
              <span className="option-letter">0{index + 1}</span>
              <strong>{option.title}</strong>
              <span className="radio-indicator" />
            </div>
            <LayoutPreview layout={option.id} />
            <p className="choice-description">{option.description}</p>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
