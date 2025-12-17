import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';

export interface SuggestionItem {
    name: string;
    count: number;
}

interface TagInputProps {
    value: string;
    onChange: (value: string) => void;
    suggestions: SuggestionItem[];
    placeholder?: string;
    label: string;
}

export function TagInput({
    value,
    onChange,
    suggestions,
    placeholder,
    label
}: TagInputProps) {
    const [inputValue, setInputValue] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Parse existing values into array
    const tags = value
        .split(',')
        .map(v => v.trim())
        .filter(v => v.length > 0);

    // Filter suggestions based on input
    const filteredSuggestions = suggestions.filter(s =>
        s.name.toLowerCase().includes(inputValue.toLowerCase()) &&
        !tags.includes(s.name)
    ).slice(0, 8);

    // Add a tag
    const addTag = (tagName: string) => {
        const trimmed = tagName.trim();
        if (trimmed && !tags.includes(trimmed)) {
            const newTags = [...tags, trimmed];
            onChange(newTags.join(', '));
        }
        setInputValue('');
        setIsOpen(false);
        setHighlightedIndex(-1);
        inputRef.current?.focus();
    };

    // Remove a tag
    const removeTag = (index: number) => {
        const newTags = tags.filter((_, i) => i !== index);
        onChange(newTags.join(', '));
    };

    // Handle keyboard
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedIndex >= 0 && highlightedIndex < filteredSuggestions.length) {
                addTag(filteredSuggestions[highlightedIndex].name);
            } else if (inputValue.trim()) {
                addTag(inputValue);
            }
        } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
            removeTag(tags.length - 1);
        } else if (e.key === 'ArrowDown' && filteredSuggestions.length > 0) {
            e.preventDefault();
            setHighlightedIndex(prev =>
                prev < filteredSuggestions.length - 1 ? prev + 1 : 0
            );
        } else if (e.key === 'ArrowUp' && filteredSuggestions.length > 0) {
            e.preventDefault();
            setHighlightedIndex(prev =>
                prev > 0 ? prev - 1 : filteredSuggestions.length - 1
            );
        } else if (e.key === 'Escape') {
            setIsOpen(false);
            setHighlightedIndex(-1);
        }
    };

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const showDropdown = isOpen && inputValue.length > 0 && filteredSuggestions.length > 0;

    return (
        <div className="relative" ref={containerRef}>
            <label className="block text-xs font-bold text-gray-400 mb-1">
                {label}
            </label>

            <div className="min-h-[42px] bg-black/30 border border-white/10 rounded px-2 py-1.5 flex flex-wrap gap-1.5 items-center focus-within:border-accent">
                {/* Tag chips */}
                {tags.map((tag, index) => (
                    <span
                        key={`${tag}-${index}`}
                        className="inline-flex items-center gap-1 bg-accent/20 text-accent-foreground px-2 py-0.5 rounded text-sm"
                    >
                        {tag}
                        <button
                            type="button"
                            onClick={() => removeTag(index)}
                            className="hover:text-red-400 transition-colors"
                        >
                            <X size={12} />
                        </button>
                    </span>
                ))}

                {/* Input */}
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => {
                        setInputValue(e.target.value);
                        setIsOpen(true);
                        setHighlightedIndex(-1);
                    }}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder={tags.length === 0 ? placeholder : ''}
                    className="flex-1 min-w-[100px] bg-transparent text-white text-sm focus:outline-none placeholder:text-gray-500"
                />
            </div>

            {/* Dropdown */}
            {showDropdown && (
                <div className="absolute z-50 w-full mt-1 bg-bg-panel border border-white/10 rounded-lg shadow-xl overflow-hidden">
                    {filteredSuggestions.map((suggestion, index) => (
                        <button
                            key={suggestion.name}
                            type="button"
                            onClick={() => addTag(suggestion.name)}
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
