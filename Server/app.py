import asyncio
import websockets
import json
import base64
import io
import os
import struct
from datetime import datetime
from amazon_transcribe.client import TranscribeStreamingClient
from amazon_transcribe.handlers import TranscriptResultStreamHandler
from amazon_transcribe.model import TranscriptEvent
import boto3
from config import (
    ACCUMULATION_WINDOW_SECONDS,
    BEDROCK_MODEL_ID,
    READING_ASSISTANT_PROMPT,
    BEDROCK_TEMPERATURE,
    BEDROCK_MAX_TOKENS,
    POLLY_VOICE_ID,
    POLLY_ENGINE,
    POLLY_OUTPUT_FORMAT,
    POLLY_LANGUAGE_CODE
)

class ReadingAssistant:
    """Analyzes accumulated transcriptions to detect if child needs help"""
    
    def __init__(self, aws_region):
        self.bedrock_runtime = boto3.client('bedrock-runtime', region_name=aws_region)
        self.polly_client = boto3.client('polly', region_name=aws_region)
        self.accumulated_text = []
        self.last_analysis_time = None
        
    def add_transcription(self, text):
        """Add a transcription to the accumulation buffer"""
        self.accumulated_text.append({
            'text': text,
            'timestamp': datetime.now()
        })
        
    def get_accumulated_text(self):
        """Get all accumulated text as a single string"""
        return ' '.join([item['text'] for item in self.accumulated_text])
    
    def should_analyze(self):
        """Check if enough time has passed to analyze"""
        if not self.accumulated_text:
            return False
            
        if self.last_analysis_time is None:
            return True
            
        time_since_last = (datetime.now() - self.last_analysis_time).total_seconds()
        return time_since_last >= ACCUMULATION_WINDOW_SECONDS
    
    async def analyze_for_help(self):
        """Analyze accumulated text using Bedrock to detect if child needs help"""
        if not self.accumulated_text:
            return None
            
        accumulated = self.get_accumulated_text()
        
        if not accumulated.strip():
            return None
        
        try:
            # Prepare the prompt for Nova Lite using config
            prompt = READING_ASSISTANT_PROMPT.format(text=accumulated)

            # Call Bedrock Nova Lite
            request_body = {
                "messages": [
                    {
                        "role": "user",
                        "content": [{"text": prompt}]
                    }
                ],
                "inferenceConfig": {
                    "temperature": BEDROCK_TEMPERATURE,
                    "maxTokens": BEDROCK_MAX_TOKENS
                }
            }
            
            response = self.bedrock_runtime.converse(
                modelId=BEDROCK_MODEL_ID,
                messages=request_body["messages"],
                inferenceConfig=request_body["inferenceConfig"]
            )
            
            # Extract response
            response_text = response['output']['message']['content'][0]['text']
            
            # Parse JSON response
            result = json.loads(response_text)
            
            # Update analysis time
            self.last_analysis_time = datetime.now()
            
            # Clear accumulated text after analysis
            self.accumulated_text = []
            
            return result
            
        except json.JSONDecodeError as e:
            print(f"[{datetime.now()}] Error parsing Bedrock response: {e}")
            return None
        except Exception as e:
            print(f"[{datetime.now()}] Error analyzing with Bedrock: {e}")
            return None
    
    async def text_to_speech(self, text):
        """Convert text to speech using Amazon Polly"""
        try:
            # Use Amazon Polly to synthesize speech
            response = self.polly_client.synthesize_speech(
                Text=text,
                OutputFormat=POLLY_OUTPUT_FORMAT,
                VoiceId=POLLY_VOICE_ID,
                Engine=POLLY_ENGINE,
                LanguageCode=POLLY_LANGUAGE_CODE
            )
            
            # Read the audio stream
            audio_stream = response['AudioStream'].read()
            
            # Convert to base64 for transmission
            audio_base64 = base64.b64encode(audio_stream).decode('utf-8')
            
            return audio_base64
            
        except Exception as e:
            print(f"[{datetime.now()}] Error converting text to speech: {e}")
            return None

