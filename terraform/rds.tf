# ============================================================================
# Multi-AZ Aurora PostgreSQL Cluster with Read Replicas & 5-min RPO Backup
# ============================================================================

resource "aws_db_subnet_group" "db_subnet_group" {
  name       = "amrutam-db-subnet-group-${var.environment}"
  subnet_ids = module.vpc.database_subnets

  tags = {
    Name = "amrutam-db-subnets-${var.environment}"
  }
}

resource "aws_security_group" "rds_sg" {
  name        = "amrutam-rds-sg-${var.environment}"
  description = "Controls ingress traffic to PostgreSQL database"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "PostgreSQL access from private subnets"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = module.vpc.private_subnets_cidr_blocks
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_rds_cluster" "postgresql" {
  cluster_identifier      = "amrutam-pg-cluster-${var.environment}"
  engine                  = "aurora-postgresql"
  engine_version          = "16.1"
  database_name           = "amrutam_telemedicine"
  master_username         = var.db_username
  master_password         = var.db_password
  db_subnet_group_name    = aws_db_subnet_group.db_subnet_group.name
  vpc_security_group_ids = [aws_security_group.rds_sg.id]

  # Scalability: Multi-AZ cluster deployment
  availability_zones      = module.vpc.azs

  # High Availability & Backup Strategy (RPO < 5 mins, RTO < 30 mins)
  backup_retention_period   = 35 # 35 days continuous incremental backups
  preferred_backup_window   = "02:00-03:00"
  copy_tags_to_snapshot     = true
  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "amrutam-pg-final-snapshot"

  # Security & Encryption at Rest
  storage_encrypted = true
  kms_key_id        = aws_kms_key.phi_encryption_key.arn

  # Point-in-time recovery (PITR) supported by default in Aurora
}

resource "aws_rds_cluster_instance" "cluster_instances" {
  count              = 3 # 1 Primary Writer + 2 Multi-AZ Read Replicas (distributes read queries)
  identifier         = "amrutam-pg-instance-${var.environment}-${count.index}"
  cluster_identifier = aws_rds_cluster.postgresql.id
  instance_class     = "db.r6g.xlarge" # 4 vCPU, 32 GiB RAM for 100k daily consultations
  engine             = aws_rds_cluster.postgresql.engine
  engine_version     = aws_rds_cluster.postgresql.engine_version

  publicly_accessible  = false
  auto_minor_version_upgrade = true
  performance_insights_enabled = true
}

# --- ElastiCache Redis Cluster for Distributed Caching & Redlock ---
resource "aws_elasticache_subnet_group" "redis_subnet_group" {
  name       = "amrutam-redis-subnet-group-${var.environment}"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_security_group" "redis_sg" {
  name        = "amrutam-redis-sg-${var.environment}"
  description = "Controls ingress to Redis"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "Redis access from private app subnets"
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = module.vpc.private_subnets_cidr_blocks
  }
}

resource "aws_elasticache_replication_group" "redis_cluster" {
  replication_group_id          = "amrutam-redis-${var.environment}"
  description                   = "Redis cluster for distributed locking and session caching"
  node_type                     = "cache.r6g.large"
  port                          = 6379
  parameter_group_name          = "default.redis7"
  subnet_group_name             = aws_elasticache_subnet_group.redis_subnet_group.name
  security_group_ids            = [aws_security_group.redis_sg.id]
  automatic_failover_enabled    = true
  multi_az_enabled              = true
  num_cache_clusters            = 3
  at_rest_encryption_enabled    = true
  transit_encryption_enabled   = true
}
