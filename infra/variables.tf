variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "app_name" {
  description = "Name prefix used for all resources"
  type        = string
  default     = "death-tank"
}
