# Audio-to-Text WebSocket Server with Reading Assistant

A Python WebSocket server that receives audio content from browser clients, converts it to text using Amazon Transcribe, and provides intelligent reading assistance for children using Amazon Bedrock.

## Features

- **Real-time Audio Processing**: Receives audio chunks from browser clients
- **Amazon Transcribe Integration**: Converts audio to text using AWS streaming transcription
- **Reading Assistant**: Uses Amazon Bedrock (Nova Lite) to detect when children need help
- **Text-to-Speech**: Converts help messages to audio using Amazon Polly (Joanna voice)
- **Intelligent Analysis**: Accumulates transcriptions and analyzes for signs of struggle
- **Live Transcription**: Prints transcribed text in real-time
- **Multiple Client Support**: Handles concurrent connections

## Prerequisites

### AWS Setup
1. **AWS Account**: You need an active AWS account
2. **AWS Credentials**: Configure AWS credentials using one of these methods:
   ```bash
   # Option 1: AWS CLI
   aws configure
   
   # Option 2: Environment variables
   export AWS_ACCESS_KEY_ID=your_access_key
   export AWS_SECRET_ACCESS_KEY=your_secret_key
   export AWS_DEFAULT_REGION=us-east-1
   
   # Option 3: AWS credentials file (~/.aws/credentials)
   [default]
   aws_access_key_id = your_access_key
   aws_secret_access_key = your_secret_key
   region = us-east-1
   ```

3. **IAM Permissions**: Your AWS user/role needs the following permissions:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "transcribe:StartStreamTranscription"
         ],
         "Resource": "*"
       },
       {
         "Effect": "Allow",
         "Action": [
           "bedrock:InvokeModel"
         ],
         "Resource": "arn:aws:bedrock:*::foundation-model/us.amazon.nova-lite-v1:0"
       },
       {
         "Effect": "Allow",
         "Action": [
           "polly:SynthesizeSpeech"
         ],
         "Resource": "*"
       }
     ]
   }
   ```

### System Requirements
- Python 3.8 or higher
- AWS credentials configured

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Verify AWS credentials:
```bash
aws sts get-caller-identity
```

3. Run the server:
```bash
python app.py
```

The server will start on `localhost:8765` by default.

## Configuration

The reading assistant behavior can be configured in `config.py`:

- **ACCUMULATION_WINDOW_SECONDS**: How long to accumulate text before analyzing (default: 10 seconds)
- **BEDROCK_MODEL_ID**: The Bedrock model to use (default: Nova Lite)
- **BEDROCK_TEMPERATURE**: Model temperature for response consistency (default: 0.3)
- **BEDROCK_MAX_TOKENS**: Maximum tokens in Bedrock response (default: 500)

## How It Works

1. **Client Connection**: Browser clients connect via WebSocket
2. **Audio Reception**: Server receives base64-encoded audio chunks
3. **Direct Streaming**: Audio is sent directly to Amazon Transcribe (supports WebM/Opus format)
4. **Transcription**: Amazon Transcribe processes the audio stream
5. **Text Accumulation**: Transcribed text is accumulated over configurable time window (5 seconds)
6. **AI Analysis**: Amazon Bedrock analyzes accumulated text for signs of struggle
7. **Help Detection**: If child needs help, generates encouraging assistance message
8. **Text-to-Speech**: Amazon Polly converts help message to natural-sounding audio (MP3)
9. **Audio Playback**: Client receives and plays audio help message to the child
10. **Text Output**: Transcribed text and help messages are sent to client and printed to console

## Audio Processing Pipeline

```
Browser Audio (WebM/Opus) 
    ↓ Base64 Encoding
WebSocket Client 
    ↓ Base64 Decoding
Python Server 
    ↓ Direct Streaming
Amazon Transcribe
    ↓ Real-time Processing
Transcribed Text → Console Output
```

## Client Integration

Browser clients should send audio data in this JSON format:
```json
{
  "type": "audio",
  "data": "base64_encoded_audio_data_here"
}
```

Or send raw base64 audio data directly as a string.

## Troubleshooting

### Common Issues:

1. **AWS Credentials Error**:
   - Ensure AWS credentials are properly configured
   - Check IAM permissions for Transcribe service

2. **Audio Format Issues**:
   - The server tries WebM/Opus format first, then falls back to PCM
   - Ensure your browser is sending compatible audio format
   - Check browser console for audio recording errors

3. **Transcription Not Working**:
   - Verify internet connection
   - Check AWS region settings
   - Ensure audio quality is sufficient (clear speech, minimal background noise)

### Supported Audio Formats:
- **Input**: WebM with Opus codec (from browsers) - preferred
- **Fallback**: PCM format if WebM fails
- **Transcribe**: Supports both Opus and PCM formats

## AWS Costs

Amazon Transcribe Streaming pricing (as of 2024):
- **Pay-per-second** of audio transcribed
- **Minimum charge**: 15 seconds per request
- Check current pricing at: https://aws.amazon.com/transcribe/pricing/

## Server Output Example

```
[2024-01-09 10:30:15] Client connected: 192.168.1.100:54321
[2024-01-09 10:30:16] Initialized Transcribe streaming for 192.168.1.100:54321
[2024-01-09 10:30:17] Sent audio chunk to Transcribe for 192.168.1.100:54321 (3200 bytes)

[2024-01-09 10:30:18] TRANSCRIPTION from 192.168.1.100:54321:
Text: Hello, this is a test of the transcription service.
Confidence: 0.95
--------------------------------------------------------------------------------
```