output "aws_region" {
  value = var.aws_region
}

output "cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "service_name" {
  value = aws_ecs_service.main.name
}

output "server_ecr_url" {
  value = aws_ecr_repository.server.repository_url
}

output "client_ecr_url" {
  value = aws_ecr_repository.client.repository_url
}