class TranscriptHandler(TranscriptResultStreamHandler):
    """Handler for Amazon Transcribe streaming results"""
    
    def __init__(self, transcript_result_stream, client_id, server_instance):
        super().__init__(transcript_result_stream)
        self.client_id = client_id
        self.server_instance = server_instance
    
    async def handle_stream(self):
        """Handle the transcript result stream"""
        try:
            async for event in self._transcript_result_stream:
                await self.handle_transcript_event(event)
        except Exception as e:
            print(f"[{datetime.now()}] Error in transcript stream: {e}")
        
    async def handle_transcript_event(self, transcript_event: TranscriptEvent):
        """Handle transcription results from Amazon Transcribe"""
        results = transcript_event.transcript.results
        
        for result in results:
            # Only process final results
            if not result.is_partial:
                for alt in result.alternatives:
                    transcript = alt.transcript
                    confidence = alt.confidence if hasattr(alt, 'confidence') else 'N/A'
                    
                    # Print transcription
                    print(f"\n[TRANSCRIPTION] {transcript}")
                    
                    # Send final results to client
                    await self.send_transcription_to_client(self.client_id, transcript, confidence, False)
                    
                    # Add to reading assistant for analysis
                    await self.analyze_for_help(self.client_id, transcript)

    async def analyze_for_help(self, client_id, transcript):
        """Analyze transcription to detect if child needs help"""
        try:
            # Get or create reading assistant for this client
            if client_id not in self.server_instance.reading_assistants:
                self.server_instance.reading_assistants[client_id] = ReadingAssistant(
                    self.server_instance.aws_region
                )
            
            assistant = self.server_instance.reading_assistants[client_id]
            
            # Add transcription to accumulation buffer
            assistant.add_transcription(transcript)
            
            # Check if it's time to analyze
            if assistant.should_analyze():
                result = await assistant.analyze_for_help()
                
                if result and result.get('needs_help'):
                    await self.send_help_message(client_id, result)
                        
        except Exception as e:
            print(f"[{datetime.now()}] Error in help analysis: {e}")

    async def send_help_message(self, client_id, analysis_result):
        """Send help message to client with audio"""
        try:
            if client_id in self.server_instance.clients:
                websocket = self.server_instance.clients[client_id]
                
                # Get the reading assistant for this client
                assistant = self.server_instance.reading_assistants.get(client_id)
                
                # Generate audio for the help message
                audio_base64 = None
                help_message = analysis_result.get('help_message', '')
                
                if assistant and help_message:
                    audio_base64 = await assistant.text_to_speech(help_message)
                
                # Print LLM response
                print(f"\n[LLM RESPONSE] {help_message}")
                
                message = {
                    "type": "help_needed",
                    "needs_help": analysis_result.get('needs_help', False),
                    "help_message": help_message,
                    "audio": audio_base64,
                    "confidence": analysis_result.get('confidence', 0),
                    "reason": analysis_result.get('reason', ''),
                    "timestamp": datetime.now().isoformat()
                }
                
                await websocket.send(json.dumps(message))
                
        except Exception as e:
            print(f"[{datetime.now()}] Error sending help message: {e}")

    async def send_transcription_to_client(self, client_id, transcript, confidence, is_partial):
        """Send transcription results back to the client"""
        try:
            if client_id in self.server_instance.clients:
                websocket = self.server_instance.clients[client_id]
                
                message = {
                    "type": "transcription",
                    "text": transcript,
                    "confidence": confidence,
                    "is_partial": is_partial,
                    "timestamp": datetime.now().isoformat()
                }
                
                await websocket.send(json.dumps(message))
                
        except Exception as e:
            print(f"[{datetime.now()}] Error sending transcription: {e}")

