#!/usr/bin/env python3
"""
AWS Setup Helper for Audio-to-Text Server
This script helps verify AWS credentials and permissions for Amazon Transcribe.
"""

import boto3
import json
from botocore.exceptions import ClientError, NoCredentialsError

def check_aws_credentials():
    """Check if AWS credentials are configured"""
    try:
        session = boto3.Session()
        sts = session.client('sts')
        
        # Get caller identity
        identity = sts.get_caller_identity()
        
        print("✅ AWS Credentials Found!")
        print(f"   Account ID: {identity['Account']}")
        print(f"   User/Role ARN: {identity['Arn']}")
        print(f"   Region: {session.region_name or 'us-east-1 (default)'}")
        
        return True
        
    except NoCredentialsError:
        print("❌ No AWS credentials found!")
        print("\nPlease configure AWS credentials using one of these methods:")
        print("1. AWS CLI: aws configure")
        print("2. Environment variables:")
        print("   export AWS_ACCESS_KEY_ID=your_access_key")
        print("   export AWS_SECRET_ACCESS_KEY=your_secret_key")
        print("   export AWS_DEFAULT_REGION=us-east-1")
        print("3. AWS credentials file (~/.aws/credentials)")
        return False
        
    except Exception as e:
        print(f"❌ Error checking AWS credentials: {e}")
        return False

def check_transcribe_permissions():
    """Check if the current credentials have Transcribe permissions"""
    try:
        session = boto3.Session()
        transcribe = session.client('transcribe')
        
        # Try to list transcription jobs (this requires minimal permissions)
        transcribe.list_transcription_jobs(MaxResults=1)
        
        print("✅ Amazon Transcribe permissions verified!")
        return True
        
    except ClientError as e:
        error_code = e.response['Error']['Code']
        if error_code == 'AccessDenied':
            print("❌ Access denied to Amazon Transcribe!")
            print("\nYour AWS user/role needs the following IAM permission:")
            print(json.dumps({
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Action": [
                            "transcribe:StartStreamTranscription",
                            "transcribe:ListTranscriptionJobs"
                        ],
                        "Resource": "*"
                    }
                ]
            }, indent=2))
        else:
            print(f"❌ Error accessing Transcribe: {error_code}")
        return False
        
    except Exception as e:
        print(f"❌ Error checking Transcribe permissions: {e}")
        return False

def check_region_support():
    """Check if the current region supports Transcribe streaming"""
    session = boto3.Session()
    region = session.region_name or 'us-east-1'
    
    # Regions that support Transcribe streaming (as of 2024)
    supported_regions = [
        'us-east-1', 'us-east-2', 'us-west-2',
        'eu-west-1', 'eu-central-1',
        'ap-southeast-2', 'ap-northeast-1'
    ]
    
    if region in supported_regions:
        print(f"✅ Region {region} supports Transcribe streaming!")
        return True
    else:
        print(f"⚠️  Region {region} may not support Transcribe streaming.")
        print(f"   Recommended regions: {', '.join(supported_regions)}")
        return False

def main():
    print("🔧 AWS Setup Verification for Audio-to-Text Server")
    print("=" * 60)
    
    # Check credentials
    if not check_aws_credentials():
        return
    
    print()
    
    # Check permissions
    if not check_transcribe_permissions():
        return
    
    print()
    
    # Check region
    check_region_support()
    
    print()
    print("🎉 AWS setup verification complete!")
    print("You can now run the audio-to-text server with: python app.py")

if __name__ == "__main__":
    main()