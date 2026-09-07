"""
Configuration for the Reading Assistant Application
"""

# Transcription Settings
ACCUMULATION_WINDOW_SECONDS = 5  # How many seconds to accumulate text before analyzing

# AWS Bedrock Settings
BEDROCK_MODEL_ID = "us.amazon.nova-lite-v1:0"  # Nova Lite model for cost-effective analysis

# Reading Assistant Prompt Settings
READING_ASSISTANT_PROMPT = """You are a reading assistant for children. Analyze the following text that a child has spoken while reading.

Child's speech: "{text}"

Determine if the child needs help based on these indicators:
- Struggling words (repeated attempts, hesitation)
- Asking for help explicitly ("help", "I don't know", "what is this")
- Long pauses or incomplete sentences
- Expressions of frustration or confusion

Respond ONLY with valid JSON in this exact format:
{{
  "needs_help": true or false,
  "help_message": "A friendly, encouraging message to help the child (if needs_help is true) or empty string (if false)",
  "confidence": 0.0 to 1.0,
  "reason": "Brief explanation of why help is or isn't needed"
}}

Be encouraging and supportive. If help is needed, provide specific, age-appropriate guidance."""

# Bedrock Inference Configuration
BEDROCK_TEMPERATURE = 0.3  # Lower temperature for more consistent responses
BEDROCK_MAX_TOKENS = 500  # Maximum tokens in response

# Amazon Polly Text-to-Speech Settings
POLLY_VOICE_ID = "Amy"  # British female voice, friendly for children
POLLY_ENGINE = "neural"    # Neural engine for more natural speech
POLLY_OUTPUT_FORMAT = "mp3"  # Audio format
POLLY_LANGUAGE_CODE = "en-GB"  # British English
