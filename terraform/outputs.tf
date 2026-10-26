output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "database_cluster_endpoint" {
  description = "Aurora PostgreSQL Writer Endpoint"
  value       = aws_rds_cluster.postgresql.endpoint
}

output "database_cluster_reader_endpoint" {
  description = "Aurora PostgreSQL Read Replica Endpoint for scaling read queries"
  value       = aws_rds_cluster.postgresql.reader_endpoint
}

output "redis_primary_endpoint" {
  description = "ElastiCache Redis primary endpoint for distributed locks and caching"
  value       = aws_elasticache_replication_group.redis_cluster.primary_endpoint_address
}

output "kms_key_arn" {
  description = "KMS Customer Managed Key ARN for PHI Envelope Encryption"
  value       = aws_kms_key.phi_encryption_key.arn
}
