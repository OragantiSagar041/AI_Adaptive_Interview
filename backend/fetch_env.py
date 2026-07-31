import boto3
import sys

BUCKET = "hireiq-production-config-007050358533"
KEY = ".env"
DEST = "/app/.env"

try:
    s3 = boto3.client("s3")
    s3.download_file(BUCKET, KEY, DEST)
    print(f"Fetched {KEY} from s3://{BUCKET} to {DEST}")
except Exception as e:
    print(f"FATAL: could not fetch .env from S3: {e}")
    sys.exit(1)
