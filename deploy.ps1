$max_retries = 30
for ($i = 0; $i -lt $max_retries; $i++) {
    docker info 2>&1 | Out-Null
    if ($?) {
        Write-Host "Docker is up!"
        break
    }
    Write-Host "Waiting for Docker..."
    Start-Sleep -Seconds 2
}
if (-not $?) {
    Write-Error "Docker failed to start"
    exit 1
}

# Login to ECR just in case
Write-Host "Logging into ECR..."
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 007050358533.dkr.ecr.us-east-1.amazonaws.com

# Build and Push
Write-Host "Building Docker Image..."
docker build -t krishna:latest ./backend
if (-not $?) { exit 1 }

Write-Host "Tagging Image..."
docker tag krishna:latest 007050358533.dkr.ecr.us-east-1.amazonaws.com/krishna:latest

Write-Host "Pushing Image..."
docker push 007050358533.dkr.ecr.us-east-1.amazonaws.com/krishna:latest
if (-not $?) { exit 1 }

Write-Host "Updating ECS Service..."
aws ecs update-service --cluster sunny-wolf-zb88n3 --service krishna-7879 --force-new-deployment --region us-east-1
