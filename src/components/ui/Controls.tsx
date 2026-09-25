// Shared map controls for the desktop rail and the mobile filter sheet, so
// both surfaces use the same selection language. Styles live in index.css
// (.chomp-toggle, .chomp-select); touch sizing is handled there via
// `pointer: coarse`.

export interface ControlOption<K extends string> {
    key: K;
    label: string;
}

// Newsroom-style segmented toggle for short option sets (2–7 choices):
// options sit side by side in one outline, the selected one accent-tinted.
export function Segmented<K extends string>({
    ariaLabel,
    options,
    value,
    onChange,
}: {
    ariaLabel: string;
    options: ControlOption<K>[];
    value: K;
    onChange: (key: K) => void;
}) {
    return (
        <div role="radiogroup" aria-label={ariaLabel} className="chomp-toggle">
            {options.map(({ key, label }) => (
                <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={key === value}
                    onClick={() => onChange(key)}
                    className="chomp-toggle__option"
                >
                    {label}
                </button>
            ))}
        </div>
    );
}

// Native select for long option lists — keeps panels short and gets
// keyboard / screen-reader / mobile picker behavior for free.
export function Select<K extends string>({
    ariaLabel,
    options,
    value,
    onChange,
}: {
    ariaLabel: string;
    options: ControlOption<K>[];
    value: K;
    onChange: (key: K) => void;
}) {
    return (
        <div className="chomp-select">
            <select
                aria-label={ariaLabel}
                value={value}
                onChange={(e) => onChange(e.target.value as K)}
            >
                {options.map(({ key, label }) => (
                    <option key={key} value={key}>
                        {label}
                    </option>
                ))}
            </select>
        </div>
    );
}
