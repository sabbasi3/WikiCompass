// shadcn className helper

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// cn(...) = clsx (conditionally combine class strings) + twMerge (resolve Tailwind conflicts). 
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
