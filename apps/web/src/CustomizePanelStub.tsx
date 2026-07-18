type Props = {
  onClose: () => void;
};

export function CustomizePanelStub({ onClose }: Props) {
  return (
    <div className="customize-stub">
      <header className="customize-stub-head">
        <h1>Customize</h1>
        <button type="button" className="ghost-btn compact" onClick={onClose}>
          Close
        </button>
      </header>
      <p className="customize-stub-body">
        Skills, rules, MCP, and hooks editing land in <strong>Wave C</strong>.
        For now, model and effort stay on the hero composer shell.
      </p>
    </div>
  );
}
