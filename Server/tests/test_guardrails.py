"""Unit tests for the interrupt guardrails (pure functions, no AI needed)."""

from guardrails import (
    classify_intent,
    decide_interrupt,
    is_gratitude_command,
    is_meta_answer,
    is_mute_command,
    question_relates_to_passage,
    reading_match_score,
)

PASSAGE = (
    "Once upon a time there was a little dragon named Pip who lived in a "
    "cozy cave at the top of a mountain. He used his trunk to carry logs."
)


# ── classify_intent ──────────────────────────────────────────────────────


def test_explicit_question_triggers_question_intent():
    assert classify_intent("What does this word mean?").intent == "question"
    assert classify_intent("How do you say this word?").intent == "question"
    assert classify_intent("Can you help me please").intent == "question"


def test_help_phrases_trigger_question_intent_without_punctuation():
    assert classify_intent("I don't know this word").intent == "question"
    assert classify_intent("I'm stuck").intent == "question"
    assert classify_intent("read it for me").intent == "question"


def test_weak_question_starter_alone_is_a_question():
    # No passage context — "why did the dragon…" is aimed at the assistant.
    result = classify_intent("why did the dragon leave")
    assert result.intent == "question"
    assert "starts_with:why" in result.signals


def test_reading_aloud_matches_the_passage():
    result = classify_intent(
        "Once upon a time there was a little dragon named Pip", PASSAGE
    )
    assert result.intent == "reading"
    assert result.match_score > 0.8
    assert "passage_match" in result.signals


def test_reading_match_tolerates_stt_mishears():
    result = classify_intent(
        "Once upon a time there was a little draggon neemed Pip", PASSAGE
    )
    assert result.intent == "reading"  # most content words still match


def test_book_line_starting_with_question_word_is_reading():
    passage = "How the little dragon found his fire is a long story."
    result = classify_intent("How the little dragon found his fire", passage)
    assert result.intent == "reading"


def test_explicit_question_beats_passage_match():
    # The child stops reading and asks a question — always answered.
    result = classify_intent("what does this word mean?", PASSAGE)
    assert result.intent == "question"


def test_narration_without_context_is_unknown():
    result = classify_intent("The dragon flew over the misty mountain")
    assert result.intent == "unknown"


def test_empty_transcript_is_unknown():
    result = classify_intent("", PASSAGE)
    assert result.intent == "unknown"
    assert result.match_score == 0.0


# ── reading_match_score ──────────────────────────────────────────────────


def test_match_score_is_zero_without_expected_text():
    assert reading_match_score("anything at all", None) == 0.0


def test_match_score_falls_with_unrelated_transcript():
    score = reading_match_score("elephants painting rainbows", PASSAGE)
    assert score == 0.0


# ── decide_interrupt ─────────────────────────────────────────────────────

HELP_VERDICT = {"needs_help": True, "confidence": 0.9}


def test_reading_never_interrupts_even_without_llm_call():
    intent = classify_intent("Once upon a time there was a little dragon", PASSAGE)
    decision = decide_interrupt(intent, llm_verdict=None)
    assert decision.send_help is False
    assert "reading" in decision.reason


def test_llm_verdict_no_help_blocks():
    intent = classify_intent("The dragon flew over the misty mountain")  # unknown intent
    decision = decide_interrupt(intent, {"needs_help": False, "confidence": 0.9})
    assert decision.send_help is False


def test_confident_question_gets_help():
    intent = classify_intent("What does this word mean?")
    decision = decide_interrupt(intent, HELP_VERDICT)
    assert decision.send_help is True


def test_question_is_always_answered_even_when_llm_disagrees():
    """A direct question is never met with silence — the question path in
    app.py supplies honest fallback answers."""
    intent = classify_intent("What does this word mean?")
    no_help = decide_interrupt(intent, {"needs_help": False, "confidence": 0.9})
    assert no_help.send_help is True
    assert no_help.reason == "explicit question — answering"

    low_confidence = decide_interrupt(intent, {"needs_help": True, "confidence": 0.1})
    assert low_confidence.send_help is True


def test_low_confidence_is_blocked_for_unclear_intents():
    intent = classify_intent("The dragon flew over the misty mountain")  # unknown intent
    decision = decide_interrupt(intent, {"needs_help": True, "confidence": 0.4})
    assert decision.send_help is False


