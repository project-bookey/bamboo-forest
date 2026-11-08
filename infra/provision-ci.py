#!/usr/bin/env python3
"""Provision the scoped, keyless GitHub Actions → S3 → SSM deployment path."""
import json
import os
import subprocess

PROFILE = 'bookey-prod'
REGION = 'ap-northeast-2'
ACCOUNT = '755610386590'
INSTANCE = 'i-04c8524cce56d6507'
SERVER_ROLE = 'bookey-ec2-s3-role'
DEPLOY_ROLE = 'metro-chat-github-deploy'
BUCKET = f'bookey-metro-chat-deploy-{ACCOUNT}-{REGION}'
REPO = 'project-bookey/bamboo-forest'
# This repository uses GitHub's immutable owner/repository ID subject format.
OIDC_SUBJECT = 'repo:project-bookey@322972644/bamboo-forest@1445310722:ref:refs/heads/main'
PROVIDER = f'arn:aws:iam::{ACCOUNT}:oidc-provider/token.actions.githubusercontent.com'

def aws(*args, allow_missing=False):
    result = subprocess.run(['aws', *args, '--profile', PROFILE, '--region', REGION, '--output', 'json', '--no-cli-pager'], text=True, capture_output=True)
    if result.returncode:
        if allow_missing and any(code in result.stderr for code in ['NoSuchEntity', 'NoSuchBucket', '(404)']): return None
        raise RuntimeError(result.stderr.strip())
    return json.loads(result.stdout) if result.stdout.strip() else {}

identity = aws('sts', 'get-caller-identity')
if identity['Account'] != ACCOUNT: raise RuntimeError('Unexpected AWS account')
provider = aws('iam', 'get-open-id-connect-provider', '--open-id-connect-provider-arn', PROVIDER)
if 'sts.amazonaws.com' not in provider['ClientIDList']: raise RuntimeError('GitHub OIDC provider does not allow STS')
trust = {'Version': '2012-10-17', 'Statement': [{'Effect': 'Allow', 'Principal': {'Federated': PROVIDER}, 'Action': 'sts:AssumeRoleWithWebIdentity', 'Condition': {'StringEquals': {'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com', 'token.actions.githubusercontent.com:sub': OIDC_SUBJECT}}}]}
role = aws('iam', 'get-role', '--role-name', DEPLOY_ROLE, allow_missing=True)
if role is None:
    role = aws('iam', 'create-role', '--role-name', DEPLOY_ROLE, '--assume-role-policy-document', json.dumps(trust), '--description', 'Metro Chat main branch deployment via GitHub OIDC', '--max-session-duration', '3600')
else:
    aws('iam', 'update-assume-role-policy', '--role-name', DEPLOY_ROLE, '--policy-document', json.dumps(trust))
if aws('s3api', 'head-bucket', '--bucket', BUCKET, '--expected-bucket-owner', ACCOUNT, allow_missing=True) is None:
    aws('s3api', 'create-bucket', '--bucket', BUCKET, '--create-bucket-configuration', f'LocationConstraint={REGION}')
aws('s3api', 'put-public-access-block', '--bucket', BUCKET, '--public-access-block-configuration', json.dumps(dict(BlockPublicAcls=True, IgnorePublicAcls=True, BlockPublicPolicy=True, RestrictPublicBuckets=True)))
aws('s3api', 'put-bucket-encryption', '--bucket', BUCKET, '--server-side-encryption-configuration', json.dumps({'Rules': [{'ApplyServerSideEncryptionByDefault': {'SSEAlgorithm': 'AES256'}}]}))
aws('s3api', 'put-bucket-lifecycle-configuration', '--bucket', BUCKET, '--lifecycle-configuration', json.dumps({'Rules': [{'ID': 'ExpireDeployArtifacts', 'Filter': {'Prefix': 'metro-chat/'}, 'Status': 'Enabled', 'Expiration': {'Days': 14}, 'AbortIncompleteMultipartUpload': {'DaysAfterInitiation': 1}}]}))
aws('s3api', 'put-bucket-policy', '--bucket', BUCKET, '--policy', json.dumps({'Version': '2012-10-17', 'Statement': [{'Sid': 'RequireTLS', 'Effect': 'Deny', 'Principal': '*', 'Action': 's3:*', 'Resource': [f'arn:aws:s3:::{BUCKET}', f'arn:aws:s3:::{BUCKET}/*'], 'Condition': {'Bool': {'aws:SecureTransport': 'false'}}}]}))
policy = {'Version': '2012-10-17', 'Statement': [
    {'Effect': 'Allow', 'Action': ['s3:PutObject', 's3:GetObject'], 'Resource': f'arn:aws:s3:::{BUCKET}/metro-chat/*'},
    {'Effect': 'Allow', 'Action': 'ssm:SendCommand', 'Resource': [f'arn:aws:ec2:{REGION}:{ACCOUNT}:instance/{INSTANCE}', f'arn:aws:ssm:{REGION}::document/AWS-RunShellScript']},
    {'Effect': 'Allow', 'Action': 'ssm:GetCommandInvocation', 'Resource': '*'},
]}
aws('iam', 'put-role-policy', '--role-name', DEPLOY_ROLE, '--policy-name', 'metro-chat-production-deploy', '--policy-document', json.dumps(policy))
aws('iam', 'attach-role-policy', '--role-name', SERVER_ROLE, '--policy-arn', 'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore')
aws('iam', 'put-role-policy', '--role-name', SERVER_ROLE, '--policy-name', 'metro-chat-deploy-artifact-read', '--policy-document', json.dumps({'Version': '2012-10-17', 'Statement': [{'Effect': 'Allow', 'Action': 's3:GetObject', 'Resource': f'arn:aws:s3:::{BUCKET}/metro-chat/*'}]}))
# Use the repository owner's existing local gh login; never print or persist the token.
token = subprocess.run(['gh', 'auth', 'token', '--user', 'project-bookey'], text=True, capture_output=True, check=True).stdout.strip()
env = dict(os.environ, GH_TOKEN=token)
values = {'AWS_DEPLOY_ROLE': f'arn:aws:iam::{ACCOUNT}:role/{DEPLOY_ROLE}', 'AWS_REGION': REGION, 'METRO_DEPLOY_BUCKET': BUCKET, 'METRO_INSTANCE_ID': INSTANCE}
for name, value in values.items():
    result = subprocess.run(['gh', 'api', '--method', 'PATCH', f'repos/{REPO}/actions/variables/{name}', '--input', '-'], input=json.dumps({'name': name, 'value': value}), text=True, capture_output=True, env=env)
    if result.returncode and '404' in result.stderr:
        result = subprocess.run(['gh', 'api', '--method', 'POST', f'repos/{REPO}/actions/variables', '--input', '-'], input=json.dumps({'name': name, 'value': value}), text=True, capture_output=True, env=env)
    if result.returncode: raise RuntimeError(result.stderr.strip())
print(json.dumps({'role': values['AWS_DEPLOY_ROLE'], 'bucket': BUCKET, 'instance': INSTANCE, 'repository_variables': list(values)}))
