import { useState, useRef, useEffect } from 'react';

export interface SuggestionItem {
    name: string;
    count: number;
}

interface AutocompleteInputProps {
    value: string;
    onChange: (value: string) => void;
    suggestions: SuggestionItem[];
    placeholder?: string;
    label: string;
    multiline?: boolean;
}

export function AutocompleteInput({
    value,
    onChange,
    suggestions,
    placeholder,
    label,
    multiline = false
}: AutocompleteInputProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

    // Parse existing values into array
    const existingValues = value
        .split(',')
        .map(v => v.trim())
        .filter(v => v.length > 0);

    // Get current input segment (after last comma)
    const getCurrentInput = () => {
        const lastCommaIndex = value.lastIndexOf(',');
        if (lastCommaIndex === -1) return value.trim();
        return value.substring(lastCommaIndex + 1).trim();
    };

    // Filter suggestions based on current input
    const currentInput = getCurrentInput();
    const filteredSuggestions = suggestions.filter(s =>
        s.name.toLowerCase().includes(currentInput.toLowerCase()) &&
        !existingValues.includes(s.name)
    ).slice(0, 8); // Limit to 8 suggestions

    // Handle input change
    const handleInputChange = (newValue: string) => {
        onChange(newValue);
        setIsOpen(true);
        setHighlightedIndex(-1);
    };

    // Add selected suggestion
    const addSuggestion = (suggestion: SuggestionItem) => {
        const lastCommaIndex = value.lastIndexOf(',');
        let newValue: string;

        if (lastCommaIndex === -1) {
            newValue = suggestion.name;
        } else {
            const prefix = value.substring(0, lastCommaIndex + 1);
            newValue = `${prefix} ${suggestion.name}`;
        }

        onChange(newValue);
        setIsOpen(false);
        setHighlightedIndex(-1);
        inputRef.current?.focus();
    };

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen || filteredSuggestions.length === 0) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex(prev =>
                    prev < filteredSuggestions.length - 1 ? prev + 1 : 0
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex(prev =>
                    prev > 0 ? prev - 1 : filteredSuggestions.length - 1
                );
                break;
            case 'Enter':
                if (highlightedIndex >= 0 && highlightedIndex < filteredSuggestions.length) {
                    e.preventDefault();
                    addSuggestion(filteredSuggestions[highlightedIndex]);
                }
                break;
            case 'Escape':
                setIsOpen(false);
                setHighlightedIndex(-1);
                break;
        }
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const showDropdown = isOpen && currentInput.length > 0 && filteredSuggestions.length > 0;

    const inputClassName = "w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-accent text-sm";

    return (
        <div className="relative" ref={containerRef}>
            <label className="block text-xs font-bold text-gray-400 mb-1">
                {label}
            </label>

            {multiline ? (
                <textarea
                    ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                    value={value}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    rows={3}
                    className={`${inputClassName} resize-none custom-scrollbar`}
                />
            ) : (
                <input
                    ref={inputRef as React.RefObject<HTMLInputElement>}
                    type="text"
                    value={value}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className={inputClassName}
                />
            )}

            {/* Dropdown */}
            {showDropdown && (
                <div className="absolute z-50 w-full mt-1 bg-bg-panel border border-white/10 rounded-lg shadow-xl overflow-hidden">
                    {filteredSuggestions.map((suggestion, index) => (
                        <button
                            key={suggestion.name}
                            type="button"
                            onClick={() => addSuggestion(suggestion)}
                            onMouseEnter={() => setHighlightedIndex(index)}
                            className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between transition-colors ${index === highlightedIndex
                                    ? 'bg-accent/20 text-white'
                                    : 'text-gray-300 hover:bg-white/5'
                                }`}
                        >
                            <span className="truncate">{suggestion.name}</span>
                            <span className="text-xs text-gray-500 ml-2 shrink-0">
                                {suggestion.count}作品
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
