"""Deterministic guardrails that keep the assistant from interrupting.

The assistant's core job is to stay quiet while the child reads aloud and to
speak up only when the child actually talks to it (asks a question, asks for
help) or is clearly stuck. A small local LLM alone is unreliable at this, so
intent is detected deterministically first and the LLM verdict is only a
secondary gate:

1. ``question``  — the transcript contains explicit question/help signals.
                   The child is talking to the assistant → help is allowed
                   (still gated by the LLM verdict + confidence).
2. ``reading``   — the transcript matches the book passage the child is
                   reading (word-overlap score). The assistant stays quiet
                   and the LLM is never even called.
3. ``unknown``   — neither; the LLM verdict decides, gated by confidence and
                   a cooldown so the assistant cannot nag repeatedly.

All functions here are pure and provider-independent, so they are fully
unit-testable without any AI dependency.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

WORD_RE = re.compile(r"[a-z']+")

# Sentence starters that usually signal a question when the child is talking
# to the assistant. Weak signals: a book line can also begin with them
# ("How the dragon found his fire…"), so a strong passage match wins.
QUESTION_STARTERS = {
    "what", "why", "how", "when", "where", "who", "whose", "which",
    "can", "could", "would", "will", "should", "shall", "may", "might",
    "do", "does", "did", "don't", "is", "are", "am", "was", "were",
    "tell", "explain", "say", "spell", "help",
}

# Unmistakable requests aimed at the assistant — strong question signals that
# beat a passage match (STT usually keeps the "?" but never rely on it).
HELP_PHRASES = (
    "help me", "help please", "please help",
    "i don't know", "i dont know", "i dunno",
    "i can't read", "i cant read", "i can't say", "i cant say",
    "i'm stuck", "im stuck", "i am stuck",
    "i don't understand", "i dont understand", "i don't get it", "i dont get it",
    "what does", "what is", "what's this", "whats this", "what does this word",
    "what does that mean", "what does it mean",
    "read it for me", "read this for me", "read to me", "read for me",
    "can you read", "can you say", "can you help",
    "how do you", "how do i", "how to say", "how do you say",
)

# Removed from both sides of the passage match so only content words count.
STOPWORDS = frozenset({
    "the", "a", "an", "and", "or", "but", "so", "then", "than", "that", "this",
    "these", "those", "is", "are", "was", "were", "am", "be", "been", "being",
    "in", "on", "at", "to", "of", "off", "up", "down", "out", "over", "into",
    "it", "its", "he", "she", "they", "them", "we", "us", "i", "me", "my",
    "your", "his", "her", "their", "our", "you", "him",
    "what", "why", "how", "when", "where", "who", "which",
    "do", "does", "did", "done", "have", "has", "had", "will", "would",
    "can", "could", "should", "shall", "may", "might", "must",
    "there", "here", "not", "no", "yes", "if", "as", "for", "with", "from",
    "said", "says", "say", "asked", "ask", "get", "got", "very", "just",
})


@dataclass(frozen=True)
class IntentResult:
    """What the child is doing, as detected by `classify_intent`."""

    intent: str            # "reading" | "question" | "unknown"
    match_score: float    # overlap with the book passage (0.0–1.0)
    signals: tuple = field(default_factory=tuple)


@dataclass(frozen=True)
class InterruptDecision:
    """Outcome of `decide_interrupt` — whether the assistant may speak up."""

    send_help: bool
    intent: str
    reason: str


def _content_words(text: str) -> list[str]:
    """Lowercase words with stopwords removed — used for passage matching."""
    return [word for word in WORD_RE.findall(text.lower()) if word not in STOPWORDS]


def reading_match_score(transcript: str, expected_text: str | None) -> float:
    """Fraction of the transcript's content words that appear in the passage.

    Lenient by design: whisper mishears and skipped words shouldn't stop the
    assistant from recognising "the child is reading the book".
    """
    if not expected_text:
        return 0.0
    spoken = _content_words(transcript)
    if not spoken:
        return 0.0
    book_words = set(_content_words(expected_text))
    if not book_words:
        return 0.0
    matched = sum(1 for word in spoken if word in book_words)
    return matched / len(spoken)


def classify_intent(
    transcript: str,
    expected_text: str | None = None,
    *,
    match_threshold: float = 0.5,
) -> IntentResult:
    """Decide whether the child is reading aloud or talking to the assistant."""
    text = (transcript or "").strip()
    lowered = " " + text.lower() + " "
    score = reading_match_score(text, expected_text)

    # 1. Strong question signals always win — the child is talking to us.
    signals: list[str] = []
    if "?" in text:
        signals.append("question_mark")
    for phrase in HELP_PHRASES:
        if phrase in lowered:
            signals.append(phrase)
    if signals:
        return IntentResult("question", score, tuple(signals))

    # 2. The transcript matches the book passage → the child is reading aloud.
    #    This also beats weak question-word starters, because book lines can
    #    begin with "How…" / "What…" just as easily as questions can.
    if expected_text and score >= match_threshold:
        return IntentResult("reading", score, ("passage_match",))

    # 3. Weak signal: the sentence starts like a question aimed at the assistant.
    first_word = WORD_RE.findall(text.lower())[:1]
    if first_word and first_word[0] in QUESTION_STARTERS:
        return IntentResult("question", score, (f"starts_with:{first_word[0]}",))

    # 4. Neither — let the LLM decide (gated by confidence + cooldown).
    return IntentResult("unknown", score, ())


# Questions like "what does this word mean?" or "what does that mean?" point
# back at the passage even when they share none of its words.
READING_REFERENCE_PHRASES = (
    "this word", "that word", "this line", "this page", "this sentence",
    "that mean", "this mean", "that means", "this means", "this one", "that one",
    "what does that", "read that", "this letter",
)

# Deterministic answers for the question path — an explicit question is never
# met with silence, even when the LLM is skipped, fails, or says nothing.
OUT_OF_CONTEXT_ANSWER = (
    "That's a great question, but it's outside our story. Let's keep reading!"
)
NOT_SURE_ANSWER = (
    "That's a good question, but I'm not sure. Let's keep reading and find out together!"
)

# Tiny local models sometimes describe the question instead of answering it
# ("The child is asking about a trunk…", "The question is not related to the
# story."). Such replies are detected and replaced with the honest fallback —
# the child must never hear a description of their own question.
META_ANSWER_PREFIXES = (
    "the child",
    "the question",
    "the kid",
    "the reader",
    "the girl",
    "the boy",
    "the student",
)


def is_meta_answer(answer: str) -> bool:
    """True when the model described the question instead of answering it."""
    lowered = (answer or "").strip().lower()
    return lowered.startswith(META_ANSWER_PREFIXES)


# Voice commands the child can use to silence the assistant ("stop", "shh",
# "be quiet"…). Matched against the *whole* normalized utterance, so ordinary
# reading that merely contains the word ("the elephant came to a stop")
# never triggers them.
MUTE_PHRASES = frozenset({
    "stop", "stop it", "stops", "please stop", "stop please", "stop talking",
    "please stop talking", "stop talking please", "stop interrupting",
    "stop interrupting me", "stop helping", "stop helping me", "no more help",
    "be quiet", "please be quiet", "be quiet please", "quiet", "quiet please",
    "shh", "shhh", "shush", "hush", "silence", "silence please",
    "enough", "thats enough", "leave me alone",
    "dont interrupt", "dont interrupt me", "dont talk",
})

_MUTE_NOISE_RE = re.compile(r"[^a-z ]+")


def _normalize_command(text: str) -> str:
    """Lowercase, drop punctuation/apostrophes, collapse whitespace."""
    lowered = (text or "").lower().replace("'", "")
    return " ".join(_MUTE_NOISE_RE.sub(" ", lowered).split())


def is_mute_command(transcript: str) -> bool:
    """True when the child told the assistant to be quiet ("stop", "shh"…)."""
    return _normalize_command(transcript) in MUTE_PHRASES


# Gratitude utterances ("thanks", "thank you") that end a question-answer
# exchange: they mean "got it, I'm going back to reading", so the assistant
# goes quiet until the next direct question — same state as a "stop" command,
# just friendlier. Whole-utterance matching, so a book line like
# "Thanks, said the rabbit" never triggers it.
GRATITUDE_PHRASES = frozenset({
    "thanks", "thank you", "thank you assistant", "thanks a lot", "thanks so much",
    "thank you so much", "thank you very much", "okay thanks", "ok thanks",
    "okay thank you", "ok thank you", "cool thanks", "great thanks",
    "got it thanks", "got it thank you", "perfect thanks", "awesome thanks",
})


def is_gratitude_command(transcript: str) -> bool:
    """True when the child thanked the assistant ("thanks", "thank you"…)."""
    return _normalize_command(transcript) in GRATITUDE_PHRASES


def question_relates_to_passage(question: str, passage: str | None) -> bool:
    """Whether the child's question is about the passage they are reading.

    True when the question shares content words with the passage, or refers
    back to it ("what does this word mean?"). Without a passage we cannot
    tell, so the answer is left to the LLM (returns True).
    """
    if not passage:
        return True
    lowered = " " + question.lower() + " "
    if any(phrase in lowered for phrase in READING_REFERENCE_PHRASES):
        return True
    shared = set(_content_words(question)) & set(_content_words(passage))
    return bool(shared)


def decide_interrupt(
    intent: IntentResult,
    llm_verdict: dict | None = None,
    *,
    now: float = 0.0,
    last_help_at: float | None = None,
    cooldown_seconds: float = 30.0,
    min_confidence: float = 0.7,
) -> InterruptDecision:
    """Central policy: may the assistant speak up right now?

    ``llm_verdict=None`` asks for the pre-LLM decision (should we even bother
    calling the model?); otherwise the verdict is gated by confidence and —
    for non-questions — by the cooldown since the last help message.

    Explicit questions are a special case: the child asked directly, so the
    assistant always replies (the question path in app.py provides the
    answer plus deterministic "I'm not sure" / "out of context" fallbacks —
    silence would be the worst possible response).
    """
    if intent.intent == "reading":
        return InterruptDecision(
            False,
            intent.intent,
            f"child is reading aloud (passage match {intent.match_score:.0%}) — staying quiet",
        )
    if intent.intent == "question":
        return InterruptDecision(True, intent.intent, "explicit question — answering")
    if llm_verdict is None:
        return InterruptDecision(True, intent.intent, "eligible for LLM analysis")

    if not llm_verdict.get("needs_help"):
        return InterruptDecision(False, intent.intent, "LLM judged no help needed")

    try:
        confidence = float(llm_verdict.get("confidence") or 0.0)
    except (TypeError, ValueError):
        confidence = 0.0
    if confidence < min_confidence:
        return InterruptDecision(
            False,
            intent.intent,
            f"LLM confidence {confidence:.2f} below threshold {min_confidence:.2f}",
        )

    # Unclear intents must wait out the cooldown so the assistant cannot
    # keep nagging while the child reads.
    if (
        last_help_at is not None
        and (now - last_help_at) < cooldown_seconds
    ):
        return InterruptDecision(
            False,
            intent.intent,
            "cooldown — helped recently",
        )

    return InterruptDecision(True, intent.intent, "help allowed")

