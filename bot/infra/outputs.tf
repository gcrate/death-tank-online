output "api_gateway_url" {
  value       = aws_apigatewayv2_stage.default.invoke_url
  description = "Set this as the Interactions Endpoint URL in the Discord Developer Portal"
}

output "dynamodb_table_name" {
  value = aws_dynamodb_table.game_servers.name
}

output "interactions_lambda_name" {
  value = aws_lambda_function.interactions.function_name
}

output "start_server_lambda_name" {
  value = aws_lambda_function.start_server.function_name
}
