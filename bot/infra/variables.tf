variable "aws_region" {
  description = "AWS region — must match infra/variables.tf"
  type        = string
  default     = "us-east-1"
}

variable "app_name" {
  description = "Application name prefix — must match infra/variables.tf"
  type        = string
  default     = "death-tank"
}

variable "discord_application_id" {
  description = "Discord application ID (non-sensitive, visible in Developer Portal)"
  type        = string
}

variable "game_port" {
  description = "Port players connect to via browser (nginx serving the client)"
  type        = number
  default     = 3000
}

variable "idle_timeout_minutes" {
  description = "Auto-stop servers after this many minutes since /start (default: 2.5 hours)"
  type        = number
  default     = 150
}