def test_invalid_confidence_is_blocked_for_unclear_intents():
    intent = classify_intent("The dragon flew over the misty mountain")  # unknown intent
    decision = decide_interrupt(intent, {"needs_help": True, "confidence": "high"})
    assert decision.send_help is False


def test_cooldown_blocks_unclear_intents_but_not_questions():
    unknown = classify_intent("The dragon flew over the misty mountain")
    question = classify_intent("What does this word mean?")
    now = 100.0
    recently = 90.0

    # Unknown intent shortly after help → suppressed (no nagging).
    decision = decide_interrupt(
        unknown, HELP_VERDICT, now=now, last_help_at=recently, cooldown_seconds=30.0
    )
    assert decision.send_help is False
    assert "cooldown" in decision.reason

    # An explicit question is always answered, even during cooldown.
    decision = decide_interrupt(
        question, HELP_VERDICT, now=now, last_help_at=recently, cooldown_seconds=30.0
    )
    assert decision.send_help is True

    # Unknown intent after the cooldown elapses is allowed again.
    decision = decide_interrupt(
        unknown, HELP_VERDICT, now=now, last_help_at=50.0, cooldown_seconds=30.0
    )
    assert decision.send_help is True


# ── question_relates_to_passage ─────────────────────────────────────────


def test_question_about_a_word_in_the_passage_relates():
    assert question_relates_to_passage("What is a trunk?", PASSAGE) is True
    assert question_relates_to_passage("what a trunk is", PASSAGE) is True


def test_reference_phrases_relate_even_without_shared_words():
    assert question_relates_to_passage("What does this word mean?", PASSAGE) is True
    assert question_relates_to_passage("what does that mean", PASSAGE) is True


def test_unrelated_question_is_out_of_context():
    assert question_relates_to_passage("How do rockets fly to the moon", PASSAGE) is False
    assert question_relates_to_passage("What's your favorite ice cream", PASSAGE) is False


def test_without_a_passage_relatedness_is_deferred_to_the_llm():
    assert question_relates_to_passage("How do rockets fly to the moon", None) is True


# ── is_meta_answer ───────────────────────────────────────────────────────


def test_meta_answers_are_detected():
    assert is_meta_answer("The child is asking about a trunk.") is True
    assert is_meta_answer("The question is not related to the story.") is True
    assert is_meta_answer("The kid wants to know what a trunk is.") is True


def test_real_answers_are_not_flagged():
    assert is_meta_answer("A trunk is an elephant's long nose.") is False
    assert is_meta_answer("The elephant is lifting the log.") is False
    assert is_meta_answer("I'm not sure.") is False
    assert is_meta_answer("") is False


# ── is_mute_command ──────────────────────────────────────────────────────


def test_mute_commands_are_detected():
    assert is_mute_command("Stop") is True
    assert is_mute_command("stop it!") is True
    assert is_mute_command("Please be quiet...") is True
    assert is_mute_command("Shh!") is True
    assert is_mute_command("stop interrupting me") is True
    assert is_mute_command("that's enough") is True


def test_only_exact_commands_mute():
    """Frustrated-but-not-exact phrasings do NOT mute — the child must say a
    clear command; anything else flows through the normal guardrails."""
    assert is_mute_command("I said stop already") is False
    assert is_mute_command("can you stop please") is False


# ── is_gratitude_command ─────────────────────────────────────────────────


def test_gratitude_commands_are_detected():
    assert is_gratitude_command("Thank you!") is True
    assert is_gratitude_command("thanks") is True
    assert is_gratitude_command("Thank you so much!") is True
    assert is_gratitude_command("okay, thanks") is True
    assert is_gratitude_command("got it, thanks") is True


def test_reading_text_is_never_a_gratitude_command():
    """Whole-utterance matching: a book line like "Thanks, said the rabbit"
    keeps the assistant in normal mode."""
    assert is_gratitude_command("Thanks, said the rabbit") is False
    assert is_gratitude_command("thank you for reading this book") is False
    assert is_gratitude_command("What is a trunk?") is False
    assert is_gratitude_command("") is False


def test_reading_text_is_never_a_mute_command():
    """Whole-utterance matching: ordinary reading keeps the assistant talking."""
    assert is_mute_command("The elephant came to a stop by the tall grass") is False
    assert is_mute_command("Stop! said the little dragon") is False
    assert is_mute_command("What is a trunk?") is False
    assert is_mute_command("") is False