class AudioWebSocketServer:
    def __init__(self, host="localhost", port=8765):
        self.host = host
        self.port = port
        self.clients = {}
        self.transcribe_clients = {}
        self.reading_assistants = {}  # One assistant per client
        
        # Get AWS region from environment/config
        self.aws_region = self.get_aws_region()
        
        # Check AWS credentials
        self.check_aws_credentials()

    def get_aws_region(self):
        """Get AWS region from environment or default to us-east-1"""
        try:
            session = boto3.Session()
            region = session.region_name
            if region:
                print(f"Using AWS region: {region}")
                return region
            else:
                print("No AWS region configured, defaulting to us-east-1")
                print("You can set region using:")
                print("1. AWS CLI: aws configure")
                print("2. Environment variable: export AWS_DEFAULT_REGION=your-region")
                print("3. AWS config file: ~/.aws/config")
                return "us-east-1"
        except Exception as e:
            print(f"Error getting AWS region: {e}")
            print("Defaulting to us-east-1")
            return "us-east-1"

    def check_aws_credentials(self):
        """Check if AWS credentials are configured"""
        try:
            session = boto3.Session()
            credentials = session.get_credentials()
            if credentials is None:
                print("WARNING: No AWS credentials found!")
                print("Please configure AWS credentials using one of these methods:")
                print("1. AWS CLI: aws configure")
                print("2. Environment variables: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY")
                print("3. IAM roles (if running on EC2)")
                print("4. AWS credentials file")
            else:
                print(f"AWS credentials found for region: {session.region_name or 'us-east-1 (default)'}")
        except Exception as e:
            print(f"Error checking AWS credentials: {e}")

    async def handle_client(self, websocket, path):
        """Handle incoming WebSocket connections"""
        client_id = f"{websocket.remote_address[0]}:{websocket.remote_address[1]}"
        self.clients[client_id] = websocket
        
        try:
            async for message in websocket:
                await self.process_message(message, client_id)
        except websockets.exceptions.ConnectionClosed:
            pass
        except Exception as e:
            print(f"[{datetime.now()}] Error: {e}")
        finally:
            await self.cleanup_client(client_id)

    async def cleanup_client(self, client_id):
        """Clean up client resources"""
        if client_id in self.clients:
            del self.clients[client_id]
        
        if client_id in self.transcribe_clients:
            try:
                stream = self.transcribe_clients[client_id]
                await stream.input_stream.end_stream()
                del self.transcribe_clients[client_id]
            except Exception as e:
                print(f"Error stopping transcribe stream for {client_id}: {e}")
        
        if client_id in self.reading_assistants:
            del self.reading_assistants[client_id]

    async def process_message(self, message, client_id):
        """Process incoming messages from clients"""
        try:
            # Try to parse as JSON first
            data = json.loads(message)
            
            if data.get("type") == "audio":
                audio_data = data.get("data")
                if audio_data:
                    await self.process_audio_chunk(audio_data, client_id)
            
        except json.JSONDecodeError:
            # If not JSON, treat as raw base64 audio data
            await self.process_audio_chunk(message, client_id)

    async def process_audio_chunk(self, base64_audio, client_id):
        """Process audio chunk and send to Amazon Transcribe"""
        try:
            # Decode base64 audio
            audio_bytes = base64.b64decode(base64_audio)
            
            # Check chunk size - Amazon Transcribe has limits
            max_chunk_size = 32 * 1024  # 32KB limit for safety
            if len(audio_bytes) > max_chunk_size:
                # Split large chunks into smaller pieces
                for i in range(0, len(audio_bytes), max_chunk_size):
                    chunk = audio_bytes[i:i + max_chunk_size]
                    await self.send_audio_chunk_to_transcribe(chunk, client_id)
            else:
                await self.send_audio_chunk_to_transcribe(audio_bytes, client_id)
            
        except Exception as e:
            print(f"[{datetime.now()}] Error processing audio: {e}")

    async def send_audio_chunk_to_transcribe(self, audio_bytes, client_id):
        """Send a single audio chunk to Amazon Transcribe"""
        try:
            # Initialize transcribe client if not exists
            if client_id not in self.transcribe_clients:
                await self.initialize_transcribe_client(client_id)
            
            # Send audio to Transcribe
            if client_id in self.transcribe_clients:
                stream = self.transcribe_clients[client_id]
                await stream.input_stream.send_audio_event(audio_chunk=audio_bytes)
            
        except Exception as e:
            print(f"[{datetime.now()}] Error sending audio to Transcribe: {e}")

    async def initialize_transcribe_client(self, client_id):
        """Initialize Amazon Transcribe streaming client for a client"""
        try:
            # Create transcribe client with configured region
            client = TranscribeStreamingClient(region=self.aws_region)
            
            # Try PCM format first (more reliable)
            stream = await client.start_stream_transcription(
                language_code="en-US",
                media_sample_rate_hz=16000,  # Standard sample rate
                media_encoding="pcm",        # PCM format
                enable_partial_results_stabilization=True,
                partial_results_stability="medium"
            )
            
            # Create transcript handler with the stream and server instance
            handler = TranscriptHandler(stream.output_stream, client_id, self)
            
            # Start handling the stream
            asyncio.create_task(handler.handle_stream())
            
            # Store the stream for sending audio
            self.transcribe_clients[client_id] = stream
            
        except Exception as e:
            print(f"[{datetime.now()}] Error initializing Transcribe: {e}")
            await self.initialize_transcribe_client_opus_fallback(client_id)

    async def initialize_transcribe_client_opus_fallback(self, client_id):
        """Fallback initialization with OGG-Opus format"""
        try:
            # Create transcribe client with configured region
            client = TranscribeStreamingClient(region=self.aws_region)
            
            # Start streaming transcription with OGG-Opus fallback
            stream = await client.start_stream_transcription(
                language_code="en-US",
                media_sample_rate_hz=48000,  # Browser sample rate
                media_encoding="ogg-opus",   # OGG-Opus format
                enable_partial_results_stabilization=True,
                partial_results_stability="medium"
            )
            
            # Create transcript handler with the stream and server instance
            handler = TranscriptHandler(stream.output_stream, client_id, self)
            
            # Start handling the stream
            asyncio.create_task(handler.handle_stream())
            
            # Store the stream for sending audio
            self.transcribe_clients[client_id] = stream
            
        except Exception as e:
            print(f"[{datetime.now()}] Error initializing Transcribe fallback: {e}")

    async def start_server(self):
        """Start the WebSocket server"""
        print(f"Starting Audio-to-Text WebSocket server on {self.host}:{self.port}")
        print("Server will:")
        print("1. Receive audio chunks from browser clients")
        print("2. Stream audio directly to Amazon Transcribe")
        print("3. Print transcribed text to console")
        print("\nNOTE: Audio format compatibility depends on browser and Transcribe support")
        print("If transcription doesn't work, the client may need to send PCM format")
        print("\nWaiting for connections...")
        
        async with websockets.serve(self.handle_client, self.host, self.port):
            await asyncio.Future()  # Run forever

if __name__ == "__main__":
    server = AudioWebSocketServer()
    try:
        asyncio.run(server.start_server())
    except KeyboardInterrupt:
        print("\nServer stopped by user")