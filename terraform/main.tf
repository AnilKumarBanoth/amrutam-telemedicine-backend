terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {
    bucket         = "amrutam-terraform-state-prod"
    key            = "telemedicine/backend/terraform.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "amrutam-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "Amrutam-Telemedicine"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Compliance  = "HIPAA-DISHA"
    }
  }
}

# --- VPC & Multi-AZ Networking ---
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "amrutam-vpc-${var.environment}"
  cidr = "10.0.0.0/16"

  azs             = ["ap-south-1a", "ap-south-1b", "ap-south-1c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
  database_subnets = ["10.0.201.0/24", "10.0.202.0/24", "10.0.203.0/24"]

  enable_nat_gateway     = true
  single_nat_gateway     = false # High availability across all AZs
  one_nat_gateway_per_az = true
  enable_dns_hostnames   = true
  enable_dns_support     = true
}

# --- AWS KMS Customer Managed Key (CMK) for Envelope Encryption ---
resource "aws_kms_key" "phi_encryption_key" {
  description             = "KMS Key for Amrutam Protected Health Information (PHI) Encryption at Rest"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name = "amrutam-phi-kms-key-${var.environment}"
  }
}

resource "aws_kms_alias" "phi_key_alias" {
  name          = "alias/amrutam-phi-key-${var.environment}"
  target_key_id = aws_kms_key.phi_encryption_key.key_id
}
