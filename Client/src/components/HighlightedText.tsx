import { memo, useEffect, useRef } from "react";
import { SpeechToken } from "@/hooks/useSpeechReader";

interface HighlightedTextProps {
  tokens: SpeechToken[];
  /** Index of the token currently being spoken, or null when idle. */
  activeTokenIndex: number | null;
}

/**
 * Renders chapter text as individual word tokens so the currently spoken word
 * can be highlighted while the assistant reads aloud (read-along style).
 * Whitespace is preserved via `whitespace-pre-wrap` so line breaks survive.
 */
const HighlightedText = ({ tokens, activeTokenIndex }: HighlightedTextProps) => {
  const activeRef = useRef<HTMLSpanElement | null>(null);

  // Keep the spoken word in view as the story advances.
  useEffect(() => {
    if (activeTokenIndex === null) return;
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeTokenIndex]);

  return (
    <div className="whitespace-pre-wrap leading-relaxed">
      {tokens.map((token, index) =>
        token.isWord ? (
          <span
            key={index}
            ref={index === activeTokenIndex ? activeRef : undefined}
            className={
              index === activeTokenIndex
                ? "read-aloud-word read-aloud-word-active"
                : activeTokenIndex !== null && index < activeTokenIndex
                  ? "read-aloud-word read-aloud-word-read"
                  : "read-aloud-word"
            }
          >
            {token.text}
          </span>
        ) : (
          <span key={index}>{token.text}</span>
        )
      )}
    </div>
  );
};

export default memo(HighlightedText);
