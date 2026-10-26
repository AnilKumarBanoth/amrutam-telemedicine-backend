variable "aws_region" {
  description = "AWS region for infrastructure deployment"
  type        = string
  default     = "ap-south-1" # Mumbai region
}

variable "environment" {
  description = "Deployment environment name"
  type        = string
  default     = "production"
}

variable "db_username" {
  description = "PostgreSQL cluster master administrator username"
  type        = string
  default     = "amrutam_db_admin"
  sensitive   = true
}

variable "db_password" {
  description = "PostgreSQL cluster master administrator password"
  type        = string
  sensitive   = true
}
